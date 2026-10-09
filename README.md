# Scorebord · Lummen United

Een wedstrijd van de jeugdploeg bijhouden langs de lijn: score, doelpuntenmakers, de klok
per periode, wissels, strafschoppen, en daarna alle uitslagen en statistieken. Gemaakt als
web-app die je op je gsm zet, met je gegevens in je Google-account en op al je toestellen.

**Open de app:** <https://evensglenn.github.io/voetbal-scorebord/>

## Wat de app kan

- **Ploegen en spelers.** Eén of meer ploegen, van U6 tot U21. Per leeftijd staat het
  speelformaat (2 tegen 2 tot 11 tegen 11) en het aantal periodes en minuten al juist
  volgens Voetbal Vlaanderen, met een link naar het spelreglement. Periodes en minuten blijven
  aanpasbaar voor tornooien en oefenmatchen.
- **Een wedstrijd starten.** Tegenstander, thuis of uit, speeltijd, wisselmelding en wie er
  meespeelt.
- **Doelpunten noteren.** Tik op de speler die scoorde, op *Own goal* of op *Tegendoelpunt*.
  De tijdslijn toont alles met minuut en tussenstand; een misklik maak je ongedaan.
- **Hattricks.** Drie doelpunten na elkaar van dezelfde speler; elk ander doelpunt daartussen
  (ploegmaat, tegenstander, own goal) breekt de reeks. De app toont het meteen.
- **De klok.** Loopt per periode, ook als de gsm even op slot gaat, en houdt het scherm aan
  zolang ze loopt. Na de laatste periode: extra periode, strafschoppen of beëindigen. Een
  periode vroeger afsluiten kan ook.
- **Wisselmeldingen.** Halverwege elke periode of om de zoveel minuten, met een aftelling
  vooraf. Desgewenst hardop gezegd en met trillen.
- **Groot scorebord.** Draai je gsm tijdens een wedstrijd, of open het met de hand op een
  tablet of computer: een groot bord met een digitale klok, leesbaar van ver.
- **Samenvatting als afbeelding.** Na de wedstrijd een afbeelding met uitslag, verloop en
  doelpuntenmakers, om te delen in WhatsApp of te bewaren.
- **Uitslagen en statistieken.** Alle gespeelde wedstrijden per ploeg, met winst/gelijk/
  verlies, vorm, doelpunten per periode, topschutters en strafschoppen.
- **Licht, donker of automatisch**, volgens je toestel.

## Op je gsm zetten

Open de link op je gsm en zet ze op het beginscherm: op iPhone via **Deel → Zet op
beginscherm**, op Android via **menu → App installeren**. Daarna opent ze in volledig scherm,
met het clubicoon. Langs het veld zonder bereik werkt ze gewoon verder.

Komt er een nieuwe versie online, dan verschijnt bovenaan *Nieuwe versie* met een knop
**Vernieuw**.

## Account, synchroniseren en back-ups

- **Inloggen met Google is nodig.** Je gegevens staan dan in je account en op elk toestel
  waarop je met hetzelfde account inlogt. Wijzigingen gaan na een paar seconden online; zonder
  bereik wachten ze tot er weer netwerk is.
- **Eerste login op een toestel met gegevens:** de app vraagt of die mee naar je account
  gaan (*Meenemen*) of gewist mogen worden (*Wis dit toestel*, met een tweede bevestiging).
- **Back-ups:** elke week bewaart de app vanzelf een kopie in je account; de laatste 8 blijven
  bewaard. In **Instellingen → Back-up** zet je er een terug, of bewaar je er zelf een. Een
  eigen back-upbestand exporteren kan ook.
- **Plaats:** in **Instellingen → Account** zie je hoeveel procent van je account gebruikt is.
  Vanaf 75% waarschuwt de app, met een stipje op de tab Instellingen.
- **Andere gebruikers** kunnen de app ook gebruiken met hun eigen Google-account; ze hoeven
  niets in te stellen. Iedereen ziet enkel zijn eigen gegevens. Alles draait wel op het
  Firebase-project van de eigenaar, die de gegevens in de Firebase-console kan zien.

## Ontwikkelen

### Lokaal draaien

Aanbevolen: tegen de Firebase-emulators, met testdata en los van de echte gegevens.

```bash
npm install
npm run dev:local
```

Open <http://localhost:5181>, klik op **Inloggen met Google** en kies **Test** in het venster
van de emulator. Je krijgt twee ploegen (U9 en U7), twaalf gespeelde wedstrijden en twee
back-ups; alles wat je doet blijft in de emulator en is weg na het stoppen (Ctrl+C).
Bovenaan staat een groen blokje **Lokaal · testdata**.

