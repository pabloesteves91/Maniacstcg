# MANIACS · COMPETE (Web App)

Features:
- Firebase Firestore (online storage)
- E-Mail/Passwort Login
- Admin-Tab (Custom Claims) zum Anlegen von Usern
- Players / Matches / Events / Sponsors (Realtime)
- Responsive (Mobile-First)
- PWA manifest

## Setup

### 1) Firebase
- Projekt anlegen
- **Authentication → Sign-in method → Email/Password aktivieren**
- **Firestore aktivieren**
- In `firebase.js` deine Config eintragen (apiKey etc.)

### 2) Security Rules
Kopiere den Inhalt aus `firestore.rules` in die Firebase Console (Firestore → Rules).

### 3) Functions deployen
```bash
cd functions
npm i
cd ..
firebase deploy --only functions
```

### 4) Ersten Admin setzen (einmalig)
Variante A (lokal, empfohlen):
```bash
# Service Account JSON herunterladen (Project settings → Service accounts)
set GOOGLE_APPLICATION_CREDENTIALS=path/to/key.json    # Windows (PowerShell: $env:GOOGLE_APPLICATION_CREDENTIALS="...")
export GOOGLE_APPLICATION_CREDENTIALS=path/to/key.json # macOS/Linux

node tools/bootstrap-admin.js your@email.com
```

Variante B (temporär): per zusätzlicher Admin-Funktion/Script – nur wenn Variante A nicht möglich ist.

### 5) Hosting
- GitHub Pages oder Netlify: Projektordner hochladen (keine Build-Schritte nötig)
- In Firebase Auth unter **Authorized domains** deine Domain erlauben

## Region für Functions
Wenn du in EU deployst (z. B. `europe-west1`), setze in `firebase.js`:
```js
// export const fns = getFunctions(app, "europe-west1");
```

## Hinweis
Die Spieler-Statistik (Wins/Losses/Draws) wird beim Anlegen von Matches aktuell **clientseitig** hochgezählt (Demo). Für produktiven Einsatz empfehle ich eine Cloud Function mit Transaktion.
