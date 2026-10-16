import { test, expect as baseExpect, type Page } from '@playwright/test';
const expect = baseExpect.configure({ timeout: 15000 });
async function signIn(page: Page, role: 'MANAGER' | 'CUSTOMER') {
  const response = await page.request.post('/api/auth/login', { headers: { Origin: 'http://localhost:3000' }, data: { email: process.env[`SEED_${role}_EMAIL`], password: process.env[`SEED_${role}_PASSWORD`] } });
  expect(response.status()).toBe(200);
  await page.goto('/');
}


test('manager opens a profile card, full page and mobile pay/document view', async ({ page }) => {
  await signIn(page, 'MANAGER');
  await expect(page).toHaveURL('/');
  await page.goto('/employees');
  const profileLink = page.locator('tbody button.person-link').first();
  await expect(profileLink).toBeVisible();
  const name = await profileLink.innerText();
  await profileLink.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: name, exact: true })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Government ID proof' })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Pay & payments' })).toBeVisible();
  await dialog.getByRole('link', { name: 'Open full profile' }).click();
  await expect(page).toHaveURL(/\/profiles\/employees\//);
  await expect(page.getByRole('heading', { name: name, exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Documents & payslips' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
  await expect(page.getByLabel('Government ID number', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Monthly pay (INR)', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel editing' }).click();
  await page.screenshot({
    path: '.local/profile-manager-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().right))
    .toBeLessThanOrEqual(0);
  await expect(page.getByRole('heading', { name: 'Pay & payments' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: '.local/profile-manager-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
});

test('customer staff cards expose identity but no pay, internal documents or edit controls', async ({
  page,
}) => {
  await signIn(page, 'CUSTOMER');
  await expect(page.getByRole('heading', { name: 'Your sites & team' })).toBeVisible();
  await page.locator('main .settings-body .person-link').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Government ID proof' })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Pay & payments' })).toHaveCount(0);
  await expect(dialog.getByRole('heading', { name: 'Documents & payslips' })).toHaveCount(0);
  await dialog.getByRole('link', { name: 'Open full profile' }).click();
  await expect(page).toHaveURL(/\/profiles\/employees\//);
  await expect(page.getByRole('heading', { name: 'Government ID proof' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit profile', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Upload photo or document' })).toHaveCount(0);
  await page.screenshot({
    path: '.local/profile-customer-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.locator('.profile .person-link').click();
  await page.getByRole('dialog').getByRole('link', { name: 'Open full profile' }).click();
  await expect(page).toHaveURL(/\/profiles\/clients\//);
  await expect(page.getByRole('button', { name: 'Edit profile', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pay & payments' })).toHaveCount(0);
});
