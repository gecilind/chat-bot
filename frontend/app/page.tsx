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
      const adminStatus = uniqueUsers.size > 1;
      setIsAdmin(adminStatus);
      
      // console.log('=== AUTH CHECK ===');
      // console.log('Total chats:', chats.length);
      // console.log('Unique usernames:', Array.from(uniqueUsers));
      // console.log('Is Admin:', adminStatus);
      // console.log('All chats:', chats.map(c => ({
      //   id: c.id,
      //   username: c.username,
      //   actual_username: c.actual_username,
      //   title: c.title
      // })));
      
      if (chats.length > 0) {
        if (adminStatus) {
          // Admin: find the actual_username that belongs to the logged-in admin
          // First, collect all actual_usernames
          const userCounts: Record<string, number> = {};
          const actualUsernames = new Set<string>();
          chats.forEach(chat => {
            const actualUser = chat.actual_username || chat.username;
            actualUsernames.add(actualUser);
            userCounts[actualUser] = (userCounts[actualUser] || 0) + 1;
          });
          
          // If "admin" appears in actual_usernames, use it (admin is likely logged in as "admin")
          let finalUsername: string;
          if (actualUsernames.has('admin')) {
            finalUsername = 'admin';
            // console.log('Admin detected: Using "admin" as username');
          } else {
            // Otherwise, use the most frequent actual_username
            const mostFrequentUser = Object.entries(userCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
            finalUsername = mostFrequentUser || (chats[0].actual_username || chats[0].username);
            // console.log('Admin detected: Using most frequent username');
          }
          
          setUsername(finalUsername);
          // console.log('Admin username set to:', finalUsername);
          // console.log('All actual_usernames:', Array.from(actualUsernames));
          // console.log('User counts:', userCounts);
        } else {
          // Regular user: all chats belong to them
          const finalUsername = chats[0].actual_username || chats[0].username;
          setUsername(finalUsername);
          // console.log('Regular user username set to:', finalUsername);
        }
      }
      // console.log('==================');
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
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ 
            width: '48px', 
            height: '48px', 
            margin: '0 auto 20px',
            border: '4px solid var(--border-color)',
            borderTopColor: 'var(--primary-color)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }}></div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>Loading...</div>
        </div>
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

