import { ACCOUNT_STATE, expect, localState, readState, seedBackup, tab, test } from './fixtures.js'

test.describe('back-ups in het account', () => {
  test.beforeEach(async ({ account }) => {
    // Een kopie van twee weken geleden met één wedstrijd minder.
    await seedBackup(account.uid, 'oud', { ...ACCOUNT_STATE, history: ACCOUNT_STATE.history.slice(1) }, 14)
  })

  test('de lijst toont de kopieën en maakt er zelf een bij', async ({ signedIn: page }) => {
    await tab(page, 4)
    const list = page.locator('.backup-list li')
    // De oude kopie plus de wekelijkse die de app na het synchroniseren maakt.
    await expect(list).toHaveCount(2)
    await page.getByRole('button', { name: 'Nu een kopie bewaren' }).click()
    await expect(page.getByText('Er is een kopie bewaard.')).toBeVisible()
    await expect(list).toHaveCount(3)
    await expect(list.first()).toContainText('zelf bewaard')
  })

  test('terugzetten zet alles zoals het toen was, na een kopie van de huidige stand', async ({
    signedIn: page,
    account,
  }) => {
    await tab(page, 4)
    const list = page.locator('.backup-list li')
    await expect(list).toHaveCount(2)
    await list.last().getByRole('button', { name: 'Zet terug' }).click()
    await page.getByRole('button', { name: 'Ja, zet terug' }).click()
    await expect(page.getByText('De kopie is teruggezet.')).toBeVisible()
    expect((await localState(page)).history).toHaveLength(1)
    await expect(list.first()).toContainText('vóór terugzetten')
    await expect.poll(async () => (await readState(account.uid)).history.length).toBe(1)
  })
})
