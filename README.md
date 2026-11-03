# 🖼️ Smart Frame & Calendar

Cornice digitale per la TV di casa: slideshow a schermo intero (dissolvenza + Ken Burns),
orologio, meteo (Open-Meteo) e prossimi impegni da Google Calendar.
Il backend Node.js gira su Raspberry Pi; la pagina si apre dal browser della TV
(VIDAA, webOS, Tizen…) oppure da Chromium in kiosk sul Pi collegato via HDMI.

```
smart-frame/
├── server/                 # Backend Node.js (Express)
│   ├── server.js           # Rotte HTTP: /api/data, /photos, /auth…
│   ├── config.js           # Lettura configurazione da .env
│   ├── services/           # calendar.js · weather.js · photos.js
│   └── utils/cache.js      # Cache con TTL e fallback sui dati vecchi
├── public/                 # Frontend (index.html, css/style.css, js/app.js)
├── deploy/                 # systemd, install.sh, kiosk opzionale
├── ecosystem.config.cjs    # Alternativa PM2
├── photos/                 # ← metti qui le foto
└── data/                   # token Google + cache immagini ridotte
```

## 1. Preparare il Raspberry Pi

```bash
sudo raspi-config                       # Localisation → Timezone: Europe/Rome
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Copia il progetto sul Pi (dal PC): `scp -r smart-frame pi@raspberrypi.local:~/`

## 2. Google Calendar (una sola volta)

1. https://console.cloud.google.com → crea un progetto.
2. **API e servizi → Libreria** → abilita **Google Calendar API**.
3. **Schermata consenso OAuth** → Esterno → aggiungi la tua email come utente di test.
   Poi clicca **Pubblica app** (“In produzione”): in modalità *Test* il token scade ogni 7 giorni.
4. **Credenziali → Crea credenziali → ID client OAuth → App desktop** → scarica il JSON
   e salvalo come `~/smart-frame/credentials.json`.
5. Avvia il server e autorizza aprendo **`http://localhost:3000/auth`**:
   - dal browser del Raspberry, **oppure**
   - dal PC con un tunnel: `ssh -L 3000:localhost:3000 pi@raspberrypi.local` e poi apri
     `http://localhost:3000/auth` sul PC.

   Google mostrerà “app non verificata” → *Avanzate → Vai a…*. Il token finisce in `data/token.json`.

## 3. Foto

Metti le immagini in `photos/` (anche in sottocartelle). Dal 31/03/2025 Google Photos non
permette più alle app di leggere album esistenti, quindi usa una sincronizzazione locale:
**Syncthing** dal telefono, `rclone sync` da Google Drive, o una cartella Samba condivisa.
Le foto nuove compaiono entro `PHOTOS_RESCAN_MIN` minuti e vengono mostrate per prime.
Con `sharp` installato vengono ridotte a 1920×1080 e ruotate secondo EXIF automaticamente.

## 4. Configurazione e avvio automatico

```bash
cd ~/smart-frame
cp .env.example .env && nano .env      # coordinate meteo, calendari, intervalli…
chmod +x deploy/*.sh
./deploy/install.sh                    # npm install + servizio systemd (boot + restart su crash)
```

Comandi utili: `sudo systemctl restart smart-frame` · `journalctl -u smart-frame -f`

**Alternativa PM2** (non usarla insieme a systemd):
```bash
sudo npm i -g pm2 && pm2 start ecosystem.config.cjs && pm2 save && pm2 startup systemd
```

## 5. Sulla TV (VIDAA)

Apri il browser della TV su `http://<IP-del-Pi>:3000` (l'IP lo stampa `install.sh`;
conviene renderlo fisso dal router) e attiva lo schermo intero.

| Telecomando | Azione |
|---|---|
| ◀ / ▶ | Foto precedente / successiva |
| OK (o Play/Pausa) | Pausa / riprendi slideshow |
| ▲ / ▼ | Mostra / nascondi i pannelli |
| Back | Esce (non intercettato) |

**Opzionale – TV collegata al Pi via HDMI:** `sudo apt install -y fonts-noto-color-emoji fonts-inter`,
poi `cp deploy/smart-frame-kiosk.desktop ~/.config/autostart/` (correggi il percorso se l'utente
non è `pi`) e disattiva lo screen blanking da `raspi-config → Display Options`.

## API

`GET /api/data` →
```json
{
  "serverStartedAt": "…",
  "display": { "slideIntervalSec": 60, "fadeSec": 3, "kenBurns": true, "...": "..." },
  "weather": { "temperature": 14.2, "description": "Parzialmente nuvoloso", "icon": "⛅",
               "today": { "max": 17, "min": 9 }, "daily": [ … ] },
  "events": { "today": [ { "title": "Dentista", "start": "2026-10-31T17:30:00+01:00",
                           "end": "…", "allDay": false, "location": "", "color": "#039be5" } ],
              "upcoming": [ … ] },
  "photos": [ { "url": "/photos/vacanze/IMG_001.jpg?v=1730380000000", "name": "IMG_001.jpg" } ],
  "status": { "weather": { "state": "ok" }, "calendar": { "state": "not_authorized", "message": "…" },
              "photos": { "state": "ok" } }
}
```
`GET /api/health` → `{ "ok": true, "uptimeSec": 123 }`

## Prestazioni e problemi comuni

- **Scatti sul browser TV / Pi 3:** imposta `KEN_BURNS=false` e/o `PANEL_BLUR=false` nel `.env`.
- **Emoji meteo come quadratini:** il browser non ha un font emoji (vedi `fonts-noto-color-emoji`).
- **"Autorizzazione scaduta":** app OAuth ancora in modalità Test → pubblicala e ripeti `/auth`.
- **La TV non raggiunge il Pi:** verifica `HOST=0.0.0.0` e che TV e Pi siano sulla stessa rete.
