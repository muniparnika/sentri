import { chromium, firefox, webkit } from "playwright";
import { expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { EventEmitter } from "events";
import { validateTest } from "./aiProvider.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const ARTIFACTS_DIR = path.join(__dirname, "..", "artifacts");

// Global event emitter for SSE log streaming
export const runEvents = new EventEmitter();
runEvents.setMaxListeners(50);

// Browser engine registry
const BROWSER_ENGINES = {
  chromium,
  firefox,
  webkit,
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function log(run, msg) {
  const entry = `[${new Date().toISOString()}] ${msg}`;
  run.logs.push(entry);
  console.log(entry);
  runEvents.emit(`log:${run.id}`, entry);
}

// ─── Dynamic Playwright code execution ────────────────────────────────────────

async function executeDynamicCode(page, playwrightCode, context) {
  const wrappedCode = `
    return (async () => {
      ${playwrightCode}
    })();
  `;

  const fn = new Function("page", "expect", "context", wrappedCode);
  await fn(page, expect, context);
}

// ─── Fallback static test execution ───────────────────────────────────────────

async function executeStaticTest(test, page) {
  if (test.type === "visibility") {
    const title = await page.title();
    if (!title) throw new Error("Page has no title");

    const bodyText = await page.locator("body").innerText().catch(() => "");
    const errorPatterns = ["404", "not found", "500", "error", "forbidden"];
    const hasError = errorPatterns.some((p) => bodyText.toLowerCase().includes(p));
    if (hasError) {
      const h1 = await page.locator("h1").first().innerText().catch(() => "");
      if (errorPatterns.some((p) => h1.toLowerCase().includes(p))) {
        throw new Error(`Error page detected: ${h1}`);
      }
    }
  }

  if (test.type === "navigation") {
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    const url = page.url();
    if (!url.startsWith("http")) throw new Error("Invalid URL after navigation");
  }

  if (test.type === "form") {
    const forms = await page.locator("form").count();
    const inputs = await page.locator("input:visible").count();
    if (forms === 0 && inputs === 0) {
      return { status: "warning", error: "No forms found on page (may have changed)" };
    }
  }

  if (test.type === "interaction") {
    const buttons = page.locator("button:visible, [role='button']:visible");
    const count = await buttons.count();
    if (count > 0) {
      const firstBtn = buttons.first();
      const isEnabled = await firstBtn.isEnabled().catch(() => false);
      if (!isEnabled) {
        return { status: "warning", error: "Primary button appears disabled" };
      }
    }
  }

  if (test.type === "accessibility") {
    const headings = await page.locator("h1, h2, h3, h4, h5, h6").count();
    if (headings === 0) {
      return { status: "warning", error: "No heading elements found — may impact accessibility" };
    }
    const images = page.locator("img:not([alt])");
    const missingAlt = await images.count();
    if (missingAlt > 0) {
      return { status: "warning", error: `${missingAlt} image(s) missing alt text` };
    }
  }

  if (test.type === "responsive") {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (overflowX) {
      return { status: "warning", error: "Page has horizontal overflow at mobile viewport (375px)" };
    }
    await page.setViewportSize({ width: 1280, height: 720 });
  }

  return { status: "passed" };
}

// ─── Single test executor ─────────────────────────────────────────────────────

async function executeTest(test, context, screenshotDir, run, options = {}) {
  const page = await context.newPage();
  const result = {
    testId: test.id,
    testName: test.name,
    status: "passed",
    durationMs: 0,
    error: null,
    screenshot: null,
    screenshotPath: null,
    videoPath: null,
    executionMode: "static",
    capabilities: test.capabilities || [],
    retryCount: 0,
  };

  const start = Date.now();
  const maxRetries = options.retries ?? 1;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    result.retryCount = attempt;
    try {
      // Set up network interception if test requires it
      if (test.type === "network" && test.mockRoutes) {
        for (const mock of test.mockRoutes) {
          await page.route(mock.pattern, (route) => {
            route.fulfill({
              status: mock.status || 200,
              contentType: mock.contentType || "application/json",
              body: typeof mock.body === "string" ? mock.body : JSON.stringify(mock.body),
            });
          });
        }
      }

      // Navigate to the page
      await page.goto(test.sourceUrl, {
        waitUntil: "domcontentloaded",
        timeout: options.navigationTimeout ?? 20000,
      });
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});

      // Execute AI-generated Playwright code if available
      if (test.playwrightCode && typeof test.playwrightCode === "string" && test.playwrightCode.trim().length > 0) {
        result.executionMode = "dynamic";
        await executeDynamicCode(page, test.playwrightCode, context);
        result.status = "passed";
      } else {
        // Fallback to static test execution
        const staticResult = await executeStaticTest(test, page);
        result.status = staticResult.status || "passed";
        if (staticResult.error) result.error = staticResult.error;
      }

      // Take screenshot on success
      const screenshotFile = path.join(screenshotDir, `${test.id}.png`);
      await page.screenshot({ path: screenshotFile, type: "png", fullPage: true });
      result.screenshot = fs.readFileSync(screenshotFile).toString("base64");
      result.screenshotPath = screenshotFile;

      break; // success, no retry needed
    } catch (err) {
      if (attempt < maxRetries) {
        log(run, `    Retry ${attempt + 1}/${maxRetries} for: ${test.name}`);
        await page.goto("about:blank").catch(() => {});
        continue;
      }

      result.status = "failed";
      result.error = err.message;
      try {
        const screenshotFile = path.join(screenshotDir, `${test.id}.png`);
        await page.screenshot({ path: screenshotFile, type: "png", fullPage: true });
        result.screenshot = fs.readFileSync(screenshotFile).toString("base64");
        result.screenshotPath = screenshotFile;
      } catch {
        // Screenshot capture failed
      }
    }
  }

  result.durationMs = Date.now() - start;

  // Capture video path before closing
  try {
    const video = page.video();
    if (video) {
      result.videoPath = await video.path();
    }
  } catch {
    // Video path retrieval failed
  }

  await page.close();
  return result;
}

