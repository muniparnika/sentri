import { chromium } from "playwright";
import { v4 as uuidv4 } from "uuid";
import { generateTests } from "./aiProvider.js";

const MAX_PAGES = 20;
const MAX_DEPTH = 3;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(run, msg) {
  const entry = `[${new Date().toISOString()}] ${msg}`;
  run.logs.push(entry);
  console.log(entry);
}

function sameOrigin(base, href) {
  try {
    return new URL(href).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

function normalizeUrl(href, base) {
  try {
    const u = new URL(href, base);
    u.hash = "";
    u.search = "";
    return u.toString();
  } catch {
    return null;
  }
}

// ─── Enhanced DOM snapshot ────────────────────────────────────────────────────

async function takeSnapshot(page) {
  return page.evaluate(() => {
    const interactable = [];

    // Expanded selector list to capture more interactive element types
    const selectors = [
      "a", "button", "input", "select", "textarea",
      "[role='button']", "[role='link']", "[role='tab']", "[role='menuitem']",
      "[role='checkbox']", "[role='radio']", "[role='switch']", "[role='slider']",
      "[role='combobox']", "[role='listbox']", "[role='dialog']", "[role='alertdialog']",
      "form", "details", "summary",
      "[draggable='true']", "[contenteditable='true']",
      "[data-testid]", "[data-test]", "[data-cy]",
    ];

    const elements = document.querySelectorAll(selectors.join(", "));
    elements.forEach((el) => {
      const tag = el.tagName.toLowerCase();
      const text = (el.innerText || el.value || el.placeholder || el.getAttribute("aria-label") || "")
        .trim()
        .slice(0, 120);
      const type = el.getAttribute("type") || "";
      const href = el.getAttribute("href") || "";
      const id = el.id || "";
      const name = el.getAttribute("name") || "";
      const role = el.getAttribute("role") || "";
      const testId = el.getAttribute("data-testid") || el.getAttribute("data-test") || el.getAttribute("data-cy") || "";
      const ariaLabel = el.getAttribute("aria-label") || "";
      const ariaExpanded = el.getAttribute("aria-expanded");
      const ariaHaspopup = el.getAttribute("aria-haspopup") || "";
      const disabled = el.disabled || el.getAttribute("aria-disabled") === "true";
      const required = el.required || el.getAttribute("aria-required") === "true";
      const draggable = el.draggable || el.getAttribute("draggable") === "true";
      const pattern = el.getAttribute("pattern") || "";

      interactable.push({
        tag, text, type, href, id, name, role,
        testId, ariaLabel, ariaExpanded, ariaHaspopup,
        disabled, required, draggable, pattern,
      });
    });

    // Detect iframes
    const iframeCount = document.querySelectorAll("iframe").length;
    const iframeDetails = Array.from(document.querySelectorAll("iframe")).slice(0, 10).map((f) => ({
      id: f.id || "",
      name: f.name || "",
      src: f.src || "",
      title: f.title || "",
    }));

    // Detect shadow DOM roots
    let shadowRootCount = 0;
    const allElements = document.querySelectorAll("*");
    for (const el of allElements) {
      if (el.shadowRoot) shadowRootCount++;
      if (shadowRootCount >= 20) break;
    }

    // Detect dialogs/modals
    const dialogCount = document.querySelectorAll(
      "dialog, [role='dialog'], [role='alertdialog'], .modal, [class*='modal'], [class*='dialog']"
    ).length;

    // Detect draggable elements
    const draggableCount = document.querySelectorAll("[draggable='true']").length;

    // Detect media elements
    const mediaCount = document.querySelectorAll("video, audio, canvas").length;

    // Detect file inputs
    const fileInputCount = document.querySelectorAll("input[type='file']").length;

    // Detect tables
    const tableCount = document.querySelectorAll("table").length;

    // Detect navigation landmarks
    const navCount = document.querySelectorAll("nav, [role='navigation']").length;

    return {
      title: document.title,
      url: location.href,
      elements: interactable.slice(0, 80),
      h1: Array.from(document.querySelectorAll("h1")).map((h) => h.innerText).join(" | "),
      forms: Array.from(document.querySelectorAll("form")).length,
      iframes: iframeCount,
      iframeDetails,
      shadowRoots: shadowRootCount,
      dialogs: dialogCount,
      draggableCount,
      mediaCount,
      fileInputCount,
      tableCount,
      navCount,
      metaDescription: document.querySelector('meta[name="description"]')?.content || "",
      hasServiceWorker: !!navigator.serviceWorker?.controller,
    };
  });
}

// ─── Main crawler ─────────────────────────────────────────────────────────────

export async function crawlAndGenerateTests(project, run, db) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (compatible; AutonomousQA/1.0)",
  });

  const visited = new Set();
  const queue = [{ url: project.url, depth: 0 }];
  const pageSnapshots = [];

  log(run, `Starting crawl of ${project.url}`);

  // Handle login if credentials provided
  if (project.credentials) {
    const loginPage = await context.newPage();
    try {
      await loginPage.goto(project.url, { timeout: 15000 });
      const { usernameSelector, username, passwordSelector, password, submitSelector } =
        project.credentials;
      if (usernameSelector && username) {
        await loginPage.fill(usernameSelector, username);
        await loginPage.fill(passwordSelector, password);
        await loginPage.click(submitSelector);
        await loginPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        log(run, `Logged in as ${username}`);
      }
    } catch (e) {
      log(run, `Login attempt failed: ${e.message}`);
    }
    await loginPage.close();
  }

  while (queue.length > 0 && visited.size < MAX_PAGES) {
    const { url, depth } = queue.shift();
    if (visited.has(url) || depth > MAX_DEPTH) continue;
    visited.add(url);

    const page = await context.newPage();
    try {
      log(run, `Visiting (depth ${depth}): ${url}`);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});

      const snapshot = await takeSnapshot(page);
      pageSnapshots.push(snapshot);
      run.pagesFound = pageSnapshots.length;

      if (depth < MAX_DEPTH) {
        const links = await page.$$eval("a[href]", (els) => els.map((e) => e.href));
        for (const href of links) {
          const normalized = normalizeUrl(href, url);
          if (normalized && sameOrigin(project.url, normalized) && !visited.has(normalized)) {
            queue.push({ url: normalized, depth: depth + 1 });
          }
        }
      }
    } catch (err) {
      log(run, `Failed to visit ${url}: ${err.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  log(run, `Crawl complete. Found ${pageSnapshots.length} pages. Generating tests with AI...`);

  // Generate tests per page using the provider abstraction
  for (const snapshot of pageSnapshots) {
    log(run, `Generating tests for: ${snapshot.url}`);
    try {
      const generatedTests = await generateTests(snapshot, project.url);
      for (const t of generatedTests) {
        const testId = uuidv4();
        db.tests[testId] = {
          id: testId,
          projectId: project.id,
          sourceUrl: snapshot.url,
          pageTitle: snapshot.title,
          createdAt: new Date().toISOString(),
          lastResult: null,
          ...t,
        };
        run.tests.push(testId);
      }
      log(run, `  Generated ${generatedTests.length} tests`);
    } catch (err) {
      log(run, `  AI generation failed for ${snapshot.url}: ${err.message}`);
    }
  }

  run.status = "completed";
  run.finishedAt = new Date().toISOString();
  log(run, `Done! Generated ${run.tests.length} total tests.`);
}
