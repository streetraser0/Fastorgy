const assert=require('assert/strict');
const {boot}=require('./helpers/category-seller-harness.cjs');

// Subscription matching should depend on inventory changes, not each search keystroke.
const h=boot(),total=h.run('cars.length');
h.run("subscriptions=Array.from({length:50},(_,i)=>({id:'perf-'+i,active:true,category:'cars',knownIds:cars.map(c=>c.id)}));lotNotices=[];window.liveCalls=0;window.matchCalls=0;const originalLive=isLotLive,originalMatch=subscriptionMatches;isLotLive=function(c){window.liveCalls++;return originalLive(c)};subscriptionMatches=function(...args){window.matchCalls++;return originalMatch(...args)};refreshSubscriptions()");
assert.equal(h.context.window.liveCalls,total,'one inventory eligibility pass serves all subscriptions');
assert.equal(h.context.window.matchCalls,0,'baseline inventory is already known');
h.run('window.liveCalls=0;for(let i=0;i<10;i++)refreshSubscriptions()');
assert.equal(h.context.window.liveCalls,0,'unchanged refreshes do not rescan inventory');
h.run("$('#search').value='Toyota';render();$('#search').value='BMW';render()");
assert(h.context.window.liveCalls<=total*2,'only each catalog render checks eligibility, not each subscription');
assert.equal(h.context.window.matchCalls,0);

const draftId=999999901;
h.run('cars.push({...cars[0],id:'+draftId+',name:"Будущий тестовый лот",demo:false,status:"draft",ends:new Date(Date.now()+86400000).toISOString()});ends.push(Date.parse(cars.at(-1).ends));refreshSubscriptions()');
assert.equal(h.run('lotNotices.length'),0,'drafts never produce notifications');
h.run('cars.at(-1).status="live";window.FasSubscriptionCache.invalidate();refreshSubscriptions()');
assert.equal(h.run('lotNotices.filter(n=>n.lotId==='+draftId+').length'),1,'same-ID publication is discovered once');
assert(h.run('subscriptions.every(sub=>sub.knownIds.includes('+draftId+'))'));
h.run('window.liveCalls=0;window.matchCalls=0;refreshSubscriptions();refreshSubscriptions()');
assert.equal(h.context.window.liveCalls,0);assert.equal(h.context.window.matchCalls,0);
h.run('cars.at(-1).status="paused";window.FasSubscriptionCache.invalidate();refreshSubscriptions();cars.at(-1).status="live";saveLots()');
assert.equal(h.run('lotNotices.filter(n=>n.lotId==='+draftId+').length'),1,'resuming a previously seen lot does not duplicate its notice');

const pausedId=999999902;
h.run('cars.push({...cars[0],id:'+pausedId+',name:"Тестовый лот на паузе",demo:false,status:"paused",ends:new Date(Date.now()+86400000).toISOString()});ends.push(Date.parse(cars.at(-1).ends));refreshSubscriptions();cars.at(-1).status="live";saveLots()');
assert.equal(h.run('lotNotices.filter(n=>n.lotId==='+pausedId+').length'),1,'a first publication from pause is discovered through saveLots');

// Start and end boundaries invalidate the cache even without an explicit mutation.
let now=Date.now();const RealDate=Date;
h.context.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}};
const scheduledId=999999903;
h.run('cars.push({...cars[0],id:'+scheduledId+',name:"Запланированный тестовый лот",demo:false,status:"scheduled",startsAt:new Date(Date.now()+1000).toISOString(),ends:new Date(Date.now()+3000).toISOString()});ends.push(Date.parse(cars.at(-1).ends));refreshSubscriptions()');
assert.equal(h.run('lotNotices.filter(n=>n.lotId==='+scheduledId+').length'),0);
now+=1001;h.run('refreshSubscriptions()');
assert.equal(h.run('lotNotices.filter(n=>n.lotId==='+scheduledId+').length'),1,'scheduled start is noticed after its clock boundary');
now+=2001;h.run('refreshSubscriptions()');
assert.equal(h.run('subscriptionInventory().live.some(lot=>lot.id==='+scheduledId+')'),false,'expired inventory is removed after its clock boundary');
assert.equal(h.run('lotNotices.filter(n=>n.lotId==='+scheduledId+').length'),1);

// Creating/resuming a subscription records the current baseline, so old lots are not new.
h.run("subscriptions.push({id:'fresh',category:'cars',active:true,knownIds:subscriptionInventory().live.map(c=>c.id)});refreshSubscriptions()");
assert.equal(h.run("lotNotices.some(n=>n.subscriptionId==='fresh')"),false);
const notices=h.run('lotNotices.length'),reload=boot({records:h.records});
assert.equal(reload.run('lotNotices.length'),notices,'reload does not replay previously seen inventory');
console.log('PASS: one inventory scan for50 subscriptions, unchanged filter refreshes skip repeated scans, publication/pause/start/end boundaries and persisted notification baselines.');

