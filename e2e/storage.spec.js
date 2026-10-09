import { ACCOUNT_STATE, expect, tab, test } from './fixtures.js'

const tabSettings = (page) => page.locator('nav.tabs .tab').last()

test('Instellingen toont hoeveel plaats er gebruikt is', async ({ signedIn: page }) => {
  await tab(page, 4)
  await expect(page.getByRole('meter', { name: 'Plaats gebruikt in je account' })).toBeVisible()
  await expect(page.locator('.storage .backup-note').first()).toHaveText(
    /^(minder dan 1|\d+)% gebruikt · plaats voor nog ongeveer \d+ wedstrijden\.$/,
  )
  await expect(tabSettings(page).locator('.tab-dot')).toHaveCount(0)
})

test.describe('een account dat vol raakt', () => {
  // Eén uitslag met veel opmerkingen, goed voor ~80% van de plaats.
  test.use({
    accountState: {
      ...ACCOUNT_STATE,
      history: [...ACCOUNT_STATE.history, { ...ACCOUNT_STATE.history[0], id: 'groot', notes: 'x'.repeat(800_000) }],
    },
  })

  test('waarschuwt in Instellingen en met een stipje op de tab', async ({ signedIn: page }) => {
    await expect(tabSettings(page).locator('.tab-dot')).toBeVisible()
    await expect(tabSettings(page)).toHaveAttribute('aria-label', 'Instellingen – je account raakt vol')
    await tab(page, 4)
    await expect(page.getByText('Je account raakt vol.', { exact: false })).toBeVisible()
    await expect(page.locator('.storage .backup-note').first()).toContainText('80% gebruikt')
  })
})
