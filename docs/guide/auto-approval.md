# Auto-Approval

Sentri can auto-approve AI-generated tests that clear a confidence threshold, so reviewers only see the tests that actually need judgement. This page covers how to turn it on, how to tune the threshold, and how to roll back a decision (or the whole feature) if things go wrong.

## How it works

Every test Sentri generates gets a **confidence score** (0.0 – 1.0) from the deduplicator's quality rubric. Each project has an optional **auto-approval threshold**, also 0.0 – 1.0:

- `threshold = null` (default) → every test lands in **Draft** for human review.
- `threshold = 0.8` → tests scoring ≥ 0.8 are **auto-approved**; tests scoring < 0.8 still land in Draft.

Auto-approved tests carry full **provenance** — the score at decision time, the threshold at decision time, who approved (`auto-approver`), and when. That provenance is visible on the Tests list, the Test Detail page, and the Approvals Timeline, so there's no "mystery approval".

## Turning it on

Open a project → **Automation** tab → expand the **Auto-Approval** panel.

1. Enter a threshold (we recommend starting at `0.8`).
2. Click **Save**.
3. The first-enable confirmation modal shows you how many of the last 30 generated tests _would have_ been auto-approved at that threshold. Use this to sanity-check before committing.
4. Click **Enable auto-approval**.

From this point, new tests clearing the threshold will land as Approved instead of Draft. Existing tests are unaffected — the threshold only applies at generation time.

## Tuning the threshold

The **Auto-Approval** panel shows a live calibration line:

> `N auto-approved · N human · N draft · X% revert rate (7d)`

- **Revert rate < 10%** → your threshold is well-tuned; humans rarely pull back what the machine approved.
- **Revert rate 10–25%** → threshold is too loose. Raise it by 0.05–0.10 and watch.
- **Revert rate > 25%** → the pipeline isn't trustworthy at this threshold. Raise significantly or disable auto-approval until you've diagnosed why.

The revert rate is a **7-day rolling** window computed from the audit trail — it stays accurate even after you've revoked tests (revoked tests have their provenance cleared on the row, but the audit log keeps the historical decision).

## Revoking an approval

Auto-approvals aren't permanent. Anyone with **qa_lead** or **admin** role can revoke:

- **One test at a time** — open the test in Test Detail, click **Revoke approval**. The button uses a two-click confirmation to prevent misclicks.
- **From the audit page** — open `/approvals`, expand the day's batch, click **Revoke** on any row.
- **In bulk** — on the Review Queue's Approved tab, select tests and bulk-restore to Draft.

Revoking returns the test to Draft (it'll be excluded from scheduled runs until re-approved) and clears the four provenance columns. The audit trail records who revoked and when.

## The sidebar badge + Approvals timeline

- **Sidebar** — the **Approvals** nav entry shows `🤖 N` for today's auto-approvals. This is your "what fired overnight?" signal when you come back in the morning.
- **Approvals timeline** (`/approvals`) — daily-grouped audit feed. Each day splits into:
  - `🤖 12 auto-approved (avg score 0.89)` — the machine-approved batch.
  - `👤 @alice approved 3` — a human's batch, if any.
  - Expand any batch to see per-test confidence, threshold, and a **Revoke** button.

The timeline is **workspace-scoped** (you only see your workspace's approvals) and supports per-project + date-range filters for compliance audits.

## Global kill-switch

For ops incidents — say an AI provider starts producing bad tests faster than reviewers can revoke them — there's a global override:

```bash
# backend/.env
DISABLE_AUTO_APPROVAL=true
```

Set the env var, restart the backend, and **every** generated test lands in Draft regardless of any project's threshold. Per-project thresholds stay intact and re-activate the moment you clear the env var.

This is a **one-step rollback**: no code deploy, no data migration, no per-project threshold reset.

::: tip
The kill-switch only affects _new_ generations. It doesn't retroactively revoke auto-approvals that already fired — use the revoke / bulk-restore paths for that.
:::

## Permissions

| Role | Can configure threshold | Can revoke approvals |
|------|:----------------------:|:-------------------:|
| `viewer` | ❌ | ❌ |
| `qa_lead` | ✅ | ✅ |
| `admin` | ✅ | ✅ |

The `POST /api/v1/tests/:testId/revoke` and `PATCH /api/v1/projects/:id` (threshold) endpoints are both `qa_lead`+ and enforced via `requireRole` at the route layer.

## Recommended workflow

1. **Week 1** — leave threshold at `null` (default). Use the Review Queue normally. Observe which tests consistently land as high-quality drafts.
2. **Week 2** — enable at `0.85`. Sanity-check the first-enable preview shows the count you'd expect.
3. **Week 3** — read the revert rate. If < 10%, consider dropping to `0.80` for more auto-approvals. If > 15%, raise to `0.90` or pause.
4. **Ongoing** — treat the sidebar badge as a daily audit. One click takes you to `/approvals` for a 30-second spot-check.

## Troubleshooting

**The calibration line shows "Calibration stats unavailable"** — the approval-stats endpoint returned an error. Check your role (need `qa_lead`+) and the backend logs.

**First-enable preview shows `0` would have been approved** — your current pipeline isn't producing confidence scores that high. Either raise the pipeline's signal (more assertions, better selectors — see [Test Dials](/guide/test-dials)) or lower the threshold.

**Auto-approved tests keep getting revoked** — the threshold is too low for the AI provider you're using. Raise by 0.05 and retry.

**Sidebar badge shows 0 but I know tests were auto-approved today** — the badge filters to **today's** auto-approvals in your **current workspace**. If you switched workspaces recently, or if your browser tab has been open since yesterday, a refresh will re-query.
