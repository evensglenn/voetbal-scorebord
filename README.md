# Matchblad

Score, doelpuntenmakers en tijdslijn bijhouden tijdens een U9-match (5 tegen 5, 4 × 15 minuten).
Draait volledig in de browser en bewaart alles lokaal op het toestel — geen server, geen account.

## Lokaal draaien

```bash
npm install
npm run dev
```

## Op GitHub Pages zetten

1. Maak een lege repository op GitHub en push deze map naar de `main`-branch.
2. Ga in de repo naar **Settings → Pages** en zet **Source** op **GitHub Actions**.
3. Push (of start de workflow handmatig via **Actions → Deploy naar GitHub Pages → Run workflow**).

De workflow in `.github/workflows/deploy.yml` bouwt de app en publiceert ze op
`https://<gebruiker>.github.io/<repo>/`.

`vite.config.js` leidt de base path af uit `GITHUB_REPOSITORY`, dus je hoeft niets aan te
passen als je de repo later hernoemt. Bij een user page (`<gebruiker>.github.io`) wordt de
base automatisch `/`.

## Gebruik

- Lummen United staat vast in het scorebord. Met de schakelaar **thuis / uit** wissel je
  van kant: bij een uitmatch staat de tegenstander links.
- Voeg de spelers toe onder **Spelers**, met of zonder rugnummer.
- Kies de periode (P1 tot P4). De klok is optioneel; wie ze laat lopen krijgt de
  tijd er in de tijdslijn bij, wie dat niet doet ziet enkel de volgorde.
- Tik op een speler om een doelpunt te noteren. **Doelpunt zonder naam** is er voor de
  keren dat niemand goed gezien heeft wie erbij was.
- **Laatste ongedaan maken** haalt een misklik weg; in de tijdslijn kan elk doelpunt apart
  met × verwijderd worden.
- **Nieuwe match** wist score en tijdslijn, de spelerslijst blijft staan.
