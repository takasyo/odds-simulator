import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
});

test('built app works under a repository prefix without console or asset errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.url().includes('/odds_sim/') && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.reload();
  await expect(page.getByLabel('0円の買い目を許可')).toBeChecked();
  await expect(page.locator('#total')).toHaveText('9,800');
  await expect(page.locator('#remaining')).toHaveText('200');
  await expect(page.locator('.amount')).toHaveText(['5,800', '2,900', '1,100']);
  await expect(page.locator('.profit')).toHaveText(['+48,200', '+48,200', '+45,200']);
  await expect(page.locator('#validation')).toBeHidden();
  await expect(page.getByRole('button', { name: /実行|計算/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('input updates immediately, preserves focus, and clears stale invalid results', async ({ page }) => {
  const budget = page.getByRole('spinbutton', { name: '購入予算', exact: true });
  await budget.fill('50');
  await expect(page.locator('#total')).toHaveText('4,800');
  await expect(budget).toBeFocused();
  await budget.fill('');
  await expect(page.locator('#total')).toHaveText('—');
  await expect(page.locator('#validation')).toBeVisible();
  await expect(budget).toHaveAttribute('aria-invalid', 'true');
  await budget.fill('100');
  await page.getByLabel('オッズ 1', { exact: true }).fill('3');
  await page.getByLabel('オッズ 2', { exact: true }).fill('5');
  await page.getByLabel('オッズ 3', { exact: true }).fill('10');
  await expect(page.locator('.amount')).toHaveText(['5,200', '3,100', '1,500']);
  await expect(page.locator('#spread')).toHaveText('600');
  await page.getByLabel('オッズ 1', { exact: true }).fill('2.');
  await expect(page.locator('.amount')).toHaveText(['—', '—', '—']);
  await page.getByLabel('オッズ 1', { exact: true }).fill('2.50');
  await expect(page.locator('#validation')).toBeHidden();
});

test('restores budget, options, and bets after reload', async ({ page }) => {
  await page.getByRole('spinbutton', { name: '購入予算', exact: true }).fill('123');
  await page.getByLabel('0円の買い目を許可').uncheck();
  await page.getByLabel('買い目 1の名前', { exact: true }).fill('保存対象');
  await page.getByLabel('オッズ 1', { exact: true }).fill('3.25');
  await page.getByRole('button', { name: '買い目を追加' }).click();
  await page.getByLabel('買い目 4の名前', { exact: true }).fill('追加分');
  await page.reload();

  await expect(page.getByRole('spinbutton', { name: '購入予算', exact: true })).toHaveValue('123');
  await expect(page.getByLabel('0円の買い目を許可')).not.toBeChecked();
  await expect(page.locator('.bet-row')).toHaveCount(4);
  await expect(page.getByLabel('買い目 1の名前', { exact: true })).toHaveValue('保存対象');
  await expect(page.getByLabel('オッズ 1', { exact: true })).toHaveValue('3.25');
  await expect(page.getByLabel('買い目 4の名前', { exact: true })).toHaveValue('追加分');
});

test('adds and deletes bets with accessible labels, focus, and safe text handling', async ({ page }) => {
  await page.getByRole('button', { name: '買い目を追加' }).click();
  await expect(page.locator('.bet-row')).toHaveCount(4);
  const odds = page.getByLabel('オッズ 4', { exact: true });
  await expect(odds).toBeFocused();
  await expect(odds).toHaveValue('10');
  await expect(page.locator('#total')).toHaveText('9,900');
  await expect(page.locator('#validation')).toBeHidden();
  await odds.fill('25');
  await expect(page.locator('#validation')).toBeHidden();
  await page.getByLabel('買い目 4の名前', { exact: true }).fill('<img src=x onerror=alert(1)>');
  await expect(page.locator('#bet-rows img')).toHaveCount(0);
  await page.getByRole('button', { name: '買い目 2を削除', exact: true }).click();
  await expect(page.locator('.bet-row')).toHaveCount(3);
  await expect(page.getByLabel('買い目 2の名前', { exact: true })).toBeFocused();
  await expect(page.getByLabel('オッズ 3', { exact: true })).toHaveValue('25');
});

test('zero option excludes zero stakes from summary and exposes the losing outcome', async ({ page }) => {
  await page.getByLabel('0円の買い目を許可').uncheck();
  await page.getByRole('spinbutton', { name: '購入予算', exact: true }).fill('10');
  await page.getByLabel('オッズ 1', { exact: true }).fill('2');
  await page.getByLabel('オッズ 2', { exact: true }).fill('3');
  await page.getByLabel('オッズ 3', { exact: true }).fill('100');
  await expect(page.locator('.amount')).toHaveText(['500', '300', '100']);
  await page.getByLabel('0円の買い目を許可').check();
  await expect(page.locator('.amount')).toHaveText(['500', '300', '0']);
  await expect(page.locator('#minimum-payout')).toHaveText('900');
  await expect(page.locator('#purchased-count')).toHaveText('2 / 3 点購入');
  await expect(page.locator('.excluded-tag').last()).toBeVisible();
  await expect(page.locator('#excluded-warning')).toContainText('払戻金は0円、収支は-800円');
  await page.getByRole('spinbutton', { name: '購入予算', exact: true }).fill('2');
  await expect(page.locator('#validation')).toContainText('2点未満');
  await expect(page.locator('#minimum-payout')).toHaveText('—');
});

test('single-bet and maximum-row boundaries remain editable', async ({ page }) => {
  await page.getByRole('button', { name: '買い目 3を削除', exact: true }).click();
  await page.getByRole('button', { name: '買い目 2を削除', exact: true }).click();
  await expect(page.getByRole('button', { name: '買い目 1を削除', exact: true })).toBeDisabled();
  await expect(page.locator('#validation')).toContainText('2点以上');
  await page.getByLabel('0円の買い目を許可').uncheck();
  await expect(page.locator('#total')).toHaveText('10,000');
  for (let index = 1; index < 30; index++) {
    await page.getByRole('button', { name: '買い目を追加' }).click();
    await page.getByLabel(`オッズ ${index + 1}`, { exact: true }).fill('10');
  }
  await expect(page.locator('.bet-row')).toHaveCount(30);
  await expect(page.getByRole('button', { name: '買い目を追加' })).toBeDisabled();
  await expect(page.locator('#validation')).toBeHidden();
});

test('layout has no overflow or overlapping numbers at supported extremes', async ({ page }, testInfo) => {
  await page.getByRole('spinbutton', { name: '購入予算', exact: true }).fill('10000');
  for (let index = 1; index <= 3; index++) {
    await page.getByLabel(`オッズ ${index}`, { exact: true }).fill('9999.99');
  }
  await expect(page.locator('#validation')).toBeHidden();
  await page.evaluate(() => document.fonts.ready);
  const problems = await page.evaluate(() => {
    const failures = [];
    if (document.documentElement.scrollWidth > window.innerWidth) failures.push('page overflow');
    for (const element of document.querySelectorAll('.result-cell, .summary-item, .budget-meta')) {
      if (element.scrollWidth > element.clientWidth + 1) failures.push(`${element.className}: ${element.scrollWidth} > ${element.clientWidth}`);
    }
    return failures;
  });
  expect(problems).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('maximum-values.png'), fullPage: true });
  await page.getByRole('spinbutton', { name: '購入予算', exact: true }).fill('100');
  for (const [index, odds] of [10, 20, 50].entries()) {
    await page.getByLabel(`オッズ ${index + 1}`, { exact: true }).fill(String(odds));
  }
  await page.screenshot({ path: testInfo.outputPath('default.png'), fullPage: true });
});

test('budget is entered as integer hundreds of yen only', async ({ page }) => {
  const budget = page.getByRole('spinbutton', { name: '購入予算', exact: true });
  await expect(budget).toHaveValue('100');
  await expect(budget).toHaveAttribute('aria-valuemin', '1');
  await expect(budget).toHaveAttribute('aria-valuemax', '10000');
  await expect(page.locator('#budget-yen')).toHaveText('10,000 円');
  for (const invalid of ['100.01', '0', '-1', '10001', '1e2']) {
    await budget.fill(invalid);
    await expect(budget).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#validation')).toContainText('整数（100円単位）');
    await expect(page.locator('#total')).toHaveText('—');
    await expect(page.locator('#budget-yen')).toHaveText('—');
  }
  await budget.fill('100');
  await budget.press('ArrowUp');
  await expect(budget).toHaveValue('101');
  await expect(page.locator('#budget-yen')).toHaveText('10,100 円');
  await expect(page.locator('#validation')).toBeHidden();
  await budget.press('ArrowDown');
  await expect(page.locator('#budget-yen')).toHaveText('10,000 円');
  await expect(page.locator('#total')).toHaveText('9,800');
});

test('numeric inputs move the caret to the end on click and tap, including added bets', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: '買い目を追加' }).click();
  const inputs = [
    page.getByRole('spinbutton', { name: '購入予算', exact: true }),
    page.getByLabel('オッズ 1', { exact: true }),
    page.getByLabel('オッズ 4', { exact: true }),
  ];
  for (const input of inputs) {
    await input.fill('123');
    await input.evaluate((element) => element.setSelectionRange(0, 0));
    if (testInfo.project.name === 'mobile') {
      await input.tap({ position: { x: 4, y: 20 } });
    } else {
      await input.click({ position: { x: 4, y: 20 } });
    }
    await expect(input).toBeFocused();
    await expect.poll(() => input.evaluate((element) => [element.selectionStart, element.selectionEnd])).toEqual([3, 3]);
    await input.press('4');
    await expect(input).toHaveValue('1234');
    await input.press('ArrowLeft');
    await expect.poll(() => input.evaluate((element) => element.selectionStart)).toBe(3);
    await input.click({ position: { x: 4, y: 20 } });
    await expect.poll(() => input.evaluate((element) => [element.selectionStart, element.selectionEnd])).toEqual([4, 4]);
    await input.dblclick({ position: { x: 4, y: 20 } });
    await expect.poll(() => input.evaluate((element) => [element.selectionStart, element.selectionEnd])).toEqual([4, 4]);
  }
  const name = page.getByLabel('買い目 1の名前', { exact: true });
  await name.fill('ABCD');
  await name.click({ position: { x: 3, y: 20 } });
  await expect.poll(() => name.evaluate((element) => element.selectionStart)).toBe(0);
});

test('budget arrow keys stay inside the 100-yen unit bounds', async ({ page }) => {
  const budget = page.getByRole('spinbutton', { name: '購入予算', exact: true });
  await budget.fill('10000');
  await budget.press('ArrowUp');
  await expect(budget).toHaveValue('10000');
  await expect(budget).toHaveAttribute('aria-valuenow', '10000');
  await budget.fill('1');
  await budget.press('ArrowDown');
  await expect(budget).toHaveValue('1');
  await expect(budget).toHaveAttribute('aria-valuenow', '1');
  await budget.fill('1.5');
  await expect(budget).not.toHaveAttribute('aria-valuenow');
  await budget.press('ArrowUp');
  await expect(budget).toHaveValue('1.5');
});