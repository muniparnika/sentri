# AI Providers

Sentri supports five AI providers. Switch at any time from the Settings page — no restart needed.

## Provider Comparison

| Provider | Model | Cost | Best For |
|---|---|---|---|
| Anthropic Claude | claude-sonnet-4-20250514 | Pay-as-you-go ($5 min) | Best quality output |
| OpenAI | gpt-4o-mini | Pay-as-you-go | Fast, high-volume crawls |
| Google Gemini | gemini-2.5-flash | Free tier (20 req/day) | Testing / evaluation |
| OpenRouter | openrouter/auto (configurable) | Pay-as-you-go | One key, 200+ models (Claude, GPT, Llama, Mixtral, …) |
| Ollama | mistral:7b (configurable) | Free, local | Privacy, no API key needed |

**Auto-detection order:** Anthropic → OpenAI → Google → OpenRouter → Ollama

## Configuration

### Via Settings Page (Runtime)

Navigate to **Settings** in the app. Enter your API key for any cloud provider, or click "Activate Ollama" for local inference.

### Via Environment Variables (Persistent)

Add to `backend/.env`:

```bash
# Cloud providers (pick one or more)
ANTHROPIC_API_KEY=sk-ant-api03-...
OPENAI_API_KEY=sk-proj-...
GOOGLE_API_KEY=AIza...
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet   # any OpenRouter slug

# Local / Ollama (no key needed)
AI_PROVIDER=local
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=mistral:7b
```

## Using OpenRouter (One Key, Many Models)

[OpenRouter](https://openrouter.ai) is a unified gateway to 200+ models behind a single OpenAI-compatible API. Useful when you want to A/B-test models or get fallback across vendors without juggling keys.

1. Get a key from [openrouter.ai/keys](https://openrouter.ai/keys)
2. In Sentri Settings, paste the key into the **OpenRouter** card — or set `OPENROUTER_API_KEY` in `.env`
3. (Optional) Pick a specific model via `OPENROUTER_MODEL`:
   - `openrouter/auto` (default — OpenRouter picks)
   - `anthropic/claude-3.5-sonnet`
   - `openai/gpt-4o-mini`
   - `meta-llama/llama-3.1-70b-instruct`
   - …see [openrouter.ai/models](https://openrouter.ai/models)

## Using Ollama (Free Local AI)

1. Install from [ollama.com](https://ollama.com)
2. Pull a model:
   ```bash
   ollama pull mistral:7b          # ~2 GB, good quality
   ollama pull qwen2.5-coder:7b  # great for code generation
   ollama pull mistral           # lighter alternative
   ```
3. Start the server: `ollama serve`
4. In Sentri Settings, select Ollama — or set `AI_PROVIDER=local` in `.env`

::: tip Recommended Models
For best results use a model with strong JSON output and code generation: **mistral:7b**, **qwen2.5-coder:7b**, or **mistral**. Small models (≤3B) may struggle to produce valid Playwright code.
:::
