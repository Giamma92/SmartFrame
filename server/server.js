/**
 * server.js
 * Server Express del Smart Frame:
 *   GET /                -> frontend (public/)
 *   GET /api/data        -> JSON con meteo, eventi, foto e opzioni display
 *   GET /api/health      -> stato del server (per script/monitoraggio)
 *   GET /photos/<file>   -> immagini (ridimensionate se "sharp" è presente)
 *   GET /auth            -> avvia l'autorizzazione Google Calendar (solo da localhost)
 *   GET /oauth2callback  -> ritorno da Google dopo il consenso
 *   GET /birthday        -> sorpresa di compleanno (gioco + biglietto), separata dalla cornice
 */
import express from 'express';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { config, ROOT_DIR } from './config.js';
import { getAuthUrl, handleOAuthCallback, getEvents } from './services/calendar.js';
import { getWeather } from './services/weather.js';
import { getHomeAssistant } from './services/homeassistant.js';
import { loadSettings, saveSettings, getCurrentTheme } from './services/themes.js';
import { getPhotos, resolvePhoto, fetchAlbumTitle, fetchGooglePhotos } from './services/photos.js';

let QRCode = null;
try {
  QRCode = (await import('qrcode')).default;
} catch (e) {
  console.warn('[server] Modulo qrcode non caricato:', e.message);
}

const app = express();
const STARTED_AT = new Date().toISOString();

app.disable('x-powered-by');
app.use(express.json());

// ---------------------------------------------------------- Frontend ---
// Disabilita completamente la cache per evitare pagine o script obsoleti
app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Se la richiesta arriva da uno smartphone (mobile user-agent) sulla root, reindirizza a /settings (a meno che non sia specificato ?frame=1)
app.get('/', (req, res, next) => {
  if (req.query.frame === '1') {
    return next();
  }
  const ua = req.headers['user-agent'] || '';
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  if (isMobile) {
    return res.redirect('/settings');
  }
  next();
});

app.use(express.static(path.join(ROOT_DIR, 'public'), {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
}));

// --------------------------------------------------------------- API & Realtime ---

// Server-Sent Events (SSE) per refresh e notifiche istantanee (< 50ms) su TV e desktop
const sseClients = new Set();

app.get('/api/live', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  res.write(': connected\n\n');

  sseClients.add(res);

  const keepAlive = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(keepAlive);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

/** Converte l'esito di un servizio in uno stato per il frontend. */
function statusOf(result, getter) {
  if (result.status === 'rejected') {
    return { state: result.reason?.state || 'error', message: result.reason?.message };
  }
  const err = getter.lastError();
  return err ? { state: 'stale', message: err.message } : { state: 'ok' };
}

// ---------------------------------------------------- Impostazioni / Temi
app.get('/settings', (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'public', 'settings.html'));
});

app.get('/api/settings', async (_req, res) => {
  const s = await loadSettings();
  res.json(s);
});

app.post('/api/settings', async (req, res) => {
  const updated = await saveSettings(req.body);
  getPhotos.invalidate(); // Forza scansione foto del nuovo tema
  broadcast('settings', { version: updated.version, theme: getCurrentTheme() });
  res.json({ ok: true, settings: updated });
});

app.post('/api/reload', (_req, res) => {
  broadcast('settings', { version: Date.now(), theme: getCurrentTheme() });
  res.json({ ok: true, message: 'Reload inviato a tutti i client' });
});

// Rilevamento automatico del titolo reale dell'album da Google Photos o Pinterest
app.get('/api/album-info', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ ok: false, error: 'URL mancante' });
  const title = await fetchAlbumTitle(url);
  res.json({ ok: true, title: title || '' });
});

// Proxy snapshot telecamera Reolink con credenziali Home Assistant
app.get('/api/camera/snapshot', async (_req, res) => {
  const HA_URL = process.env.HA_URL || 'http://localhost:8123';
  const HA_TOKEN = process.env.HA_TOKEN || '';
  if (!HA_TOKEN) return res.status(503).send('HA non configurato');

  try {
    const upstream = await fetch(`${HA_URL}/api/camera_proxy/camera.webcam_soggiorno_scorrevole`, {
      headers: { 'Authorization': `Bearer ${HA_TOKEN}` },
      signal: AbortSignal.timeout(4000)
    });
    if (!upstream.ok) {
      return res.status(upstream.status).send(`Upstream HA ${upstream.status}`);
    }
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const arrayBuffer = await upstream.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    res.status(502).send('Errore proxy camera: ' + err.message);
  }
});

