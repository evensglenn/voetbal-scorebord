import { expect, localState, readState, tab, test } from './fixtures.js'

test('een volledige wedstrijd komt bij de uitslagen en in het account', async ({ signedIn: page, account }) => {
  await page.getByRole('button', { name: 'Start nieuwe wedstrijd' }).click()
  await page.getByLabel('Naam tegenstander').fill('Sporting Hasselt')
  await page.getByRole('button', { name: 'Start wedstrijd' }).click()

  await page.locator('.scorer', { hasText: 'Seppe' }).click()
  await page.getByRole('button', { name: 'Tegendoelpunt' }).click()
  await page.locator('.scorer', { hasText: 'Seppe' }).click()

  for (const period of [2, 3, 4]) await page.getByRole('button', { name: `Naar periode ${period}` }).first().click()
  await page.getByRole('button', { name: 'Beëindig de wedstrijd vroegtijdig' }).click()
  await page.getByRole('button', { name: 'Beëindig', exact: true }).click()
  await page.getByRole('button', { name: 'Ja, beëindig' }).click()
  await page.keyboard.press('Escape')

  await tab(page, 2)
  await expect(page.getByText('Sporting Hasselt')).toBeVisible()
  const history = (await localState(page)).history
  expect(history).toHaveLength(3)
  expect(history[0]).toMatchObject({ theirName: 'Sporting Hasselt', left: { goals: 2 }, right: { goals: 1 } })
  await expect.poll(async () => (await readState(account.uid)).history.length).toBe(3)
})
