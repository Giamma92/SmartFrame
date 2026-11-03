/**
 * photos.js
 * Supporta foto locali e album Google Photos in Ultra-HD (4K / 3840x2160)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { cached } from '../utils/cache.js';
import { getCurrentTheme, getSavedAlbums } from './themes.js';

const EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);
const ROOT = config.photos.dir;

async function walk(dir, out) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    return;
  }
  for (const ent of entries) {
    if (ent.name.startsWith('.') || ent.name.startsWith('@')) continue;
    const abs = path.join(dir, ent.name);
    let isDir = ent.isDirectory();
    let isFile = ent.isFile();
    if (ent.isSymbolicLink()) {
      const st = await fs.stat(abs).catch(() => null);
      isDir = Boolean(st?.isDirectory());
      isFile = Boolean(st?.isFile());
    }
    if (isDir && config.photos.recursive) await walk(abs, out);
    else if (isFile && EXTENSIONS.has(path.extname(ent.name).toLowerCase())) out.push(abs);
  }
}

const toRel = (abs) => path.relative(ROOT, abs).split(path.sep).join('/');

export async function fetchAlbumTitle(url) {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) return '';
  try {
    const res = await fetch(url.trim(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return '';
    const html = await res.text();
    const ogMatch = html.match(/<meta property=["']og:title["'] content=["']([^"']+)["']/i);
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    let title = ogMatch ? ogMatch[1] : (titleMatch ? titleMatch[1] : '');
    title = title
      .replace(/\s*-\s*Google\s*(?:Foto|Photos)\s*$/i, '')
      .replace(/\s*[|\/]\s*Pinterest\s*$/i, '')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
    return title;
  } catch (err) {
    console.warn('[photos] Impossibile rilevare titolo album:', err.message);
    return '';
  }
}

async function scanLocalPhotos() {
  const files = [];
  await walk(ROOT, files);
  files.sort();

  // Carica eventuale comments.json se presente nella cartella foto
  let localComments = {};
  try {
    const rawC = await fs.readFile(path.join(ROOT, 'comments.json'), 'utf8');
    localComments = JSON.parse(rawC);
  } catch {}

  const photos = [];
  for (const abs of files) {
    const st = await fs.stat(abs).catch(() => null);
    if (!st) continue;
    const rel = toRel(abs);
    const bname = path.basename(rel);

    // Supporta sidecar text file (es. foto.jpg.txt)
    let sidecarTxt = '';
    try {
      sidecarTxt = (await fs.readFile(abs + '.txt', 'utf8')).trim();
    } catch {}

    const comment = sidecarTxt || localComments[bname] || localComments[rel] || '';

    photos.push({
      url: `/photos/${rel.split('/').map(encodeURIComponent).join('/')}?v=${Math.round(st.mtimeMs)}`,
      name: bname,
      caption: comment,
      comment: comment,
      commentAuthor: '',
      source: 'local'
    });
  }
  return photos;
}

function isGoogleInternalToken(s) {
  if (!s || typeof s !== 'string') return true;
  const str = s.trim();
  if (str.length < 2) return true;
  if (str.startsWith('http') || str.startsWith('AF1Qip') || str.startsWith('pw/')) return true;
  if (/^vd[a-z0-9]{4,12}$/i.test(str)) return true; // Token interni Google Photos (es. vdhimt2q, vdkble6q, vdl579bj)
  if (/^[a-zA-Z0-9_\-]{20,}$/.test(str)) return true; // Hash e token casuali
  if (/^(?:image\/|video\/)/.test(str)) return true;
  if (/^(?:Apple|iPhone|Samsung|Pixel|Sony|Canon|Nikon|Xiaomi)/i.test(str)) return true;
  if (/^[a-z0-9]{4,10}$/.test(str) && !/[aeiou]{2}/.test(str) && !/^[a-z]+$/.test(str)) return true;
  return false;
}

export async function fetchGooglePhotos(albumUrl) {
  if (!albumUrl) return [];
  try {
    console.log('[photos] Sincronizzazione album Google Photos...');
    const res = await fetch(albumUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    // 1. Identifica con precisione tutti i video nel payload (blocco metadati video con durata stream 76647426)
    const videoUrls = new Set();
    const videoStreamRx = /"76647426":\[\d+[\s\S]*?"(https:\/\/lh3\.googleusercontent\.com\/pw\/[^"]+)"/g;
    let vm;
    while ((vm = videoStreamRx.exec(html)) !== null) {
      videoUrls.add(vm[1]);
    }

    // 2. Estrai dati strutturati da AF_initDataCallback (ds:1)
    let parsedMediaItems = null;
    const cbRegex = /AF_initDataCallback\(\{[\s\S]*?\}\);/g;
    let cb;
    while ((cb = cbRegex.exec(html)) !== null) {
      const txt = cb[0];
      if (txt.includes('ds:1') || txt.length > 50000) {
        const dm = txt.match(/data:\s*([\s\S]*?),\s*sideChannel:/);
        if (dm) {
          try {
            const parsed = JSON.parse(dm[1]);
            if (Array.isArray(parsed[1])) {
              parsedMediaItems = parsed[1];
              break;
            }
          } catch {}
        }
      }
    }

    const param = '=w3840-h2160';
    const photos = [];
    const seenUrls = new Set();

    if (parsedMediaItems && parsedMediaItems.length > 0) {
      for (let i = 0; i < parsedMediaItems.length; i++) {
        const it = parsedMediaItems[i];
        if (!it || !Array.isArray(it)) continue;
        const u = it[1]?.[0];
        if (!u || seenUrls.has(u)) continue;

        // Verifica accurata: è un video se ha il blocco di durata streaming 76647426
        const isVideo = Boolean(it[9]?.['76647426'] || videoUrls.has(u));
        if (isVideo) {
          videoUrls.add(u);
          continue;
        }

        seenUrls.add(u);
        const ts = Number(it[2]) || null;
        const d = ts ? new Date(ts) : null;
        let desc = '';
        let comment = '';
        let author = '';

        // Scansione per trovare didascalia utente o commenti
        function findAnnotations(node, depth = 0) {
          if (!node || depth > 5) return;
          if (typeof node === 'string') {
            const s = node.trim();
            if (!isGoogleInternalToken(s)) {
              if (!desc) desc = s;
              else if (!comment && s !== desc) comment = s;
            }
          } else if (Array.isArray(node)) {
            if (node.length >= 3 && typeof node[1] === 'string' && Array.isArray(node[2])) {
              const cText = node[1].trim();
              const cAuthor = typeof node[2][0] === 'string' ? node[2][0] : (typeof node[2][3] === 'string' ? node[2][3] : '');
              if (cText && !cText.startsWith('http') && !cText.startsWith('AF1Qip')) {
                comment = cText;
                if (cAuthor && !cAuthor.startsWith('http')) author = cAuthor;
              }
            }
            for (const child of node) findAnnotations(child, depth + 1);
          } else if (typeof node === 'object') {
            for (const k of Object.keys(node)) findAnnotations(node[k], depth + 1);
          }
        }
        findAnnotations(it);

        // Estrai location dal chunk HTML se disponibile
        const idx = html.indexOf(u);
        let location = '';
        if (idx !== -1) {
          const chunkAfter = html.slice(idx, idx + 1400);
          const locM = chunkAfter.match(/\[2,null,"([^"]+)"\]/);
          if (locM) location = locM[1];
        }

        photos.push({
          url: `${u}${param}`,
          name: `gphoto_${photos.length + 1}.jpg`,
          source: 'google',
          ts,
          date: d ? d.toISOString().slice(0, 10) : '',
          year: d ? d.getFullYear() : null,
          month: d ? (d.getMonth() + 1) : null,
          day: d ? d.getDate() : null,
          location,
          caption: desc || comment || '',
          comment: comment || desc || '',
          commentAuthor: author || ''
        });
      }
    } else {
      // Fallback regex se la struttura JSON ds:1 non è disponibile
      const tsRegex = /\["(https:\/\/lh3\.googleusercontent\.com\/pw\/[^"]+)",\d+,\d+,[\s\S]*?\],(\d{12,13})/g;
      const dateMap = new Map();
      let tm;
      while ((tm = tsRegex.exec(html)) !== null) {
        const u = tm[1];
        const ts = Number(tm[2]);
        if (!dateMap.has(u)) {
          const chunkAfter = html.slice(tm.index, tm.index + 1400);
          const locM = chunkAfter.match(/\[2,null,"([^"]+)"\]/);
          dateMap.set(u, {
            ts,
            location: locM ? locM[1] : ''
          });
        }
      }

      const regex = /https:\/\/[a-z0-9\-]+\.googleusercontent\.com\/pw\/[a-zA-Z0-9_\-]+/g;
      const matches = html.match(regex) || [];
      const unique = Array.from(new Set(matches));
      const onlyPhotos = unique.filter(u => !videoUrls.has(u));

      onlyPhotos.forEach((u, i) => {
        const info = dateMap.get(u);
        const d = info?.ts ? new Date(info.ts) : null;
        photos.push({
          url: `${u}${param}`,
          name: `gphoto_${i + 1}.jpg`,
          source: 'google',
          ts: info?.ts || null,
          date: d ? d.toISOString().slice(0, 10) : '',
          year: d ? d.getFullYear() : null,
          month: d ? (d.getMonth() + 1) : null,
          day: d ? d.getDate() : null,
          location: info?.location || '',
          caption: '',
          comment: '',
          commentAuthor: ''
        });
      });
    }

    console.log(`[photos] Trovate ${photos.length} foto in Ultra-HD (scartati con precisione ${videoUrls.size} video)!`);
    return photos;
  } catch (err) {
    console.warn('[photos] Errore sincronizzazione Google Photos:', err.message);
    return [];
  }
}

async function fetchPinterestPhotos(boardUrl) {
  if (!boardUrl || !boardUrl.trim()) return [];
  try {
    let target = boardUrl.trim();
    if (target.includes('pin.it')) {
      const head = await fetch(target, { method: 'HEAD', redirect: 'follow' });
      if (head.url) target = head.url;
    }

    const u = new URL(target);
    const p = u.pathname.replace(/\/+$/, '');
    const parts = p.split('/').filter(Boolean);
    let rssUrl = '';
    if (target.endsWith('.rss')) {
      rssUrl = target;
    } else if (parts.length === 1) {
      rssUrl = `https://www.pinterest.com/${parts[0]}/feed.rss`;
    } else if (parts.length >= 2) {
      rssUrl = `https://www.pinterest.com/${parts[0]}/${parts[1]}.rss`;
    } else {
      return [];
    }

    console.log(`[photos] Sincronizzazione Pinterest da: ${rssUrl}...`);
    const res = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!res.ok) {
      console.warn(`[photos] Pinterest RSS risposta HTTP ${res.status}`);
      return [];
    }

    const xml = await res.text();
    const items = [];
    const itemRx = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = itemRx.exec(xml)) !== null) {
      const chunk = m[1];
      const titleM = chunk.match(/<title>([\s\S]*?)<\/title>/);
      const imgM = chunk.match(/https:\/\/i\.pinimg\.com\/[^\s"&<']+/);
      if (imgM) {
        const orig = imgM[0].replace(/\/(?:236x|564x|736x)\//, '/originals/');
        const rawTitle = titleM ? titleM[1].trim() : 'Pinterest Pin';
        const cleanTitle = rawTitle
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");

        let cleanDesc = '';
        const descM = chunk.match(/<description>([\s\S]*?)<\/description>/);
        if (descM) {
          cleanDesc = descM[1]
            .replace(/<[^>]+>/g, '') // rimuovi tag HTML
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .trim();
        }

        const note = cleanDesc && cleanDesc !== cleanTitle ? cleanDesc : cleanTitle;

        items.push({
          url: orig,
          name: cleanTitle || 'pinterest_pin.jpg',
          title: cleanTitle,
          caption: cleanTitle,
          description: cleanDesc,
          comment: note,
          commentAuthor: 'Pinterest',
          source: 'pinterest'
        });
      }
    }
    console.log(`[photos] Trovate ${items.length} foto in Ultra-HD da Pinterest!`);
    return items;
  } catch (err) {
    console.warn('[photos] Errore sincronizzazione Pinterest:', err.message);
    return [];
  }
}

function filterTodayMemories(photos) {
  if (!photos || photos.length === 0) return [];
  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curDay = now.getDate();
  const curYear = now.getFullYear();

  // Foto che hanno data
  const withDate = photos.filter(p => p.month && p.day);
  if (withDate.length === 0) return photos;

  // 1. Stretto: stesso mese, entro +/- 5 giorni da oggi, negli anni passati
  let matches = withDate.filter(p =>
    p.month === curMonth &&
    Math.abs(p.day - curDay) <= 5 &&
    p.year < curYear
  );

  // 2. Se poche foto, allarga a +/- 10 giorni
  if (matches.length < 6) {
    matches = withDate.filter(p =>
      p.month === curMonth &&
      Math.abs(p.day - curDay) <= 10
    );
  }

  // 3. Se ancora poche foto, prendi tutte le foto dello stesso mese (es. tutte le foto di Novembre)
  if (matches.length < 6) {
    matches = withDate.filter(p => p.month === curMonth);
  }

  // 4. Se ancora meno di 4 foto (es. l'album contiene solo foto estive),
  // ordina le foto per vicinanza al giorno/mese dell'anno in modo da mostrare comunque ricordi coerenti
  if (matches.length < 4) {
    console.log('[photos] Pochi ricordi per questo mese, mostro ricordi ordinati per vicinanza stagionale');
    const dayOfYear = (d) => Math.floor((new Date(2024, d.month - 1, d.day) - new Date(2024, 0, 1)) / 86400000);
    const targetDay = dayOfYear({ month: curMonth, day: curDay });
    const sorted = [...withDate].sort((a, b) => {
      const diffA = Math.abs(dayOfYear(a) - targetDay);
      const diffB = Math.abs(dayOfYear(b) - targetDay);
      return diffA - diffB;
    });
    return sorted.slice(0, Math.min(sorted.length, 40));
  }

  console.log(`[photos] Accadde Oggi: trovati ${matches.length} ricordi per questo periodo dell'anno!`);
  return matches;
}

async function scanPhotos() {
  const theme = getCurrentTheme();
  const photoSource = theme?.photoSource || 'mix';
  const slideshowFilter = theme?.slideshowFilter || 'all';

  let gAlbum = '';
  let pinterestUrl = (theme?.pinterestUrl || '').trim();

  if (theme) {
    if (theme.albumUrl && theme.albumUrl.trim()) {
      gAlbum = theme.albumUrl.trim();
    } else if (theme.id === 'standard') {
      gAlbum = (process.env.GOOGLE_PHOTOS_ALBUM_URL || '').trim();
    }
  }

  const savedList = getSavedAlbums().filter(a => a.url && a.url.trim());
  let albumUrls = [];

  // Se l'utente ha impostato 'all_saved', oppure siamo in modalità 'today_memories' (Accadde Oggi)
  // e l'album non è ristretto a uno solo: scansiona TUTTI gli album della libreria salvata!
  if (gAlbum === 'all_saved' || (slideshowFilter === 'today_memories' && (!gAlbum || gAlbum === 'all_saved'))) {
    albumUrls = savedList.map(a => a.url.trim());
    const envUrl = (process.env.GOOGLE_PHOTOS_ALBUM_URL || '').trim();
    if (envUrl && !albumUrls.includes(envUrl)) albumUrls.push(envUrl);
  } else if (gAlbum) {
    albumUrls = [gAlbum];
  }

  const wantGoogle = photoSource !== 'pinterest' && albumUrls.length > 0;
  const wantPinterest = photoSource !== 'google' && Boolean(pinterestUrl);

  const [localPhotos, gPhotosArrays, pPhotos] = await Promise.all([
    scanLocalPhotos(),
    wantGoogle ? Promise.all(albumUrls.map(u => fetchGooglePhotos(u))) : Promise.resolve([]),
    wantPinterest ? fetchPinterestPhotos(pinterestUrl) : Promise.resolve([])
  ]);

  // Unifica e deduplica tutte le foto caricate da tutti gli album Google
  const gPhotoMap = new Map();
  (Array.isArray(gPhotosArrays) ? gPhotosArrays.flat() : []).forEach(photo => {
    const base = photo.url.split('=')[0];
    if (!gPhotoMap.has(base)) {
      gPhotoMap.set(base, photo);
    }
  });
  const gPhotos = Array.from(gPhotoMap.values());

  let combined = [];
  if (wantGoogle && wantPinterest && gPhotos.length && pPhotos.length) {
    // Bilanciamento Mix: 2 Google Photos, poi 1 Pinterest per un mix armonioso
    const gList = [...gPhotos];
    const pList = [...pPhotos];
    let gi = 0, pi = 0;
    while (gi < gList.length || pi < pList.length) {
      if (gi < gList.length) combined.push(gList[gi++]);
      if (gi < gList.length) combined.push(gList[gi++]);
      if (pi < pList.length) combined.push(pList[pi++]);
    }
  } else if (wantPinterest && !wantGoogle) {
    combined = pPhotos;
  } else if (wantGoogle && !wantPinterest) {
    combined = gPhotos;
  } else {
    combined = [...gPhotos, ...pPhotos];
  }

  // Applica filtro "Accadde Oggi / Ricordi" se attivo
  if (slideshowFilter === 'today_memories') {
    combined = filterTodayMemories(combined);
  }

  const all = [...combined, ...localPhotos];
  return all;
}

export const getPhotos = cached(scanPhotos, config.photos.rescanMin * 60_000);

export async function resolvePhoto(rel) {
  const abs = path.resolve(ROOT, rel);
  if (!abs.startsWith(ROOT + path.sep)) return null;
  const ext = path.extname(abs).toLowerCase();
  if (!EXTENSIONS.has(ext)) return null;
  const st = await fs.stat(abs).catch(() => null);
  if (!st?.isFile()) return null;
  return abs;
}
