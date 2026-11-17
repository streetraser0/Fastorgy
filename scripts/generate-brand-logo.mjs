// The approved vector master is immutable; crop only its transparent margins.
// Text is outlined so the deployed brand never depends on installed fonts.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFile, writeFile, stat } from 'node:fs/promises';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const sharp = require(path.join(root, 'mobile/node_modules/sharp'));
const source = await readFile(path.join(root, 'design/brand/fas-torgi-centered-gradient-master.svg'), 'utf8');
const target = path.join(root, 'dist/assets/brand/fas-torgi-logo.png');
const metadata = await sharp(Buffer.from(source)).metadata();
if (metadata.format !== 'svg' || metadata.width !== 1120 || metadata.height !== 440) {
  throw Error('The approved centered vector must retain its original 1120 × 440 canvas.');
}
const { data, info } = await sharp(Buffer.from(source)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let left = info.width, top = info.height, right = -1, bottom = -1;
for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
  if (!data[(y * info.width + x) * 4 + 3]) continue;
  left = Math.min(left, x); top = Math.min(top, y);
  right = Math.max(right, x); bottom = Math.max(bottom, y);
}
if (right < left) throw Error('Approved brand artwork is empty.');
// Eight logical pixels of breathing room; 2× raster for crisp mobile/desktop text.
const padding = 8, width = right - left + 1 + padding * 2, height = bottom - top + 1 + padding * 2;
const cropped = source.replace('width="1120" height="440" viewBox="0 0 1120 440"',
  `width="${width * 2}" height="${height * 2}" viewBox="${left - padding} ${top - padding} ${width} ${height}"`);
const png = { compressionLevel: 9, palette: false, adaptiveFiltering: false };
await sharp(Buffer.from(cropped)).ensureAlpha().png(png).toFile(target);

// Tiny app/favicon surfaces use exactly the original pyramid and its glint.
const defs = source.match(/<defs>[\s\S]*?<\/defs>/)?.[0];
const pyramid = source.match(/<g fill="url\(#pyramid-blue\)"[\s\S]*?<\/g>/)?.[0];
const glint = source.match(/<g clip-path="url\(#pyramid-clip\)"[\s\S]*?<\/g>/)?.[0];
if (!defs || !pyramid || !glint) throw Error('The approved pyramid/glint groups are missing.');
const iconSvg = (size, maskable = false) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${maskable ? '416 -50 288 288' : '446 -20 228 228'}" role="img" aria-label="ФАС торги">${defs}${pyramid}${glint}</svg>`;
await writeFile(path.join(root, 'dist/favicon.svg'), iconSvg(64));
for (const [name, size, maskable] of [['icon-192', 192, false], ['icon-512', 512, false], ['maskable-512', 512, true], ['apple-touch-icon', 180, false]]) {
  await sharp(Buffer.from(iconSvg(size, maskable))).flatten({ background: '#FFFFFF' })
    .png(png).toFile(path.join(root, 'dist/assets/app', name + '.png'));
}
console.log(JSON.stringify({ logo: 'dist/assets/brand/fas-torgi-logo.png', width: width * 2, height: height * 2, bytes: (await stat(target)).size, icons: 5 }));
