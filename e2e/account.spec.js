import { expect, localState, readState, seedDevice, signIn, tab, team, test } from './fixtures.js'

// Een toestel dat de app al gebruikte vóór er een account was.
const DEVICE_STATE = {
  teams: [team('u7', 'U7', [{ id: 'd1', name: 'Lou' }])],
  activeTeamId: 'u7',
  history: [],
}

const names = (state) => state.teams.flatMap((t) => t.players.map((p) => p.name)).sort()

test('zonder login toont de app enkel het inlogscherm', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Inloggen met Google' })).toBeVisible()
  await expect(page.locator('nav.tabs')).toHaveCount(0)
})

test('een leeg toestel neemt zonder vragen over wat in het account staat', async ({ signedIn: page }) => {
  await tab(page, 1)
  await expect(page.getByText('Seppe')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(names(await localState(page))).toEqual(['Lars', 'Rune', 'Seppe'])
})

test.describe('eerste login op een toestel met gegevens', () => {
  test('Meenemen voegt ze samen met het account', async ({ page, account }) => {
    await seedDevice(page, DEVICE_STATE)
    await signIn(page, account.email)
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Op dit toestel staan 1 ploeg en 0 wedstrijden')
    await expect(dialog).toContainText('In je account staan al 1 ploeg en 2 wedstrijden')
    await dialog.getByRole('button', { name: 'Meenemen' }).click()
    await expect(dialog).toHaveCount(0)
    await expect.poll(async () => names(await readState(account.uid))).toEqual(['Lars', 'Lou', 'Rune', 'Seppe'])
    expect((await readState(account.uid)).history).toHaveLength(2)
  })

  test('Wis dit toestel vraagt bevestiging en houdt enkel het account over', async ({ page, account }) => {
    await seedDevice(page, DEVICE_STATE)
    await signIn(page, account.email)
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Wis dit toestel' }).click()
    await expect(dialog.getByRole('heading')).toHaveText('Zeker wissen?')
    await dialog.getByRole('button', { name: 'Ja, wis' }).click()
    await expect(dialog).toHaveCount(0)
    expect(names(await localState(page))).toEqual(['Lars', 'Rune', 'Seppe'])
    // Er gaat niets van het gewiste toestel naar het account.
    await page.waitForTimeout(3000)
    expect(names(await readState(account.uid))).toEqual(['Lars', 'Rune', 'Seppe'])
  })

  test.describe('met een leeg account', () => {
    test.use({ accountState: null })

    test('Meenemen zet de gegevens van het toestel in het account', async ({ page, account }) => {
      await seedDevice(page, DEVICE_STATE)
      await signIn(page, account.email)
      const dialog = page.getByRole('dialog')
      await expect(dialog).toContainText('Je account is nog leeg')
      await dialog.getByRole('button', { name: 'Meenemen' }).click()
      await expect.poll(async () => (await readState(account.uid)) && names(await readState(account.uid))).toEqual(['Lou'])
    })
  })
})

test('uitloggen zet de app op slot; opnieuw inloggen gaat verder zonder vraag', async ({ signedIn: page, account }) => {
  await tab(page, 4)
  await page.getByRole('button', { name: 'Uitloggen' }).click()
  await expect(page.getByRole('button', { name: 'Inloggen met Google' })).toBeVisible()
  await signIn(page, account.email)
  await expect(page.locator('nav.tabs')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(names(await localState(page))).toEqual(['Lars', 'Rune', 'Seppe'])
})

test('wie al ingelogd was, komt na herladen meteen in de app', async ({ signedIn: page }) => {
  await page.reload()
  await expect(page.locator('nav.tabs')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Inloggen met Google' })).toHaveCount(0)
})

test('het account toont naam en synchronisatie', async ({ signedIn: page, account }) => {
  await tab(page, 4)
  await expect(page.getByText(account.email)).toBeVisible()
  await expect(page.getByText(/Gesynchroniseerd/)).toBeVisible()
})
