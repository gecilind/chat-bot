# Django Chat Backend

A Django REST Framework backend for a chat application with OpenAI integration.

## Setup

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Run migrations:**
   ```bash
   python manage.py migrate
   ```

3. **Start the development server:**
   ```bash
   python manage.py runserver
   ```

The server will run on `http://127.0.0.1:8000/`

## API Endpoints

### GET /api/messages/
Returns all messages ordered by creation time.

**Response:**
```json
[
  {
    "id": 1,
    "role": "user",
    "text": "Hello",
    "created": "2024-01-01T12:00:00Z"
  },
  {
    "id": 2,
    "role": "assistant",
    "text": "Hi! How can I help you?",
    "created": "2024-01-01T12:00:01Z"
  }
]
```

### POST /api/chat/
Sends a message to OpenAI and saves both user and assistant messages.

**Request:**
```json
{
  "message": "Hello"
}
```

**Response:**
```json
{
  "response": "Hi! How can I help you?"
}
```

## Environment Variables

All configuration is stored in the `.env` file:

- `DJANGO_SECRET_KEY` - Django secret key
- `DJANGO_DEBUG` - Debug mode (True/False)
- `DJANGO_ALLOWED_HOSTS` - Comma-separated list of allowed hosts
- `CORS_ALLOWED_ORIGINS` - Comma-separated list of CORS origins
- `OPENAI_API_KEY` - OpenAI API key

## Testing with curl

**Get all messages:**
```bash
curl http://127.0.0.1:8000/api/messages/
```

**Send a chat message:**
```bash
curl -X POST http://127.0.0.1:8000/api/chat/ \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}'
```

