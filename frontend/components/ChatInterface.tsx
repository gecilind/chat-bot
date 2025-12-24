'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import { getChats, getMessages, sendMessage, type Chat, type Message } from '@/lib/api';

interface ChatInterfaceProps {
  username: string;
  isAdmin: boolean;
  onLogout: () => void;
}

type LocalMessage = Message & { isLocal?: boolean; isStreaming?: boolean };

export default function ChatInterface({ username, isAdmin, onLogout }: ChatInterfaceProps) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [currentChatId, setCurrentChatId] = useState<number | null>(null);
  const [currentChatOwner, setCurrentChatOwner] = useState<string | null>(null);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const skipNextLoadRef = useRef(false);

  useEffect(() => {
    loadChats();
    const interval = setInterval(loadChats, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    return () => {
      Object.values(streamTimersRef.current).forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    if (currentChatId) {
      if (skipNextLoadRef.current) {
        skipNextLoadRef.current = false;
        return;
      }
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
      // Preserve any local/streaming messages so the user's question stays visible while thinking
      setMessages(prev => {
        const pending = prev.filter(m => m.isLocal || m.isStreaming);
        const merged = [...messageList];

        // Keep pending optimistic/streaming if not already present
        pending.forEach(m => {
          if (!merged.some(s => s.id === m.id)) {
            merged.push(m);
          }
        });

        // If a server assistant message exists, drop any streaming duplicates
        const hasServerAssistant = merged.some(m => m.role === 'assistant' && !m.isLocal && !m.isStreaming);
        return hasServerAssistant
          ? merged.filter(m => !(m.role === 'assistant' && m.isStreaming))
          : merged;
      });
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
    const tempId = Date.now();
    const createdAt = new Date().toISOString();

    // Show the user's message immediately (optimistic)
    setMessages(prev => [
      ...prev,
      {
        id: tempId,
        chat_id: currentChatId ?? -1,
        role: 'user',
        text: messageText,
        created: createdAt,
        isLocal: true,
      },
    ]);

    setInputMessage('');
    setLoading(true);
    setError('');

    try {
      const response = await sendMessage(messageText, currentChatId || undefined);

      // Update temp message with real chat_id
      setMessages(prev => prev.map(m =>
        m.id === tempId ? { ...m, chat_id: response.chat_id, isLocal: false } : m
      ));

      // Append assistant reply
      const assistantId = tempId + 1;
      const assistantMessage: LocalMessage = {
        id: assistantId,
        chat_id: response.chat_id,
        role: 'assistant',
        text: '',
        created: new Date().toISOString(),
        isStreaming: true,
      };

      setMessages(prev => [...prev, assistantMessage]);
      startStreaming(response.response, assistantId);
      skipNextLoadRef.current = true;
      setCurrentChatId(response.chat_id);
      setCurrentChatOwner(username); // New chat belongs to current user
      await loadChats();
    } catch (err) {
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setLoading(false);
    }
  };

  const stopStreaming = (messageId: number) => {
    const t = streamTimersRef.current[messageId];
    if (t) {
      clearTimeout(t);
      delete streamTimersRef.current[messageId];
    }
  };

  const startStreaming = (fullText: string, messageId: number) => {
    stopStreaming(messageId);

    const tokens = fullText.split(/(\s+)/); // keep spaces for natural flow
    const total = tokens.length;
    let current = 0;

    const push = () => {
      current = Math.min(total, current + 1);
      const partial = tokens.slice(0, current).join('');

      setMessages(prev => prev.map(m =>
        m.id === messageId
          ? { ...m, text: partial, isStreaming: current < total }
          : m
      ));

      if (current >= total) {
        stopStreaming(messageId);
        return;
      }

      const nextToken = tokens[current] || '';
      const base = 14;
      const punctuationPause = /[.,;:!?]/.test(nextToken) ? 80 : 0;
      const jitter = Math.random() * 16;
      const delay = base + punctuationPause + jitter;

      streamTimersRef.current[messageId] = window.setTimeout(push, delay);
    };

    push();
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
            <h1>
              <span style={{ fontSize: '24px' }}>🤖</span>
              <span>AI Assistant</span>
            </h1>
            <div className="header-actions">
              <button onClick={handleNewChat} className="new-chat-btn" title="Start a new conversation">
                <span>+</span>
                <span>New Chat</span>
              </button>
              <button onClick={onLogout} className="logout-btn" title="Sign out">
                <span>👤</span>
                <span>{username}</span>
                <span>→</span>
              </button>
            </div>
          </div>

          <div className="chat-messages">
            {messages.length === 0 && !currentChatId ? (
              <div className="empty-state">
                <div style={{ fontSize: '64px', marginBottom: '16px', opacity: 0.6 }}>💬</div>
                <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Start a conversation
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  Type a message below to begin chatting with your AI assistant
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`message ${msg.role}`}>
                  <div className="message-label">
                    {msg.role === 'user' ? (
                      <>
                        <span>👤</span>
                        <span>You</span>
                      </>
                    ) : (
                      <>
                        <span>🤖</span>
                        <span>Assistant</span>
                      </>
                    )}
                  </div>
                  <div className="message-bubble">{msg.text}</div>
                </div>
              ))
            )}
            {loading && (
              <div className="message assistant">
                <div className="message-label">
                  <span>🤖</span>
                  <span>Assistant</span>
                </div>
                <div className="message-bubble loading">
                  <span>Thinking</span>
                </div>
              </div>
            )}
            {error && (
              <div className="error">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-container">
            {isReadOnly && (
              <div className="read-only-indicator">
                <span>🔒</span>
                <span>Read-only mode: You are viewing another user&apos;s chat. You cannot send messages here.</span>
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
                title="Send message"
              >
                <span>Send</span>
                <span style={{ fontSize: '18px' }}>→</span>
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="dashboard-panel">
        <div className="header">
          <h1>
            <span style={{ fontSize: '24px' }}>📊</span>
            <span>Conversations</span>
          </h1>
        </div>
        <div className="dashboard-content">
          {chats.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: '48px', marginBottom: '12px', opacity: 0.5 }}>💭</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                No conversations yet
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Start a new chat to begin
              </div>
            </div>
          ) : (
            Object.entries(groupedChats).map(([user, userChats]) => (
              <div key={user} className="user-section">
                <div className="user-section-header">
                  <span>👤</span>
                  <span>{user}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '12px', opacity: 0.8 }}>
                    {userChats.length} {userChats.length === 1 ? 'chat' : 'chats'}
                  </span>
                </div>
                <div className="user-section-messages">
                  {userChats.map((chat) => (
                    <div
                      key={chat.id}
                      className={`chat-item ${currentChatId === chat.id ? 'active' : ''}`}
                      onClick={() => handleChatClick(chat.id)}
                      title={`${chat.title || `Chat ${chat.id}`} - ${chat.message_count || 0} messages`}
                    >
                      <div className="chat-item-title">
                        <span>💬</span>
                        <span>{chat.title || `Chat ${chat.id}`}</span>
                      </div>
                      <div className="chat-item-meta">
                        <span>{chat.message_count || 0} {chat.message_count === 1 ? 'message' : 'messages'}</span>
                        <span>•</span>
                        <span>{new Date(chat.updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
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

