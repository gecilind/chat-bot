from rest_framework import viewsets
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from django.conf import settings
from django.shortcuts import render, redirect
from django.contrib.auth import login, authenticate
from django.contrib.auth.decorators import login_required
from django.contrib.auth import logout as auth_logout
from django.contrib.auth.models import User
from django.contrib import messages as django_messages
from openai import OpenAI
from .models import Chat, Message, UserProfile
from .serializers import ChatSerializer, MessageSerializer


class ChatViewSet(viewsets.ModelViewSet):
    """
    ViewSet for viewing chats.
    Requires authentication.
    """
    queryset = Chat.objects.all()
    serializer_class = ChatSerializer
    http_method_names = ['get']  # Only allow GET requests
    
    def get_queryset(self):
        """Return chats filtered by user."""
        if self.request.user.is_authenticated:
            if self.request.user.is_staff or self.request.user.is_superuser:
                # Admins see all chats
                return Chat.objects.all()
            else:
                # Regular users see only their chats
                return Chat.objects.filter(user=self.request.user)
        return Chat.objects.none()


class MessageViewSet(viewsets.ModelViewSet):
    """
    ViewSet for viewing messages by chat ID.
    Requires authentication.
    """
    queryset = Message.objects.all()
    serializer_class = MessageSerializer
    http_method_names = ['get']  # Only allow GET requests
    
    def get_queryset(self):
        """Return messages filtered by chat_id and user permissions."""
        if not self.request.user.is_authenticated:
            return Message.objects.none()
        
        chat_id = self.request.query_params.get('chat_id', None)
        if chat_id:
            try:
                chat = Chat.objects.get(id=chat_id)
                # Check if user has permission to view this chat
                if self.request.user.is_staff or self.request.user.is_superuser or chat.user == self.request.user:
                    return Message.objects.filter(chat_id=chat_id)
            except Chat.DoesNotExist:
                return Message.objects.none()
        
        return Message.objects.none()


@api_view(['POST'])
@login_required
def chat_view(request):
    """
    Handle chat POST requests.
    Accepts {"message": "...", "chat_id": 123} and returns {"response": "...", "chat_id": 123}
    If chat_id is not provided, creates a new chat.
    Requires authentication.
    """
    # Check if API key is configured
    api_key = settings.OPENAI_API_KEY
    if not api_key:
        return Response(
            {'error': 'OpenAI API key is not configured'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    
    # Get user message and chat_id from request
    user_message_text = request.data.get('message', '').strip()
    chat_id = request.data.get('chat_id', None)
    
    if not user_message_text:
        return Response(
            {'error': 'Message field is required'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        # Get or create chat
        if chat_id:
            try:
                chat = Chat.objects.get(id=chat_id)
                # Check if user has permission to use this chat
                if not (request.user.is_staff or request.user.is_superuser or chat.user == request.user):
                    return Response(
                        {'error': 'You do not have permission to access this chat'},
                        status=status.HTTP_403_FORBIDDEN
                    )
                # Prevent admins from writing to other users' chats (read-only access)
                if (request.user.is_staff or request.user.is_superuser) and chat.user != request.user:
                    return Response(
                        {'error': 'You can only view this chat. You cannot write messages to other users\' chats.'},
                        status=status.HTTP_403_FORBIDDEN
                    )
            except Chat.DoesNotExist:
                return Response(
                    {'error': 'Chat not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
        else:
            # Create new chat
            chat = Chat.objects.create(user=request.user)
            # Set title from first message (first 50 chars)
            chat.title = user_message_text[:50] if len(user_message_text) <= 50 else user_message_text[:47] + "..."
            chat.save()
        
        # Initialize OpenAI client
        client = OpenAI(api_key=api_key)
        
        # Get conversation history for this chat only
        previous_messages = Message.objects.filter(chat=chat).order_by('created')
        messages = []
        
        # Build message history for OpenAI
        for msg in previous_messages:
            messages.append({
                'role': msg.role,
                'content': msg.text
            })
        
        # Add current user message
        messages.append({
            'role': 'user',
            'content': user_message_text
        })
        
        # Call OpenAI API
        response = client.chat.completions.create(
            model='gpt-4o-mini',
            messages=messages
        )
        
        # Get assistant response
        assistant_response = response.choices[0].message.content
        
        # Save user message to database
        user_message = Message.objects.create(
            chat=chat,
            role='user',
            text=user_message_text
        )
        
        # Save assistant message to database
        assistant_message = Message.objects.create(
            chat=chat,
            role='assistant',
            text=assistant_response
        )
        
        return Response({
            'response': assistant_response,
            'chat_id': chat.id
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


def login_view(request):
    """
    Handle user login.
    """
    if request.user.is_authenticated:
        return redirect('chatbot-ui')
    
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            return redirect('chatbot-ui')
        else:
            django_messages.error(request, 'Invalid username or password.')
    
    return render(request, 'chat/chatbot.html')


@api_view(['GET'])
def get_csrf_token(request):
    """
    Get CSRF token for frontend.
    """
    from django.middleware.csrf import get_token
    token = get_token(request)
    return Response({'csrfToken': token})


@login_required
def chatbot_ui(request):
    """
    Render the chatbot UI template (requires login).
    """
    is_admin = request.user.is_staff or request.user.is_superuser
    context = {
        'is_admin': is_admin,
        'user': request.user,
    }
    return render(request, 'chat/chatbot.html', context)


def logout_view(request):
    """
    Handle user logout.
    """
    auth_logout(request)
    return redirect('login')


def register_view(request):
    """
    Handle user registration.
    """
    if request.user.is_authenticated:
        return redirect('chatbot-ui')
    
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        password_confirm = request.POST.get('password_confirm', '')
        
        # Validation
        if not username or not password:
            django_messages.error(request, 'Username and password are required.')
            return render(request, 'chat/chatbot.html')
        
        if password != password_confirm:
            django_messages.error(request, 'Passwords do not match.')
            return render(request, 'chat/chatbot.html')
        
        if User.objects.filter(username=username).exists():
            django_messages.error(request, 'Username already exists.')
            return render(request, 'chat/chatbot.html')
        
        # Create user
        try:
            user = User.objects.create_user(username=username, password=password)
            # Create user profile with default role 'User'
            UserProfile.objects.create(user=user, role='User')
            # Automatically log in the user
            login(request, user)
            return redirect('chatbot-ui')
        except Exception as e:
            django_messages.error(request, f'Error creating account: {str(e)}')
    
    return render(request, 'chat/chatbot.html')

