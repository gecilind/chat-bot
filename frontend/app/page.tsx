'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, logout } from '@/lib/api';
import LoginPage from '@/components/LoginPage';
import RegisterPage from '@/components/RegisterPage';
import ChatInterface from '@/components/ChatInterface';

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [username, setUsername] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    const shouldEnableScroll = isAuthenticated !== true;
    if (shouldEnableScroll) {
      document.body.classList.add('auth-page');
    } else {
      document.body.classList.remove('auth-page');
    }

    return () => {
      document.body.classList.remove('auth-page');
    };
  }, [isAuthenticated]);

  const checkAuth = async () => {
    try {
      const user = await getCurrentUser();
      if (!user) {
        setIsAuthenticated(false);
        return;
      }

      setIsAuthenticated(true);
      setUsername(user.username);
      setIsAdmin(user.is_staff || user.is_superuser);
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
    if (showRegister) {
      return <RegisterPage onRegister={handleLogin} onSwitchToLogin={() => setShowRegister(false)} />;
    }
    return <LoginPage onLogin={handleLogin} onSwitchToRegister={() => setShowRegister(true)} />;
  }

  return (
    <ChatInterface
      username={username}
      isAdmin={isAdmin}
      onLogout={handleLogout}
    />
  );
}

