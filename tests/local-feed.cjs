const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {boot}=require('./helpers/category-seller-harness.cjs');
const h=boot(),plain=value=>JSON.parse(JSON.stringify(value));
vm.runInContext(fs.readFileSync('dist/lot-discovery.js','utf8'),h.context);
const now=Date.now(),base={brand:'BMW',description:'Имущество для проверки ленты',regionCode:'36',city:'Воронеж',bank:'Тестовый продавец',status:'live',price:100000,start:100000,step:1000,deposit:0,bids:0,ends:new Date(now+2*3600000).toISOString(),condition:'used',demo:false};
const lots=[
 {...base,id:991140001,name:'Ближайший автомобиль',category:'cars',subcategory:'cars',latitude:51.66,longitude:39.2},
 {...base,id:991140002,name:'Квартира рядом',category:'property',subcategory:'property',latitude:51.67,longitude:39.2},
 {...base,id:991140003,name:'Диван рядом',category:'other',subcategory:'furniture',latitude:51.68,longitude:39.2},
 {...base,id:991140004,name:'Телефон в соседнем городе',category:'other',subcategory:'phones',latitude:52.1,longitude:39.2,city:'Липецк',regionCode:'48'},
 {...base,id:991140005,name:'Оборудование в Москве',category:'equipment',subcategory:'equipment',latitude:55.756,longitude:37.617,city:'Москва',regionCode:'77'},
 {...base,id:991140006,name:'Имущество без адреса',category:'trucks',subcategory:'trucks',city:'Неизвестный город',regionCode:'',latitude:'',longitude:''},
 {...base,id:991140007,name:'Завершённые торги',category:'cars',subcategory:'cars',latitude:51.66,longitude:39.2,ends:new Date(now-1000).toISOString()},
];
h.run('cars='+JSON.stringify(lots)+';ends.length=0;cars.forEach(lot=>ends.push(Date.parse(lot.ends)));window.FasSubscriptionCache.invalidate();window.FasKeywordSearch.invalidate();userGeo={point:[51.66,39.2],approximate:false};userRegion={code:"36",scope:"region"};window.FasLotDiscovery.markViewed(991140001);window.FasLotDiscovery.markViewed(991140002);updateRegionLabels();');
const order=()=>plain(h.run('visibleLots.map(lot=>lot.id)'));
const initialGeo=plain(h.run('userGeo')),initialRegion=plain(h.run('userRegion'));
// Stale restrictive filters, an invalid range, and a price sort must not leak
// into the broad discovery entry point on the home page.
h.run('tab="fav";catalogLimit=144;$("#search").value="невозможный запрос";$("#category").value="trucks";$("#brand").value="Toyota";$("#city").value="Москва";$("#budget").value="1";$("#region-filter").value="77";ADV_IDS.forEach(id=>$("#adv-"+id).value="123");$("#adv-price-min").value="999";$("#adv-price-max").value="1";$("#sort").value="high";keywordCategoryAutomatic=true;keywordCategoryAuto="trucks";keywordCategoryQuery="old";');
h.node('#home-open-feed').onclick();
assert.equal(h.run('reelsMode'),true);assert.equal(h.run('tab'),'all');assert.equal(h.run('catalogLimit'),24);assert.equal(h.node('#sort').value,'nearest');
assert.deepEqual(order(),[991140001,991140002,991140003,991140004,991140005,991140006],'all property kinds enter the home feed, nearest city first, farther cities next, unknown locations last');
assert.equal(h.run('new Set(visibleLots.map(lot=>window.FasCategories.groupOf(lot).id)).size'),5,'home entry includes all five sale groups');
assert.deepEqual(plain(h.run('userGeo')),initialGeo,'home reset never changes the actual visitor coordinates');assert.deepEqual(plain(h.run('userRegion')),initialRegion,'clearing the inventory region filter preserves the chosen reference region');
assert.deepEqual(plain(h.run('["search","category","brand","city","budget","region-filter"].map(id=>$("#"+id).value)')),['','','','','','']);assert(h.run('ADV_IDS.every(id=>$("#adv-"+id).value==="")'));assert.equal(h.run('keywordCategoryAutomatic'),false);assert.equal(h.node('#advanced-error').textContent,'');
h.run('window.FasLotDiscovery.markViewed(991140003);render(991140003)');assert.deepEqual(order(),[991140001,991140002,991140003,991140004,991140005,991140006],'a viewed nearby lot stays ahead of an unseen distant lot');
// The result-list feed button is intentionally scoped to the current search.
h.run('setReels(false);ADV_IDS.forEach(id=>$("#adv-"+id).value="");tab="soon";$("#search").value="Ближайший";$("#category").value="cars";$("#brand").value="BMW";$("#city").value="Воронеж";$("#region-filter").value="36";$("#budget").value="200000";$("#adv-price-min").value="50000";$("#adv-ends").value="24";window.FasRestoreManualKeywordCategory($("#search").value);render();');
const scopedCriteria=plain(h.run('({query:$("#search").value,category:$("#category").value,brand:$("#brand").value,city:$("#city").value,region:$("#region-filter").value,budget:$("#budget").value,values:readAdvancedFilters().values,tab})'));
assert.equal(h.node('#advanced-error').textContent,'','the independent scoped-search scenario starts with valid filters');
h.node('#open-reels').onclick();assert.equal(h.run('reelsMode'),true);assert.deepEqual(order(),[991140001]);assert.deepEqual(plain(h.run('({query:$("#search").value,category:$("#category").value,brand:$("#brand").value,city:$("#city").value,region:$("#region-filter").value,budget:$("#budget").value,values:readAdvancedFilters().values,tab})')),scopedCriteria,'opening a filtered feed preserves its keyword, location, price, category and soon-ending criteria');
// Without GPS, a known region remains an explicitly approximate reference.
h.run('setReels(false);userGeo=null;userRegion={code:"36",scope:"region"};updateRegionLabels();');h.node('#home-open-feed').onclick();assert.equal(h.run('userGeo'),null);assert.equal(h.run('userOrigin().approximate'),true);assert.deepEqual(order().slice(0,3),[991140001,991140002,991140003]);assert(!h.node('#reels-region-open').innerHTML.includes('Рядом со мной'),'region fallback never claims precise geolocation');
// No known origin means no fabricated GPS coordinates or distance claims.
h.run('setReels(false);userGeo=null;userRegion={code:"",scope:"all"};updateRegionLabels();');h.node('#home-open-feed').onclick();assert.equal(h.run('userOrigin()'),null);assert.equal(order().length,6);assert(!h.node('#reels-region-open').innerHTML.includes('Рядом со мной'));assert.match(h.run('distanceHTML(cars[0])'),/Показать расстояние/);
console.log('PASS: broad local home feed, all five groups, nearest-first over viewed state, full filter reset without changing origin, scoped search-feed preservation, approximate-region and missing-origin fallbacks.');
