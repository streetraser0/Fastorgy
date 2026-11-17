const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {boot}=require('./helpers/category-seller-harness.cjs');
const {setup}=require('./helpers/quickbar-dom.cjs');
const h=boot({noMedia:true}),run=h.run;
run('window.distanceFixtureInventory=cars;window.originalDistanceKm=kmBetween;window.distanceOperations=0;kmBetween=function(...args){window.distanceOperations++;return window.originalDistanceKm(...args)};userGeo={point:[51.66,39.2],approximate:false};$("#sort").value="nearest";');
const expected=()=>run('cars.filter(lot=>isLotLive(lot)).map(lot=>({id:lot.id,distance:lotLocation(lot)?window.originalDistanceKm(userOrigin().point,lotLocation(lot).point):Infinity})).sort((a,b)=>a.distance-b.distance||a.id-b.id).map(item=>item.id).join(",")');
function assertMainOrder(message){const wanted=expected();run('window.distanceOperations=0;render()');assert(run('visibleLots.map(lot=>lot.id).join(",")')===wanted,message);return h.context.window.distanceOperations}
assert(run('cars.length')>=52785,'exercise the actual full regional inventory');
let calls=assertMainOrder('shared-position reuse preserves exact nearest-first inventory order');
assert(calls<200,'the full regional catalogue computes distances by distinct positions instead of once per asset');
run('userGeo.point[0]=55.756;userGeo.point[1]=37.617');
calls=assertMainOrder('mutating the current location recalculates distances for the new origin');assert(calls<200);
run('window.movedDistanceLot=visibleLots[0].id;cars.find(lot=>lot.id===window.movedDistanceLot).latitude=59.934;cars.find(lot=>lot.id===window.movedDistanceLot).longitude=30.335');
assertMainOrder('editing coordinates on an existing object is reflected on the next render');
assert.notEqual(run('visibleLots[0].id'),h.context.window.movedDistanceLot,'an edited remote object cannot retain its old zero distance');
// More exact locations than the bounded reuse map can retain must still sort correctly.
const now=Date.now(),base={category:'cars',subcategory:'cars',brand:'Test',model:'Test',name:'Точное местоположение',city:'Воронеж',regionCode:'36',price:100000,start:100000,step:1000,deposit:0,status:'live',ends:new Date(now+86400000).toISOString(),bids:0,tag:'Тест'};
const distinct=Array.from({length:1110},(_,index)=>({...base,id:999631000+index,latitude:51.66+index*.0001,longitude:39.2+index*.0001}));
distinct.push({...distinct.at(-1),id:999632500},{...distinct.at(-2),id:999632501});
run('cars='+JSON.stringify(distinct)+';userGeo={point:[51.66,39.2],approximate:false};invalidateSubscriptionInventory();window.FasKeywordSearch.invalidate();');
assertMainOrder('exhausting the bounded coordinate map never loses or misorders unique locations');assert.equal(run('visibleLots.length'),distinct.length);
// The independent top selection uses the same exact-point rule and a fresh origin.
run('cars=window.distanceFixtureInventory;invalidateSubscriptionInventory();window.FasKeywordSearch.invalidate();userGeo={point:[51.66,39.2],approximate:false};window.distanceOperations=0;');
// The nested photo module needs real card nodes. Enrich only this fixture;
// keep the shared marketplace harness lightweight for its other callers.
const dom=setup(),trackDOM=new dom.Element('div'),actualTrack=h.node('#featured-track');
Object.defineProperty(actualTrack,'innerHTML',{get:()=>trackDOM.innerHTML,set:value=>{trackDOM.innerHTML=value}});
for(const method of ['querySelector','querySelectorAll','contains'])actualTrack[method]=trackDOM[method].bind(trackDOM);
h.node('#featured-lots').contains=trackDOM.contains.bind(trackDOM);
vm.runInContext(fs.readFileSync('dist/featured-lots.js','utf8'),h.context);
assert(h.context.window.distanceOperations<150,'the top selection also reuses regional coordinates');
function assertFeatured(){const ids=[...h.node('#featured-track').innerHTML.matchAll(/data-featured-lot="(\d+)"/g)].map(match=>Number(match[1]));assert.equal(ids.length,12);let previous=-Infinity;for(const id of ids){const km=run('window.originalDistanceKm(userOrigin().point,lotLocation(cars.find(lot=>lot.id==='+id+')).point)');assert(km>=previous,'top cards retain nearest-first order');previous=km}return ids}
const before=assertFeatured();run('userGeo.point[0]=55.756;userGeo.point[1]=37.617;window.distanceOperations=0;window.FasFeaturedLots.refresh()');
assert(h.context.window.distanceOperations<150,'changing the top selection origin starts a bounded fresh coordinate pass');const after=assertFeatured();assert.notDeepEqual(after,before,'the top selection responds to the new location');
console.log('PASS: exact coordinate reuse bounds full-catalogue/top-selection distance work, preserves nearest order and refreshes edited coordinates/origin beyond cache capacity.');
