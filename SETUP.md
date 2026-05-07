# Setup-Anleitung Vertriebs-Cockpit Pro

## Voraussetzungen

- Cloudflare Account (kostenlos): https://dash.cloudflare.com/sign-up
- Node.js + npm: https://nodejs.org
- Wrangler CLI: `npm install -g wrangler`

## Schritt 1: Cloudflare KV Namespace

1. Login: https://dash.cloudflare.com
2. Workers & Pages -> KV
3. Klick "Create namespace"
4. Name: `COCKPIT_KV` (oder beliebig)
5. Notiere die **Namespace-ID** (z.B. `269ca22eddfc4ef397f9d20e9c98a829`)

## Schritt 2: Pages Project

1. Workers & Pages -> Create application -> Pages -> Direct Upload
2. Project Name: `mein-cockpit`  
3. Settings -> Functions -> KV namespace bindings -> Add binding:
   - Variable name: `KV`
   - KV namespace: dein gerade erstelltes Namespace
4. Save

## Schritt 3: Deploy

```bash
cd cockpit-template
wrangler login   # Browser oeffnet sich, einloggen
wrangler pages deploy . --project-name=mein-cockpit --commit-dirty=true
```

Output zeigt URL wie: `https://abc123.mein-cockpit.pages.dev`

## Schritt 4: Erste Anmeldung

1. Oeffne deine URL
2. Login mit `11111` (Admin-Standard)
3. Navigiere zu `/admin` -> Benutzer-Verwaltung
4. **Aendere alle Passwoerter sofort!**
5. Setze Email-Signaturen pro User
6. Aendere User-Namen (Admin User -> dein Name)

## Schritt 5: Branding anpassen

Siehe `CONFIG.md` fuer alle Customization-Optionen.

## Schritt 6: Eigene Lead-Daten

Demo-Daten ueberschreiben:
1. Excel/CSV mit deinen Firmen vorbereiten
2. JSON-Format anlegen (siehe Demo in `index.html` bei `"leads":[...]`)
3. Wichtige Felder pro Lead:
   ```json
   {
     "id": 0,
     "firma": "Firma X",
     "plz_ort": "12345 Stadt",
     "plz": "12345",
     "tel": "+49 ...",
     "mail": "info@firma.de",
     "web": "www.firma.de",
     "kontakt_person": "",
     "branchen": ["Maschinenbau"],
     "bundesland": "BW",
     "size_label": "Mittelstand",
     "umsatz_mio": 50,
     "scores": {
       "produkt_a": 80,
       "produkt_b": 60,
       ...
     },
     "best_score": 80,
     "best_produkt": "produkt_a",
     "tier": "A",
     "lat": 48.7758,
     "lng": 9.1829
   }
   ```
4. Geocoding (PLZ -> lat/lng): https://download.geonames.org/export/zip/DE.zip oder anderes Land
5. Re-deploy

## Schritt 7: Tier-Bereich konfigurieren

In `index.html` und `_middleware.js`:
```js
// Default tiers (best_score):
A: >= 78
B: >= 62
C: >= 40
D: < 40
```

## Schritt 8: Eigene Domain (optional)

Cloudflare Pages -> Custom domains -> Set up custom domain.

## Backup einrichten

1. Login als Admin
2. /admin -> Backup & Sicherheit -> JSON-Backup herunterladen
3. **Wochentlich** auf USB-Stick speichern
4. Bei Datenverlust: /admin -> Restore -> Datei waehlen -> Dry-Run -> Restore

## Probleme?

- 429 Rate-Limit: 15 Min warten oder KV-key `ratelimit:login:DEINE_IP` loeschen
- 403 Forbidden: Origin-Check, vom richtigen Domain aufrufen
- Login-HTML statt JSON: Auth abgelaufen, neu einloggen