Vereist **Java 21+** voor de emulators (`brew install openjdk@21`; het script vindt de
Homebrew-installatie ook zonder PATH-aanpassing).

`npm run dev` (<http://localhost:5173>) start de app tegen de **echte** gegevens, met een
rood blokje **Lokaal · echte gegevens**: handig om iets na te kijken, maar elke wijziging is
echt.

### Werkwijze

Elke wijziging op een eigen branch, met een pull request. GitHub Actions
([ci.yml](.github/workflows/ci.yml)) draait daarop de build en alle tests; merge pas als die
groen zijn. `main` is beschermd tegen force-push en verwijderen. Verhoog bij elke wijziging aan
de app het versienummer in `package.json`: dat staat onderaan Instellingen en zorgt ervoor dat
toestellen de nieuwe versie melden.

### Tests

```bash
npm test               # unit-tests (spelregels, samenvoegen, opslag)
npm run test:emulator  # ook de Firestore-tests (opslaan, back-ups, regels) tegen de emulators
npm run test:e2e       # browsertests (Playwright, met je geïnstalleerde Chrome) op gsm- en desktopbreedte
```

Beide emulatortests gebruiken een draaiende `npm run dev:local` als die er is, en maken per
test een eigen account aan, zodat het testaccount van `dev:local` ongemoeid blijft.

### Opbouw

| Waar | Wat |
| --- | --- |
| `src/App.jsx` | De app zelf: staat, klok, meldingen en welk scherm openstaat |
| `src/match.js`, `src/results.js` | Spelregels en gegevens, uitslagen en statistieken (zonder schermen, getest) |
| `src/*.jsx` | De schermen en onderdelen: `Home`, `Match`, `Scoreboard`, `BigBoard`, `StartMatch`, `Squad`, `History`, `Stats`, `Settings`, `Account`, … |
| `src/cloud.js`, `src/firebase.js` | Synchroniseren met het account; enkel `firebase.js` spreekt Firebase aan |
| `src/summary.js` | Tekent de samenvatting als afbeelding |
| `src/styles.css` | Alle stijlen, met de kleuren als variabelen voor licht en donker |
| `public/sw.js` | Service worker: de app werkt ook zonder netwerk |
| `firestore.rules` | Wie wat mag lezen en schrijven in Firestore |
| `e2e/`, `scripts/` | Browsertests, emulators en testdata |

Meer technische uitleg staat in [CLAUDE.md](CLAUDE.md).

## Deploy

Een push naar `main` (dus een gemergde pull request) zet eerst de Firestore-regels online en
daarna de app op GitHub Pages ([deploy.yml](.github/workflows/deploy.yml)).

Voor de regels heeft GitHub een sleutel nodig (eenmalig, staat al ingesteld):

1. Open in de [Google Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts?project=voetbal-scorebord-6eb7f)
   het project `voetbal-scorebord-6eb7f` → **Service accounts** → **Create service account**
   (bv. `github-firestore-deploy`).
2. Geef het de rollen **Firebase Rules Admin** en **Service Usage Consumer**.
3. Open het service account → **Keys** → **Add key** → **JSON** en download het bestand.
4. Zet de inhoud als repository secret `FIREBASE_SERVICE_ACCOUNT`:
   `gh secret set FIREBASE_SERVICE_ACCOUNT < sleutel.json`. Verwijder daarna het bestand.

`vite.config.js` leidt het pad van de app af uit de naam van de repository, dus een andere
repo-naam vraagt geen aanpassing.

## Firebase-project (eenmalig, staat al ingesteld)

1. Maak een project aan op <https://console.firebase.google.com>.
2. **Authentication → Google** inschakelen, en onder **Settings → Authorized domains** het
   domein van de app toevoegen (`evensglenn.github.io`).
3. **Firestore Database** aanmaken in productiemodus, regio `europe-west1`. De regels komen
   met de deploy mee.
4. **Projectinstellingen → Jouw apps → Web-app** toevoegen en `apiKey`, `authDomain`,
   `projectId` en `appId` overnemen in `src/firebase-config.js`. Dat zijn geen geheimen: ze
   zitten in elke kopie van de app. Beperk de sleutel wel in de
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials?project=voetbal-scorebord-6eb7f)
   tot de websites van de app (`https://evensglenn.github.io/*`,
   `https://voetbal-scorebord-6eb7f.firebaseapp.com/*`, `http://localhost:5173/*`).

Zolang `src/firebase-config.js` leeg is, werkt de app zonder login, enkel lokaal.

## Iconen

De iconen in `public/` zijn gemaakt met `tools/make_icons.py`. Voor een andere clubkleur:
pas `CLUB` in dat script aan en draai `python3 tools/make_icons.py`.
