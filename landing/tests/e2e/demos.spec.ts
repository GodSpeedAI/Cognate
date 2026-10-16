import { expect, test } from '@playwright/test';

test('composition demo: mallory is denied before anything runs', async ({ page }) => {
  await page.goto('/#fit');
  await page.getByRole('radio', { name: 'mallory' }).check();
  await expect(page.locator('.demo-result')).toContainText('Denied by policy before anything ran.');
});

// Beat F mirrors examples/refund-desk: a $75 refund escalates (refund.awaiting_approval), then allow or deny.
test('decision node: pending, then escalate, then allow on approve', async ({ page }) => {
  await page.goto('/#operate');
  const node = page.locator('.decision-node');
  await expect(node).toHaveAttribute('data-phase', 'escalate');
  await expect(node).toContainText('Escalate: waiting for a person');
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(node).toHaveAttribute('data-phase', 'allow');
  await expect(page.locator('.run-strip')).toContainText('refund.issued');
  await expect(page.locator('.run-strip')).toContainText('run.completed');
  await expect(page.locator('.run-strip')).not.toContainText('refund.denied');
});

test('decision node: deny records refund.denied and no refund; reset returns to pending', async ({ page }) => {
  await page.goto('/#operate');
  const node = page.locator('.decision-node');
  await expect(node).toHaveAttribute('data-phase', 'escalate');
  await page.getByRole('button', { name: 'Deny' }).click();
  await expect(node).toHaveAttribute('data-phase', 'deny');
  await expect(page.locator('.run-strip')).toContainText('run.completed (no refund)');
  await expect(page.locator('.run-strip')).not.toContainText('refund.issued');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  // Reset starts the policy check again: it reads pending for a moment, then escalates.
  await expect(node).toHaveAttribute('data-phase', 'escalate');
});
