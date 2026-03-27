// Demo/mock data for static GitHub Pages deployment (no backend required)

const demoProjects = [
  {
    id: "demo-proj-1",
    name: "E-Commerce Platform",
    url: "https://demo-shop.example.com",
    credentials: null,
    createdAt: "2026-03-20T10:30:00Z",
    status: "idle",
  },
  {
    id: "demo-proj-2",
    name: "Admin Dashboard",
    url: "https://admin.example.com",
    credentials: null,
    createdAt: "2026-03-18T08:15:00Z",
    status: "idle",
  },
  {
    id: "demo-proj-3",
    name: "Marketing Site",
    url: "https://www.example.com",
    credentials: null,
    createdAt: "2026-03-15T14:00:00Z",
    status: "idle",
  },
];

const demoTests = [
  { id: "t1", projectId: "demo-proj-1", name: "Homepage loads correctly", description: "Verify the homepage loads with all key elements visible including hero banner and product grid", type: "visibility", priority: "high", sourceUrl: "https://demo-shop.example.com/", pageTitle: "Shop - Home", lastResult: "passed", lastRunAt: "2026-03-25T12:00:00Z", createdAt: "2026-03-20T11:00:00Z" },
  { id: "t2", projectId: "demo-proj-1", name: "Product search works", description: "Search for a product and verify results appear correctly", type: "interaction", priority: "high", sourceUrl: "https://demo-shop.example.com/search", pageTitle: "Search", lastResult: "passed", lastRunAt: "2026-03-25T12:00:00Z", createdAt: "2026-03-20T11:00:00Z" },
  { id: "t3", projectId: "demo-proj-1", name: "Cart form validation", description: "Verify checkout form validates required fields properly", type: "form", priority: "medium", sourceUrl: "https://demo-shop.example.com/cart", pageTitle: "Cart", lastResult: "failed", lastRunAt: "2026-03-25T12:00:00Z", createdAt: "2026-03-20T11:00:00Z" },
  { id: "t4", projectId: "demo-proj-1", name: "Navigation menu links", description: "Verify all navigation menu links are accessible and working", type: "navigation", priority: "medium", sourceUrl: "https://demo-shop.example.com/", pageTitle: "Shop - Home", lastResult: "passed", lastRunAt: "2026-03-25T12:00:00Z", createdAt: "2026-03-20T11:00:00Z" },
  { id: "t5", projectId: "demo-proj-1", name: "Product detail page", description: "Verify product detail page shows image, price, and add-to-cart button", type: "visibility", priority: "high", sourceUrl: "https://demo-shop.example.com/products/1", pageTitle: "Product Detail", lastResult: "passed", lastRunAt: "2026-03-25T12:00:00Z", createdAt: "2026-03-20T11:00:00Z" },
  { id: "t6", projectId: "demo-proj-2", name: "Login page loads", description: "Admin login page loads with username and password fields", type: "visibility", priority: "high", sourceUrl: "https://admin.example.com/login", pageTitle: "Admin Login", lastResult: "passed", lastRunAt: "2026-03-24T09:00:00Z", createdAt: "2026-03-18T09:00:00Z" },
  { id: "t7", projectId: "demo-proj-2", name: "Dashboard widgets render", description: "Verify all dashboard widgets render with data", type: "visibility", priority: "high", sourceUrl: "https://admin.example.com/dashboard", pageTitle: "Dashboard", lastResult: "passed", lastRunAt: "2026-03-24T09:00:00Z", createdAt: "2026-03-18T09:00:00Z" },
  { id: "t8", projectId: "demo-proj-2", name: "User management table", description: "Users table loads with pagination controls", type: "interaction", priority: "medium", sourceUrl: "https://admin.example.com/users", pageTitle: "Users", lastResult: "warning", lastRunAt: "2026-03-24T09:00:00Z", createdAt: "2026-03-18T09:00:00Z" },
  { id: "t9", projectId: "demo-proj-3", name: "Landing page hero", description: "Hero section displays with CTA button", type: "visibility", priority: "high", sourceUrl: "https://www.example.com/", pageTitle: "Example - Home", lastResult: "passed", lastRunAt: "2026-03-23T16:00:00Z", createdAt: "2026-03-15T14:30:00Z" },
  { id: "t10", projectId: "demo-proj-3", name: "Contact form submission", description: "Contact form accepts input and shows success message", type: "form", priority: "medium", sourceUrl: "https://www.example.com/contact", pageTitle: "Contact Us", lastResult: "passed", lastRunAt: "2026-03-23T16:00:00Z", createdAt: "2026-03-15T14:30:00Z" },
];

