const API_BASE_URL = typeof window !== 'undefined' 
  ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')
  : 'http://localhost:8000';

export interface Chat {
  id: number;
  user: number;
  username: string;
  actual_username?: string;  // For comparison (actual username, not role)
  title: string | null;
  created: string;
  updated: string;
  message_count: number;
}

export interface Message {
  id: number;
  chat_id: number;
  role: 'user' | 'assistant';
  text: string;
  created: string;
}

export interface ChatResponse {
  response: string;
  chat_id: number;
}

export interface UserInfo {
  username: string;
  is_staff: boolean;
  is_superuser: boolean;
}

// Helper function to make API calls with credentials
async function apiCall<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  // Get CSRF token for POST/PUT/DELETE requests
  const method = options.method || 'GET';
  const needsCsrf = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
  let csrfToken = '';
  
  if (needsCsrf) {
    csrfToken = await getCsrfToken();
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    credentials: 'include', // Include cookies for session auth
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken && { 'X-CSRFToken': csrfToken }),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}

// Get CSRF token from API endpoint or cookie
async function getCsrfToken(): Promise<string> {
  // First try to get from cookie
  if (typeof document !== 'undefined') {
    const name = 'csrftoken';
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
      const [key, value] = cookie.trim().split('=');
      if (key === name && value) {
        return decodeURIComponent(value);
      }
    }
  }
  
  // If not in cookie, fetch from API endpoint
  try {
    const response = await fetch(`${API_BASE_URL}/api/csrf-token/`, {
      method: 'GET',
      credentials: 'include',
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.csrfToken) {
        return data.csrfToken;
      }
    }
    
    // Fallback: try to get from login page HTML
    const loginResponse = await fetch(`${API_BASE_URL}/login/`, {
      method: 'GET',
      credentials: 'include',
    });
    
    const html = await loginResponse.text();
    const match = html.match(/name=['"]csrfmiddlewaretoken['"] value=['"]([^'"]+)['"]/);
    if (match) {
      return match[1];
    }
    
    // Try to get from cookie after the request
    if (typeof document !== 'undefined') {
      const cookies = document.cookie.split(';');
      for (let cookie of cookies) {
        const [key, value] = cookie.trim().split('=');
        if (key === 'csrftoken' && value) {
          return decodeURIComponent(value);
        }
      }
    }
  } catch (e) {
    console.error('Error getting CSRF token:', e);
  }
  
  return '';
}

// Login function
export async function login(username: string, password: string): Promise<void> {
  // Get CSRF token
  const csrfToken = await getCsrfToken();
  
  const formData = new URLSearchParams();
  formData.append('username', username);
  formData.append('password', password);
  if (csrfToken) {
    formData.append('csrfmiddlewaretoken', csrfToken);
  }

  // Try the login request - don't use redirect: 'manual' as it causes CORS issues
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/login/`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(csrfToken && { 'X-CSRFToken': csrfToken }),
        'Referer': `${API_BASE_URL}/login/`,
      },
      body: formData,
    });
    
    // console.log('Login response status:', response.status);
    // console.log('Login response URL:', response.url);
    // console.log('Login response headers:', Object.fromEntries(response.headers.entries()));
  } catch (error) {
    console.error('Fetch error:', error);
    // If fetch fails, check cookies after a delay
    await new Promise(resolve => setTimeout(resolve, 200));
    if (typeof document !== 'undefined') {
      const cookies = document.cookie.split(';');
      for (let cookie of cookies) {
        if (cookie.trim().startsWith('sessionid=')) {
          // console.log('Login successful: sessionid found after fetch error');
          return; // Login might have succeeded despite fetch error
        }
      }
    }
    throw new Error('Network error. Please try again.');
  }
  
  // Check if login succeeded by URL (redirect means success)
  if (response.url && !response.url.includes('/login')) {
    // console.log('Login successful: Redirected away from login page');
    return; // Login successful
  }
  
  // Check if login succeeded
  // 302 means successful login (Django redirects on success)
  if (response.status === 302) {
    // console.log('Login successful: 302 redirect');
    return; // Login successful
  }
  
  // Check if session cookie was set in response headers
  const setCookie = response.headers.get('Set-Cookie');
  // console.log('Set-Cookie header:', setCookie);
  if (setCookie && setCookie.includes('sessionid')) {
    // console.log('Login successful: sessionid in Set-Cookie header');
    return; // Login successful, session cookie is set
  }
  
  // Wait a bit for cookie to be set by browser
  await new Promise(resolve => setTimeout(resolve, 200));
  
  if (typeof document !== 'undefined') {
    // console.log('Document cookies:', document.cookie);
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
      if (cookie.trim().startsWith('sessionid=')) {
        // console.log('Login successful: sessionid found in document cookies');
        return; // Login successful, session cookie found
      }
    }
  }
  
  // If we get 200, check the response HTML for error messages
  if (response.status === 200) {
    // console.log('Got 200 status, checking response HTML...');
    const html = await response.text();
    // console.log('Response HTML length:', html.length);
    // console.log('Response contains error?', html.includes('Invalid username or password') || html.includes('alert-error'));
    
    // If HTML contains error message, login failed
    if (html.includes('Invalid username or password') || html.includes('alert-error')) {
      // console.log('Login failed: Error message found in HTML');
      throw new Error('Invalid username or password');
    }
    
    // If no error in HTML, might be successful (check cookies one more time)
    if (typeof document !== 'undefined') {
      const cookies = document.cookie.split(';');
      for (let cookie of cookies) {
        if (cookie.trim().startsWith('sessionid=')) {
          // console.log('Login successful: sessionid found after checking HTML');
          return; // Login successful
        }
      }
    }
    
    // Check if Location header suggests redirect (success)
    const location = response.headers.get('Location');
    if (location && !location.includes('/login')) {
      // console.log('Login successful: Location header indicates redirect');
      return;
    }
    
    // If we get here with 200 and no session cookie, it's a failure
    // console.log('Login failed: 200 status but no session cookie found');
    throw new Error('Invalid username or password');
  }
  
  // For 403, it might be CSRF error
  if (response.status === 403) {
    // console.log('Login failed: 403 CSRF error');
    throw new Error('CSRF verification failed. Please try again.');
  }
  
  // Status 0 usually means CORS/network error, but cookies might still be set
  if (response.status === 0) {
    // console.log('Status 0 detected, checking cookies...');
    await new Promise(resolve => setTimeout(resolve, 300));
    if (typeof document !== 'undefined') {
      const cookies = document.cookie.split(';');
      for (let cookie of cookies) {
        if (cookie.trim().startsWith('sessionid=')) {
          // console.log('Login successful: sessionid found despite status 0');
          return; // Login successful despite status 0
        }
      }
    }
    // console.log('Login failed: Status 0 and no session cookie found');
    throw new Error('Network error. Please try again.');
  }
  
  // Any other error
  // console.log('Login failed: Unknown error, status:', response.status);
  throw new Error('Invalid username or password');
}

// Register function
export async function register(username: string, password: string, passwordConfirm: string): Promise<void> {
  // Get CSRF token
  const csrfToken = await getCsrfToken();
  
  const formData = new URLSearchParams();
  formData.append('username', username);
  formData.append('password', password);
  formData.append('password_confirm', passwordConfirm);
  if (csrfToken) {
    formData.append('csrfmiddlewaretoken', csrfToken);
  }

  const response = await fetch(`${API_BASE_URL}/register/`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(csrfToken && { 'X-CSRFToken': csrfToken }),
      'Referer': `${API_BASE_URL}/register/`,
    },
    body: formData,
  });

  // Check if registration succeeded (redirect means success)
  if (response.url && !response.url.includes('/register')) {
    return; // Registration successful and user is logged in
  }

  // Check response status
  if (response.status === 302) {
    return; // Registration successful
  }

  // If we get 200, check the response HTML for error messages
  if (response.status === 200) {
    const html = await response.text();
    if (html.includes('Username already exists') || html.includes('Passwords do not match') || html.includes('Error creating account')) {
      // Extract error message from HTML if possible
      const errorMatch = html.match(/<li class="error">([^<]+)<\/li>/);
      const errorMessage = errorMatch ? errorMatch[1] : 'Registration failed. Please try again.';
      throw new Error(errorMessage);
    }
    
    // Check if session cookie was set (registration successful)
    await new Promise(resolve => setTimeout(resolve, 200));
    if (typeof document !== 'undefined') {
      const cookies = document.cookie.split(';');
      for (let cookie of cookies) {
        if (cookie.trim().startsWith('sessionid=')) {
          return; // Registration successful
        }
      }
    }
  }

  // Any other error
  throw new Error('Registration failed. Please try again.');
}

// Logout function
export async function logout(): Promise<void> {
  const csrfToken = await getCsrfToken();
  await fetch(`${API_BASE_URL}/logout/`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      ...(csrfToken && { 'X-CSRFToken': csrfToken }),
      'Referer': `${API_BASE_URL}/`,
    },
  });
  
  // Clear all cookies
  if (typeof document !== 'undefined') {
    document.cookie.split(';').forEach(cookie => {
      const eqPos = cookie.indexOf('=');
      const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
      // Clear cookie by setting it to expire in the past
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`;
    });
  }
}

// Get current user info
export async function getCurrentUser(): Promise<UserInfo | null> {
  try {
    // Try to get user info by fetching chats (requires auth)
    const chats = await apiCall<Chat[]>('/api/chats/');
    // If we get here, user is authenticated
    // We'll get user info from the first chat or make a separate endpoint
    // For now, we'll check if user can see all chats (admin) or just their own
    return null; // Will be handled by checking chats
  } catch {
    return null;
  }
}

// Get all chats
export async function getChats(): Promise<Chat[]> {
  return apiCall<Chat[]>('/api/chats/');
}

// Get messages for a chat
export async function getMessages(chatId: number): Promise<Message[]> {
  return apiCall<Message[]>(`/api/messages/?chat_id=${chatId}`);
}

// Send a message
export async function sendMessage(
  message: string,
  chatId?: number
): Promise<ChatResponse> {
  return apiCall<ChatResponse>('/api/chat/', {
    method: 'POST',
    body: JSON.stringify({
      message,
      ...(chatId && { chat_id: chatId }),
    }),
  });
}

