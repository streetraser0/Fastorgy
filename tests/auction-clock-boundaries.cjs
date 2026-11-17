const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {boot}=require('./helpers/category-seller-harness.cjs');
let clock=Date.now();class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock]))}static now(){return clock}}
const ID=999888001,START=999888002,LONG=999888003;
const base={category:'cars',subcategory:'cars',name:'Проверка времени торгов',bank:'Продавец',city:'Воронеж',regionCode:'36',price:100000,start:100000,step:1000,deposit:0,bids:0,extension:false,status:'live',demo:false};
function setup(){
 const start=clock,h=boot({records:{'fas-bids':JSON.stringify({[ID]:{price:101000,count:1,history:[{price:101000,at:new Date(clock-1000).toISOString()}]}})},noMedia:true});h.context.Date=ClockDate;
 const lots=[{...base,id:ID,ends:new Date(start+1000).toISOString()},{...base,id:START,status:'scheduled',startsAt:new Date(start+2000).toISOString(),ends:new Date(start+6000).toISOString()},{...base,id:LONG,ends:new Date(start+60000).toISOString()}];
 h.run('cars='+JSON.stringify(lots)+';ends.splice(0,ends.length,...cars.map(lot=>Date.parse(lot.ends)));subscriptions=[];invalidateSubscriptionInventory();window.FasKeywordSearch.invalidate();render();window.boundaryRenderCount=0;window.boundaryLiveCount=0;const clockOriginalRender=render,clockOriginalLive=isLotLive;render=function(...args){window.boundaryRenderCount++;return clockOriginalRender(...args)};isLotLive=function(...args){window.boundaryLiveCount++;return clockOriginalLive(...args)}');
 return h;
}
const ids=h=>Array.from(h.run('visibleLots.map(lot=>lot.id)'));
{
 const start=clock,h=setup();vm.runInContext(fs.readFileSync('dist/auction-notifications.js','utf8'),h.context);h.run('configureAuctionNotifications();window.FasAuctionNotifications.openMyBids()');h.node('#modal').scrollTop=470;h.node('#grid').scrollTop=720;
 assert.deepEqual(ids(h),[ID,LONG]);assert(h.node('#modal-content').innerHTML.includes('Вы лидируете'));assert.equal(h.run('catalogAuctionBoundary.nextBoundary'),start+1000,'no-subscription visitors still schedule the closest real boundary');
 h.run('window.boundaryLiveCount=0');clock=start+500;for(let n=0;n<6;n++)h.run('updateCountdowns()');assert.equal(h.context.window.boundaryRenderCount,0);assert.equal(h.context.window.boundaryLiveCount,0,'ordinary second ticks do not rescan inventory');
 h.writes.length=0;clock=start+1001;h.run('updateCountdowns()');assert.equal(h.context.window.boundaryRenderCount,1);assert.deepEqual(ids(h),[LONG]);assert.equal(h.node('#result-count').textContent,'1 лот');assert.match(h.node('#modal-content').innerHTML,/Торги завершены/);assert(!h.node('#modal-content').innerHTML.includes('Вы лидируете'));assert.equal(h.node('#modal').scrollTop,470);assert.equal(h.node('#grid').scrollTop,720);assert(!h.writes.some(key=>['fas-bids','fas-lots'].includes(key)),'clock membership work cannot bid, buy or change financial records');
 h.run('window.boundaryLiveCount=0');h.run('updateCountdowns();updateCountdowns()');assert.equal(h.context.window.boundaryRenderCount,1);assert.equal(h.context.window.boundaryLiveCount,0);
 clock=start+2001;h.run('updateCountdowns()');assert.equal(h.context.window.boundaryRenderCount,2);assert.deepEqual(ids(h),[START,LONG],'scheduled lots appear without a manual search or page reload');assert.equal(h.node('#grid').scrollTop,720);
 clock=start+6001;h.run('updateCountdowns()');assert.equal(h.context.window.boundaryRenderCount,3);assert.deepEqual(ids(h),[LONG]);assert.equal(h.run('catalogAuctionBoundary.nextBoundary'),start+60000);
}
{
 const start=clock,h=setup();h.run('openCar('+ID+')');h.node('#bid-form').dataset.lotId=String(ID);h.node('#bid').value='125000';h.node('#bid').min=102000;h.node('#modal').scrollTop=630;const before=h.run('JSON.stringify(bids)');h.writes.length=0;
 clock=start+1001;h.run('updateCountdowns()');assert.equal(h.node('#modal').open,true);assert.equal(h.node('#modal').scrollTop,630);assert.equal(h.node('#bid').value,'125000');assert.equal(h.node('#bid').disabled,true);assert.equal(h.node('#bid-form .purchase-submit').disabled,true);assert.match(h.node('#bid-current-status').textContent,/завершены/);assert.equal(h.run('JSON.stringify(bids)'),before);assert(!h.writes.some(key=>['fas-bids','fas-lots'].includes(key)));assert.equal(h.run('commitDemoBid(cars.find(lot=>lot.id==='+ID+'),125000)'),false,'the ended form cannot create a ghost bid');
}
{
 const start=clock,h=setup();h.run('setReels(true);render('+LONG+')');assert.equal(h.run('visibleLots[activeFeedIndex()].id'),LONG);h.run('window.boundaryRenderCount=0');clock=start+1001;h.run('updateCountdowns()');assert.deepEqual(ids(h),[LONG]);assert.equal(h.run('visibleLots[activeFeedIndex()].id'),LONG,'removing an earlier expired card keeps the same active reel');assert.equal(h.context.window.boundaryRenderCount,1);
}
{
 const start=clock,h=setup();h.run('setReels(true);render('+LONG+')');const top=h.node('#grid').scrollTop,markup=h.node('#grid').innerHTML;let photoOpen=true;h.context.window.FasLotPhotos={state(){return {open:photoOpen}}};h.run('window.boundaryRenderCount=0;window.boundaryLiveCount=0');clock=start+1001;h.run('updateCountdowns();updateCountdowns()');assert.equal(h.context.window.boundaryRenderCount,0);assert.equal(h.context.window.boundaryLiveCount,0);assert.equal(h.node('#grid').scrollTop,top);assert.equal(h.node('#grid').innerHTML,markup,'a photo overlay keeps its underlying gallery/feed snapshot stable');photoOpen=false;h.run('updateCountdowns()');assert.equal(h.context.window.boundaryRenderCount,1);assert.equal(h.run('visibleLots[activeFeedIndex()].id'),LONG);
}
{
 const start=clock,h=setup();h.run('subscriptions=[{id:"clock-sub",active:true,category:"cars",knownIds:cars.map(lot=>lot.id)}];refreshSubscriptions();render();window.boundaryRenderCount=0;window.boundaryLiveCount=0');assert.equal(h.run('catalogAuctionBoundary.nextBoundary'),h.run('subscriptionInventoryCache.nextBoundary'),'active subscriptions share the existing next-boundary cache');clock=start+500;h.run('updateCountdowns()');assert.equal(h.context.window.boundaryLiveCount,0);clock=start+1001;h.run('updateCountdowns()');assert.deepEqual(ids(h),[LONG]);assert.equal(h.context.window.boundaryRenderCount,1);
}
{
 const start=clock,h=setup();h.run('cars[0].autoRelist=true;cars[0].relistDurationMinutes=60;cars[0].relistLimit=2;cars[0].startsAt=new Date(Date.now()-3600000).toISOString();bids={};persist(["fas-bids"]);openCar('+ID+')');h.node('#bid-form').dataset.lotId=String(ID);h.node('#bid').value='120000';h.node('#bid').min=101000;clock=start+1001;h.run('updateCountdowns()');assert.equal(h.node('#bid').disabled,true);const result=h.run('window.FasProcessAuctionRenewals()');assert.equal(result.length,1);assert.equal(h.node('#bid').disabled,false,'a separately confirmed automatic repeat refreshes its existing bid controls');assert.equal(h.node('#bid-form .purchase-submit').disabled,false);assert.match(h.node('#bid-current-status').textContent,/снова принимают ставки/);assert.equal(h.node('#bid').value,'120000');assert.equal(h.run('Object.keys(bids).length'),0,'automatic renewal never places a bid or marks a purchase');
}
console.log('PASS: automatic start/end membership and My Bids status, disabled ended forms with retained input/position, preserved active reels/photo overlays, no pre-boundary inventory work and shared subscription deadlines without financial side effects.');
