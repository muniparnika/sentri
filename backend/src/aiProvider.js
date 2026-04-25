// backend/src/aiProvider.js

import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";

// ─── Playwright Capability Reference ──────────────────────────────────────────

const PLAYWRIGHT_CAPABILITIES = `
## Playwright API Reference for Test Generation

### Locator Strategies (prefer in this order)
1. getByRole('button', { name: 'Submit' })
2. getByText('Welcome')
3. getByLabel('Email')
4. getByPlaceholder('Enter email')
5. getByTestId('login-form')
6. getByAltText('Company logo')
7. getByTitle('Close dialog')
8. page.locator('css-selector') — last resort

### Actions
- click(), dblclick(), click({ button: 'right' }), click({ clickCount: 3 })
- fill('value'), type('value', { delay: 100 }), press('Enter'), press('Control+A')
- check(), uncheck(), setChecked(true/false)
- selectOption('value'), selectOption({ label: 'Option' })
- hover(), focus(), blur()
- dragTo(target), dragAndDrop(source, target)
- setInputFiles('path/to/file') or setInputFiles([file1, file2])
- page.keyboard.press('Tab'), page.keyboard.type('text')
- page.mouse.click(x, y), page.mouse.wheel(0, 100)
- scrollIntoViewIfNeeded()

### Assertions (use expect from @playwright/test)
- expect(locator).toBeVisible(), toBeHidden()
- expect(locator).toBeEnabled(), toBeDisabled()
- expect(locator).toBeChecked(), not.toBeChecked()
- expect(locator).toHaveText('exact'), toContainText('partial')
- expect(locator).toHaveValue('val'), toHaveValues(['a','b'])
- expect(locator).toHaveAttribute('href', '/path')
- expect(locator).toHaveClass(/active/)
- expect(locator).toHaveCount(5)
- expect(locator).toHaveCSS('color', 'rgb(0,0,0)')
- expect(locator).toBeFocused()
- expect(page).toHaveURL(/dashboard/), toHaveTitle('Title')
- expect(response).toBeOK()
- expect.soft(locator).toBeVisible() — soft assertions (continue on failure)

### Navigation
- page.goto(url, { waitUntil: 'domcontentloaded' | 'load' | 'networkidle' })
- page.reload(), page.goBack(), page.goForward()
- page.waitForURL('**/dashboard')

### Waiting
- locator.waitFor({ state: 'visible' | 'hidden' | 'attached' | 'detached' })
- page.waitForSelector(selector, { state, timeout })
- page.waitForLoadState('load' | 'domcontentloaded' | 'networkidle')
- page.waitForResponse(url => url.includes('/api/'))
- page.waitForRequest('**/api/data')
- page.waitForEvent('download'), page.waitForEvent('dialog')
- Auto-waiting: Playwright auto-waits for actionability before actions

### Frames & Shadow DOM
- page.frameLocator('#iframe-id').locator('button')
- page.frameLocator('iframe[name="content"]').getByRole('link')
- frame.locator('selector') for nested frame access
- locator.locator('css=pierce/selector') for shadow DOM

### Network Interception & Mocking
- page.route('**/api/users', route => route.fulfill({ json: [...] }))
- page.route('**/api/**', route => route.abort())
- page.route('**/*.png', route => route.fulfill({ path: 'mock.png' }))
- page.route(url, route => route.continue({ headers: { ...route.request().headers(), 'X-Custom': 'val' } }))
- page.waitForResponse(resp => resp.url().includes('/api/') && resp.status() === 200)
- page.on('request', req => ...), page.on('response', resp => ...)

### API Testing (without browser)
- const ctx = await request.newContext({ baseURL: 'https://api.example.com' })
- const resp = await ctx.get('/users'), ctx.post('/users', { data: {...} })
- expect(resp).toBeOK(), expect(resp.status()).toBe(200)
- const json = await resp.json()

### Authentication
- context.storageState({ path: 'auth.json' }) — save session
- browser.newContext({ storageState: 'auth.json' }) — reuse session
- context.addCookies([...]), context.clearCookies()

### Device Emulation & Viewports
- browser.newContext({ ...devices['iPhone 13'] })
- browser.newContext({ viewport: { width: 375, height: 812 } })
- browser.newContext({ geolocation: { latitude: 40.7, longitude: -74.0 }, permissions: ['geolocation'] })
- browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin' })
- browser.newContext({ colorScheme: 'dark' })

### Debugging & Artifacts
- page.screenshot({ path: 'shot.png', fullPage: true })
- context.tracing.start({ screenshots: true, snapshots: true })
- context.tracing.stop({ path: 'trace.zip' })
- page.video().path()

### Test Structure & Patterns
- test.describe('suite', () => { ... })
- test.describe.parallel('parallel suite', () => { ... })
- test.beforeEach(async ({ page }) => { ... })
- test.afterEach(async ({ page }) => { ... })
- test.use({ viewport: { width: 1280, height: 720 } })
- test.slow(), test.skip(), test.fixme()

### Error Handling
- test.describe.configure({ retries: 2 })
- expect.soft() for non-fatal assertions
- try/catch with screenshot on failure
- { timeout: 10000 } on individual actions
`;

