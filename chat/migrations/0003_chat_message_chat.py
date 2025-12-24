# Generated manually

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def create_chats_for_existing_messages(apps, schema_editor):
    Message = apps.get_model('chat', 'Message')
    Chat = apps.get_model('chat', 'Chat')
    User = apps.get_model(settings.AUTH_USER_MODEL)
    
    # Group messages by user
    messages_by_user = {}
    for message in Message.objects.all():
        user_id = message.user_id
        if user_id not in messages_by_user:
            messages_by_user[user_id] = []
        messages_by_user[user_id].append(message)
    
    # Create a chat for each user and assign their messages
    for user_id, messages in messages_by_user.items():
        try:
            user = User.objects.get(id=user_id)
            # Create a chat for this user
            chat = Chat.objects.create(user=user, title="Migrated Chat")
            # Assign all messages to this chat
            for message in messages:
                message.chat = chat
                message.save()
        except User.DoesNotExist:
            # If user doesn't exist, delete the messages
            for message in messages:
                message.delete()


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('chat', '0002_message_user'),
    ]

    operations = [
        migrations.CreateModel(
            name='Chat',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(blank=True, max_length=255, null=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('updated', models.DateTimeField(auto_now=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='chats', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-updated'],
            },
        ),
        migrations.AddField(
            model_name='message',
            name='chat',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name='messages', to='chat.chat'),
        ),
        migrations.RunPython(create_chats_for_existing_messages, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='message',
            name='user',
        ),
        migrations.AlterField(
            model_name='message',
            name='chat',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='messages', to='chat.chat'),
        ),
    ]

