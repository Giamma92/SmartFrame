/**
 * calendar.js
 * Autenticazione OAuth2 con Google e lettura degli eventi da Google Calendar.
 *
 * Flusso:
 *  1. credentials.json (client OAuth "App desktop") scaricato da Google Cloud Console
 *  2. l'utente apre http://localhost:3000/auth -> consenso Google -> /oauth2callback
 *  3. il token (con refresh_token) viene salvato in data/token.json e rinnovato da solo
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import calendarPkg from '@googleapis/calendar';
import { config } from '../config.js';
import { cached, ServiceError } from '../utils/cache.js';

const { calendar: calendarApi, auth: googleAuth } = calendarPkg;
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

let oauthClient = null;
let storedTokens = null;
let eventPalette = null; // colori eventi (colorId -> hex), caricati una volta

// ---------------------------------------------------------------- OAuth ---

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function saveTokens(tokens) {
  await fs.mkdir(path.dirname(config.google.tokenPath), { recursive: true });
  await fs.writeFile(config.google.tokenPath, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

/** Crea (una sola volta) il client OAuth2 a partire da credentials.json. */
async function getOAuthClient() {
  if (oauthClient) return oauthClient;

  let creds;
  try {
    creds = await readJson(config.google.credentialsPath);
  } catch {
    throw new ServiceError(
      `File credenziali non trovato: ${config.google.credentialsPath}`,
      'not_configured',
    );
  }
  const c = creds.installed || creds.web;
  if (!c?.client_id) throw new ServiceError('credentials.json non valido', 'not_configured');

  const client = new googleAuth.OAuth2(c.client_id, c.client_secret, config.google.redirectUri);

  try {
    storedTokens = await readJson(config.google.tokenPath);
    client.setCredentials(storedTokens);
  } catch {
    storedTokens = null; // non ancora autorizzato
  }

  // Quando la libreria rinnova l'access token, lo salviamo su disco
  // mantenendo il refresh_token originale (Google non lo rimanda ogni volta).
  client.on('tokens', (tokens) => {
    storedTokens = { ...(storedTokens || {}), ...tokens };
    saveTokens(storedTokens).catch((e) => console.error('[calendar] salvataggio token:', e.message));
  });

  oauthClient = client;
  return client;
}

/** URL della pagina di consenso Google. */
export async function getAuthUrl() {
  const client = await getOAuthClient();
  return client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES });
}

/** Scambia il "code" ricevuto da Google con i token e li salva. */
export async function handleOAuthCallback(code) {
  const client = await getOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  storedTokens = tokens;
  await saveTokens(tokens);
  getEvents.reset();
  console.log('[calendar] autorizzazione completata, token salvato');
}

async function forgetTokens() {
  storedTokens = null;
  oauthClient?.setCredentials({});
  await fs.rm(config.google.tokenPath, { force: true });
}

// --------------------------------------------------------------- Eventi ---

/** Converte "YYYY-MM-DD" in mezzanotte locale (Date). */
function parseDateOnly(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

async function fetchEvents() {
  const client = await getOAuthClient();
  if (!storedTokens?.refresh_token && !storedTokens?.access_token) {
    throw new ServiceError('Calendario non autorizzato: apri /auth sul Raspberry', 'not_authorized');
  }

  const cal = calendarApi({ version: 'v3', auth: client });
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  const rangeEnd = new Date(startOfToday);
  rangeEnd.setDate(rangeEnd.getDate() + config.google.daysAhead + 1);

  try {
    // Metadati dei calendari (nome e colore) + palette colori evento
    const { data: calList } = await cal.calendarList.list({ maxResults: 250 });
    const calendars = calList.items ?? [];
    if (!eventPalette) {
      const { data: colors } = await cal.colors.get();
      eventPalette = Object.fromEntries(
        Object.entries(colors.event ?? {}).map(([id, c]) => [id, c.background]),
      );
    }

    const holidayCals = calendars
      .filter((c) =>
        c.id.includes('#holiday') ||
        c.id.includes('holiday@group.v.calendar.google.com') ||
        (c.summary && /festivit/i.test(c.summary))
      )
      .map((c) => c.id);

    if (holidayCals.length === 0) {
      holidayCals.push('it.italian#holiday@group.v.calendar.google.com');
    }

    const configured = config.google.calendarIds.includes('all')
      ? calendars.filter((c) => c.selected !== false).map((c) => c.id)
      : config.google.calendarIds;

    const wanted = Array.from(new Set([...configured, ...holidayCals]));

    const metaFor = (id) =>
      calendars.find((c) => (id === 'primary' ? c.primary : c.id === id)) ?? {};

    const results = await Promise.allSettled(
      wanted.map((calendarId) =>
        cal.events.list({
          calendarId,
          timeMin: startOfToday.toISOString(),
          timeMax: rangeEnd.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 100,
        }).then((r) => ({ calendarId, items: r.data.items ?? [] })),
      ),
    );

    const events = [];
    for (const r of results) {
      if (r.status === 'rejected') {
        if (/invalid_grant/.test(String(r.reason?.message))) throw r.reason;
        console.warn('[calendar] errore su un calendario:', r.reason?.message);
        continue;
      }
      const meta = metaFor(r.value.calendarId);
      const isHolidayCal = Boolean(
        r.value.calendarId.includes('#holiday') ||
        r.value.calendarId.includes('holiday@group.v.calendar.google.com') ||
        /festivit/i.test(meta.summary || '')
      );

      for (const e of r.value.items) {
        if (e.status === 'cancelled') continue;
        const self = e.attendees?.find((a) => a.self);
        if (self?.responseStatus === 'declined') continue;

        const allDay = Boolean(e.start?.date);
        const start = e.start?.dateTime || e.start?.date;
        const end = e.end?.dateTime || e.end?.date || start;
        let endDate;
        if (allDay) {
          endDate = parseDateOnly(end);
          if (end === start) {
            endDate.setDate(endDate.getDate() + 1);
          }
        } else {
          endDate = new Date(end);
        }
        if (endDate <= now) continue; // già terminato

        events.push({
          id: e.id,
          title: e.summary || '(Senza titolo)',
          start,
          end,
          allDay,
          isHoliday: isHolidayCal,
          location: e.location || '',
          calendar: isHolidayCal ? 'Festività' : (meta.summaryOverride || meta.summary || r.value.calendarId),
          color: isHolidayCal ? '#f59e0b' : ((e.colorId && eventPalette[e.colorId]) || meta.backgroundColor || '#7aa2ff'),
          _startTs: allDay ? parseDateOnly(start).getTime() : new Date(start).getTime(),
        });
      }
    }

    // Ordina per inizio; a parità, gli eventi "tutto il giorno" prima e le festività in cima
    events.sort((a, b) =>
      a._startTs - b._startTs ||
      Number(b.allDay) - Number(a.allDay) ||
      Number(Boolean(b.isHoliday)) - Number(Boolean(a.isHoliday))
    );
    const limited = events.slice(0, config.google.maxEvents).map(({ _startTs, ...e }) => e);

    const isToday = (e) =>
      (e.allDay ? parseDateOnly(e.start) : new Date(e.start)) < endOfToday;
    return {
      today: limited.filter(isToday),
      upcoming: limited.filter((e) => !isToday(e)),
    };
  } catch (err) {
    const msg = String(err?.response?.data?.error || err?.message);
    if (/invalid_grant/.test(msg)) {
      await forgetTokens();
      throw new ServiceError('Autorizzazione Google scaduta o revocata: ripeti /auth', 'not_authorized');
    }
    throw err;
  }
}

export const getEvents = cached(fetchEvents, config.google.refreshMin * 60_000);
