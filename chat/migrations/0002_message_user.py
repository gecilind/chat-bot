# Generated manually

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def assign_messages_to_admin(apps, schema_editor):
    Message = apps.get_model('chat', 'Message')
    User = apps.get_model(settings.AUTH_USER_MODEL)
    
    # Get or create admin user
    admin_user = User.objects.filter(is_superuser=True).first()
    if not admin_user:
        admin_user = User.objects.filter(username='admin').first()
    
    # Assign all existing messages to admin if they exist
    if admin_user:
        Message.objects.filter(user__isnull=True).update(user=admin_user)


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('chat', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='message',
            name='user',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name='messages', to=settings.AUTH_USER_MODEL),
        ),
        migrations.RunPython(assign_messages_to_admin, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='message',
            name='user',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='messages', to=settings.AUTH_USER_MODEL),
        ),
    ]

