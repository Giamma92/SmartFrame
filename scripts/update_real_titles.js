import fs from 'node:fs/promises';

const FILE = '/home/raspi/smart-frame/data/settings.json';
const raw = await fs.readFile(FILE, 'utf8');
const settings = JSON.parse(raw);

const realAlbums = [
  {
    id: 'album_mallorca',
    name: 'Mallorca · Jul 12 – 18 📸',
    url: 'https://photos.app.goo.gl/CesyTH5Su1BkwZzCA'
  },
  {
    id: 'album_karpathos',
    name: 'Karpathos - Greek 2026 · Sep 5 – 13, 2025 📸',
    url: 'https://photos.app.goo.gl/1wy1zQQHXv1TJzMx5'
  },
  {
    id: 'album_natale',
    name: 'Natale negli anni · Dec 24, 2014 – Jul 8, 2026 📸',
    url: 'https://photos.app.goo.gl/SGJZAFtkKyn58wQs8'
  }
];

settings.savedAlbums = realAlbums;
await fs.writeFile(FILE, JSON.stringify(settings, null, 2), 'utf8');
console.log('Saved albums updated with real Google titles!');
