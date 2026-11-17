import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const text = name => readFile(path.join(root, name), 'utf8');
const config = JSON.parse(await text('capacitor.config.json'));
assert.equal(config.appId, 'ru.fastorgi.app');
assert.equal(config.server?.url, undefined, 'Bundle the app locally; do not load a remote website as native code.');
assert.equal(config.server?.allowNavigation, undefined, 'Remote pages must not navigate inside the native bridge.');
assert.equal(config.server?.cleartext, false);
for (const name of ['android/app/src/main/assets/capacitor.config.json', 'ios/App/App/capacitor.config.json']) {
  const bundledConfig = JSON.parse(await text(name));
  assert.equal(bundledConfig.server?.url, undefined, 'Remote native bundle in ' + name);
  assert.equal(bundledConfig.server?.allowNavigation, undefined, 'Remote native navigation in ' + name);
  assert.equal(bundledConfig.server?.cleartext, false, 'Cleartext native traffic in ' + name);
}
for (const name of ['server', '.openai', 'drizzle']) await assert.rejects(access(path.join(root, 'www', name)), error => error.code === 'ENOENT', 'Server-only output must not enter the app: ' + name);
const html = await text('www/index.html');
assert.equal((html.match(/src="native-bridge.js"/g) || []).length, 1);
for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
  if (match[1].trim()) new vm.Script(match[1]);
}
for (const name of ['app-ui.js', 'lot-gestures.js', 'pwa.js', 'sw.js', 'seller-rules.js', 'seller-media.js', 'seller-ui.js', 'quickbar.js', 'lot-close-gesture.js', 'category-tree.js', 'category-ui.js', 'motion.js', 'buyer-tools.js', 'feed-close-gesture.js', 'support.js', 'seller-ratings.js', 'back-swipe.js', 'car-catalog.js', 'smart-fill.js', 'keyword-search.js', 'search-typos.js', 'search-identifiers.js', 'voice-assistant.js', 'payment-ui.js', 'countdown.js', 'auction-renewal.js', 'lot-location.js', 'feed-tutorial.js', 'asset-reports.js', 'sales-analytics.js', 'lot-discovery.js', 'catalog-scroll.js', 'auction-notifications.js', 'auction-modes.js', 'property-map.js', 'catalog-data.js', 'demo-profiles.js', 'search-data.js', 'vendor/leaflet/leaflet.js']) {
  assert.equal(await text('www/' + name), await readFile(path.join(root, '../dist', name), 'utf8'), 'Stale bundled asset: ' + name);
  new vm.Script(await text('www/' + name), { filename: name });
}
assert.equal(await text('www/seller.css'), await readFile(path.join(root, '../dist/seller.css'), 'utf8'), 'Stale seller styling.');
assert.equal(await text('www/quickbar.css'), await readFile(path.join(root, '../dist/quickbar.css'), 'utf8'), 'Stale quick navigation styling.');
assert.equal(await text('www/categories.css'), await readFile(path.join(root, '../dist/categories.css'), 'utf8'), 'Stale category styling.');
assert.equal(await text('www/motion.css'), await readFile(path.join(root, '../dist/motion.css'), 'utf8'), 'Stale transition styling.');
for (const name of ['app.css', 'buyer-tools.css', 'scroll.css', 'feed-close.css', 'support.css', 'seller-ratings.css', 'back-swipe.css', 'car-catalog.css', 'smart-fill.css', 'voice-assistant.css', 'payment-ui.css', 'countdown.css', 'feed-tutorial.css', 'asset-reports.css', 'sales-analytics.css', 'auction-notifications.css', 'auction-modes.css', 'visual-polish.css', 'brand-home.css', 'property-map.css', 'vendor/leaflet/leaflet.css', 'privacy.html']) assert.equal(await text('www/' + name), await readFile(path.join(root, '../dist', name), 'utf8'), 'Stale shared styling: ' + name);
for (const name of ['data/car-catalog.json', 'data/car-catalog-LICENSE.txt', 'data/car-catalog-source.json']) assert.equal(await text('www/' + name), await readFile(path.join(root, '../dist', name), 'utf8'), 'Stale vehicle catalogue: ' + name);
new vm.Script(await text('www/native-bridge.js'), { filename: 'native-bridge.js' });
for (const name of ['assets/app/icon-192.png', 'assets/app/icon-512.png', 'assets/app/apple-touch-icon.png', 'assets/brand/fas-torgi-logo.png']) await access(path.join(root, 'www', name));
const manifest = await text('android/app/src/main/AndroidManifest.xml');
assert.match(manifest, /android:allowBackup="false"/, 'Local profile and media data must not enter Android backups.');
assert.doesNotMatch(manifest, /android:allowBackup="true"/);
assert.match(manifest, /ACCESS_COARSE_LOCATION/);
assert.match(manifest, /ACCESS_FINE_LOCATION/);
assert.doesNotMatch(manifest, /ACCESS_BACKGROUND_LOCATION/);
const filePaths = await text('android/app/src/main/res/xml/file_paths.xml');
const sharedPaths = [...filePaths.matchAll(/<([a-z-]+-path)\b([^>]*)\/>/g)].map(([, type, attributes]) => ({
  type,
  ...Object.fromEntries([...attributes.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map(([, key, value]) => [key, value]))
}));
assert.deepEqual(sharedPaths, [{ type: 'cache-path', name: 'share', path: 'share/' }, { type: 'external-files-path', name: 'camera_photos', path: 'Pictures/' }], 'FileProvider exposes only the sharing cache and the app-specific camera directory.');
assert.match(manifest, /<action android:name="android\.media\.action\.IMAGE_CAPTURE"\s*\/>/, 'Android package visibility must allow the system camera intent.');
assert.match(manifest, /<uses-feature android:name="android\.hardware\.camera" android:required="false"\s*\/>/, 'Gallery uploads remain available on devices without a camera.');
const gradleWrapper = await text('android/gradle/wrapper/gradle-wrapper.properties');
assert.match(gradleWrapper, /^distributionSha256Sum=[a-f0-9]{64}$/m, 'Verify the Gradle distribution against its official SHA-256 checksum.');
const iosProject = await text('ios/App/App.xcodeproj/project.pbxproj');
assert.equal((iosProject.match(/IPHONEOS_DEPLOYMENT_TARGET = 15\.4;/g) || []).length, 4, 'iOS requires 15.4 or newer for native HTML dialogs.');
const info = await text('ios/App/App/Info.plist');
const locationDescription = key => info.match(new RegExp('<key>' + key + '</key>\\s*<string>([^<]+)</string>'))?.[1].trim();
assert.ok(locationDescription('NSLocationWhenInUseUsageDescription'), 'iOS needs a foreground location explanation.');
for (const key of ['NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription', 'NSMicrophoneUsageDescription']) assert.ok(locationDescription(key), 'The selected media action needs its iOS purpose string: ' + key);
assert.equal(locationDescription('NSLocationAlwaysAndWhenInUseUsageDescription'), locationDescription('NSLocationWhenInUseUsageDescription'), 'The geolocation dependency requires the second usage description with the same foreground explanation.');
assert.doesNotMatch(info, /<key>NSLocationAlwaysUsageDescription<\/key>|<key>UIBackgroundModes<\/key>/, 'The app does not request background location.');
console.log('PASS: bundled JavaScript syntax, current shared web assets, app identity, icons, foreground location, local native navigation and restricted file sharing.');
