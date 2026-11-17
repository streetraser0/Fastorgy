// Regenerate native artwork from the same approved brand used by the website.
// Keep platform filenames, pixel dimensions and adaptive-icon configuration intact.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const sharp = require(path.join(root, 'mobile/node_modules/sharp'));
const icon = await readFile(path.join(root, 'dist/favicon.svg'), 'utf8');
const logo = await readFile(path.join(root, 'dist/assets/brand/fas-torgi-logo.png'));
const png = { compressionLevel: 9, palette: false, adaptiveFiltering: false };
const white = { r: 255, g: 255, b: 255, alpha: 1 };
let updated = 0;

async function nativeIcon(relative) {
  const target = path.join(root, relative);
  const { width, height } = await sharp(target).metadata();
  // Set the SVG viewport size before rasterization, including the 1254px source,
  // rather than enlarging a 512px app icon or a 64px favicon bitmap.
  const vector = icon.replace(/width="\d+" height="\d+"/, `width="${width}" height="${height}"`);
  let image = sharp(Buffer.from(vector)).flatten({ background: white });
  if (relative.endsWith('ic_launcher_background.png')) {
    image = sharp({ create: { width, height, channels: 3, background: white } });
  } else if (relative.endsWith('ic_launcher_round.png')) {
    const mask = Buffer.from(`<svg width="${width}" height="${height}"><circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 2}" fill="white"/></svg>`);
    image = image.ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]);
  } else {
    // iOS application icons must be opaque; Android foreground shares white backing.
    image = image.flatten({ background: white }).removeAlpha();
  }
  await image.png(png).toFile(target);
  updated++;
}

async function nativeSplash(relative, ios = false) {
  const target = path.join(root, relative);
  const { width, height } = await sharp(target).metadata();
  // iOS uses a square image with scaleAspectFill. Keep the complete logo inside
  // the central safe area so narrow portrait screens cannot crop its wordmark.
  const logoWidth = Math.round(Math.min(width, height) * (ios ? 0.32 : 0.62));
  const artwork = await sharp(logo).resize({ width: logoWidth }).png().toBuffer();
  await sharp({ create: { width, height, channels: 3, background: white } })
    .composite([{ input: artwork, gravity: 'centre' }]).removeAlpha().png(png).toFile(target);
  updated++;
}

await nativeIcon('mobile/resources/icon.png');
await nativeIcon('mobile/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
const android = 'mobile/android/app/src/main/res';
for (const file of await readdir(path.join(root, android), { recursive: true })) {
  if (/^mipmap-[^/\\]+[/\\]ic_launcher(?:_round|_background|_foreground)?\.png$/.test(file)) {
    await nativeIcon(path.join(android, file));
  } else if (/^drawable[^/\\]*[/\\]splash\.png$/.test(file)) {
    await nativeSplash(path.join(android, file));
  }
}
const iosSplash = 'mobile/ios/App/App/Assets.xcassets/Splash.imageset';
for (const file of await readdir(path.join(root, iosSplash))) {
  if (file.endsWith('.png')) await nativeSplash(path.join(iosSplash, file), true);
}
console.log(`Generated ${updated} native brand assets with existing platform dimensions.`);
