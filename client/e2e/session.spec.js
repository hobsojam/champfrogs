import { test, expect } from '@playwright/test';

test('paired session: create, join both roles, arrange, reveal, phase 2', async ({ browser }) => {
  const subjectCtx = await browser.newContext();
  const interviewerCtx = await browser.newContext();
  const subject = await subjectCtx.newPage();
  const interviewer = await interviewerCtx.newPage();

  // Subject creates a paired session
  await subject.goto('/');
  await expect(subject.getByRole('heading', { name: 'Moving Motivators' })).toBeVisible();
  await subject.getByRole('button', { name: /Paired/ }).click();
  await expect(subject.getByRole('heading', { name: 'Session created' })).toBeVisible();
  const code = (await subject.locator('.code').textContent()).trim();
  expect(code).toMatch(/^[A-Z]{4}$/);
  await subject.getByRole('button', { name: 'Join as Subject' }).click();

  // Subject lands in the arrange view
  await expect(subject.getByRole('button', { name: /Done/ })).toBeVisible();
  await expect(subject.locator('.badge')).toHaveText('Phase 1 — Importance');

  // Interviewer joins with the code
  await interviewer.goto('/');
  await interviewer.getByRole('button', { name: 'Join existing session' }).click();
  await interviewer.getByLabel('Session code').fill(code);
  await interviewer.getByRole('button', { name: /facilitator/i }).click();
  await interviewer.getByRole('button', { name: 'Join as Interviewer' }).click();
  await expect(interviewer.getByText(/Subject is arranging/)).toBeVisible();

  // Subject submits, interviewer's turn
  await subject.getByRole('button', { name: /Done/ }).click();
  await expect(subject.getByText(/Interviewer is arranging/)).toBeVisible();
  await expect(interviewer.getByRole('button', { name: /Done/ })).toBeVisible();
  await interviewer.getByRole('button', { name: /Done/ }).click();

  // Reveal: both pages show both rows of 10 cards
  for (const page of [subject, interviewer]) {
    await expect(page.getByRole('button', { name: /Phase 2/ })).toBeVisible();
    await expect(page.locator('.reveal .row > *')).toHaveCount(20);
  }

  // Advance to phase 2 from the subject's page; both pages follow
  await subject.getByRole('button', { name: /Phase 2/ }).click();
  await expect(subject.locator('.badge')).toHaveText('Phase 2 — Realisation');
  await expect(interviewer.locator('.badge')).toHaveText('Phase 2 — Realisation');

  await subjectCtx.close();
  await interviewerCtx.close();
});

test('solo session: create, arrange, straight to phase 2', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Solo/ }).click();

  // Solo joins automatically and goes straight to arranging
  await expect(page.getByRole('button', { name: /Done/ })).toBeVisible();
  await expect(page.locator('.badge')).toHaveText('Phase 1 — Importance');

  // Submitting skips the interviewer and reveal phases entirely
  await page.getByRole('button', { name: /Done/ }).click();
  await expect(page.locator('.badge')).toHaveText('Phase 2 — Realisation');
});