// Proxy immagini Home Assistant (artwork Now Playing album / copertine)
app.get('/api/ha-proxy-image', async (req, res) => {
  const HA_URL = process.env.HA_URL || 'http://localhost:8123';
  const HA_TOKEN = process.env.HA_TOKEN || '';
  const imgPath = req.query.path;
  if (!HA_TOKEN || !imgPath || !imgPath.startsWith('/')) {
    return res.status(400).send('Parametri non validi');
  }

  try {
    const upstream = await fetch(`${HA_URL}${imgPath}`, {
      headers: { 'Authorization': `Bearer ${HA_TOKEN}` },
      signal: AbortSignal.timeout(6000)
    });
    if (!upstream.ok) {
      return res.status(upstream.status).send(`Upstream HA ${upstream.status}`);
    }
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=300');
    const arrayBuffer = await upstream.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    res.status(502).send('Errore proxy immagine HA: ' + err.message);
  }
});

// Stato e sensore foto corrente per Alexa e Home Assistant ("Alexa, che foto è?")
let currentPhotoState = null;

app.post('/api/current-photo', async (req, res) => {
  try {
    const p = req.body || {};
    currentPhotoState = {
      ...p,
      updatedAt: new Date().toISOString()
    };

    // Costruisci frase naturale in italiano per risposta vocale di Alexa
    let voiceSummary = '';
    const parts = [];
    if (p.caption) {
      parts.push(`La foto sullo schermo mostra ${p.caption}`);
    } else if (p.destination) {
      parts.push(`Questa foto è stata scattata a ${p.destination}`);
    } else if (p.location) {
      parts.push(`Questa foto è stata scattata a ${p.location}`);
    } else {
      parts.push('Questa è una foto della cornice digitale');
    }

    if (p.year) {
      parts.push(`nel ${p.year}`);
    }
    if (p.album && (!p.caption || !p.caption.toLowerCase().includes(p.album.toLowerCase()))) {
      parts.push(`dall'album ${p.album}`);
    }
    voiceSummary = parts.join(' ') + '.';

    // Sincronizza stato verso Home Assistant (crea/aggiorna sensor.smartframe_foto_corrente)
    const HA_URL = process.env.HA_URL || 'http://localhost:8123';
    const HA_TOKEN = process.env.HA_TOKEN || '';
    if (HA_TOKEN) {
      const stateTitle = (p.caption || p.destination || p.location || p.album || 'Foto attiva').slice(0, 255);
      fetch(`${HA_URL}/api/states/sensor.smartframe_foto_corrente`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HA_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          state: stateTitle,
          attributes: {
            friendly_name: 'SmartFrame Foto Corrente',
            icon: 'mdi:image-frame',
            caption: p.caption || '',
            destination: p.destination || '',
            location: p.location || '',
            year: p.year || '',
            album: p.album || '',
            url: p.url || '',
            voice_summary: voiceSummary,
            updated_at: new Date().toISOString()
          }
        }),
        signal: AbortSignal.timeout(3000)
      }).catch(err => console.warn('[ha] Invio sensore foto a HA fallito:', err.message));
    }

    res.json({ ok: true, summary: voiceSummary });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/current-photo', (_req, res) => {
  res.json(currentPhotoState || { state: 'Nessuna foto attiva' });
});

// ------------------------------------------------- 🎂 Sorpresa compleanno ---
// Pagina separata dalla cornice: /birthday (gioco + biglietto di auguri).
// Contenuti personali (config.json + foto) in data/birthday/ → non finiscono
// nello slideshow né su git. Se manca config.json si usa l'esempio.
const BIRTHDAY_DIR = path.join(ROOT_DIR, 'data', 'birthday');
let birthdayAlbumCache = { url: '', at: 0, photos: [] };

async function getBirthdayAlbumPhotos(url, forceRefresh = false) {
  const clean = String(url || '').trim();
  if (!clean) return [];
  const now = Date.now();
  if (!forceRefresh && birthdayAlbumCache.url === clean && (now - birthdayAlbumCache.at) < 5 * 60_000 && birthdayAlbumCache.photos.length) {
    return birthdayAlbumCache.photos;
  }
  const photos = await fetchGooglePhotos(clean);
  birthdayAlbumCache = { url: clean, at: now, photos };
  return photos;
}

app.get(['/birthday', '/birthday/'], (req, res) => {
  if (req.query.config !== undefined || req.query.edit !== undefined) {
    return res.sendFile(path.join(ROOT_DIR, 'public', 'birthday', 'config.html'));
  }
  res.sendFile(path.join(ROOT_DIR, 'public', 'birthday', 'index.html'));
});

app.get(['/birthday-config', '/birthday/config', '/birthday/config/'], (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'public', 'birthday', 'config.html'));
});

app.get(['/birthday/coupons', '/birthday/coupons/'], (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'public', 'birthday', 'coupons.html'));
});

