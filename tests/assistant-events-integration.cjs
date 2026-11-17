const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { boot } = require('./helpers/category-seller-harness.cjs');

const h = boot();
const spoken = [];
const synthesis = {
  speaking: false,
  pending: false,
  speak(utterance) { spoken.push(utterance); this.speaking = true; },
  cancel() { this.speaking = false; }
};
h.context.window.speechSynthesis = synthesis;
h.context.window.SpeechSynthesisUtterance = class {
  constructor(text) { this.text = text; }
};
for (const name of ['assistant-preferences.js', 'auction-notifications.js']) {
  vm.runInContext(fs.readFileSync('dist/' + name, 'utf8'), h.context);
}
h.run('configureAuctionNotifications()');
for (const key of ['spoken', 'outbid', 'newBidOwn']) {
  assert.equal(h.run('window.FasAssistantPreferences.execute(' + JSON.stringify({ type: 'set', key, value: true }) + ').ok'), true);
}
const now = Date.now();
const base = {
  name: 'Проверка настоящего обработчика событий', category: 'cars',
  regionCode: '36', city: 'Воронеж', bank: 'Демопродавец', status: 'live',
  price: 100000, start: 100000, step: 1000, deposit: 0, bids: 0,
  startsAt: new Date(now - 60000).toISOString(),
  ends: new Date(now + 86400000).toISOString(), demo: false
};
const buyerId = 991130001;
const ownerId = 991130002;
h.run('cars = [...cars, ' + JSON.stringify({ ...base, id: buyerId }) + ', ' + JSON.stringify({ ...base, id: ownerId, sellerOwnerId: 'seller-owner' }) + '];');
assert.equal(h.run('commitDemoBid(cars.find(lot => lot.id === ' + buyerId + '), 120000)'), true);
assert.equal(spoken.length, 0, 'a personal bid cannot announce a competitor or seller event');

const update = (id, price) => 'window.FasApplyAuctionUpdate(' + JSON.stringify({ lotId: id, price, actorOwn: false }) + ')';
h.setFailLots(true);
assert.equal(h.run(update(buyerId, 150000)).ok, false);
assert.equal(spoken.length, 0, 'a failed durable quote never triggers speech');
h.setFailLots(false);
assert.equal(h.run(update(buyerId, 150000)).ok, true);
assert.equal(spoken.length, 1);
assert.match(spoken[0].text, /ставку.*перебили/i);
assert.equal(h.run('lotNotices.filter(notice => notice.type === "outbid").length'), 1);
assert.equal(h.run(update(buyerId, 150000)).ok, false);
assert.equal(spoken.length, 1, 'quote and saved-notice delivery share one announcement');
synthesis.speaking = false;
spoken[0].onend();

assert.equal(h.run(update(ownerId, 130000)).ok, true);
assert.equal(spoken.length, 2);
assert.match(spoken[1].text, /Новая ставка на ваш лот/);
assert.equal(h.run('JSON.parse(localStorage.getItem("fas-lots")).find(lot => lot.id === ' + ownerId + ').price'), 130000);
assert.equal(h.run('window.FasApplyAuctionUpdate({lotId:' + ownerId + ', price:140000, actorOwn:true}).ok'), false);
assert.equal(spoken.length, 2);

console.log('PASS: actual persisted auction updates drive opt-in assistant speech; personal/failed/forged/replayed updates stay silent and quote/notice delivery is deduplicated.');