const demoRuns = [
  {
    id: "run-1", projectId: "demo-proj-1", type: "test_run", status: "completed",
    startedAt: "2026-03-25T12:00:00Z", finishedAt: "2026-03-25T12:02:30Z",
    passed: 4, failed: 1, total: 5,
    logs: [
      "[2026-03-25T12:00:00Z] \uD83D\uDE80 Starting test run: 5 tests",
      "[2026-03-25T12:00:05Z]   \u25B6 Running: Homepage loads correctly",
      "[2026-03-25T12:00:08Z]     \u2705 PASSED (3200ms)",
      "[2026-03-25T12:00:08Z]   \u25B6 Running: Product search works",
      "[2026-03-25T12:00:12Z]     \u2705 PASSED (4100ms)",
      "[2026-03-25T12:00:12Z]   \u25B6 Running: Cart form validation",
      "[2026-03-25T12:00:16Z]     \u274C FAILED: Form submit button not found",
      "[2026-03-25T12:00:16Z]   \u25B6 Running: Navigation menu links",
      "[2026-03-25T12:00:19Z]     \u2705 PASSED (2800ms)",
      "[2026-03-25T12:00:19Z]   \u25B6 Running: Product detail page",
      "[2026-03-25T12:00:22Z]     \u2705 PASSED (3500ms)",
      "[2026-03-25T12:00:22Z] \uD83C\uDFC1 Run complete: 4 passed, 1 failed out of 5",
    ],
    results: [
      { testId: "t1", testName: "Homepage loads correctly", status: "passed", durationMs: 3200, error: null },
      { testId: "t2", testName: "Product search works", status: "passed", durationMs: 4100, error: null },
      { testId: "t3", testName: "Cart form validation", status: "failed", durationMs: 3900, error: "Form submit button not found" },
      { testId: "t4", testName: "Navigation menu links", status: "passed", durationMs: 2800, error: null },
      { testId: "t5", testName: "Product detail page", status: "passed", durationMs: 3500, error: null },
    ],
  },
  {
    id: "run-2", projectId: "demo-proj-1", type: "crawl", status: "completed",
    startedAt: "2026-03-20T11:00:00Z", finishedAt: "2026-03-20T11:05:00Z",
    pagesFound: 8, tests: ["t1", "t2", "t3", "t4", "t5"],
    logs: [
      "[2026-03-20T11:00:00Z] \uD83D\uDD77\uFE0F  Starting crawl of https://demo-shop.example.com",
      "[2026-03-20T11:00:02Z] \uD83D\uDCC4 Visiting (depth 0): https://demo-shop.example.com/",
      "[2026-03-20T11:00:05Z] \uD83D\uDCC4 Visiting (depth 1): https://demo-shop.example.com/search",
      "[2026-03-20T11:00:08Z] \uD83D\uDCC4 Visiting (depth 1): https://demo-shop.example.com/cart",
      "[2026-03-20T11:00:11Z] \uD83D\uDCC4 Visiting (depth 1): https://demo-shop.example.com/products/1",
      "[2026-03-20T11:00:14Z] \uD83D\uDCC4 Visiting (depth 2): https://demo-shop.example.com/products/2",
      "[2026-03-20T11:00:17Z] \uD83D\uDCC4 Visiting (depth 2): https://demo-shop.example.com/about",
      "[2026-03-20T11:00:20Z] \uD83D\uDCC4 Visiting (depth 2): https://demo-shop.example.com/faq",
      "[2026-03-20T11:00:23Z] \uD83D\uDCC4 Visiting (depth 2): https://demo-shop.example.com/terms",
      "[2026-03-20T11:00:23Z] \u2705 Crawl complete. Found 8 pages. Generating tests with AI...",
      "[2026-03-20T11:01:00Z] \uD83E\uDD16 Generating tests for: https://demo-shop.example.com/",
      "[2026-03-20T11:01:10Z]   \u2192 Generated 2 tests",
      "[2026-03-20T11:01:20Z] \uD83E\uDD16 Generating tests for: https://demo-shop.example.com/search",
      "[2026-03-20T11:01:30Z]   \u2192 Generated 1 tests",
      "[2026-03-20T11:01:40Z] \uD83E\uDD16 Generating tests for: https://demo-shop.example.com/cart",
      "[2026-03-20T11:01:50Z]   \u2192 Generated 1 tests",
      "[2026-03-20T11:02:00Z] \uD83E\uDD16 Generating tests for: https://demo-shop.example.com/products/1",
      "[2026-03-20T11:02:10Z]   \u2192 Generated 1 tests",
      "[2026-03-20T11:02:10Z] \uD83C\uDF89 Done! Generated 5 total tests.",
    ],
  },
  {
    id: "run-3", projectId: "demo-proj-2", type: "test_run", status: "completed",
    startedAt: "2026-03-24T09:00:00Z", finishedAt: "2026-03-24T09:01:45Z",
    passed: 2, failed: 0, total: 3,
    logs: [
      "[2026-03-24T09:00:00Z] \uD83D\uDE80 Starting test run: 3 tests",
      "[2026-03-24T09:00:05Z]   \u25B6 Running: Login page loads",
      "[2026-03-24T09:00:09Z]     \u2705 PASSED (4200ms)",
      "[2026-03-24T09:00:09Z]   \u25B6 Running: Dashboard widgets render",
      "[2026-03-24T09:00:14Z]     \u2705 PASSED (5100ms)",
      "[2026-03-24T09:00:14Z]   \u25B6 Running: User management table",
      "[2026-03-24T09:00:18Z]     \u26A0\uFE0F  WARNING: Pagination controls not found",
      "[2026-03-24T09:00:18Z] \uD83C\uDFC1 Run complete: 2 passed, 0 failed out of 3",
    ],
    results: [
      { testId: "t6", testName: "Login page loads", status: "passed", durationMs: 4200, error: null },
      { testId: "t7", testName: "Dashboard widgets render", status: "passed", durationMs: 5100, error: null },
      { testId: "t8", testName: "User management table", status: "warning", durationMs: 3800, error: "Pagination controls not found" },
    ],
  },
  {
    id: "run-4", projectId: "demo-proj-3", type: "test_run", status: "completed",
    startedAt: "2026-03-23T16:00:00Z", finishedAt: "2026-03-23T16:01:00Z",
    passed: 2, failed: 0, total: 2,
    logs: [
      "[2026-03-23T16:00:00Z] \uD83D\uDE80 Starting test run: 2 tests",
      "[2026-03-23T16:00:04Z]   \u25B6 Running: Landing page hero",
      "[2026-03-23T16:00:07Z]     \u2705 PASSED (3100ms)",
      "[2026-03-23T16:00:07Z]   \u25B6 Running: Contact form submission",
      "[2026-03-23T16:00:11Z]     \u2705 PASSED (4400ms)",
      "[2026-03-23T16:00:11Z] \uD83C\uDFC1 Run complete: 2 passed, 0 failed out of 2",
    ],
    results: [
      { testId: "t9", testName: "Landing page hero", status: "passed", durationMs: 3100, error: null },
      { testId: "t10", testName: "Contact form submission", status: "passed", durationMs: 4400, error: null },
    ],
  },
];

