# Docker Deployment

## Quick Start

```bash
git clone https://github.com/RameshBabuPrudhvi/sentri.git
cd sentri
cp backend/.env.example backend/.env
# Edit backend/.env — add at least one AI provider key
docker compose up --build
```

Open [http://localhost:80](http://localhost:80)

## Architecture

```
┌──────────────────┐     ┌──────────────────┐
│  frontend (nginx) │────▶│  backend (node)   │
│  :80              │     │  :3001            │
│  Serves SPA       │     │  Express API      │
│  Proxies /api/*   │     │  Playwright       │
└──────────────────┘     └──────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
              ┌─────┴─────┐       ┌──────┴──────┐
              │ PostgreSQL │       │    Redis    │
              │ (optional) │       │ (optional)  │
              └───────────┘       └─────────────┘
```

Nginx proxies `/api/*` and `/artifacts/*` to the backend container automatically.

By default, the backend uses SQLite (zero config). To use PostgreSQL and/or Redis, activate the optional services:

```bash
# With PostgreSQL:
docker compose --profile postgres up --build

# With Redis:
docker compose --profile redis up --build

# With both:
docker compose --profile postgres --profile redis up --build
```

Set the corresponding env vars on the backend service in `docker-compose.yml`:
- `DATABASE_URL=postgres://sentri:sentri@postgres:5432/sentri`
- `REDIS_URL=redis://redis:6379`

## Environment Variables

Set in `backend/.env` or pass via `docker compose`:

```bash
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
JWT_SECRET=your-32-char-secret
NODE_ENV=production

# Or use OpenRouter (one key, 200+ models — Claude, GPT, Llama, Mixtral, …):
# OPENROUTER_API_KEY=sk-or-v1-...
# OPENROUTER_MODEL=openrouter/auto   # or e.g. anthropic/claude-3.5-sonnet

# Optional — PostgreSQL instead of SQLite:
# DATABASE_URL=postgres://sentri:sentri@postgres:5432/sentri

# Optional — Redis for shared rate limiting, token revocation, SSE pub/sub:
# REDIS_URL=redis://redis:6379
```

## Production Compose

For pre-built images from GHCR:

```bash
BACKEND_IMAGE=ghcr.io/you/sentri-backend:latest \
FRONTEND_IMAGE=ghcr.io/you/sentri-frontend:latest \
docker compose -f docker-compose.prod.yml up -d
```

## Volumes

The backend stores data in `/app/data/sentri.db` (SQLite) inside the container. When using PostgreSQL (`DATABASE_URL`), data is stored in the PostgreSQL database instead. Mount a volume to persist SQLite data across restarts:

```yaml
volumes:
  - ./data:/app/data
```

::: tip Migration from JSON
If you have an existing `sentri-db.json` file in the data directory, it will be automatically migrated to SQLite on first startup and renamed to `sentri-db.json.migrated`.
:::
