from django.contrib import admin
from .models import Chat, Message


@admin.register(Chat)
class ChatAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'title', 'created', 'updated']
    list_filter = ['created', 'updated', 'user']
    search_fields = ['title', 'user__username']
    list_select_related = ['user']


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ['id', 'chat', 'role', 'text', 'created']
    list_filter = ['role', 'created', 'chat']
    search_fields = ['text', 'chat__title']
    list_select_related = ['chat']

