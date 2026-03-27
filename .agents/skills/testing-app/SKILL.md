# Testing Sentri

## Starting the App

```bash
# Backend (port 3001)
cd backend && HEADLESS=true npm run dev

# Frontend (port 3000) — proxies /api and /artifacts to backend
cd frontend && npm run dev
```

## Seeding Test Data Without AI Key

The crawl step requires an AI provider key (ANTHROPIC_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY). To test the execution pipeline without one:

1. Temporarily add a seed endpoint to `backend/src/index.js` that creates a project and test records in the in-memory DB
2. Call it via `curl -X POST http://localhost:3001/api/seed`
3. Remove the endpoint after testing

## Testing the Execution Pipeline

1. Navigate to `http://localhost:3000/projects` and click a project
2. Click "Run Tests" — a "Run in progress..." banner appears
3. Click "View Live" to see the RunDetail page
4. Verify:
   - **SSE logs**: Timestamped entries appear in Agent Logs panel
   - **Video player**: Auto-opens after run completes with "TEST RECORDING" heading
   - **Per-test buttons**: Each result has Video and Screenshot action buttons
   - **Trace download**: "Download Playwright Trace" link downloads a .zip file
   - **Headless log**: Should show `Headed mode: false` by default

## Verifying Video-to-Result Mapping

```bash
curl -s http://localhost:3001/api/runs/<runId> | python3 -c "
import sys, json, os
run = json.load(sys.stdin)
for r in run.get('results', []):
    vpath = r.get('videoPath', '')
    vurl = r.get('videoUrl', '')
    print(f'{r["testName"]}: {os.path.basename(vpath)} == {vurl.rsplit("/",1)[-1]}')
"
```

Each result's videoUrl filename should match the videoPath basename.

## Key Environment Variables

- `HEADLESS` — defaults to `true`; set to `false` for headed browser mode
- `AI_PROVIDER` — `anthropic` (default), `gemini`, or `openai`
- `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `OPENAI_API_KEY` — required for crawl/test generation
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` — optional custom Chromium path

## Important: Vite Proxy

The frontend Vite config must proxy both `/api` and `/artifacts` to the backend. Without the `/artifacts` proxy, videos/screenshots/traces will 404 in dev mode.