// A favorite action only serializes its small record, never every uploaded lot.
const favorite=boot();const countdownNow=Date.now();favorite.context.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[countdownNow]))}static now(){return countdownNow}};let serialized=0;favorite.context.window.FasSellerMedia.serializeLot=lot=>{serialized++;return lot};
favorite.run('cars.push({...cars[0],id:999999904,demo:false})');favorite.writes.length=0;favorite.run('toggleLotFavorite(cars[0].id)');
assert.equal(serialized,0);assert.deepEqual(favorite.writes,['fas-favs']);
favorite.writes.length=0;favorite.run("persist(['fas-bids'])");
assert.equal(serialized,0);assert.deepEqual(favorite.writes,['fas-bids']);
favorite.run("persist(['fas-lots'])");assert(serialized>0,'lot snapshots are serialized only when requested');

// Countdown uses the authoritative deadline directly and handles missing/expired lots.
assert.equal(favorite.run('timer({ends:new Date(Date.now()-1000).toISOString()})'),'0 мес. 0 дн. 00 ч. 00 мин. 00 сек.');
assert.equal(favorite.run('timer(null)'),'0 мес. 0 дн. 00 ч. 00 мин. 00 сек.');
assert.equal(favorite.run('timer({ends:"invalid"})'),'0 мес. 0 дн. 00 ч. 00 мин. 00 сек.');
assert.equal(favorite.run('timer({ends:new Date(Date.now()+3600000).toISOString()})'),'0 мес. 0 дн. 01 ч. 00 мин. 00 сек.');
console.log('PASS: favorites and selective persistence do not serialize unrelated lot records; countdown needs no catalog lookup.');

// Catalog passes snapshot their controls once, rather than reading the DOM for every lot.
const document=favorite.context.document,originalQuery=document.querySelector,controlReads=new Map();
document.querySelector=function(selector){controlReads.set(selector,(controlReads.get(selector)||0)+1);return originalQuery.call(this,selector)};
favorite.run("$('#search').value='';$('#region-filter').value='36';$('#category').value='';$('#brand').value='';$('#budget').value='3000000';$('#city').value='';tab='all'");
controlReads.clear();favorite.run('render()');
for(const selector of ['#region-filter','#category','#brand','#budget','#city','#sort'])assert((controlReads.get(selector)||0)<=3,selector+' is read a bounded number of times for the whole inventory');
assert(favorite.run("visibleLots.length>0&&visibleLots.every(lot=>getRegionCode(lot)==='36'&&current(lot)<=3000000)"),'snapshotted region and budget retain their filtering behavior');
document.querySelector=originalQuery;

// Ticking uses rendered deadlines, avoiding a catalog scan even near the end of the feed.
let writes=0,text='';
const countdown={dataset:{time:'missing-from-catalog',timeEnd:new RealDate(countdownNow+3600000).toISOString()},get textContent(){return text},set textContent(value){writes++;text=value}};
const originalAll=document.querySelectorAll;document.querySelectorAll=()=>[countdown];
favorite.run("cars=new Proxy(cars,{get(target,key,receiver){if(key==='find')throw Error('Countdown must not search the catalog');return Reflect.get(target,key,receiver)}})");
favorite.run('updateCountdowns()');assert.equal(text,'0 мес. 0 дн. 01 ч. 00 мин. 00 сек.');assert.equal(writes,1);
favorite.run('updateCountdowns()');assert.equal(writes,1,'unchanged countdown does not rewrite the DOM');
countdown.dataset.timeEnd=new RealDate(countdownNow+120000).toISOString();favorite.run('updateCountdowns()');assert.equal(text,'0 мес. 0 дн. 00 ч. 02 мин. 00 сек.','an updated deadline takes effect');
document.hidden=true;document.querySelectorAll=()=>{throw Error('Hidden page should not query countdowns')};favorite.run('updateCountdowns()');
document.hidden=false;document.querySelectorAll=()=>[countdown];countdown.dataset.timeEnd='invalid';favorite.run('updateCountdowns()');assert.equal(text,'0 мес. 0 дн. 00 ч. 00 мин. 00 сек.');
document.querySelectorAll=originalAll;
const nextEnd=new RealDate(countdownNow+7200000).toISOString();favorite.context.window.nextCountdownEnd=nextEnd;
assert(favorite.run("cardHTML({...cars[0],ends:window.nextCountdownEnd}).includes('data-time-end=\"'+window.nextCountdownEnd+'\"')"),'card replacement carries the new auction deadline');
console.log('PASS: bounded filter reads preserve results; countdowns skip background work, unchanged writes and full-catalog lookups while tracking new deadlines.');
