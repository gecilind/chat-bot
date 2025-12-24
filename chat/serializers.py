from rest_framework import serializers
from .models import Chat, Message


class ChatSerializer(serializers.ModelSerializer):
    username = serializers.SerializerMethodField()
    actual_username = serializers.CharField(source='user.username', read_only=True)  # For comparison
    message_count = serializers.IntegerField(source='messages.count', read_only=True)
    
    def get_username(self, obj):
        # Get role from UserProfile, default to username if no profile
        if hasattr(obj.user, 'profile') and obj.user.profile.role:
            return obj.user.profile.role
        return obj.user.username
    
    class Meta:
        model = Chat
        fields = ['id', 'user', 'username', 'actual_username', 'title', 'created', 'updated', 'message_count']


class MessageSerializer(serializers.ModelSerializer):
    chat_id = serializers.IntegerField(source='chat.id', read_only=True)
    
    class Meta:
        model = Message
        fields = ['id', 'chat_id', 'role', 'text', 'created']

