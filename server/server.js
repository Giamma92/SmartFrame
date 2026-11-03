/**
 * server.js
 * Server Express del Smart Frame:
 *   GET /                -> frontend (public/)
 *   GET /api/data        -> JSON con meteo, eventi, foto e opzioni display
 *   GET /api/health      -> stato del server (per script/monitoraggio)
 *   GET /photos/<file>   -> immagini (ridimensionate se "sharp" è presente)
 *   GET /auth            -> avvia l'autorizzazione Google Calendar (solo da localhost)
 *   GET /oauth2callback  -> ritorno da Google dopo il consenso
 */
import express from 'express';
import path from 'node:path';
import { config, ROOT_DIR } from './config.js';
import { getAuthUrl, handleOAuthCallback, getEvents } from './services/calendar.js';
import { getWeather } from './services/weather.js';
import { getHomeAssistant } from './services/homeassistant.js';
import { loadSettings, saveSettings, getCurrentTheme } from './services/themes.js';
import { getPhotos, resolvePhoto, fetchAlbumTitle } from './services/photos.js';

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

app.get('/api/data', async (_req, res) => {
  const [weather, events, photos, ha] = await Promise.allSettled([
    getWeather(),
    getEvents(),
    getPhotos(),
    getHomeAssistant(),
  ]);

  for (const [name, r] of [['meteo', weather], ['calendario', events], ['foto', photos]]) {
    if (r.status === 'rejected' && !r.reason?.state) console.error(`[api] ${name}:`, r.reason?.message);
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
