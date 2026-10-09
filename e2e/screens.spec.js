import { expect, tab, test } from './fixtures.js'

// Rooktest: elk scherm en venster één keer openen, zonder JavaScript-fouten.
// Vangt vooral ontbrekende imports of verkeerd verplaatste code.
test('alle schermen openen zonder fouten', async ({ signedIn: page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))

  await tab(page, 1)
  await expect(page.getByLabel('Naam speler')).toBeVisible()
  await tab(page, 2)
  await expect(page.getByText('Herk FC')).toBeVisible()
  await page.getByText('Herk FC').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await tab(page, 3)
  await expect(page.getByText('Topschutters')).toBeVisible()
  await tab(page, 4)
  await expect(page.getByText('Weergave')).toBeVisible()

  // Een wedstrijd tot aan de strafschoppen, met het grote scorebord ertussen.
  await tab(page, 0)
  await page.getByRole('button', { name: 'Start nieuwe wedstrijd' }).click()
  await page.getByRole('button', { name: 'Start wedstrijd' }).click()
  await page.locator('.scorer', { hasText: 'Rune' }).click()
  await page.getByRole('button', { name: 'Open groot scorebord' }).click()
  await expect(page.locator('.bigboard')).toBeVisible()
  await page.keyboard.press('Escape')
  for (const period of [2, 3, 4]) await page.getByRole('button', { name: `Naar periode ${period}` }).first().click()
  await page.getByRole('button', { name: 'Beëindig de wedstrijd vroegtijdig' }).click()
  await page.getByRole('button', { name: 'Strafschoppen', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Wie neemt een strafschop?' })).toBeVisible()
  await page.getByRole('button', { name: 'Seppe', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Doelpunt' }).click()
  await expect(page.getByText('Strafschoppen reeks')).toBeVisible()

  expect(errors).toEqual([])
})
