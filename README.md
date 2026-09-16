# Matchblad

Score, doelpuntenmakers en tijdslijn bijhouden langs de lijn — voor U7 (3 tegen 3) en U9
(5 tegen 5). Geen papieren blaadje meer dat nat wordt in de regen: dit draait volledig in
de browser en bewaart alles lokaal op het toestel. Geen server, geen account, geen
internet nodig zodra de pagina één keer geladen is.

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

- Vul bij **Wedstrijd** de naam van de tegenstander in, kies of Lummen United thuis of uit
  speelt, en kies de leeftijdscategorie. Zie hieronder voor wat dat allemaal doet.
- Voeg de spelers toe onder **Spelers**, met of zonder rugnummer.
- Kies de periode (P1 tot P4). De klok is optioneel; wie ze laat lopen krijgt de
  tijd er in de tijdslijn bij, wie dat niet doet ziet enkel de volgorde.
- Tik op een speler om een doelpunt te noteren. **Doelpunt zonder naam** is er voor de
  keren dat niemand goed gezien heeft wie erbij was.
- **Laatste ongedaan maken** haalt een misklik weg; in de tijdslijn kan elk doelpunt apart
  met × verwijderd worden.
- **Nieuwe match** wist score en tijdslijn, de spelerslijst blijft staan.

## Wedstrijdinstellingen

Het tabblad **Wedstrijd** verzamelt alles wat per match verschilt:

- **Tegenstander** — de naam die je hier intikt verschijnt op het scorebord, in de
  tijdslijn en in de gegenereerde samenvatting. Leeg gelaten? Dan staat er gewoon
  "Tegenstander".
- **Thuis / uit** — bepaalt aan welke kant Lummen United op het scorebord staat.
- **Leeftijdscategorie** — **U7** speelt 4 × 10 minuten, **U9** speelt 4 × 15 minuten. De
  klok op het Match-scherm houdt daar automatisch rekening mee, en onder de keuze staat een
  link naar het officiële spelreglement (pdf) van Voetbal Vlaanderen voor die categorie.

De gekozen categorie zie je ook meteen terug op het scorebord, netjes tussen de twee
ploegnamen in.

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

## Samenvatting als foto

De knop **Samenvatting** tekent de match op een canvas van 1080 × 1350 en toont het
resultaat in een venster. Op een telefoon verschijnt **Delen**, wat het deelvenster van het
toestel opent (WhatsApp, Foto's, …); waar dat niet kan, staat er **Bewaren** en wordt de
PNG gedownload.

Op de afbeelding staan de namen van beide ploegen, de uitslag, een verloopgrafiek met de
vier periodes, en álle doelpuntenmakers — met een bolletje per goal en een label bij een
hattrick. Scoort de halve ploeg? Dan krimpen de rijen gewoon een beetje zodat iedereen erop
past. De tekenlogica staat apart in `src/summary.js`.

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

## Versie

Onderaan de app staat een versienummer (bv. `v0.3.0`), rechtstreeks uit `package.json`.
Bij elke wijziging aan de app hoort dat nummer een tikje omhoog te gaan.
