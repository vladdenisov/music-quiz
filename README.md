# Music Quiz Backend

Node.js backend for the Music Quiz MVP.

## Stack

- Hono REST API
- Socket.IO realtime events
- PostgreSQL + Drizzle ORM
- Redis for rate limits and socket presence
- Zod validation

## Local Run

```sh
cp .env.example .env
docker compose up -d
npm install
npm run db:migrate
npm run dev
```

Health check:

```sh
curl http://localhost:3001/health
```

## Main Endpoints

- `GET /health`
- `POST /rooms`
- `GET /rooms/:roomCode`
- `POST /rooms/:roomCode/join`
- `POST /rooms/:roomCode/start`
- `POST /tracks/generate`
- `GET /tracks/generation-options`
- `GET /tracks/:id`

Correct answers are emitted only in `round:ended`; active round payloads expose only public options.

`GET /tracks/generation-options` returns frontend-selectable generation parameters: English/Russian language bias, decades, genres, moods, regions, popularity, difficulty, explicitness, and ready-to-use presets.
