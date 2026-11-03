/**
 * Genera le icone PNG (per VIDAA / manifest) a partire da public/icons/icon.svg.
 * Uso: npm run icons   (richiede il pacchetto "sharp")
 */
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/icons');
const svg = path.join(dir, 'icon.svg');

// Icone quadrate
for (const size of [128, 192, 256, 512]) {
  await sharp(svg, { density: 300 }).resize(size, size).png().toFile(path.join(dir, `icon-${size}.png`));
}

// Miniatura 16:9 (anteprima nel launcher): icona centrata su sfondo scuro
const icon = await sharp(svg, { density: 300 }).resize(280, 280).png().toBuffer();
await sharp({ create: { width: 640, height: 360, channels: 4, background: '#0a0d16' } })
  .composite([{ input: icon, gravity: 'centre' }])
  .png()
  .toFile(path.join(dir, 'thumbnail-640x360.png'));

console.log('Icone generate in', dir);