// ─── Test Generation Prompt ───────────────────────────────────────────────────

function buildPrompt(snapshot, projectUrl) {
  const hasFrames = snapshot.iframes > 0;
  const hasShadowDOM = snapshot.shadowRoots > 0;
  const hasFileInputs = snapshot.elements.some(el => el.type === "file");
  const hasForms = snapshot.forms > 0;
  const hasDialogs = snapshot.dialogs > 0;
  const hasSelects = snapshot.elements.some(el => el.tag === "select");
  const hasCheckboxes = snapshot.elements.some(el => el.type === "checkbox" || el.type === "radio");
  const hasDraggable = snapshot.draggableCount > 0;
  const hasMedia = snapshot.mediaCount > 0;

  let contextualGuidance = "";

  if (hasFrames) {
    contextualGuidance += `\n- This page has ${snapshot.iframes} iframe(s). Generate tests using page.frameLocator() for cross-frame interactions.`;
  }
  if (hasShadowDOM) {
    contextualGuidance += `\n- This page has ${snapshot.shadowRoots} shadow DOM root(s). Use pierce selectors or shadow-piercing locators.`;
  }
  if (hasFileInputs) {
    contextualGuidance += `\n- This page has file upload input(s). Generate tests using setInputFiles() for file upload scenarios.`;
  }
  if (hasForms) {
    contextualGuidance += `\n- This page has ${snapshot.forms} form(s). Generate comprehensive form tests: fill, validation errors, submission, and reset.`;
  }
  if (hasDialogs) {
    contextualGuidance += `\n- This page has dialog/modal elements. Test opening, closing, and interacting within dialogs.`;
  }
  if (hasSelects) {
    contextualGuidance += `\n- This page has select/dropdown elements. Use selectOption() for dropdown interactions.`;
  }
  if (hasCheckboxes) {
    contextualGuidance += `\n- This page has checkboxes/radio buttons. Use check(), uncheck(), and toBeChecked() assertions.`;
  }
  if (hasDraggable) {
    contextualGuidance += `\n- This page has draggable elements. Use dragTo() or dragAndDrop() for drag interactions.`;
  }
  if (hasMedia) {
    contextualGuidance += `\n- This page has audio/video elements. Verify media loads and controls work.`;
  }

  return `You are an expert QA automation engineer specializing in Playwright. Given this page snapshot from a web application, generate 3-6 specific, production-grade Playwright test cases that thoroughly cover the page's functionality.

${PLAYWRIGHT_CAPABILITIES}

## Page Snapshot
- URL: ${snapshot.url}
- Title: ${snapshot.title}
- H1: ${snapshot.h1}
- Forms on page: ${snapshot.forms}
- Iframes: ${snapshot.iframes || 0}
- Shadow DOM roots: ${snapshot.shadowRoots || 0}
- Dialogs/modals: ${snapshot.dialogs || 0}
- Draggable elements: ${snapshot.draggableCount || 0}
- Interactive elements: ${JSON.stringify(snapshot.elements, null, 2)}

## Context-Specific Guidance
${contextualGuidance || "- Standard page with typical interactive elements."}

## Test Generation Rules
1. **Prefer semantic locators**: Use getByRole, getByText, getByLabel, getByTestId over CSS selectors.
2. **Use proper assertions**: Use expect(locator).toBeVisible(), toHaveText(), etc. — NOT manual checks.
3. **Include waits**: Use proper waiting strategies (auto-wait, waitFor, waitForLoadState) — NOT hardcoded timeouts.
4. **Cover edge cases**: Test error states, empty states, boundary conditions.
5. **Test interactions deeply**: Don't just check visibility — test clicks, fills, hovers, keyboard navigation.
6. **Handle dynamic content**: Use waitForResponse or waitForSelector for async data.
7. **Generate runnable code**: Each playwrightCode must be a complete, self-contained async function body receiving a \`page\` parameter.

## Test Types to Consider
- "visibility": element presence, text content, layout assertions
- "navigation": page transitions, URL changes, back/forward, reload
- "form": input filling, validation, submission, error messages, reset
- "interaction": clicks, hovers, keyboard, drag-drop, file uploads
- "network": API response validation, request interception, mock responses
- "accessibility": ARIA roles, keyboard navigation, focus management
- "responsive": viewport-dependent behavior, mobile layouts
- "state": check/uncheck, select options, toggle states
- "dialog": modal/dialog open/close/interaction
- "media": video/audio playback, controls

Generate test cases as a JSON array. Each test case must have:
- "name": short descriptive test name
- "description": what this test validates
- "priority": "high" | "medium" | "low"
- "type": one of the types above
- "steps": array of plain-English steps
- "playwrightCode": complete runnable async function body using \`page\` object. Must include proper assertions, waits, and error handling. Target URL: ${snapshot.url}
- "capabilities": array of Playwright APIs used (e.g., ["getByRole", "fill", "toBeVisible", "waitForLoadState"])

Generate diverse tests that cover DIFFERENT capabilities. Do not generate multiple tests that only check visibility. Include at least one test using advanced features appropriate for this page.

Return ONLY a valid JSON array. No markdown fences, no explanation, no extra text.`;
}

