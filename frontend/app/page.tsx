'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getChats, getMessages, sendMessage, logout, type Chat, type Message } from '@/lib/api';
import LoginPage from '@/components/LoginPage';
import ChatInterface from '@/components/ChatInterface';

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [username, setUsername] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState(false);
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const chats = await getChats();
      setIsAuthenticated(true);
      // Determine if admin by checking if we can see chats from multiple users
      const uniqueUsers = new Set(chats.map(c => c.username));
      // If we see chats from multiple users, we're likely an admin
      setIsAdmin(uniqueUsers.size > 1);
      
      if (chats.length > 0) {
        if (uniqueUsers.size > 1) {
          // Admin: find the actual_username that appears most frequently (likely the admin's own chats)
          const userCounts: Record<string, number> = {};
          chats.forEach(chat => {
            const actualUser = chat.actual_username || chat.username;
            userCounts[actualUser] = (userCounts[actualUser] || 0) + 1;
          });
          // Get the user with the most chats (likely the admin)
          const mostFrequentUser = Object.entries(userCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
          setUsername(mostFrequentUser || (chats[0].actual_username || chats[0].username));
        } else {
          // Regular user: all chats belong to them
          setUsername(chats[0].actual_username || chats[0].username);
        }
      }
    } catch {
      setIsAuthenticated(false);
    }
  };

  const handleLogin = () => {
    checkAuth();
  };

  const handleLogout = async () => {
    try {
      await logout();
      setIsAuthenticated(false);
      setUsername('');
      setIsAdmin(false);
      router.push('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (isAuthenticated === null) {
    return (
      <div className="login-container">
        <div className="empty-state">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <ChatInterface
      username={username}
      isAdmin={isAdmin}
      onLogout={handleLogout}
    />
  );
}