// ─── Self-healing: attempt to fix and re-run failed tests ─────────────────────

async function attemptSelfHeal(test, error, context, screenshotDir, run, options) {
  try {
    log(run, `    Self-healing: attempting AI-driven fix for ${test.name}`);
    const snapshot = {
      url: test.sourceUrl,
      title: test.pageTitle || "",
      elements: [],
    };
    const fix = await validateTest(test.playwrightCode, error, snapshot);
    if (fix && fix.fixedCode) {
      log(run, `    Self-healing: applying fix — ${fix.diagnosis || "AI correction"}`);
      const healedTest = { ...test, playwrightCode: fix.fixedCode };
      const healedResult = await executeTest(healedTest, context, screenshotDir, run, { ...options, retries: 0 });
      if (healedResult.status === "passed") {
        healedResult.selfHealed = true;
        healedResult.originalError = error;
        return healedResult;
      }
    }
  } catch (healErr) {
    log(run, `    Self-healing failed: ${healErr.message}`);
  }
  return null;
}

// ─── Main test runner ─────────────────────────────────────────────────────────

export async function runTests(project, tests, run, db, options = {}) {
  // Create artifacts directories for this run
  const runDir = path.join(ARTIFACTS_DIR, run.id);
  const videoDir = path.join(runDir, "videos");
  const screenshotDir = path.join(runDir, "screenshots");
  const traceDir = path.join(runDir, "traces");
  ensureDir(videoDir);
  ensureDir(screenshotDir);
  ensureDir(traceDir);

  // Store artifact info in run for later reference
  run.artifactsDir = runDir;
  run.artifactsUrl = `/artifacts/${run.id}`;

  // Per-request headed flag overrides the env var default
  const headless = options.headed === true
    ? false
    : (process.env.HEADLESS || "true").toLowerCase() === "true";

  // Multi-browser support: default to chromium
  const browserName = (options.browser || process.env.BROWSER_ENGINE || "chromium").toLowerCase();
  const browserEngine = BROWSER_ENGINES[browserName];
  if (!browserEngine) {
    throw new Error(`Unknown browser engine: "${browserName}". Valid: ${Object.keys(BROWSER_ENGINES).join(", ")}`);
  }

  const launchOptions = {
    headless,
    executablePath: browserName === "chromium"
      ? (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined)
      : undefined,
    args: browserName === "chromium"
      ? ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
      : [],
  };

  const browser = await browserEngine.launch(launchOptions);

  // Context options with device emulation support
  const contextOptions = {
    userAgent: options.userAgent || "Mozilla/5.0 (compatible; AutonomousQA/1.0)",
    recordVideo: {
      dir: videoDir,
      size: { width: 1280, height: 720 },
    },
  };

  // Apply viewport / device emulation
  if (options.viewport) {
    contextOptions.viewport = options.viewport;
  }
  if (options.device) {
    const { devices } = await import("playwright");
    const deviceConfig = devices[options.device];
    if (deviceConfig) {
      Object.assign(contextOptions, deviceConfig);
    }
  }
  if (options.colorScheme) {
    contextOptions.colorScheme = options.colorScheme;
  }
  if (options.locale) {
    contextOptions.locale = options.locale;
  }
  if (options.geolocation) {
    contextOptions.geolocation = options.geolocation;
    contextOptions.permissions = ["geolocation"];
  }
  if (options.storageState) {
    contextOptions.storageState = options.storageState;
  }

  const context = await browser.newContext(contextOptions);

  // Start tracing for this run
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: false,
  });

  log(run, `Starting test run: ${tests.length} tests`);
  log(run, `Browser: ${browserName} | Headed: ${!headless} | Video: enabled | Tracing: enabled`);
  if (options.device) log(run, `Device emulation: ${options.device}`);
  if (options.retries) log(run, `Retries per test: ${options.retries}`);

  const selfHealEnabled = options.selfHeal !== false && !!process.env.ANTHROPIC_API_KEY || !!process.env.GEMINI_API_KEY || !!process.env.OPENAI_API_KEY;

  for (const test of tests) {
    log(run, `  Running: ${test.name} [${test.type}]`);
    try {
      let result = await executeTest(test, context, screenshotDir, run, options);

      // Attempt self-healing for failed dynamic tests
      if (result.status === "failed" && result.executionMode === "dynamic" && selfHealEnabled) {
        const healedResult = await attemptSelfHeal(test, result.error, context, screenshotDir, run, options);
        if (healedResult) {
          result = healedResult;
          log(run, `    SELF-HEALED (was: ${result.originalError})`);
        }
      }

      run.results.push(result);

      if (result.status === "passed") {
        run.passed++;
        log(run, `    PASSED (${result.durationMs}ms) [${result.executionMode}]`);
      } else if (result.status === "warning") {
        run.passed++; // Count warnings as passed
        log(run, `    WARNING: ${result.error}`);
      } else {
        run.failed++;
        log(run, `    FAILED: ${result.error}`);
      }

      // Update test's last result
      if (db.tests[test.id]) {
        db.tests[test.id].lastResult = result.status;
        db.tests[test.id].lastRunAt = new Date().toISOString();
      }
    } catch (err) {
      run.failed++;
      run.results.push({
        testId: test.id,
        testName: test.name,
        status: "failed",
        error: err.message,
        durationMs: 0,
        executionMode: "error",
      });
      log(run, `    FAILED (exception): ${err.message}`);
    }
  }

  // Stop tracing and save trace file
  const traceFile = path.join(traceDir, "trace.zip");
  try {
    await context.tracing.stop({ path: traceFile });
    run.tracePath = traceFile;
    run.traceUrl = `/artifacts/${run.id}/traces/trace.zip`;
    log(run, `Trace saved: ${run.traceUrl}`);
  } catch (err) {
    log(run, `Warning: Failed to save trace: ${err.message}`);
  }

  await context.close();

  // After context is closed, video files are finalized
  try {
    const videoFiles = fs.readdirSync(videoDir);
    log(run, `Videos generated: ${videoFiles.length} files`);
    run.videos = videoFiles.map((f) => `/artifacts/${run.id}/videos/${f}`);

    for (const result of run.results) {
      if (result.videoPath) {
        const filename = path.basename(result.videoPath);
        result.videoUrl = `/artifacts/${run.id}/videos/${filename}`;
      }
    }
  } catch (err) {
    log(run, `Warning: Could not read video directory: ${err.message}`);
  }

  await browser.close();

  run.status = "completed";
  run.finishedAt = new Date().toISOString();
  run.browserEngine = browserName;
  log(
    run,
    `Run complete: ${run.passed} passed, ${run.failed} failed out of ${run.total}`
  );

  // Emit run completed event for SSE
  runEvents.emit(`complete:${run.id}`, run);
}
