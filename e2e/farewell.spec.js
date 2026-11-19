import { expect, test } from '@playwright/test'

// De app stopt: wie ze opent, krijgt enkel nog het afscheidsscherm, ook met
// gegevens van vroeger op het toestel, en zonder inlogscherm.
test('de app toont enkel nog het afscheidsscherm', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('matchblad.v1', JSON.stringify({ teams: [], activeTeamId: null, history: [] }))
  })
  await page.goto('/')
  await expect(page.getByText('Deze app werkt niet meer.')).toBeVisible()
  await expect(page.getByText('Je mag de app van je toestel verwijderen.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Inloggen met Google' })).toHaveCount(0)
  await expect(page.getByRole('navigation')).toHaveCount(0)
})
