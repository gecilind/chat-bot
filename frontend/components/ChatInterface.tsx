'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import { getChats, getMessages, sendMessage, type Chat, type Message } from '@/lib/api';

interface ChatInterfaceProps {
  username: string;
  isAdmin: boolean;
  onLogout: () => void;
}

export default function ChatInterface({ username, isAdmin, onLogout }: ChatInterfaceProps) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentChatId, setCurrentChatId] = useState<number | null>(null);
  const [currentChatOwner, setCurrentChatOwner] = useState<string | null>(null);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadChats();
    const interval = setInterval(loadChats, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (currentChatId) {
      loadMessages(currentChatId);
      // Get chat owner info - use actual_username for comparison
      const chat = chats.find(c => c.id === currentChatId);
      if (chat) {
        setCurrentChatOwner(chat.actual_username || chat.username);
      }
    } else {
      setMessages([]);
      setCurrentChatOwner(null);
    }
  }, [currentChatId, chats]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadChats = async () => {
    try {
      const chatList = await getChats();
      setChats(chatList);
    } catch (err) {
      console.error('Error loading chats:', err);
    }
  };

  const loadMessages = async (chatId: number) => {
    try {
      const messageList = await getMessages(chatId);
      setMessages(messageList);
    } catch (err) {
      console.error('Error loading messages:', err);
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    }
  };

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || loading) return;

    // Check if admin is trying to write to someone else's chat
    if (isAdmin && currentChatId && currentChatOwner && currentChatOwner !== username) {
      setError('You can only view this chat. You cannot write messages to other users\' chats.');
      return;
    }

    const messageText = inputMessage.trim();
    setInputMessage('');
    setLoading(true);
    setError('');

    try {
      const response = await sendMessage(messageText, currentChatId || undefined);
      
      // Add user message
      const userMessage: Message = {
        id: Date.now(),
        chat_id: response.chat_id,
        role: 'user',
        text: messageText,
        created: new Date().toISOString(),
      };
      
      // Add assistant message
      const assistantMessage: Message = {
        id: Date.now() + 1,
        chat_id: response.chat_id,
        role: 'assistant',
        text: response.response,
        created: new Date().toISOString(),
      };

      setMessages([...messages, userMessage, assistantMessage]);
      setCurrentChatId(response.chat_id);
      setCurrentChatOwner(username); // New chat belongs to current user
      await loadChats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setLoading(false);
    }
  };

  const handleChatClick = (chatId: number) => {
    setCurrentChatId(chatId);
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
      setCurrentChatOwner(chat.username);
    }
  };

  const handleNewChat = () => {
    setCurrentChatId(null);
    setMessages([]);
    setCurrentChatOwner(null);
    setError('');
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Admin can only edit their own chats, not other users' chats
  // Read-only when: admin is viewing a chat that belongs to someone else
  const isReadOnly = isAdmin && currentChatId && currentChatOwner && currentChatOwner.trim() !== username.trim();

  // Group chats by user for admin view
  const groupedChats = isAdmin
    ? chats.reduce((acc, chat) => {
        if (!acc[chat.username]) {
          acc[chat.username] = [];
        }
        acc[chat.username].push(chat);
        return acc;
      }, {} as Record<string, Chat[]>)
    : chats.length > 0 ? { [username]: chats } : {};

  return (
    <div className="container">
      <div className="main-content">
        <div className="chat-container">
          <div className="header">
            <h1>🤖 AI Chatbot</h1>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button onClick={handleNewChat} className="new-chat-btn">
                🆕 New Chat
              </button>
              <button onClick={onLogout} className="logout-btn">
                Logout ({username})
              </button>
            </div>
          </div>

          <div className="chat-messages">
            {messages.length === 0 && !currentChatId ? (
              <div className="empty-state">
                Start a conversation by typing a message below...
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`message ${msg.role}`}>
                  <div className="message-label">
                    {msg.role === 'user' ? 'You' : 'Assistant'}
                  </div>
                  <div className="message-bubble">{msg.text}</div>
                </div>
              ))
            )}
            {loading && (
              <div className="message assistant">
                <div className="message-label">Assistant</div>
                <div className="message-bubble loading">Thinking</div>
              </div>
            )}
            {error && <div className="error">{error}</div>}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-container">
            {isReadOnly && (
              <div className="read-only-indicator">
                🔒 Read-only mode: You are viewing another user&apos;s chat. You cannot send messages here.
              </div>
            )}
            <form onSubmit={handleSendMessage} className="chat-input-form">
              <input
                type="text"
                className="chat-input"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder={isReadOnly ? 'Read-only mode: You can only view this chat' : 'Type your message here...'}
                disabled={isReadOnly || loading}
                autoComplete="off"
              />
              <button
                type="submit"
                className="send-button"
                disabled={isReadOnly || loading || !inputMessage.trim()}
              >
                Send
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="dashboard-panel">
        <div className="header">
          <h1>📊 Chats</h1>
        </div>
        <div className="dashboard-content">
          {chats.length === 0 ? (
            <div className="empty-state">No chats yet. Start a new chat!</div>
          ) : (
            Object.entries(groupedChats).map(([user, userChats]) => (
              <div key={user} className="user-section">
                <div className="user-section-header">👤 {user}</div>
                <div className="user-section-messages">
                  {userChats.map((chat) => (
                    <div
                      key={chat.id}
                      className={`chat-item ${currentChatId === chat.id ? 'active' : ''}`}
                      onClick={() => handleChatClick(chat.id)}
                    >
                      <div className="chat-item-title">
                        💬 {chat.title || `Chat ${chat.id}`}
                      </div>
                      <div className="chat-item-meta">
                        {chat.message_count || 0} messages • {new Date(chat.updated).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

