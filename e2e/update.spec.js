import { expect, test } from './fixtures.js'

test('een nieuwe versie toont een melding met Vernieuw, die weggeklikt kan worden', async ({ signedIn: page }) => {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('scorebord:update-available')))
  const notice = page.getByRole('status').filter({ hasText: 'Nieuwe versie' })
  await expect(notice).toBeVisible()
  await expect(notice.getByRole('button', { name: 'Vernieuw' })).toBeVisible()
  await notice.getByRole('button', { name: 'Sluit melding' }).click()
  await expect(notice).toHaveCount(0)
})
