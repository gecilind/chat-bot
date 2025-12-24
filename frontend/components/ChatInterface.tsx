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
      // Only load messages if we don't have any local/streaming messages
      // This prevents clearing the user's question when a new chat is created
      const hasLocalMessages = messages.some((m: LocalMessage) => m.isLocal || m.isStreaming);
      if (!hasLocalMessages) {
        loadMessages(currentChatId);
      }
      // Get chat owner info - use actual_username for comparison
      const chat = chats.find(c => c.id === currentChatId);
      if (chat) {
        const owner = chat.actual_username || chat.username;
        setCurrentChatOwner(owner);
        // console.log('=== MESSAGES LOADED ===');
        // console.log('Chat ID:', currentChatId);
        // console.log('Chat username:', chat.username);
        // console.log('Chat actual_username:', chat.actual_username);
        // console.log('Chat owner set to:', owner);
        // console.log('======================');
      }
    } else {
      // Only clear messages if we're not in the middle of sending a message
      const hasLocalMessages = messages.some((m: LocalMessage) => m.isLocal || m.isStreaming);
      if (!hasLocalMessages) {
        setMessages([]);
      }
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
        const hasServerAssistant = merged.some((m: LocalMessage) => m.role === 'assistant' && !(m as LocalMessage).isLocal && !(m as LocalMessage).isStreaming);
        return hasServerAssistant
          ? merged.filter((m: LocalMessage) => !(m.role === 'assistant' && (m as LocalMessage).isStreaming))
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
      // Set chat ID before streaming so the chat is properly associated
      skipNextLoadRef.current = true;
      setCurrentChatId(response.chat_id);
      setCurrentChatOwner(username); // New chat belongs to current user
      // Start streaming after state is updated
      setTimeout(() => {
        startStreaming(response.response, assistantId);
      }, 0);
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

    // Split text into words with spaces (like ChatGPT)
    // Use regex to match words and spaces separately, preserving the text structure
    const tokens: string[] = [];
    const regex = /(\S+|\s+)/g; // Match non-whitespace (words) or whitespace (spaces/newlines)
    let match;
    
    while ((match = regex.exec(fullText)) !== null) {
      tokens.push(match[0]);
    }

    const total = tokens.length;
    let current = 0;

    console.log('=== STREAMING STARTED (WORD BY WORD) ===');
    console.log('Total words/tokens to stream:', total);
    console.log('Full text length:', fullText.length);
    console.log('First 20 tokens:', tokens.slice(0, 20));

    const push = () => {
      current = Math.min(total, current + 1);
      // Join tokens up to current
      const partial = tokens.slice(0, current).join('');

      if (current % 10 === 0 || current <= 5) {
        console.log(`--- Word ${current}/${total} ---`);
        console.log('Current word:', tokens[current - 1]);
        console.log('Partial text length:', partial.length);
      }

      setMessages(prev => prev.map(m =>
        m.id === messageId
          ? { ...m, text: partial, isStreaming: current < total }
          : m
      ));

      if (current >= total) {
        console.log('=== STREAMING COMPLETED ===');
        console.log('Final text length:', partial.length);
        stopStreaming(messageId);
        return;
      }

      // Calculate delay based on word characteristics (like ChatGPT)
      const currentWord = tokens[current] || '';
      const wordLength = currentWord.length;
      
      // Base delay - faster for shorter words
      let delay = 20; // Base delay in milliseconds
      
      // Longer words get slightly more delay
      if (wordLength > 8) {
        delay = 30;
      } else if (wordLength > 5) {
        delay = 25;
      }
      
      // Punctuation pauses (like ChatGPT does)
      const hasPunctuation = /[.,!?;:]/.test(currentWord);
      if (hasPunctuation) {
        delay += 50; // Pause after punctuation
      }
      
      // Pause after newlines
      if (currentWord === '\n') {
        delay = 80;
      }
      
      // Small random variation for natural feel (but keep it minimal)
      const jitter = Math.random() * 10;
      delay = Math.max(delay + jitter, 15); // Minimum 15ms

      streamTimersRef.current[messageId] = window.setTimeout(push, delay) as unknown as ReturnType<typeof setTimeout>;
    };

    // Start immediately
    push();
  };

  const handleChatClick = (chatId: number) => {
    setCurrentChatId(chatId);
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
      const owner = chat.actual_username || chat.username;
      setCurrentChatOwner(owner);
      console.log('=== CHAT CLICKED ===');
      console.log('Chat ID:', chatId);
      console.log('Chat username:', chat.username);
      console.log('Chat actual_username:', chat.actual_username);
      console.log('Current chat owner set to:', owner);
      console.log('Current user (username prop):', username);
      console.log('Is Admin:', isAdmin);
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
  const isReadOnly = isAdmin && currentChatId && currentChatOwner && currentChatOwner.trim().toLowerCase() !== username.trim().toLowerCase();
  
  // Debug logging for read-only logic
  useEffect(() => {
    if (isAdmin && currentChatId) {
      console.log('=== READ-ONLY CHECK ===');
      console.log('Is Admin:', isAdmin);
      console.log('Current Chat ID:', currentChatId);
      console.log('Current Chat Owner:', currentChatOwner);
      console.log('Current User (username):', username);
      console.log('Is Read-Only:', isReadOnly);
      console.log('Comparison:', {
        owner: currentChatOwner?.trim().toLowerCase(),
        user: username?.trim().toLowerCase(),
        match: currentChatOwner?.trim().toLowerCase() === username?.trim().toLowerCase()
      });
      console.log('======================');
    }
  }, [isAdmin, currentChatId, currentChatOwner, username, isReadOnly]);

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

