import { runAgent } from "./agent.js";

/**
 * Sentri Phase 1 Pipeline
 *
 *   crawl_output
 *     → filter        (remove noise)
 *     → planner       (intent-driven test plans)
 *     → executor      (generate Playwright code)
 *     → assertion_enhancer (upgrade assertions)
 *     → auditor       (post-run analysis, called separately)
 *
 * Each stage passes structured JSON to the next.
 */

/**
 * Run the full pre-execution pipeline for a crawled page.
 *
 * @param {object} crawlOutput - Raw output from the Playwright crawler
 * @param {string} crawlOutput.url - The page URL
 * @param {Array}  crawlOutput.elements - Raw DOM elements snapshot
 * @returns {Promise<PipelineResult>}
 */
export async function runPipeline(crawlOutput) {
  const { url, elements } = crawlOutput;
  console.log(
    `\n🚀 [Pipeline] Starting for ${url} with ${elements.length} raw elements`
  );

  // ── Stage 1: Filter ────────────────────────────────────────────────────────
  console.log("🧹 [Pipeline] Stage 1: Filter");
  const filterInput = {
    page_url: url,
    raw_elements: elements,
    instruction:
      "Filter the following crawled elements. Keep only high-signal elements that belong to real user flows. Remove noise.",
  };
  const filterOutput = await runAgent("filter", filterInput);
  console.log(`   Filter raw output: ${JSON.stringify(filterOutput)}`); // ← ADD THIS

  if (!filterOutput.filtered_elements || filterOutput.filtered_elements.length === 0) {
    // ← FALLBACK: if LLM filtered everything out, use all input elements instead
    console.log("   ⚠ Filter removed everything — using all elements as fallback.");
    filterOutput.filtered_elements = elements.map((el, i) => ({
      id: `el-${i}`,
      type: el.tag,
      role: el.ariaRole || el.type || el.tag,
      selector: el.selector,
      page: url,
      user_intent: el.text || el.ariaLabel || el.placeholder || "interactive element",
    }));
  }

  console.log(`   ✓ ${filterOutput.filtered_elements.length} elements kept`);

  // ── Stage 2: Planner ───────────────────────────────────────────────────────
  console.log("🧩 [Pipeline] Stage 2: Planner");
  const plannerInput = {
    page_url: url,
    filtered_elements: filterOutput.filtered_elements,
    instruction:
      "Convert these filtered elements into user-intent-driven test plans. Group logically. Avoid redundancy.",
  };
  const plannerOutput = await runAgent("planner", plannerInput);
  console.log(`   ✓ ${plannerOutput.test_plans.length} test plans created`);

  // ── Stages 3+4: Executor → Assertion Enhancer (per plan) ──────────────────
  const enhancedTests = [];

  for (const plan of plannerOutput.test_plans) {
    console.log(`\n⚡ [Pipeline] Stage 3: Executor for plan "${plan.goal}"`);
    const executorInput = {
      plan,
      instruction:
        "Convert this test plan into a complete Playwright TypeScript test. Use stable selectors. Add test.step() sections.",
    };
    const executorOutput = await runAgent("executor", executorInput);
    console.log(`   ✓ Generated: ${executorOutput.test_file}`);

    console.log(
      `🎯 [Pipeline] Stage 4: Assertion Enhancer for "${plan.goal}"`
    );
    const enhancerInput = {
      plan_id: plan.id,
      goal: plan.goal,
      original_test: executorOutput.test_code,
      instruction:
        "Enhance this Playwright test with rich, meaningful assertions. Every action must have a follow-up assertion.",
    };
    const enhancedOutput = await runAgent("assertion_enhancer", enhancerInput);
    console.log(
      `   ✓ Assertions: ${enhancedOutput.original_assertion_count} → ${enhancedOutput.enhanced_assertion_count}`
    );

    enhancedTests.push({
      plan,
      test_file: enhancedOutput.test_file,
      test_code: enhancedOutput.test_code,
      enhancements: enhancedOutput.enhancements_made,
      assertion_count: enhancedOutput.enhanced_assertion_count,
    });
  }

  console.log(
    `\n✅ [Pipeline] Complete for ${url}: ${enhancedTests.length} high-quality tests generated`
  );

  return {
    url,
    skipped: false,
    stats: {
      raw_elements: elements.length,
      filtered_elements: filterOutput.filtered_elements.length,
      removed_elements: filterOutput.removed_count,
      plans_created: plannerOutput.test_plans.length,
      tests_generated: enhancedTests.length,
    },
    tests: enhancedTests,
  };
}

/**
 * Post-execution: Run the Auditor on failed tests.
 *
 * @param {object} executionResult - Result from testRunner with logs/errors
 * @returns {Promise<AuditReport>}
 */
export async function auditFailedTest(executionResult) {
  console.log(`\n🧪 [Auditor] Analyzing failure: ${executionResult.test_id}`);
  const auditInput = {
    test_id: executionResult.test_id,
    test_code: executionResult.test_code,
    execution_logs: executionResult.logs,
    error_message: executionResult.error,
    instruction:
      "Analyze this test failure. Classify it, find root cause, and prescribe a fix.",
  };
  return runAgent("auditor", auditInput);
}

/**
 * Run the full pipeline across multiple crawled pages.
 * Deduplicates equivalent test plans across pages.
 *
 * @param {Array<object>} crawlResults - Array of per-page crawl outputs
 * @returns {Promise<Array<PipelineResult>>}
 */
export async function runPipelineForCrawl(crawlResults) {
  const results = [];
  for (const pageResult of crawlResults) {
    try {
      const pipelineResult = await runPipeline(pageResult);
      results.push(pipelineResult);
    } catch (err) {
      console.error(`[Pipeline] Error for ${pageResult.url}:`, err.message);
      results.push({ url: pageResult.url, error: err.message });
    }
  }
  return results;
}