app.get('/api/birthday/album-preview', async (req, res) => {
  const url = String(req.query.url || '').trim();
  if (!url) return res.json({ ok: true, title: '', photos: [] });
  try {
    const [title, gPhotos] = await Promise.all([
      fetchAlbumTitle(url).catch(() => ''),
      getBirthdayAlbumPhotos(url, true)
    ]);
    res.json({
      ok: true,
      title: title || '',
      photos: gPhotos.map(p => ({ url: p.url, caption: p.caption || p.comment || '', date: p.date || '' }))
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/birthday', async (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ ok: false, error: 'Dati non validi' });
    }
    const clean = { ...body };
    delete clean._source;
    delete clean.albumPhotos;
    await fsp.mkdir(BIRTHDAY_DIR, { recursive: true });
    await fsp.writeFile(path.join(BIRTHDAY_DIR, 'config.json'), JSON.stringify(clean, null, 2), 'utf8');
    birthdayAlbumCache = { url: '', at: 0, photos: [] };
    res.json({ ok: true });
  } catch (err) {
    console.error('[birthday] errore salvataggio config:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/birthday', async (req, res) => {
  for (const file of [path.join(BIRTHDAY_DIR, 'config.json'), path.join(ROOT_DIR, 'public', 'birthday', 'config.example.json')]) {
    try {
      const json = JSON.parse(await fsp.readFile(file, 'utf8'));
      json._source = file.includes('example') ? 'example' : 'custom';

      const albumUrl = (json.albumUrl || process.env.BIRTHDAY_ALBUM_URL || '').trim();
      if (albumUrl) {
        const gPhotos = await getBirthdayAlbumPhotos(albumUrl, req.query.refresh === '1');
        json.albumPhotos = gPhotos.map(p => ({ url: p.url, caption: p.caption || p.comment || '' }));

        if (req.query.raw === '1') {
          return res.set('Cache-Control', 'no-store').json(json);
        }

        // Mappa in ordine: prime N foto al Quiz, le successive 6 al Memory
        const questions = json.quiz?.questions || [];
        let cursor = 0;
        for (let i = 0; i < questions.length; i++) {
          const gp = gPhotos[cursor++];
          if (gp) {
            if (!questions[i].photo || /^quiz\d+\./i.test(questions[i].photo)) {
              questions[i].photo = gp.url;
            }
            if (!questions[i].caption && (gp.caption || gp.comment)) {
              questions[i].caption = gp.caption || gp.comment;
            }
          }
        }
        if (json.memory) {
          const memPhotos = gPhotos.slice(cursor, cursor + 6).map(p => p.url);
          if (memPhotos.length > 0) {
            json.memory.photos = memPhotos;
          }
        }
      }

      const host = req.headers.host || `localhost:${config.server.port || 3000}`;
      const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
      const couponsUrl = `${proto}://${host}/birthday/coupons`;
      json.couponsUrl = couponsUrl;
      if (QRCode) {
        try {
          json.couponsQrSvg = await QRCode.toString(couponsUrl, {
            type: 'svg',
            margin: 1,
            width: 180,
            color: { dark: '#3b1f4a', light: '#ffffff' }
          });
        } catch (qrErr) {
          console.warn('[birthday] errore generazione QR coupon:', qrErr.message);
        }
      }

      return res.set('Cache-Control', 'no-store').json(json);
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('[birthday] config non valida:', file, err.message);
    }
  }
  res.status(500).json({ error: 'Configurazione compleanno mancante' });
});

app.get('/birthday/media/*', (req, res) => {
  const abs = path.resolve(BIRTHDAY_DIR, req.params[0]);
  if (!abs.startsWith(BIRTHDAY_DIR + path.sep)) return res.sendStatus(404);
  res.sendFile(abs, (err) => { if (err && !res.headersSent) res.sendStatus(404); });
});

app.get('/api/data', async (_req, res) => {
  const [weather, events, photos, ha, settings] = await Promise.allSettled([
    getWeather(),
    getEvents(),
    getPhotos(),
    getHomeAssistant(),
    loadSettings(),
  ]);

  for (const [name, r] of [['meteo', weather], ['calendario', events], ['foto', photos]]) {
    if (r.status === 'rejected' && !r.reason?.state) console.error(`[api] ${name}:`, r.reason?.message);
  }

  const sVal = settings.status === 'fulfilled' ? settings.value : {};
  const wifiConfig = sVal?.wifi || { enabled: true, ssid: 'Casa Moretti', password: '', guest: true };
  let wifiQrSvg = '';
  if (QRCode && wifiConfig.ssid) {
    try {
      const wifiString = `WIFI:T:${wifiConfig.password ? 'WPA' : 'nopass'};S:${wifiConfig.ssid};P:${wifiConfig.password || ''};;`;
      wifiQrSvg = await QRCode.toString(wifiString, { type: 'svg', margin: 1, width: 200 });
    } catch (err) {
      console.warn('[qrcode] Errore generazione SVG:', err.message);
    }
  }

  res.set('Cache-Control', 'no-store').json({
    generatedAt: new Date().toISOString(),
    serverStartedAt: STARTED_AT,
    display: config.display,
    weather: weather.status === 'fulfilled' ? weather.value : null,
    events: events.status === 'fulfilled' ? events.value : { today: [], upcoming: [] },
    photos: photos.status === 'fulfilled' ? photos.value : [],
    homeAssistant: ha.status === 'fulfilled' ? ha.value : null,
    theme: getCurrentTheme(),
    wifi: { ...wifiConfig, qrSvg: wifiQrSvg },
    status: {
      weather: statusOf(weather, getWeather),
      calendar: statusOf(events, getEvents),
      photos: statusOf(photos, getPhotos),
    },
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, startedAt: STARTED_AT, uptimeSec: Math.round(process.uptime()) });
});

// ----------------------------------------------------- Telemetria TV & Diagnostica ---
let lastDiagnostics = null;

app.post('/api/diagnostics', (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const ua = req.headers['user-agent'] || '';
  lastDiagnostics = {
    ip,
    userAgent: ua,
    receivedAt: new Date().toISOString(),
    ...req.body,
  };
  const bName = req.body?.browserName || 'Client';
  const vp = req.body?.viewport ? `${req.body.viewport.width}x${req.body.viewport.height}` : 'N/D';
  console.log(`[tv-diagnostics] Dati ricevuti da ${ip} (${bName}) - Viewport: ${vp}`);
  res.json({ ok: true });
});

app.get('/api/diagnostics', (_req, res) => {
  res.json(lastDiagnostics || { status: 'no_data', message: 'Nessun report diagnostico ancora registrato.' });
});

// ------------------------------------------------------------ Foto ---
app.get('/photos/*', async (req, res) => {
  try {
    const file = await resolvePhoto(req.params[0]);
    if (!file) return res.sendStatus(404);
    res.set('Cache-Control', 'public, max-age=86400');
    res.sendFile(file);
  } catch (err) {
    console.error('[photos]', err.message);
    res.sendStatus(500);
  }
});

// ----------------------------------------------------------- OAuth ---

/** L'autorizzazione è permessa solo da localhost (browser del Pi o tunnel SSH). */
function localOnly(req, res, next) {
  const ip = req.socket.remoteAddress || '';
  if (config.google.allowRemoteAuth || ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip)) {
    return next();
  }
  res.status(403).type('text/plain').send(
    'Autorizzazione consentita solo da localhost.\n' +
    `Usa il browser del Raspberry oppure un tunnel: ssh -L ${config.server.port}:localhost:${config.server.port} pi@<ip-raspberry>`,
  );
}

const page = (title, body) => `<!doctype html><html lang="it"><meta charset="utf-8">
<title>${title}</title><body style="font-family:sans-serif;background:#111;color:#eee;padding:3rem">
<h1>${title}</h1><p>${body}</p></body></html>`;

app.get('/auth', localOnly, async (_req, res) => {
  try {
    res.redirect(await getAuthUrl());
  } catch (err) {
    res.status(500).type('html').send(page('Errore configurazione', err.message));
  }
});

app.get('/manualcode', async (req, res) => {
  const code = String(req.query.code || '').trim();
  if (!code) return res.status(400).type('html').send(page('Errore', 'Inserisci un codice valido'));
  try {
    await handleOAuthCallback(code);
    res.type('html').send(page('✅ Google Calendar collegato!', 'Puoi chiudere questa pagina: il calendario e la TV si aggiorneranno subito.'));
  } catch (err) {
    res.status(500).type('html').send(page('Errore codice', err.message));
  }
});

app.get(new URL(config.google.redirectUri).pathname, localOnly, async (req, res) => {
  if (req.query.error) {
    return res.status(400).type('html').send(page('Autorizzazione negata', String(req.query.error)));
  }
  try {
    await handleOAuthCallback(String(req.query.code || ''));
    res.type('html').send(page('✅ Google Calendar collegato', 'Puoi chiudere questa pagina: la TV si aggiornerà entro un minuto.'));
  } catch (err) {
    console.error('[oauth]', err.message);
    res.status(500).type('html').send(page('Errore durante l\'autorizzazione', err.message));
  }
});

// ----------------------------------------------------------- Avvio ---
const server = app.listen(config.server.port, config.server.host, async () => {
  console.log(`[server] Smart Frame attivo su http://${config.server.host}:${config.server.port}`);
  await loadSettings().catch(() => {});
  getPhotos.invalidate();
  getPhotos().catch(() => {});
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`[server] ${sig} ricevuto, chiusura...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
