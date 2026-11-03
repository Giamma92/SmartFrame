/**
 * themes.js
 * Gestione dei profili, catalogo stazioni radio e versioning per force-refresh immediato
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT_DIR } from '../config.js';

const SETTINGS_FILE = path.join(ROOT_DIR, 'data', 'settings.json');

export const DEFAULT_RADIO_STATIONS = [
  { id: 'lofi', name: 'Lofi Chill / Relax', url: 'https://lofi.stream.laut.fm/lofi' },
  { id: 'lounge', name: 'Lounge Groove / NTS', url: 'https://stream-relay-geo.ntslive.net/stream' },
  { id: 'rmc', name: 'Radio Monte Carlo (RMC)', url: 'https://icecast.unitedradio.it/RMC.mp3' },
  { id: 'virgin', name: 'Virgin Radio Rock 🎸', url: 'https://icecast.unitedradio.it/Virgin.mp3' },
  { id: 'radio105', name: 'Radio 105 📻', url: 'https://icecast.unitedradio.it/Radio105.mp3' },
  { id: 'classic', name: 'Musica Classica / Relax', url: 'https://stream.srg-ssr.ch/m/rsc_de/mp3_128' },
  { id: 'jazz', name: 'Smooth Jazz Cafe', url: 'https://stream.zeno.fm/f3wvbbqmdg8uv' },
  { id: 'christmas_hits', name: 'Christmas Hits & Classics 🎄', url: 'https://christmas-high.rautemusik.fm/' },
  { id: 'christmas_0n', name: 'Christmas Radio (0N) 🎅', url: 'https://0n-christmas.radionetz.de/0n-christmas.mp3' }
];

export const DEFAULT_SAVED_ALBUMS = [
  { id: 'family_mallorca', name: 'Album Famiglia (Mallorca & Casa)', url: 'https://photos.app.goo.gl/CesyTH5Su1BkwZzCA' },
  { id: 'christmas_album', name: 'Natale & Feste di Famiglia 🎄', url: '' },
  { id: 'travel_album', name: 'Vacanze & Viaggi ✈️', url: '' }
];

export const PRESET_THEMES = {
  standard: {
    id: 'standard',
    name: 'Standard',
    icon: '🏡',
    photoSource: 'mix', // 'mix', 'google', 'pinterest'
    slideshowFilter: 'all', // 'all', 'today_memories'
    showCalendar: true,
    showAlerts: true,
    showPopups: true,
    showPhotoComments: true,
    albumUrl: process.env.GOOGLE_PHOTOS_ALBUM_URL || 'https://photos.app.goo.gl/CesyTH5Su1BkwZzCA',
    pinterestUrl: '',
    radioStationId: 'lofi'
  },
  christmas: {
    id: 'christmas',
    name: 'Natale 🎄',
    icon: '🎄',
    photoSource: 'mix',
    slideshowFilter: 'all',
    showCalendar: true,
    showAlerts: true,
    showPopups: true,
    showPhotoComments: true,
    albumUrl: '',
    pinterestUrl: '',
    radioStationId: 'christmas_hits'
  },
  party: {
    id: 'party',
    name: 'Festa / Lounge 🍸',
    icon: '🍸',
    photoSource: 'mix',
    slideshowFilter: 'all',
    showCalendar: false,
    showAlerts: true,
    showPopups: true,
    showPhotoComments: true,
    albumUrl: '',
    pinterestUrl: '',
    radioStationId: 'lounge'
  }
};

let currentSettings = {
  version: Date.now(),
  activeTheme: 'standard',
  uiMode: 'always', // 'always' (default fissa), 'hidden' (senza UI), 'autohide' (timer inattività)
  uiTimeoutSec: 15,
  slideIntervalSec: 60, // Secondi per foto nello slideshow
  audioVolume: 0.5, // Volume musica (0.0 a 1.0)
  showCalendar: true, // Mostra riquadro Google Calendar
  showAlerts: true, // Mostra avvisi casa in alto a sinistra
  showPopups: true, // Mostra popup notifiche (lavatrice, asciugatrice, luci)
  showPhotoComments: true, // Mostra popup fumetto per commenti e didascalie foto
  reolinkEnabled: true, // Mostra PiP telecamera Reolink se attiva
  smartNightDim: true, // Oscuramento notturno intelligente con luci/lux
  motionEffect: 'cinematic', // 'cinematic' (zoom & pan dinamico), 'vibrant' (molto dinamico), 'gentle' (ultra lento), 'none' (statico)
  themes: { ...PRESET_THEMES },
  savedAlbums: [...DEFAULT_SAVED_ALBUMS],
  radioStations: [...DEFAULT_RADIO_STATIONS]
};

export async function loadSettings() {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const mergedThemes = {};

    // 1. Inizializza con i preset
    for (const [id, def] of Object.entries(PRESET_THEMES)) {
      const p = parsed.themes?.[id] || {};
      mergedThemes[id] = {
        ...def,
        ...p,
        id,
        name: p.name || def.name,
        icon: p.icon || def.icon,
        photoSource: p.photoSource || def.photoSource || 'mix',
        slideshowFilter: p.slideshowFilter || def.slideshowFilter || 'all',
        albumUrl: p.albumUrl !== undefined ? p.albumUrl : def.albumUrl,
        pinterestUrl: p.pinterestUrl !== undefined ? p.pinterestUrl : def.pinterestUrl,
        radioStationId: p.radioStationId || def.radioStationId,
        showCalendar: p.showCalendar !== undefined ? Boolean(p.showCalendar) : (def.showCalendar !== undefined ? def.showCalendar : true),
        showAlerts: p.showAlerts !== undefined ? Boolean(p.showAlerts) : (def.showAlerts !== undefined ? def.showAlerts : true),
        showPopups: p.showPopups !== undefined ? Boolean(p.showPopups) : (def.showPopups !== undefined ? def.showPopups : true),
        showPhotoComments: p.showPhotoComments !== undefined ? Boolean(p.showPhotoComments) : (def.showPhotoComments !== undefined ? def.showPhotoComments : true)
      };
    }

    // 2. Carica eventuali temi personalizzati creati dall'utente
    if (parsed.themes) {
      for (const [id, t] of Object.entries(parsed.themes)) {
        if (!mergedThemes[id]) {
          mergedThemes[id] = {
            id,
            name: t.name || 'Nuova Modalità',
            icon: t.icon || '✨',
            isCustom: true,
            photoSource: t.photoSource || 'mix',
            slideshowFilter: t.slideshowFilter || 'all',
            albumUrl: t.albumUrl || '',
            pinterestUrl: t.pinterestUrl || '',
            radioStationId: t.radioStationId || 'lofi',
            showCalendar: t.showCalendar !== undefined ? Boolean(t.showCalendar) : true,
            showAlerts: t.showAlerts !== undefined ? Boolean(t.showAlerts) : true,
            showPopups: t.showPopups !== undefined ? Boolean(t.showPopups) : true,
            showPhotoComments: t.showPhotoComments !== undefined ? Boolean(t.showPhotoComments) : true
          };
        }
      }
    }

    currentSettings = {
      version: parsed.version || Date.now(),
      activeTheme: (mergedThemes[parsed.activeTheme] ? parsed.activeTheme : 'standard'),
      uiMode: parsed.uiMode || 'always',
      uiTimeoutSec: parsed.uiTimeoutSec !== undefined ? Number(parsed.uiTimeoutSec) : 15,
      slideIntervalSec: parsed.slideIntervalSec !== undefined ? Number(parsed.slideIntervalSec) : 60,
      audioVolume: parsed.audioVolume !== undefined ? Number(parsed.audioVolume) : 0.5,
      showCalendar: parsed.showCalendar !== undefined ? Boolean(parsed.showCalendar) : true,
      showAlerts: parsed.showAlerts !== undefined ? Boolean(parsed.showAlerts) : true,
      showPopups: parsed.showPopups !== undefined ? Boolean(parsed.showPopups) : true,
      showPhotoComments: parsed.showPhotoComments !== undefined ? Boolean(parsed.showPhotoComments) : true,
      reolinkEnabled: parsed.reolinkEnabled !== undefined ? Boolean(parsed.reolinkEnabled) : true,
      smartNightDim: parsed.smartNightDim !== undefined ? Boolean(parsed.smartNightDim) : true,
      motionEffect: parsed.motionEffect || 'cinematic',
      themes: mergedThemes,
      savedAlbums: parsed.savedAlbums && parsed.savedAlbums.length ? parsed.savedAlbums : [...DEFAULT_SAVED_ALBUMS],
      radioStations: parsed.radioStations && parsed.radioStations.length ? parsed.radioStations : [...DEFAULT_RADIO_STATIONS]
    };
  } catch {
    await saveSettings(currentSettings);
  }
  return currentSettings;
}

export async function saveSettings(newSettings) {
  let mergedThemes = {};
  if (newSettings.themes) {
    // Garantisci che 'standard' sia sempre presente
    mergedThemes.standard = {
      ...PRESET_THEMES.standard,
      ...(currentSettings.themes.standard || {}),
      ...(newSettings.themes.standard || {})
    };

    for (const [id, t] of Object.entries(newSettings.themes)) {
      const isPreset = Boolean(PRESET_THEMES[id]);
      mergedThemes[id] = {
        ...(isPreset ? PRESET_THEMES[id] : { isCustom: true }),
        ...t,
        id,
        name: t.name || (isPreset ? PRESET_THEMES[id].name : 'Modalità'),
        icon: t.icon || (isPreset ? PRESET_THEMES[id].icon : '✨'),
        photoSource: t.photoSource || 'mix',
        slideshowFilter: t.slideshowFilter || 'all',
        albumUrl: t.albumUrl !== undefined ? t.albumUrl : '',
        pinterestUrl: t.pinterestUrl !== undefined ? t.pinterestUrl : '',
        radioStationId: t.radioStationId || 'lofi',
        showCalendar: t.showCalendar !== undefined ? Boolean(t.showCalendar) : (isPreset && PRESET_THEMES[id].showCalendar !== undefined ? PRESET_THEMES[id].showCalendar : true),
        showAlerts: t.showAlerts !== undefined ? Boolean(t.showAlerts) : (isPreset && PRESET_THEMES[id].showAlerts !== undefined ? PRESET_THEMES[id].showAlerts : true),
        showPopups: t.showPopups !== undefined ? Boolean(t.showPopups) : (isPreset && PRESET_THEMES[id].showPopups !== undefined ? PRESET_THEMES[id].showPopups : true),
        showPhotoComments: t.showPhotoComments !== undefined ? Boolean(t.showPhotoComments) : (isPreset && PRESET_THEMES[id].showPhotoComments !== undefined ? PRESET_THEMES[id].showPhotoComments : true)
      };
    }
  } else {
    mergedThemes = { ...currentSettings.themes };
  }

  // Verifica che activeTheme esista ancora
  let activeTheme = newSettings.activeTheme || currentSettings.activeTheme || 'standard';
  if (!mergedThemes[activeTheme]) {
    activeTheme = 'standard';
  }

  currentSettings = {
    ...currentSettings,
    ...newSettings,
    activeTheme,
    themes: mergedThemes,
    savedAlbums: newSettings.savedAlbums || currentSettings.savedAlbums || [...DEFAULT_SAVED_ALBUMS],
    uiMode: newSettings.uiMode || currentSettings.uiMode || 'always',
    uiTimeoutSec: newSettings.uiTimeoutSec !== undefined ? Number(newSettings.uiTimeoutSec) : (currentSettings.uiTimeoutSec || 15),
    slideIntervalSec: newSettings.slideIntervalSec !== undefined ? Number(newSettings.slideIntervalSec) : (currentSettings.slideIntervalSec || 60),
    audioVolume: newSettings.audioVolume !== undefined ? Number(newSettings.audioVolume) : (currentSettings.audioVolume !== undefined ? currentSettings.audioVolume : 0.5),
    showCalendar: newSettings.showCalendar !== undefined ? Boolean(newSettings.showCalendar) : (currentSettings.showCalendar !== undefined ? currentSettings.showCalendar : true),
    showAlerts: newSettings.showAlerts !== undefined ? Boolean(newSettings.showAlerts) : (currentSettings.showAlerts !== undefined ? currentSettings.showAlerts : true),
    showPopups: newSettings.showPopups !== undefined ? Boolean(newSettings.showPopups) : (currentSettings.showPopups !== undefined ? currentSettings.showPopups : true),
    showPhotoComments: newSettings.showPhotoComments !== undefined ? Boolean(newSettings.showPhotoComments) : (currentSettings.showPhotoComments !== undefined ? currentSettings.showPhotoComments : true),
    reolinkEnabled: newSettings.reolinkEnabled !== undefined ? Boolean(newSettings.reolinkEnabled) : (currentSettings.reolinkEnabled !== undefined ? currentSettings.reolinkEnabled : true),
    smartNightDim: newSettings.smartNightDim !== undefined ? Boolean(newSettings.smartNightDim) : (currentSettings.smartNightDim !== undefined ? currentSettings.smartNightDim : true),
    motionEffect: newSettings.motionEffect || currentSettings.motionEffect || 'cinematic',
    version: Date.now() // Incrementa sempre la versione per forzare il refresh immediato dei client
  };
  await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(currentSettings, null, 2), 'utf8');
  return currentSettings;
}

export function getSavedAlbums() {
  return currentSettings.savedAlbums || DEFAULT_SAVED_ALBUMS;
}

export function getCurrentTheme() {
  const t = currentSettings.themes[currentSettings.activeTheme] || currentSettings.themes.standard || PRESET_THEMES.standard;
  const stations = currentSettings.radioStations || DEFAULT_RADIO_STATIONS;
  const station = stations.find(s => s.id === t.radioStationId) || stations[0];
  const albumUrl = (t.albumUrl || (t.id === 'standard' ? (process.env.GOOGLE_PHOTOS_ALBUM_URL || '') : '')).trim();
  const pinterestUrl = (t.pinterestUrl || '').trim();
  const photoSource = t.photoSource || 'mix';
  const slideshowFilter = t.slideshowFilter || 'all';

  const savedAlbums = currentSettings.savedAlbums || DEFAULT_SAVED_ALBUMS;
  const hasSavedWithUrl = savedAlbums.some(a => a.url && a.url.trim());
  const isAllSaved = (albumUrl === 'all_saved');
  const hasGoogle = isAllSaved ? hasSavedWithUrl : Boolean(albumUrl);
  const hasPinterest = Boolean(pinterestUrl);
  let albumConfigured = false;
  if (photoSource === 'pinterest') {
    albumConfigured = hasPinterest;
  } else if (photoSource === 'google') {
    albumConfigured = hasGoogle;
  } else {
    albumConfigured = hasGoogle || hasPinterest;
  }

  return {
    ...t,
    photoSource,
    slideshowFilter,
    albumUrl,
    pinterestUrl,
    albumConfigured,
    radioUrl: station?.url || '',
    radioName: station?.name || 'Radio',
    uiMode: currentSettings.uiMode || 'always',
    uiTimeoutSec: currentSettings.uiTimeoutSec || 15,
    slideIntervalSec: currentSettings.slideIntervalSec || 60,
    audioVolume: currentSettings.audioVolume !== undefined ? currentSettings.audioVolume : 0.5,
    motionEffect: currentSettings.motionEffect || 'cinematic',
    showCalendar: (currentSettings.showCalendar !== false) && (t.showCalendar !== false),
    showAlerts: (currentSettings.showAlerts !== false) && (t.showAlerts !== false),
    showPopups: (currentSettings.showPopups !== false) && (t.showPopups !== false),
    showPhotoComments: (currentSettings.showPhotoComments !== false) && (t.showPhotoComments !== false),
    reolinkEnabled: currentSettings.reolinkEnabled !== undefined ? currentSettings.reolinkEnabled : true,
    smartNightDim: currentSettings.smartNightDim !== undefined ? currentSettings.smartNightDim : true,
    settingsVersion: currentSettings.version
  };
}
