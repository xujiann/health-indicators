import { expect, test } from "@playwright/test";

test("核心页面、来源筛选与分析工作台可用", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/index.html");
  await expect(page).toHaveTitle(/指标|数据/);
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByRole("button", { name: "分析", exact: true })).toBeVisible();

  const search = page.locator("#q");
  await search.fill("GDP");
  await expect(page.locator("#count")).toContainText("指标");
  await expect(page.locator(".card").first()).toBeVisible();
  await search.fill("");
  await expect(page.locator("#count")).not.toContainText(/^0 /);

  await page.getByRole("button", { name: "分析", exact: true }).click();
  await expect(page.locator(".workbench.open")).toBeVisible();
  await expect(page.locator(".wb-tab")).toHaveCount(9);
  await page.getByRole("button", { name: "数据质量", exact: true }).click();
  await expect(page.getByRole("button", { name: "查看非单条原文", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "查看非单条原文", exact: true }).click();

  await expect(page.locator(".workbench")).not.toHaveClass(/open/);
  await expect(page.locator("#fSourceState .chip.on")).toHaveText("非单条原文");
  await expect(page.locator("#count")).not.toContainText(/^0 /);
  expect(pageErrors).toEqual([]);
});

test("列表视图与公开工作簿下载入口可达", async ({ page, request }) => {
  await page.goto("/index.html");
  await page.locator(".tab[data-m='list']").click();
  await expect(page.locator("#listView")).toBeVisible();
  await expect(page.locator("#rows tr").first()).toBeVisible();

  const workbook = await request.get("/公开指标数据库.xlsx");
  expect(workbook.ok()).toBeTruthy();
  expect(workbook.headers()["content-type"]).toContain("spreadsheetml");
});