export const demoApi = {
  getDashboard: () => {
    const runs = demoRuns.filter((r) => r.type === "test_run" && r.status === "completed");
    const passRate = Math.round(
      (runs.reduce((s, r) => s + (r.passed || 0), 0) /
        runs.reduce((s, r) => s + (r.total || 1), 0)) *
        100
    );
    return Promise.resolve({
      totalProjects: demoProjects.length,
      totalTests: demoTests.length,
      totalRuns: demoRuns.length,
      passRate,
      recentRuns: runs.slice(0, 5),
    });
  },

  getProjects: () => Promise.resolve([...demoProjects]),

  getProject: (id) => {
    const p = demoProjects.find((p) => p.id === id);
    return p ? Promise.resolve({ ...p }) : Promise.reject(new Error("not found"));
  },

  getTests: (projectId) =>
    Promise.resolve(demoTests.filter((t) => t.projectId === projectId)),

  getRuns: (projectId) =>
    Promise.resolve(
      demoRuns
        .filter((r) => r.projectId === projectId)
        .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
    ),

  getRun: (runId) => {
    const r = demoRuns.find((r) => r.id === runId);
    return r ? Promise.resolve({ ...r }) : Promise.reject(new Error("not found"));
  },

  createProject: (data) => {
    const id = "demo-proj-" + Date.now();
    const project = { id, ...data, createdAt: new Date().toISOString(), status: "idle" };
    demoProjects.push(project);
    return Promise.resolve(project);
  },

  crawl: (projectId) => {
    const existingCrawl = demoRuns.find((r) => r.projectId === projectId && r.type === "crawl");
    if (existingCrawl) return Promise.resolve({ runId: existingCrawl.id });
    const project = demoProjects.find((p) => p.id === projectId);
    const url = project ? project.url : "https://example.com";
    const newRun = {
      id: "run-crawl-" + Date.now(),
      projectId,
      type: "crawl",
      status: "completed",
      startedAt: new Date(Date.now() - 60000).toISOString(),
      finishedAt: new Date().toISOString(),
      pagesFound: 3,
      tests: [],
      logs: [
        `[${new Date().toISOString()}] \uD83D\uDD77\uFE0F  Starting crawl of ${url}`,
        `[${new Date().toISOString()}] \uD83D\uDCC4 Visiting (depth 0): ${url}/`,
        `[${new Date().toISOString()}] \uD83D\uDCC4 Visiting (depth 1): ${url}/about`,
        `[${new Date().toISOString()}] \uD83D\uDCC4 Visiting (depth 1): ${url}/contact`,
        `[${new Date().toISOString()}] \u2705 Crawl complete. Found 3 pages. Generating tests with AI...`,
        `[${new Date().toISOString()}] \uD83C\uDF89 Done! Demo mode — no new tests generated.`,
      ],
    };
    demoRuns.push(newRun);
    return Promise.resolve({ runId: newRun.id });
  },

  runTests: (projectId) => {
    const existingRun = demoRuns.find((r) => r.projectId === projectId && r.type === "test_run");
    if (existingRun) return Promise.resolve({ runId: existingRun.id });
    const tests = demoTests.filter((t) => t.projectId === projectId);
    const newRun = {
      id: "run-test-" + Date.now(),
      projectId,
      type: "test_run",
      status: "completed",
      startedAt: new Date(Date.now() - 30000).toISOString(),
      finishedAt: new Date().toISOString(),
      passed: tests.length,
      failed: 0,
      total: tests.length,
      logs: [
        `[${new Date().toISOString()}] \uD83D\uDE80 Starting test run: ${tests.length} tests`,
        ...tests.map((t) => `[${new Date().toISOString()}]   \u2705 PASSED: ${t.name}`),
        `[${new Date().toISOString()}] \uD83C\uDFC1 Run complete: ${tests.length} passed, 0 failed out of ${tests.length}`,
      ],
      results: tests.map((t) => ({
        testId: t.id,
        testName: t.name,
        status: "passed",
        durationMs: 2000 + Math.floor(Math.random() * 3000),
        error: null,
      })),
    };
    demoRuns.push(newRun);
    return Promise.resolve({ runId: newRun.id });
  },

  deleteTest: (projectId, testId) => {
    const idx = demoTests.findIndex((t) => t.id === testId);
    if (idx !== -1) demoTests.splice(idx, 1);
    return Promise.resolve({ ok: true });
  },
};
