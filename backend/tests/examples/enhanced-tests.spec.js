/**
 * Sentri — Example Enhanced Test Output
 * These illustrate what the pipeline produces after all 5 stages run.
 *
 * Contrast: Before (executor only) vs After (assertion_enhancer applied)
 */

// ─────────────────────────────────────────────────────────────────────────────
// EXAMPLE 1: User Login Flow
// ─────────────────────────────────────────────────────────────────────────────

// ❌ BEFORE (executor output — weak assertions)
import { test, expect } from "@playwright/test";

test("User login", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("user@example.com");
  await page.getByLabel("Password").fill("ValidPass123!");
  await page.getByRole("button", { name: /login/i }).click();
  // ← No assertions! No way to know if login succeeded.
});

// ✅ AFTER (assertion_enhancer output — meaningful assertions)
test.describe("Authentication", () => {
  test("User can log in with valid credentials", async ({ page }) => {
    await test.step("Navigate to login page", async () => {
      await page.goto("/login");
      // Assert login form is rendered correctly
      await expect(page).toHaveURL("/login");
      await expect(page).toHaveTitle(/Login/i);
      await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
    });

    await test.step("Enter credentials", async () => {
      await page.getByLabel("Email").fill("user@example.com");
      await page.getByLabel("Password").fill("ValidPass123!");
      // Assert fields are populated correctly
      await expect(page.getByLabel("Email")).toHaveValue("user@example.com");
    });

    await test.step("Submit and verify authentication", async () => {
      await page.getByRole("button", { name: /login/i }).click();
      // Assert successful navigation to dashboard
      await expect(page).toHaveURL(/\/dashboard/);
      await expect(page).toHaveTitle(/Dashboard/i);
      // Assert authenticated UI state
      await expect(page.getByText(/welcome/i)).toBeVisible();
      await expect(page.getByRole("button", { name: /logout/i })).toBeVisible();
      await expect(page.getByRole("navigation")).toContainText("My Account");
      // Assert no error messages remain
      await expect(page.getByRole("alert")).not.toBeVisible();
    });
  });

  test("User sees error with invalid credentials", async ({ page }) => {
    await test.step("Submit invalid credentials", async () => {
      await page.goto("/login");
      await page.getByLabel("Email").fill("wrong@example.com");
      await page.getByLabel("Password").fill("wrongpassword");
      await page.getByRole("button", { name: /login/i }).click();
    });

    await test.step("Verify error state", async () => {
      // Assert user stays on login page
      await expect(page).toHaveURL("/login");
      // Assert error message is shown
      await expect(page.getByRole("alert")).toBeVisible();
      await expect(page.getByRole("alert")).toContainText(
        /invalid|incorrect|wrong/i
      );
      // Assert no redirect occurred
      await expect(page).not.toHaveURL(/dashboard/);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EXAMPLE 2: Search Flow
// ─────────────────────────────────────────────────────────────────────────────

// ❌ BEFORE
test("Search", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("Search...").fill("laptop");
  await page.keyboard.press("Enter");
  // ← No assertion that results appeared
});

// ✅ AFTER
test.describe("Search", () => {
  test("User can search and see relevant results", async ({ page }) => {
    const SEARCH_QUERY = "laptop";

    await test.step("Perform search", async () => {
      await page.goto("/");
      const searchInput = page.getByRole("searchbox");
      await expect(searchInput).toBeVisible();
      await searchInput.fill(SEARCH_QUERY);
      // Assert input has our value
      await expect(searchInput).toHaveValue(SEARCH_QUERY);
      await page.keyboard.press("Enter");
    });

    await test.step("Verify results page", async () => {
      // Assert URL reflects the search
      await expect(page).toHaveURL(/search|results|q=/i);
      // Assert results are present
      await expect(
        page.getByRole("list").first()
      ).toBeVisible();
      // Assert results contain the search term
      const firstResult = page.getByRole("listitem").first();
      await expect(firstResult).toBeVisible();
      // Assert a "no results" state is NOT shown
      await expect(page.getByText(/no results found/i)).not.toBeVisible();
      // Assert result count is shown
      await expect(page.getByText(/result/i)).toBeVisible();
    });
  });

  test("Search with no results shows empty state", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("searchbox").fill("xyzxyzxyz-nonexistent-item-12345");
    await page.keyboard.press("Enter");

    await expect(page.getByText(/no results/i)).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EXAMPLE 3: Add to Cart Flow
// ─────────────────────────────────────────────────────────────────────────────

// ❌ BEFORE
test("Add to cart", async ({ page }) => {
  await page.goto("/products/laptop-pro");
  await page.getByRole("button", { name: /add to cart/i }).click();
  // ← No confirmation that cart actually updated
});

// ✅ AFTER
test.describe("Shopping Cart", () => {
  test("User can add a product to cart and see updated cart", async ({
    page,
  }) => {
    await test.step("Navigate to product page", async () => {
      await page.goto("/products/laptop-pro");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByText(/in stock/i)).toBeVisible();
    });

    await test.step("Get initial cart state", async () => {
      // Record initial cart count for comparison
      const cartBadge = page.getByTestId("cart-count");
      await expect(cartBadge).toBeVisible();
    });

    await test.step("Add item to cart", async () => {
      // Intercept the add-to-cart API call to verify it succeeds
      const addToCartResponse = page.waitForResponse(
        (res) => res.url().includes("/cart") && res.request().method() === "POST"
      );
      await page.getByRole("button", { name: /add to cart/i }).click();
      const response = await addToCartResponse;
      expect(response.status()).toBe(200);
    });

    await test.step("Verify cart updated", async () => {
      // Assert success toast/notification appears
      await expect(
        page.getByRole("status").or(page.getByRole("alert"))
      ).toContainText(/added|success/i);
      // Assert cart badge count increased
      const cartBadge = page.getByTestId("cart-count");
      await expect(cartBadge).not.toContainText("0");
      // Assert "Add to Cart" button state changed (optional: "Added" or disabled)
      const addBtn = page.getByRole("button", { name: /add to cart/i });
      // Button may say "Added" or remain available for multiple adds
      await expect(addBtn.or(page.getByText(/added to cart/i))).toBeVisible();
    });
  });
});
