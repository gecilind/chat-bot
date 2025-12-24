# Chatbot Frontend (Next.js)

This is the Next.js frontend for the AI Chatbot application. It connects to the Django backend and provides the same functionality as the Django template version.

## Setup Instructions

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Configure Django Backend

Make sure your Django backend is running on `http://localhost:8000` and that CORS is properly configured:

- The `CORS_ALLOWED_ORIGINS` in `assistant/settings.py` should include `http://localhost:3000`
- `CORS_ALLOW_CREDENTIALS` should be set to `True` (already configured)

### 3. Start the Development Server

```bash
npm run dev
```

### 4. Open in Browser

Navigate to [http://localhost:3000](http://localhost:3000)

## Features

✅ **Login/Logout** - Session-based authentication with Django  
✅ **Chat Interface** - Clean, modern chat UI with message history  
✅ **Dashboard Panel** - View all your chats in a sidebar  
✅ **Admin Features** - Admins can view all users' chats (read-only)  
✅ **Read-Only Mode** - Admins cannot write to other users' chats  
✅ **Real-time Updates** - Chat list refreshes every 5 seconds  
✅ **Similar Design** - Matches the Django template version  

## Project Structure

```
frontend/
├── app/
│   ├── layout.tsx          # Root layout
│   ├── page.tsx             # Main page (handles auth)
│   └── globals.css          # Global styles
├── components/
│   ├── LoginPage.tsx        # Login component
│   └── ChatInterface.tsx    # Main chat interface
├── lib/
│   └── api.ts               # API client functions
└── package.json
```

## API Endpoints Used

- `GET /api/chats/` - Get all chats (filtered by user/admin)
- `GET /api/messages/?chat_id=X` - Get messages for a chat
- `POST /api/chat/` - Send a message
- `POST /login/` - Login
- `POST /logout/` - Logout

## Environment Variables

You can create a `.env.local` file to customize the API URL:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Admin Restrictions

When logged in as an admin:
- ✅ Can view all users' chats
- ✅ Can write in your own chats
- ❌ Cannot write in other users' chats (read-only mode)
- Shows a warning indicator when viewing other users' chats

## Troubleshooting

**CORS Errors:**
- Make sure Django CORS settings include `http://localhost:3000`
- Ensure `CORS_ALLOW_CREDENTIALS = True` in Django settings

**Authentication Issues:**
- Make sure Django backend is running
- Check that cookies are being sent (check browser dev tools)
- Verify CSRF token is being handled correctly

**Connection Errors:**
- Verify Django is running on `http://localhost:8000`
- Check `NEXT_PUBLIC_API_URL` if using a different port