// ─── Validation Prompt ────────────────────────────────────────────────────────

/**
 * Build a prompt that asks the LLM to diagnose a failed test and return a
 * corrected version. Used by the self-healing pipeline.
 *
 * @param {string} testCode - The Playwright code that failed.
 * @param {string} error    - Sanitised error message from the failed run.
 * @param {Object} snapshot - DOM snapshot of the current page state.
 * @returns {string} Prompt string ready to send to a provider.
 */
export function buildValidationPrompt(testCode, error, snapshot) {
  return `You are an expert Playwright debugging engineer. A generated test has failed during execution. Analyze the failure and produce a corrected version.

${PLAYWRIGHT_CAPABILITIES}

## Failed Test Code
\`\`\`javascript
${testCode}
\`\`\`

## Error Message
${error}

## Page Context
- URL: ${snapshot.url}
- Title: ${snapshot.title}
- Interactive elements: ${JSON.stringify(snapshot.elements?.slice(0, 30), null, 2)}

## Debugging Guidelines
1. If element not found: try alternative locator strategies (getByRole → getByText → getByTestId → CSS)
2. If timeout: add proper waits (waitForLoadState, waitFor, waitForSelector)
3. If assertion failed: check if the expected value matches the current page state
4. If navigation error: verify URL patterns, add waitForURL
5. If frame error: use frameLocator correctly
6. If network error: add route/mock or waitForResponse
7. Do NOT use page.waitForTimeout() — use proper waiting strategies instead

Return a JSON object:
{
  "fixedCode": "corrected async function body using page parameter",
  "diagnosis": "what went wrong and why",
  "changes": ["list of specific changes made"],
  "locatorStrategy": "which locator strategy was used and why"
}

Return ONLY valid JSON. No markdown fences, no explanation.`;
}

// ─── Debugging Prompt ─────────────────────────────────────────────────────────

/**
 * Build a prompt that asks the LLM for a deep diagnosis of a test failure,
 * including a structured root-cause category and self-healing suggestions.
 *
 * @param {string}  testCode        - The Playwright code under analysis.
 * @param {string}  executionLog    - Full execution log for context.
 * @param {boolean} [screenshot]    - Whether a screenshot is available.
 * @returns {string} Prompt string ready to send to a provider.
 */
