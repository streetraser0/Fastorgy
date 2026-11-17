const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {boot}=require('./helpers/category-seller-harness.cjs');
const HOUR=3600000,DAY=24*HOUR,INCOMING=999787001,EXISTING=999787002,LATER=999787003;
let clock=Date.now();class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock]))}static now(){return clock}}
const base={category:'cars',subcategory:'cars',name:'Проверка окна окончания',bank:'Продавец',city:'Воронеж',regionCode:'36',price:100000,start:100000,step:1000,deposit:0,bids:0,extension:false,status:'live',demo:false};
function setup(hours=24){
 const start=clock,h=boot({noMedia:true});h.context.Date=ClockDate;
 const lots=[{...base,id:INCOMING,ends:new Date(start+hours*HOUR+1000).toISOString()},{...base,id:EXISTING,ends:new Date(start+2*HOUR).toISOString()},{...base,id:LATER,ends:new Date(start+(hours+4)*HOUR).toISOString()}];
 h.run('cars='+JSON.stringify(lots)+';ends.splice(0,ends.length,...cars.map(lot=>Date.parse(lot.ends)));subscriptions=[];invalidateSubscriptionInventory();window.FasKeywordSearch.invalidate();render();window.boundaryRenderCount=0;window.boundaryLiveCount=0;const endingOriginalRender=render,endingOriginalLive=isLotLive;render=function(...args){window.boundaryRenderCount++;return endingOriginalRender(...args)};isLotLive=function(...args){window.boundaryLiveCount++;return endingOriginalLive(...args)}');
 return h;
}
const ids=h=>Array.from(h.run('visibleLots.map(lot=>lot.id)'));
const reset=h=>h.run('window.boundaryRenderCount=0;window.boundaryLiveCount=0');
function assertIdle(h){h.run('updateCountdowns();updateCountdowns()');assert.equal(h.context.window.boundaryRenderCount,0);assert.equal(h.context.window.boundaryLiveCount,0,'ticks before the active threshold do not rescan the catalogue')}
function featured(h){vm.runInContext(fs.readFileSync('dist/featured-lots.js','utf8'),h.context)}
{
 const start=clock,h=setup();assert.equal(h.run('catalogAuctionBoundary.nextBoundary'),start+2*HOUR,'inactive deadline filters do not schedule every possible window');clock=start+2000;reset(h);assertIdle(h);
 h.run('setTab("soon");subscriptions=[{id:"window-sub",active:true,category:"cars",knownIds:cars.map(lot=>lot.id)}];refreshSubscriptions();render()');
 assert.deepEqual(new Set(ids(h)),new Set([INCOMING,EXISTING]));assert.equal(h.run('catalogAuctionBoundary.nextBoundary'),start+2*HOUR,'an already crossed cutoff is not scheduled again');
}
{
 const start=clock,h=setup();h.run('subscriptions=[{id:"window-sub",active:true,category:"cars",knownIds:cars.map(lot=>lot.id)}];refreshSubscriptions();setTab("soon")');
 assert.equal(h.run('subscriptionInventoryCache.nextBoundary'),start+2*HOUR);assert.equal(h.run('catalogAuctionBoundary.nextBoundary'),start+1001,'the strict window bypasses the subscription cache that only knows starts/ends');assert.deepEqual(ids(h),[EXISTING]);
 h.node('#grid').scrollTop=510;reset(h);clock=start+1000;assertIdle(h);assert(!ids(h).includes(INCOMING),'exactly 24 hours is still excluded');
 h.writes.length=0;clock=start+1001;h.run('updateCountdowns()');assert.equal(h.context.window.boundaryRenderCount,1);assert.deepEqual(new Set(ids(h)),new Set([INCOMING,EXISTING]));assert.equal(h.node('#grid').scrollTop,510);assert(!h.writes.some(key=>['fas-bids','fas-lots'].includes(key)),'window entry cannot change financial state');reset(h);assertIdle(h);
}
for(const hours of [24,72,168]){
 const start=clock,h=setup(hours);h.run('$("#adv-ends").value="'+hours+'";render()');assert.equal(h.run('catalogAuctionBoundary.nextBoundary'),start+1000);assert.deepEqual(ids(h),[EXISTING]);reset(h);clock=start+999;assertIdle(h);clock=start+1000;h.run('updateCountdowns()');assert.equal(h.context.window.boundaryRenderCount,1);assert(ids(h).includes(INCOMING),'advanced '+hours+'h includes the exact deadline threshold');reset(h);assertIdle(h);
}
{
 const start=clock,h=setup();h.run('$("#adv-ends").value="24";setTab("soon")');assert.equal(h.run('catalogAuctionBoundary.nextBoundary'),start+1000);clock=start+1000;h.run('updateCountdowns()');assert(!ids(h).includes(INCOMING));assert.equal(h.run('catalogAuctionBoundary.nextBoundary'),start+1001,'inclusive advanced and strict soon windows retain their own boundary');clock=start+1001;h.run('updateCountdowns()');assert(ids(h).includes(INCOMING));
}
{
 const start=clock,h=setup();h.run('setTab("soon");setTab("all")');assert.equal(h.run('catalogAuctionBoundary.windows'),'');assert.equal(h.run('catalogAuctionBoundary.nextBoundary'),start+2*HOUR,'turning the only deadline filter off removes its cutoff');reset(h);clock=start+2000;assertIdle(h);
}
{
 const start=clock,h=setup();featured(h);h.run('window.FasFeaturedLots.setMode("ending");updateCountdowns()');assert(!h.node('#featured-track').innerHTML.includes('data-featured-lot="'+INCOMING+'"'));assert.equal(h.run('catalogAuctionBoundary.nextBoundary'),start+1001,'a top selection change arms its threshold without a manual main render');reset(h);clock=start+1000;assertIdle(h);clock=start+1001;h.run('updateCountdowns()');assert.equal(h.context.window.boundaryRenderCount,1);assert(h.node('#featured-track').innerHTML.includes('data-featured-lot="'+INCOMING+'"'),'the top ending selection invalidates its otherwise fresh preview cache at entry');reset(h);assertIdle(h);
}
{
 const start=clock,h=setup();featured(h);assert.equal(h.run('window.FasOpenFeaturedFeed({modes:["nearby","ending"],ids:['+EXISTING+'],scopeIds:['+[INCOMING,EXISTING,LATER].join(',')+']})'),true);assert.deepEqual(ids(h),[EXISTING]);assert.equal(h.run('catalogAuctionBoundary.nextBoundary'),start+1001);reset(h);clock=start+1000;assertIdle(h);clock=start+1001;h.run('updateCountdowns()');assert(ids(h).includes(INCOMING),'a broad multi-mode feed admits newly eligible lots beyond its initial displayed IDs');assert(!ids(h).includes(LATER));assert.equal(h.run('visibleLots[activeFeedIndex()].id'),EXISTING,'new earlier rows do not move the currently viewed lot');assert.equal(h.context.window.boundaryRenderCount,1);reset(h);assertIdle(h);
}
console.log('PASS: active strict/inclusive ending windows refresh on clock entry in soon, advanced 24/72/168h, top preview and broad multi-mode feed; caches remain idle before thresholds and inactive filters schedule no window work.');
