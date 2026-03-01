# Pulse Backend

AI-native analytics API for Sportomic.

## Setup

```bash
cd Backend
npm install
cp .env.example .env
# Add GROQ_API_KEY to .env
```

## Run

```bash
npm run dev
```

Server runs on `http://localhost:3001`.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | Health check |
| GET | /api/databases | List databases |
| POST | /api/databases | Add database |
| POST | /api/databases/:id/test | Test connection |
| DELETE | /api/databases/:id | Remove database |
| POST | /api/schema/:dbId/ingest | Ingest schema |
| GET | /api/schema/:dbId | Get schema |
| POST | /api/chat | Chat (dbId, message, conversationId?) |
| POST | /api/export/csv | Export data as CSV |

## Environment

- `PORT` - Server port (default: 3001)
- `GROQ_API_KEY` - Required for chat
- `DATA_DIR` - SQLite data dir (default: ./data)
