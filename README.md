# Vertriebs-Cockpit Pro - Template

Eine vollstaendige B2B-CRM/Vertriebs-Plattform fuer kleine und mittelstaendische Unternehmen (KMU).
Basiert auf Cloudflare Pages + KV (kostenlos bis 100k Requests/Tag).

## Features (Sprint 1-15)

### Lead-Management
- Multi-User Cockpit mit 1000+ Leads (extensible)
- Lead-Scoring nach Produktlinien (algorithmisch + manuell ueberschreibbar)
- 7-Stufen Pipeline (Neu -> Kontaktiert -> Erstgespraech -> Angebot -> Abschluss -> Kunde / Verloren)
- Notizen mit Wiedervorlage-Datum
- Multi-Ansprechpartner pro Firma (Name, Position, Mail, Tel, Mobil, LinkedIn)
- Datei-Upload pro Firma (max 5 MB, max 10 pro Firma)
- Tags-System (frei definierbar, durchsuchbar)
- Aktivitaet-Timeline pro Firma (alle Events chronologisch)

### Sales-Tools
- Email-Templates pro Produktlinie + pro User (eigene Signaturen)
- Anruf-Log Schnellbutton (1-Klick Notiz + Status-Update)
- Tour-Planung (PLZ-Cluster -> Google Maps Route)
- Quick-Search (Ctrl+K) - global Lead-Suche
- Saved Filters (eigene Sichten speichern)

### Visualisierung
- Karte (Leaflet + OpenStreetMap, alle Leads als Pins)
- Vertrieb-Dashboard (Pipeline-Funnel + User-Aktivitaet)
- News-Watch Top-50 (Google News RSS)
- Mein-Tag Modal (taegliche Wiedervorlagen + Empfehlungen)

### Admin
- User-Verwaltung (Rollen: admin/vertrieb)
- Pro-User Email-Signatur
- Backup-Export (JSON komplett)
- Restore-Import (Dry-Run + Apply)
- Audit-Log Viewer (alle Aenderungen filterbar)
- Health-Check
- Manuelle Score-Override

### Sicherheit
- Brute-Force Schutz (5/15min/IP)
- API Rate-Limit (30 writes/min/user)
- CSRF Origin-Check
- HSTS / CSP / X-Frame-Options
- Cookie: HttpOnly + Secure + SameSite=Strict
- Input-Length Limits
- Session: 7 Tage

### Mobile
- PWA (installable auf iOS/Android)
- Responsive Design
- Service Worker (Offline-Cache fuer Karten-Daten)

## Quickstart

1. Cloudflare Account erstellen (kostenlos): https://dash.cloudflare.com
2. KV Namespace anlegen (Workers > KV > Create namespace, Name: COCKPIT)
3. Pages Project anlegen, KV-Binding `KV` -> dein Namespace
4. Wrangler installieren: `npm install -g wrangler`
5. Deploy: `wrangler pages deploy . --project-name=mein-cockpit`

Detail: siehe `SETUP.md`

## Konfiguration

Suche & ersetze in allen Dateien:
- `{{COMPANY_NAME}}` -> dein Firmenname
- `{{CITY}}` -> deine Stadt  
- `{{DOMAIN}}` -> deine Domain (ohne https://)
- `{{ADDRESS}}` -> deine Strasse/Hausnummer
- `{{ZIP}}` -> deine PLZ
- `{{CEO_NAMES}}` -> Geschaeftsfuehrer-Namen
- `{{REGISTER}}` -> Registereintrag (z.B. HRA 12345)
- `{{COURT}}` -> Amtsgericht
- `{{VAT_ID}}` -> USt-Id (z.B. DE123456789)
- `{{TEL_MAIN}}`, `{{FAX}}`, `{{TEL_MOBILE}}` -> Kontaktdaten

Detail: siehe `CONFIG.md`

## Dateien

```
.
├── index.html              # Haupt-Cockpit (Lead-Liste, Filter, Modal)
├── kunden.html             # Bestandskunden-Seite
├── konkurenz.html          # Konkurrenz-Analyse
├── dashboard.html          # Vertrieb-Dashboard (Funnel + User-Stats)
├── karte.html              # Karten-View (Leaflet)
├── news.html               # News-Watch
├── admin.html              # Admin-Panel
├── functions/
│   └── _middleware.js      # Cloudflare Pages Functions (Auth + API)
├── manifest.json           # PWA Manifest
├── sw.js                   # Service Worker
├── _headers                # HTTP Headers (Security + Cache)
├── leads-geo.json          # Lead-Koordinaten fuer Karte
├── icon-192.png            # PWA Icon klein
├── icon-512.png            # PWA Icon gross
├── README.md               # Diese Datei
├── SETUP.md                # Detaillierte Setup-Anleitung
└── CONFIG.md               # Konfigurations-Anleitung
```

## Demo-Daten

10 Demo-Leads sind enthalten:
- 4x Tier-A (Hot Leads)
- 4x Tier-B (Warm)
- 2x Tier-C (Cold)
- Verteilt ueber Deutschland (BW/BY/HE/NW/HH/SN/TH/NI)

Zum Loeschen: Leads-Array in `index.html` leeren.

## Default Login

- Admin: Passwort `11111` (User-ID: admin)
- Sales 1: Passwort `22222` (User-ID: sales1)  
- Sales 2: Passwort `33333` (User-ID: sales2)

**SOFORT ANDERN nach Deploy!** Admin-Panel -> Benutzer-Verwaltung.

## Lizenz

Verwendung gemaess Vereinbarung mit Hasi Elektronic.

## Support

Hasi Elektronic - www.hasi-elektronic.de
