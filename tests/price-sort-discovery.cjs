/* Explicit price sorting outranks the fresh-before-viewed discovery preference. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {boot}=require('./helpers/category-seller-harness.cjs');
const base={name:'Контрольный автомобиль',brand:'BMW',category:'cars',subcategory:'cars',regionCode:'36',city:'Воронеж',bank:'Тестовый банк',status:'live',start:100000,step:1000,deposit:0,bids:0,ends:new Date(Date.now()+86400000).toISOString(),demo:false};
const rows=[{...base,id:999771001,price:100000},{...base,id:999771002,price:200000},{...base,id:999771003,price:300000}];
const h=boot({noMedia:true,fixtureInventory:rows}),run=h.run;
vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../dist/lot-discovery.js'),'utf8'),h.context);
run('cars='+JSON.stringify(rows)+';ends.length=0;cars.forEach(lot=>ends.push(Date.parse(lot.ends)));invalidateSubscriptionInventory();window.FasKeywordSearch.invalidate();userGeo=null;$("#search").value="";$("#region-filter").value="";$("#category").value="";$("#brand").value="";$("#budget").value="";$("#city").value="";window.FasLotDiscovery.markViewed(999771001);');
const prices=()=>Array.from(run('visibleLots.map(lot=>current(lot))'));
for(const reels of [false,true]){
 run('reelsMode='+reels+';recommendationSession=null;$("#sort").value="low";resetDiscoverySession();render()');
 assert.deepEqual(prices(),[100000,200000,300000],(reels?'feed':'catalog')+' keeps the seen cheapest lot first');
 run('window.FasLotDiscovery.markViewed(999771003);$("#sort").value="high";resetDiscoverySession();render()');
 assert.deepEqual(prices(),[300000,200000,100000],(reels?'feed':'catalog')+' keeps the seen most expensive lot first');
 run('$("#search").value="BMW";$("#sort").value="low";render()');assert.deepEqual(prices(),[100000,200000,300000],'a typed search keeps the requested price order');run('$("#search").value=""');
}
// A newly accepted local bid is read on the next pass, never from a lasting price memo.
run('bids={999771001:{price:350000}};$("#sort").value="low";resetDiscoverySession();render(999771001)');assert.deepEqual(prices(),[200000,300000,350000]);assert.equal(run('visibleLots[activeFeedIndex()].id'),999771001,'refresh retains the active feed lot while updating global price order');
run('$("#sort").value="high";render(999771001)');assert.deepEqual(prices(),[350000,300000,200000]);assert.equal(run('visibleLots[activeFeedIndex()].id'),999771001);
run('reelsMode=false;$("#sort").value="nearest";resetDiscoverySession();render()');assert.equal(run('visibleLots[0].id'),999771002,'default discovery without a location still prioritizes the unviewed lot');
// The full-catalogue comparator reads each authoritative price once, rather than once per comparison.
const many=Array.from({length:257},(_,index)=>({...base,id:999772000+index,price:100000+((index*83)%257)*1000}));
run('cars='+JSON.stringify(many)+';ends.length=0;cars.forEach(lot=>ends.push(Date.parse(lot.ends)));invalidateSubscriptionInventory();bids={};window.auditPriceCalls=0;window.originalCurrent=current;current=function(lot){window.auditPriceCalls++;return window.originalCurrent(lot)};$("#sort").value="low";resetDiscoverySession();render()');
assert(h.context.window.auditPriceCalls<many.length*3,'sorting plus 24 rendered cards uses a bounded number of current-price reads');const sorted=prices();assert(sorted.every((value,index)=>!index||sorted[index-1]<=value));
run('bids={999772000:{price:990000}};$("#sort").value="high";render()');assert.equal(prices()[0],990000,'the next render never reuses the previous price snapshot');
console.log('PASS: explicit low/high ordering across seen lots, catalog/feed/search, changed bids and active feed preservation; default discovery retained and price reads bounded per sort pass.');
