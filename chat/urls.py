from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'chats', views.ChatViewSet, basename='chat')
router.register(r'messages', views.MessageViewSet, basename='message')

urlpatterns = [
    path('api/', include(router.urls)),
    path('api/chat/', views.chat_view, name='chat'),
    path('api/me/', views.current_user, name='current-user'),
    path('api/csrf-token/', views.get_csrf_token, name='csrf-token'),
    path('login/', views.login_view, name='login'),
    path('register/', views.register_view, name='register'),
    path('logout/', views.logout_view, name='logout'),
    path('', views.chatbot_ui, name='chatbot-ui'),
]