export function buildDebuggingPrompt(testCode, executionLog, screenshot) {
  return `You are a Playwright test debugging specialist. Analyze this test execution and provide a detailed diagnosis.

${PLAYWRIGHT_CAPABILITIES}

## Test Code
\`\`\`javascript
${testCode}
\`\`\`

## Execution Log
${executionLog}

${screenshot ? "## Screenshot\nA screenshot of the page state at failure is available for context." : ""}

## Analysis Required
1. Root cause of failure
2. Whether the test logic is correct but the page changed, or the test itself is flawed
3. Recommended fix with specific Playwright API calls
4. Alternative locator strategies to make the test more resilient
5. Any self-healing suggestions (fallback selectors, retry patterns)

Return a JSON object:
{
  "rootCause": "detailed explanation",
  "category": "locator_failure" | "timing_issue" | "page_changed" | "network_error" | "assertion_mismatch" | "frame_error" | "auth_expired",
  "fixedCode": "corrected async function body or null if page changed",
  "selfHealingSuggestions": ["list of resilience improvements"],
  "alternativeLocators": ["list of alternative selectors to try"]
}

Return ONLY valid JSON. No markdown fences, no explanation.`;
}

// ─── Response parser ──────────────────────────────────────────────────────────

function parseResponse(raw) {
  try {
    const cleaned = raw.trim().replace(/^```json\n?/, "").replace(/^```\n?/, "").replace(/\n?```$/, "");
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Parse a raw LLM response that should contain a single JSON object.
 *
 * Strips surrounding markdown code fences (```json ... ```), then runs
 * `JSON.parse`. Returns `null` if the input is not valid JSON, so callers
 * can branch without a try/catch.
 *
 * @param {string} raw - Raw text from the provider.
 * @returns {Object|null} Parsed object, or `null` on parse failure.
 */
export function parseJsonResponse(raw) {
  try {
    const cleaned = raw.trim().replace(/^```json\n?/, "").replace(/^```\n?/, "").replace(/\n?```$/, "");
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

// ─── Providers ────────────────────────────────────────────────────────────────

async function runAnthropic(prompt) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });
  return msg.content[0].text;
}

async function runGemini(prompt) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

async function runOpenAI(prompt) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });
  return response.choices[0].message.content;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

const PROVIDERS = {
  anthropic: runAnthropic,
  gemini: runGemini,
  openai: runOpenAI,
};

export async function generateTests(snapshot, projectUrl) {
  const providerName = (process.env.AI_PROVIDER || "anthropic").toLowerCase();
  const providerFn = PROVIDERS[providerName];

  if (!providerFn) {
    throw new Error(
      `Unknown AI_PROVIDER: "${providerName}". Valid options: ${Object.keys(PROVIDERS).join(", ")}`
    );
  }

  const prompt = buildPrompt(snapshot, projectUrl);
  const raw = await providerFn(prompt);
  return parseResponse(raw);
}

/**
 * Ask the configured provider to diagnose and correct a failed test.
 *
 * @param {string} testCode - The Playwright code that failed.
 * @param {string} error    - Sanitised error message from the failed run.
 * @param {Object} snapshot - DOM snapshot of the current page state.
 * @returns {Promise<Object|null>} Parsed `{ fixedCode, diagnosis, ... }` or `null` on parse failure.
 * @throws {Error} If `AI_PROVIDER` is unknown.
 */
export async function validateTest(testCode, error, snapshot) {
  const providerName = (process.env.AI_PROVIDER || "anthropic").toLowerCase();
  const providerFn = PROVIDERS[providerName];

  if (!providerFn) {
    throw new Error(`Unknown AI_PROVIDER: "${providerName}"`);
  }

  const prompt = buildValidationPrompt(testCode, error, snapshot);
  const raw = await providerFn(prompt);
  return parseJsonResponse(raw);
}

/**
 * Ask the configured provider for a deep failure analysis.
 *
 * @param {string}  testCode     - The Playwright code under analysis.
 * @param {string}  executionLog - Full execution log for context.
 * @param {boolean} [screenshot] - Whether a screenshot is available.
 * @returns {Promise<Object|null>} Parsed `{ rootCause, category, ... }` or `null` on parse failure.
 * @throws {Error} If `AI_PROVIDER` is unknown.
 */
export async function debugTest(testCode, executionLog, screenshot) {
  const providerName = (process.env.AI_PROVIDER || "anthropic").toLowerCase();
  const providerFn = PROVIDERS[providerName];

  if (!providerFn) {
    throw new Error(`Unknown AI_PROVIDER: "${providerName}"`);
  }

  const prompt = buildDebuggingPrompt(testCode, executionLog, screenshot);
  const raw = await providerFn(prompt);
  return parseJsonResponse(raw);
}
