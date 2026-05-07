# Konfiguration Vertriebs-Cockpit Pro

## Brand & Firma anpassen

Search&Replace alle Platzhalter:

| Platzhalter | Beispiel |
|---|---|
| `{{COMPANY_NAME}}` | "Mustermann" |
| `{{CITY}}` | "Stuttgart" |
| `{{DOMAIN}}` | "mustermann.de" |
| `{{ADDRESS}}` | "Industriestr. 1" |
| `{{ZIP}}` | "70173" |
| `{{CEO_NAMES}}` | "Hans und Peter Mustermann" |
| `{{REGISTER}}` | "HRA 12345" |
| `{{COURT}}` | "Amtsgericht Stuttgart" |
| `{{VAT_ID}}` | "DE123456789" |
| `{{TEL_MAIN}}` | "+49 711 1234567" |
| `{{FAX}}` | "+49 711 1234568" |
| `{{TEL_MOBILE}}` | "+49 162 1234567" |

```bash
# Linux/Mac
find . -name "*.html" -o -name "*.js" -o -name "*.md" -o -name "*.json" | xargs sed -i 's/{{COMPANY_NAME}}/Mustermann/g'
find . -name "*.html" -o -name "*.js" -o -name "*.md" -o -name "*.json" | xargs sed -i 's/{{CITY}}/Stuttgart/g'
# usw.
```

## Brand-Farbe

In `_headers`, alle `*.html`, `manifest.json`:
- `#0a4d8c` -> deine Hauptfarbe
- `#1565c0` -> deine Akzentfarbe (heller)

## Produktlinien

In `index.html` (constants `PRODUKTE` + `PRODUKT_LABEL`):
```js
const PRODUKTE = ["produkt_a", "produkt_b", "produkt_c"];
const PRODUKT_LABEL = {
  produkt_a: "Mein Produkt A",
  produkt_b: "Mein Produkt B",
  produkt_c: "Mein Produkt C",
};
```

In `_middleware.js`, search-replace die Liste in `/api/score-override`.

## Tier-Schwellen

Wenn deine Score-Verteilung anders ist:
```js
// In index.html und _middleware.js:
A: >= 78    // Hot
B: >= 62    // Warm
C: >= 40    // Cold
D: < 40     // Skip
```

## Email-Templates

In `index.html` (constant `EMAIL_TEMPLATES`):
```js
const EMAIL_TEMPLATES = {
  produkt_a: {
    subject: "...",
    body: "..."  // {FIRMA_NAME}, {ABSENDER}, {ANSPRECHPARTNER_GREETING} sind Variablen
  },
};
```

## Default-User & Passwoerter

In `_middleware.js` Top:
```js
const DEFAULT_USERS = [
  { password: '11111', id: 'admin', name: 'Admin User', role: 'admin', color: '#0a4d8c', email_signature: 'deine Signatur' },
  { password: '22222', id: 'sales1', name: 'Sales 1', role: 'vertrieb', color: '#16a34a', email_signature: '' },
];
```

**Wichtig:** Sobald deployed, die Passwoerter via Admin-Panel aendern. Default-Passwoerter werden nur beim ersten Start verwendet.

## TOKEN_SECRET (Security)

In `_middleware.js`:
```js
const TOKEN_SECRET = 'aendere-dieses-zu-einem-zufaelligen-string';
```

Generiere einen zufaelligen Wert: `openssl rand -base64 48`

Besser: als Cloudflare Pages Environment Variable setzen.

## Sprachen

Aktuell: Deutsch fest.
Fuer Englisch: search-replace in HTML-Dateien (kann mehrere Stunden dauern).

## Konkurrenz-Liste anpassen

`konkurenz.html` enthaelt 94 Beispiel-Konkurrenten. Loesche oder ersetze mit deiner eigenen Liste.

## Bestandskunden

`kunden.html` zeigt Firmen mit Status "Kunde" (automatisch). Keine Konfiguration noetig.

## Karten-Region

`karte.html` startet auf Deutschland (51, 10.5 zoom 6). Aenderbar:
```js
map = L.map('map').setView([DEINE_LAT, DEINE_LNG], DEIN_ZOOM);
```

## News-Watch

Fuer eigenes Land/Sprache in `_middleware.js` `/api/news/refresh`:
```js
// Aktuell: hl=de&gl=DE&ceid=DE:de
// Englisch USA: hl=en&gl=US&ceid=US:en
```

## PWA Icon

Ersetze `icon-192.png` und `icon-512.png` mit deinem Logo (PNG, exakt 192x192 und 512x512 px).
