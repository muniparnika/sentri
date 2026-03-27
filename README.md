# Sentri — Autonomous QA Platform

An AI-powered autonomous QA system that crawls your web application, generates test cases using Claude AI, and continuously executes them — similar to SmartBear's quality platform approach.

**Live Demo:** [https://rameshbabuprudhvi.github.io/sentri/](https://rameshbabuprudhvi.github.io/sentri/)

---

## Features

- **Autonomous Crawler** — Explores your app up to 3 levels deep, mapping all pages and interactive elements
- **AI Test Generation** — Uses Claude to generate meaningful Playwright test cases per page
- **One-Click Test Execution** — Run all generated tests against your live app
- **Self-Healing Hints** — Tests capture DOM snapshots to assist re-generation after app changes
- **Live Dashboard** — Real-time pass/fail metrics, run history, and trend charts
- **Auth Support** — Login to your app before crawling using CSS selectors
- **Demo Mode** — Frontend works standalone with sample data (no backend needed)
- **Docker Ready** — Full Docker Compose setup for instant deployment
- **GitHub Pages** — Auto-deploys frontend demo to GitHub Pages on push to main

---

## Quick Start

### Prerequisites
- Node.js 20+
- An [Anthropic API key](https://console.anthropic.com)
- Docker & Docker Compose (for containerized deployment)

---

### Option A: Docker (Recommended)

```bash
# 1. Clone the project
cd sentri

# 2. Set your API key
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# 3. Build and start
docker compose up --build

# App is live at http://localhost:80
# API is live at http://localhost:3001
```

---

### Option B: Local Development

**Backend:**
```bash
cd backend
npm install
npx playwright install chromium   # Install browser
cp .env.example .env               # Add your ANTHROPIC_API_KEY
npm run dev                        # Starts on :3001
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev                        # Starts on :3000, proxies API to :3001
```

Open http://localhost:3000

---

## Demo Mode

When deployed to GitHub Pages (or any static host without a backend), the frontend automatically detects that no backend API is available and switches to **demo mode**. Demo mode uses realistic sample data so you can explore the full UI — dashboard, projects, test results, run logs — without running any server.

---

## Usage

### 1. Create a Project
- Click **New Project**
- Enter your app name and URL (e.g. `https://myapp.com`)
- Optionally configure login credentials (CSS selectors for username/password fields)

### 2. Crawl & Generate Tests
- On your project page, click **Crawl & Generate Tests**
- The agent will:
  - Visit your app and follow internal links (up to 20 pages, depth 3)
  - Snapshot each page's interactive elements
  - Send each snapshot to Claude to generate 2-4 Playwright test cases

### 3. Run Tests
- Click **Run Tests** to execute all generated tests
- Watch live logs stream in the Run Detail view
- Review pass/fail results per test

### 4. Monitor
- The **Dashboard** shows aggregate pass rate, test counts, and run history

---

## Project Structure

```
sentri/
├── backend/
│   ├── src/
│   │   ├── index.js        # Express API server
│   │   ├── crawler.js      # Playwright crawler + Claude AI test generator
│   │   ├── testRunner.js   # Playwright test executor
│   │   └── db.js           # In-memory store (swap for Postgres)
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── api.js           # API client (with demo fallback)
│   │   ├── demo.js          # Mock data for static deployment
│   │   ├── index.css        # Design system
│   │   ├── components/
│   │   │   └── Layout.jsx   # Sidebar navigation
│   │   └── pages/
│   │       ├── Dashboard.jsx
│   │       ├── Projects.jsx
│   │       ├── ProjectDetail.jsx
│   │       ├── NewProject.jsx
│   │       └── RunDetail.jsx
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── .github/workflows/
│   ├── ci.yml               # CI: lint, build, smoke test
│   ├── cd.yml               # CD: build & push Docker images
│   └── deploy.yml           # Deploy frontend to GitHub Pages
├── docker-compose.yml
└── docker-compose.prod.yml
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/projects` | Create project |
| GET | `/api/projects` | List all projects |
| GET | `/api/projects/:id` | Get project |
| POST | `/api/projects/:id/crawl` | Start crawl + test generation |
| POST | `/api/projects/:id/run` | Execute all tests |
| GET | `/api/projects/:id/tests` | List tests |
| DELETE | `/api/projects/:id/tests/:testId` | Delete test |
| GET | `/api/projects/:id/runs` | List runs |
| GET | `/api/runs/:runId` | Get run (with live logs) |
| GET | `/api/dashboard` | Summary stats |

---

## Deployment

### GitHub Pages (Frontend Demo)

The frontend is automatically deployed to GitHub Pages on every push to `main`. The deployment workflow:
1. Builds the Vite app with the `/sentri/` base path
2. Copies `index.html` to `404.html` for SPA routing
3. Deploys to GitHub Pages

Visit: **https://rameshbabuprudhvi.github.io/sentri/**

### Docker (Full Stack)

For full-stack deployment with the backend (required for actual crawling/testing):

```bash
docker compose up --build
```

---

## Production Upgrades

For production use, consider these improvements:

| Area | Recommendation |
|------|----------------|
| **Database** | Replace in-memory `db.js` with PostgreSQL + Prisma |
| **Job Queue** | Add BullMQ + Redis for background crawl/run jobs |
| **Auth** | Add user authentication (NextAuth, Clerk, or JWT) |
| **Screenshots** | Store failure screenshots to S3/R2 |
| **Scheduling** | Add cron-based auto-runs via node-cron |
| **Notifications** | Send Slack/email alerts on failures |
| **Multi-tenant** | Add workspace/org scoping |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes (backend only) | Your Anthropic API key |
| `PORT` | No | Backend port (default: 3001) |

---

## License

MIT
