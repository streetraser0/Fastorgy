const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '../mobile/scripts/native-bridge.js'), 'utf8').replace(/^import .*;\n/gm, '');
const shared = [];
const context = {
  URL,
  document: { documentElement: { classList: { add() {} } }, querySelectorAll: () => [], addEventListener() {} },
  navigator: { geolocation: {} },
  location: { href: 'https://localhost/', origin: 'https://localhost' },
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
  App: { addListener() {} },
  Browser: {},
  Geolocation: {},
  Share: { share: async payload => { shared.push(JSON.parse(JSON.stringify(payload))); return { activityType: 'test' }; } },
  StatusBar: { setStyle: async () => {}, setOverlaysWebView: async () => {}, setBackgroundColor: async () => {} },
  Style: { Dark: 'DARK' }
};
context.window = context;
vm.runInNewContext(source, context);

(async () => {
  const share = context.FasNativeShare.share;
  await share({ title: 'Лот', text: 'Образец квитанции', url: 'https://example.test/lot/42' });
  assert.deepEqual(shared.pop(), { dialogTitle: 'Поделиться', title: 'Лот', text: 'Образец квитанции', url: 'https://example.test/lot/42' });
  for (const url of ['file:///data/user/0/ru.fastorgi.app/cache/private.txt', 'content://private/file', 'javascript:alert(1)', 'not a URL']) {
    await share({ text: 'Текст без вложений', url, files: ['file:///sdcard/private.txt'] });
    assert.deepEqual(shared.pop(), { dialogTitle: 'Поделиться', text: 'Текст без вложений' }, 'Non-web URLs and file fields do not reach the Share plugin.');
  }
  await assert.rejects(share({ files: ['file:///sdcard/private.txt'], url: 'file:///sdcard/private.txt' }), { name: 'TypeError' });
  assert.equal(shared.length, 0, 'File-only payloads do not open a native share sheet.');
  console.log('PASS: native text/web-link sharing needs no FileProvider paths and drops file options and non-web URLs.');
})().catch(error => { console.error(error); process.exitCode = 1; });
