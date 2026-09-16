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

## Op je gsm zetten

Open de gepubliceerde link op je telefoon en zet ze op het beginscherm: op iPhone via
**Deel → Zet op beginscherm**, op Android via **menu → App installeren**. Daarna opent het
matchblad in volledig scherm, zonder adresbalk, met het voetbalicoon erbij.

De service worker in `public/sw.js` cachet de app, dus ze opent ook als er langs het veld
geen bereik is. Dat werkt enkel over https — op GitHub Pages dus wel, op een gewone
`http://`-testserver niet. Het lettertype komt van Google Fonts en valt zonder netwerk
terug op de systeemletter.

De iconen staan in `public/` en zijn gemaakt met `tools/make_icons.py`. Wil je een andere
clubkleur, pas dan `CLUB` in dat script aan en draai het opnieuw:

```bash
python3 tools/make_icons.py
```

## Liggend scherm

Draai je de telefoon, dan komt de tijdslijn naast de spelersknoppen te staan en blijft het
scorebord bovenaan hangen. Het manifest legt geen oriëntatie meer vast, dus ook als app op
je beginscherm draait hij gewoon mee.

## Hattricks

Drie doelpunten na elkaar van dezelfde speler tellen als hattrick. Elk doelpunt daartussen
breekt de reeks: van een ploegmaat, van de tegenstander, of een doelpunt zonder naam.

Je ziet het op drie plaatsen: een oranje balk bovenaan zodra het zover is, een dikke oranje
rand langs de betrokken doelpunten in de tijdslijn met het label erbij, en een teller per
speler in de spelerslijst. Staat iemand op twee op rij, dan verschijnt dat al op zijn knop.
Loopt de reeks door tot vier of vijf, dan telt het label mee.
