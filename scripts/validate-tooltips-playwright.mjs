import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BASE_URL = "http://localhost:3000";
const PASSWORD = "TestPassword123!";
const OUTPUT_DIR = path.resolve("artifacts/tooltip-validation");

const ROLES = [
  { key: "admin", email: "admin@acme.com", dashboardLabel: "Executive Dashboard", viewports: [{ width: 1440, height: 900 }, { width: 1280, height: 720 }] },
  { key: "manager", email: "manager.london@acme.com", dashboardLabel: "Executive Dashboard", viewports: [{ width: 1440, height: 900 }, { width: 1280, height: 720 }] },
  { key: "staff", email: "staff.engineer@acme.com", dashboardLabel: "My Dashboard", viewports: [{ width: 1280, height: 720 }] },
];

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function login(page, email) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/dashboard"), { timeout: 20000 });
}

async function logout(page) {
  const signOut = page.getByRole("button", { name: "Sign out" });
  if (await signOut.count()) {
    await signOut.click();
    await page.waitForURL((url) => url.pathname === "/login", { timeout: 10000 });
  }
}

async function openPage(page, pagePath) {
  await page.goto(`${BASE_URL}${pagePath}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
}

async function evaluateTooltipForIcon(iconHandle) {
  return await iconHandle.evaluate((icon) => {
    const group = icon.closest(".group.relative.inline-block");
    if (!group) return { pass: false, reason: "Tooltip group wrapper not found" };

    const tooltip = group.querySelector("div.pointer-events-none.absolute");
    if (!tooltip) return { pass: false, reason: "Tooltip bubble element not found" };

    const style = window.getComputedStyle(tooltip);
    const isVisible = style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
    const rect = tooltip.getBoundingClientRect();
    const vp = { width: window.innerWidth, height: window.innerHeight };

    const withinViewport =
      rect.left >= 0 &&
      rect.top >= 0 &&
      rect.right <= vp.width &&
      rect.bottom <= vp.height;

    const clippingAncestors = [];
    let node = tooltip.parentElement;
    while (node) {
      const nodeStyle = window.getComputedStyle(node);
      const overflowCombo = `${nodeStyle.overflow} ${nodeStyle.overflowX} ${nodeStyle.overflowY}`;
      const canClip = /(hidden|clip|auto|scroll)/.test(overflowCombo);
      if (canClip) {
        const parentRect = node.getBoundingClientRect();
        const clipped =
          rect.left < parentRect.left ||
          rect.top < parentRect.top ||
          rect.right > parentRect.right ||
          rect.bottom > parentRect.bottom;
        if (clipped) {
          clippingAncestors.push({
            tag: node.tagName,
            className: node.className,
            overflow: overflowCombo,
          });
        }
      }
      node = node.parentElement;
    }

    const pass = isVisible && withinViewport && clippingAncestors.length === 0;
    return {
      pass,
      reason: pass
        ? "Tooltip bubble fully visible"
        : [
            !isVisible ? "tooltip not visible" : null,
            !withinViewport ? "tooltip exceeds viewport bounds" : null,
            clippingAncestors.length ? `tooltip clipped by ancestor overflow (${clippingAncestors[0].tag}.${clippingAncestors[0].className || "no-class"})` : null,
          ]
            .filter(Boolean)
            .join("; "),
      rect,
      vp,
      clippingAncestors,
    };
  });
}

async function runChecks(page, roleKey, pagePath, viewport, maxIcons = 3) {
  await openPage(page, pagePath);
  const icons = page.locator('span[aria-label="Health detail available"]');
  const count = await icons.count();
  if (count === 0) {
    return {
      page: pagePath,
      viewport,
      pass: false,
      reason: "No health tooltip info icons found",
      checks: [],
    };
  }

  const checks = [];
  const toCheck = Math.min(count, maxIcons);
  for (let i = 0; i < toCheck; i += 1) {
    const icon = icons.nth(i);
    await icon.scrollIntoViewIfNeeded();
    await icon.hover();
    await page.waitForTimeout(150);
    const iconHandle = await icon.elementHandle();
    if (!iconHandle) {
      checks.push({ row: i + 1, pass: false, reason: "Icon handle unavailable" });
      continue;
    }
    const result = await evaluateTooltipForIcon(iconHandle);
    checks.push({ row: i + 1, ...result });
  }

  const pass = checks.every((c) => c.pass);
  const screenshotName = `${roleKey}-${pagePath.replace("/", "") || "home"}-${viewport.width}x${viewport.height}.png`;
  const screenshotPath = path.join(OUTPUT_DIR, screenshotName);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  return {
    page: pagePath,
    viewport,
    pass,
    reason: pass ? "All checked health tooltips fully visible" : checks.find((c) => !c.pass)?.reason ?? "One or more tooltip checks failed",
    screenshotPath,
    checks,
  };
}

async function main() {
  await ensureDir(OUTPUT_DIR);
  const browser = await chromium.launch({ headless: true });
  const allResults = [];

  for (const role of ROLES) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await login(page, role.email);
      const roleResults = [];
      for (const viewport of role.viewports) {
        await page.setViewportSize(viewport);
        roleResults.push(await runChecks(page, role.key, "/dashboard", viewport));
        roleResults.push(await runChecks(page, role.key, "/projects", viewport));
      }
      allResults.push({ role: role.key, email: role.email, results: roleResults });
      await logout(page);
    } finally {
      await context.close();
    }
  }

  await browser.close();
  const outputPath = path.join(OUTPUT_DIR, "results.json");
  await fs.writeFile(outputPath, JSON.stringify({ baseUrl: BASE_URL, generatedAt: new Date().toISOString(), allResults }, null, 2));
  console.log(outputPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
