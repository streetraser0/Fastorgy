const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {boot}=require('./helpers/category-seller-harness.cjs');
const engineSource=fs.readFileSync('dist/recommendations.js','utf8');
const now=Date.now(),base={bank:'Тестовый продавец',sellerType:'private',status:'live',city:'Воронеж',regionCode:'36',price:1000000,start:1000000,step:1000,deposit:0,ends:new Date(now+86400000).toISOString(),startsAt:new Date(now-3600000).toISOString(),description:'Общая контрольная метка',bids:0,demo:false,latitude:51.66};
const fixtures=[
 {...base,id:999881001,category:'cars',subcategory:'cars',brand:'BMW',model:'530i',name:'BMW 530i',longitude:39.22},
 {...base,id:999881002,category:'cars',subcategory:'cars',brand:'Toyota',model:'Camry',name:'Toyota Camry',longitude:39.21},
 {...base,id:999881003,category:'cars',subcategory:'cars',brand:'BMW',model:'530i',name:'BMW 530i далеко',longitude:42.2},
 {...base,id:999881004,category:'equipment',subcategory:'equipment',brand:'Atlas Copco',model:'GA11',name:'Компрессор Atlas Copco GA11',longitude:39.205},
 {...base,id:999881005,category:'other',subcategory:'phones',brand:'Samsung',model:'Galaxy',name:'Телефон Samsung Galaxy',longitude:39.202},
 {...base,id:999881006,category:'cars',subcategory:'cars',brand:'BMW',model:'530i',name:'Собственное объявление BMW',longitude:43.2,sellerOwnerId:'seller-owner'}
];
function setup(){
 const h=boot({noMedia:true});vm.runInContext(engineSource,h.context);
 h.run('cars='+JSON.stringify(fixtures)+';ends.splice(0,ends.length,...cars.map(lot=>Date.parse(lot.ends)));invalidateSubscriptionInventory();window.FasKeywordSearch.invalidate();userGeo={point:[51.66,39.2],approximate:false};userRegion={code:"36",scope:"region"};$("#sort").value="nearest";syncSearchFields();render();');
 return h;
}
const ids=h=>Array.from(h.run('visibleLots.map(lot=>lot.id)'));
function nearest(h){assert(h.run('visibleLots.every((lot,index)=>!index||distanceToLot(visibleLots[index-1])<=distanceToLot(lot))'),'recommendation candidates retain strict geographical order')}
function click(h,dataset,{disabled=false}={}){
 let prevented=false;
 const matches=selector=>selector.split(',').some(part=>{
  part=part.trim();if(part==='button')return true;
  const match=part.match(/^\[data-([a-z-]+)(?:="([^"]*)")?\]$/);if(!match)return false;
  const key=match[1].replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());
  return Object.hasOwn(dataset,key)&&(match[2]===undefined||String(dataset[key])===match[2]);
 });
 const button={dataset,disabled,matches,closest:selector=>matches(selector)?button:null};
 // The actual click may originate on an icon or text node inside the button.
 const target={closest:selector=>button.closest(selector)};
 h.dispatchClick({target,preventDefault(){prevented=true},stopPropagation(){}});
 return {prevented,button};
}
const h=setup(),R=h.context.window.FasRecommendations,grid=h.node('#grid'),modal=h.node('#modal');
let featuredRefreshes=0;h.context.window.FasFeaturedLots={refresh(){featuredRefreshes++},invalidate(){},setMode(){}};
const all=[999881005,999881004,999881002,999881001,999881003,999881006];
assert.equal(R.summary().signalCount,0);
h.run('openCar(999881006)');modal.close();assert.equal(R.summary().signalCount,0,'opening an own listing never records an interest');
h.run('toggleLotFavorite(999881006)');assert.equal(R.summary().signalCount,0,'own favorites do not train interests');h.run('openLocalFeed()');assert.equal(R.summary().signalCount,0,'importing existing favorites also excludes own listings');assert.equal(h.run('recommendationSession.reason'),'cold');assert.equal(h.run('recommendationSession.personalized'),false);assert.deepEqual(ids(h),all,'cold visitors see every live asset kind');nearest(h);
// First favorite learns an interest, but never moves cards under the finger.
const coldSession=h.run('recommendationSession');grid.scrollTop=700;const coldMarkup=grid.innerHTML;featuredRefreshes=0;
h.run('toggleLotFavorite(999881001)');assert.equal(R.summary().favoriteCount,1);assert.strictEqual(h.run('recommendationSession'),coldSession);assert.equal(grid.scrollTop,700);assert.equal(grid.innerHTML,coldMarkup);assert.deepEqual(ids(h),all,'a favorite cannot shrink the active cold session');assert.equal(featuredRefreshes,0,'full-feed favorites never recompute the hidden featured rail');
h.run('openCar(999881001)');assert.equal(featuredRefreshes,0,'opening a lot records interests without refreshing the rail underneath its dialog');modal.close();assert.equal(R.summary().openCount,1,'opening a real detail card records its interest');
const savedRecord=JSON.parse(h.records['fas-recommendations-v1']);assert(savedRecord.signals.some(row=>row.lot.id===999881001&&row.favoriteAt&&row.opens),'both actual actions reach durable local interest storage');
h.run('setReels(false);openLocalFeed()');
assert.equal(h.run('recommendationSession.personalized'),true);
assert.deepEqual(ids(h),[999881002,999881001,999881003,999881006],'the next session narrows to related assets');nearest(h);
assert(ids(h).indexOf(999881002)<ids(h).indexOf(999881003),'a farther exact-brand/model match never outranks a nearer category analogue');
const session=h.run('recommendationSession'),candidates=h.run('recommendationSession.ids'),markup=grid.innerHTML;grid.scrollTop=700;featuredRefreshes=0;
h.run('toggleLotFavorite(999881002)');assert.strictEqual(h.run('recommendationSession'),session);assert.strictEqual(h.run('recommendationSession.ids'),candidates,'candidate membership is frozen for the active session');assert.equal(grid.innerHTML,markup);assert.equal(grid.scrollTop,700);assert.deepEqual(ids(h),[999881002,999881001,999881003,999881006]);assert.equal(featuredRefreshes,0,'learning another in-feed favorite keeps the hidden rail idle');
// A different asset can be opened from a map or another UI without changing the feed below it.
h.run('openCar(999881004);toggleLotFavorite(999881004)');modal.close();assert.equal(R.summary().openCount,2);assert.equal(R.summary().favoriteCount,3);h.run('render(999881001)');assert.strictEqual(h.run('recommendationSession.ids'),candidates);assert(!ids(h).includes(999881004),'new interests wait until the next feed session');
h.run('setReels(false);openLocalFeed()');assert(ids(h).includes(999881004),'the next session includes the newly favored asset kind');nearest(h);
// Explicit searches and the result-list feed retain their complete query scope.
h.run('applyKeywordSearch("Общая контрольная метка",{allCategories:true})');assert.equal(h.run('recommendationSession'),null);assert.equal(h.run('reelsMode'),false);assert.deepEqual(ids(h),all,'explicit keywords search every matching asset kind');
h.run('setReels(true)');assert.equal(h.run('recommendationSession'),null);assert.deepEqual(ids(h),all,'opening the search-result feed does not apply interests');nearest(h);
// Settings are a deliberate session change, unlike ordinary favorite interactions.
h.run('setReels(false);openLocalFeed()');assert(click(h,{recommendationSettings:''}).prevented,'empty settings attribute is handled by the actual document click listener');assert(modal.open);assert(h.node('#modal-content').innerHTML.includes('Интересы хранятся только на этом устройстве'));
grid.scrollTop=700;assert(click(h,{recommendationMode:'all'}).prevented,'mode buttons route through the document listener');assert.equal(R.getMode(),'all');assert.equal(modal.open,false);assert.equal(h.run('recommendationSession.reason'),'all');assert.equal(h.run('recommendationSession.ids'),null);assert.equal(grid.scrollTop,0,'explicitly changing the mode intentionally starts the new feed at its beginning');assert.deepEqual(ids(h),all);
const interests=R.summary().signalCount;h.run('openCar(999881005)');modal.close();assert.equal(R.summary().signalCount,interests,'all-nearby mode does not silently learn new opens');
const favoritesBefore=h.run('JSON.stringify(saved)'),favoritesStorageBefore=h.records['fas-favs'],workspaceBefore=h.records['fas-seller-workspace-v1'];
click(h,{recommendationReset:''},{disabled:true});assert.equal(R.summary().signalCount,interests,'disabled reset cannot clear existing interests');featuredRefreshes=0;
assert(click(h,{recommendationReset:''}).prevented,'empty reset attribute routes through the real click handler');assert.equal(R.summary().signalCount,0);assert.equal(h.run('JSON.stringify(saved)'),favoritesBefore,'resetting interests preserves saved favorites');assert.equal(h.records['fas-favs'],favoritesStorageBefore,'resetting interests leaves durable favorites unchanged');assert.equal(h.records['fas-seller-workspace-v1'],workspaceBefore,'resetting interests preserves seller drafts and profile');
assert.equal(modal.open,false,'successful reset releases the modal instead of leaving the page blocked');
assert.equal(featuredRefreshes,0,'resetting an active feed does not scan or rebuild the hidden rail');
assert(click(h,{recommendationMode:'for-you'}).prevented);assert.equal(h.run('recommendationSession.reason'),'cold');assert.deepEqual(ids(h),all,'cleared interests stay cold without reimporting existing favorites');
// Reset from the home-page settings must release the native dialog even when
// the rail is in a different tab. A reset does not select a different rail tab.
const catalogue=setup(),CR=catalogue.context.window.FasRecommendations;
catalogue.run('openCar(999881001)');catalogue.node('#modal').close();
let resets=0,railRefreshes=0,railModeChanges=0;
catalogue.context.window.FasFeaturedLots={invalidate(){resets++},refresh(){railRefreshes++},setMode(){railModeChanges++}};
const previousFavourites=catalogue.records['fas-favs'],previousWorkspace=catalogue.records['fas-seller-workspace-v1'];
catalogue.run('openRecommendationSettings()');assert(catalogue.node('#modal').open);assert.equal(CR.summary().signalCount,1);
assert(click(catalogue,{recommendationReset:''}).prevented);
assert.equal(CR.summary().signalCount,0);assert.equal(catalogue.node('#modal').open,false,'catalogue reset closes its modal');
assert.equal(resets,1);assert.equal(railRefreshes,1,'only the visible rail refreshes');assert.equal(railModeChanges,0,'reset preserves the current rail tab');
assert.equal(catalogue.records['fas-favs'],previousFavourites);assert.equal(catalogue.records['fas-seller-workspace-v1'],previousWorkspace);
catalogue.run('openRecommendationSettings()');assert.match(catalogue.node('#modal-content').innerHTML,/data-recommendation-reset disabled/,'reopening shows that there are no interests left to clear');
click(catalogue,{recommendationReset:''},{disabled:true});assert.equal(resets,1,'a disabled repeated reset performs no extra refresh');
catalogue.node('#modal').close();assert.equal(catalogue.node('#modal').open,false,'the settings window remains closable after a reset');
// A session whose entire candidate set expires must fall back to eligible inventory.
const fallback=setup(),FR=fallback.context.window.FasRecommendations;
fallback.run('openCar(999881001)');fallback.node('#modal').close();fallback.run('openLocalFeed()');assert(fallback.run('recommendationSession.ids instanceof Set'));
fallback.run('for(const lot of cars)if(recommendationSession.ids.has(lot.id))lot.ends=new Date(Date.now()-1).toISOString();invalidateSubscriptionInventory();render()');
assert.equal(fallback.run('recommendationSession.reason'),'no-eligible');assert.equal(fallback.run('recommendationSession.personalized'),false);assert.deepEqual(ids(fallback),[999881005,999881004],'expired personalized candidates fall back to other live asset kinds');nearest(fallback);
assert.equal(FR.summary().openCount,1,'fallback does not fabricate additional interests');
// The engine remains optional: the existing site still opens the complete local feed.
const optional=setup();optional.context.window.FasRecommendations=undefined;optional.run('openLocalFeed()');assert.equal(optional.run('recommendationSession'),null);assert.deepEqual(ids(optional),all);
console.log('PASS: actual open/favorite interest hooks, cold/all/optional fallbacks, frozen candidate sessions, strict nearest analogues, next-session updates, explicit query isolation, expired-candidate recovery and settings preserving favorites/drafts.');
