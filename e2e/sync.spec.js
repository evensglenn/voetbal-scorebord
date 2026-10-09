import { expect, signIn, tab, test } from './fixtures.js'

test('een wijziging op het ene toestel verschijnt op het andere', async ({ signedIn: phone, account, browser }) => {
  const tablet = await (await browser.newContext()).newPage()
  await signIn(tablet, account.email)
  await expect(tablet.locator('nav.tabs')).toBeVisible()

  await tab(phone, 1)
  await phone.getByLabel('Naam speler').fill('Mats')
  await phone.getByLabel('Voeg speler toe').click()

  await tab(tablet, 1)
  await expect(tablet.getByText('Mats')).toBeVisible({ timeout: 15_000 })
  await tablet.context().close()
})
