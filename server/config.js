/**
 * config.js
 * Carica la configurazione da variabili d'ambiente (.env) con default sensati.
 */
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Cartella radice del progetto (quella con package.json). */
export const ROOT_DIR = path.resolve(__dirname, '..');

const raw = (k) => {
  const v = process.env[k];
  return v === undefined || v.trim() === '' ? undefined : v.trim();
};
const str = (k, d) => raw(k) ?? d;
const num = (k, d) => {
  const v = Number(raw(k));
  return raw(k) !== undefined && Number.isFinite(v) ? v : d;
};
const bool = (k, d) => {
  const v = raw(k);
  return v === undefined ? d : ['1', 'true', 'yes', 'on', 'si'].includes(v.toLowerCase());
};
const list = (k, d) => str(k, d).split(',').map((s) => s.trim()).filter(Boolean);
const absPath = (p) => (path.isAbsolute(p) ? p : path.resolve(ROOT_DIR, p));

const port = num('PORT', 3000);

export const config = {
  server: {
    port,
    host: str('HOST', '0.0.0.0'),
  },

  google: {
    credentialsPath: absPath(str('GOOGLE_CREDENTIALS_PATH', './credentials.json')),
    tokenPath: absPath(str('GOOGLE_TOKEN_PATH', './data/token.json')),
    redirectUri: str('OAUTH_REDIRECT_URI', `http://localhost:${port}/oauth2callback`),
    calendarIds: list('CALENDAR_IDS', 'primary'),
    daysAhead: num('CALENDAR_DAYS_AHEAD', 7),
    maxEvents: num('CALENDAR_MAX_EVENTS', 10),
    refreshMin: num('CALENDAR_REFRESH_MIN', 5),
    allowRemoteAuth: bool('ALLOW_REMOTE_AUTH', false),
  },

  weather: {
    lat: num('WEATHER_LAT', 41.9028),
    lon: num('WEATHER_LON', 12.4964),
    locationName: str('WEATHER_LOCATION_NAME', ''),
    refreshMin: num('WEATHER_REFRESH_MIN', 10),
  },

  photos: {
    dir: absPath(str('PHOTOS_DIR', './photos')),
    recursive: bool('PHOTOS_RECURSIVE', true),
    rescanMin: num('PHOTOS_RESCAN_MIN', 10),
    resize: bool('PHOTOS_RESIZE', true),
    maxWidth: num('PHOTOS_MAX_WIDTH', 1920),
    maxHeight: num('PHOTOS_MAX_HEIGHT', 1080),
    cacheDir: absPath(str('PHOTOS_CACHE_DIR', './data/cache')),
  },

  /** Opzioni inviate al frontend dentro /api/data. */
  display: {
    locale: str('LOCALE', 'it-IT'),
    slideIntervalSec: num('SLIDE_INTERVAL_SEC', 60),
    fadeSec: num('FADE_SEC', 3),
    shuffle: bool('SHUFFLE', true),
    kenBurns: bool('KEN_BURNS', true),
    panelBlur: bool('PANEL_BLUR', true),
    showSeconds: bool('SHOW_SECONDS', false),
    refreshSec: num('CLIENT_REFRESH_SEC', 60),
    maxEvents: num('CALENDAR_MAX_EVENTS', 10),
    pixelShift: bool('PIXEL_SHIFT', true),
    nightDim: {
      enabled: bool('NIGHT_DIM', true),
      start: str('NIGHT_DIM_START', '23:00'),
      end: str('NIGHT_DIM_END', '07:00'),
      level: num('NIGHT_DIM_LEVEL', 0.7),
    },
  },
};
