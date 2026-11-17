const assert=require('node:assert/strict');
const {boot}=require('./helpers/category-seller-harness.cjs');
const h=boot({noMedia:true}),run=h.run,now=Date.now();
const base={category:'trucks',subcategory:'trucks',brand:'SITRAK',model:'C7H',name:'Седельный тягач SITRAK C7H',city:'Воронеж',regionCode:'36',price:1500000,start:1500000,step:1000,deposit:0,status:'live',ends:new Date(now+86400000).toISOString(),latitude:51.66,longitude:39.21,bids:0,demo:false};
const fixtures=[
 {...base,id:999731001},
 {...base,id:999731002,price:2500000,start:2500000,longitude:39.22},
 {...base,id:999731003,city:'Москва',regionCode:'77',price:1400000,start:1400000,latitude:55.756,longitude:37.617},
 {...base,id:999731004,category:'equipment',subcategory:'equipment',brand:'Atlas Copco',model:'GA11',name:'Компрессор Atlas Copco GA11',price:100000,start:100000},
 {...base,id:999731005,category:'cars',subcategory:'cars',brand:'Toyota',model:'RAV4',name:'Toyota RAV4',price:900000,start:900000},
 {...base,id:999731006,price:1800000,start:1800000,longitude:40.1}
];
run('cars='+JSON.stringify(fixtures)+';ends.length=0;cars.forEach(lot=>ends.push(Date.parse(lot.ends)));invalidateSubscriptionInventory();window.FasKeywordSearch.invalidate();userGeo={point:[51.66,39.2],approximate:false};$("#sort").value="nearest";render();');
assert.equal(run('typeof window.FasGlobalSearch'),'function');
assert.equal(run('window.FasGlobalSearch.supportsCriteria'),true,'global search advertises atomic structured criteria support');
run('window.voiceSearchRenders=[];window.originalCriteriaRender=render;render=function(...args){window.voiceSearchRenders.push({query:$("#search").value,region:$("#region-filter").value,city:$("#city").value,budget:$("#budget").value,brand:$("#brand").value,category:$("#category").value,criteria:readAdvancedFilters().values});return window.originalCriteriaRender.apply(this,args)};');
const ids=()=>Array.from(run('visibleLots.map(lot=>lot.id)'));
function search(query,criteria){run('window.voiceSearchRenders=[]');const result=run('window.FasGlobalSearch('+JSON.stringify(query)+',{criteria:'+JSON.stringify(criteria)+'})');return {result,renders:Array.from(run('window.voiceSearchRenders'))}}

run('$("#category").value="equipment";$("#brand").value="Canon";$("#city").value="Москва";$("#region-filter").value="77";$("#budget").value="50000";$("#adv-model").value="EOS";$("#adv-price-min").value="100";');
let result=search('Ситрак',{priceMax:2000000,regionCode:'36',city:'Воронеж',sort:'nearest'});
assert.equal(result.renders.length,1,'voice constraints are applied before the single result render');
assert.equal(result.renders[0].query,'Ситрак');
assert.equal(result.renders[0].region,'36');
assert.equal(result.renders[0].city,'Воронеж');
assert.equal(result.renders[0].brand,'','a new voice search clears the old contradictory brand');
assert.equal(result.renders[0].criteria.model,'','a new voice search clears the old model');
assert.equal(result.renders[0].criteria['price-min'],'','old minimum does not leak into the new request');
assert.equal(Number(result.renders[0].criteria['price-max']),2000000,'spoken budget is already present at render');
assert.deepEqual(ids(),[999731001,999731006],'Russian brand alias, budget and city select actual truck lots');
assert.equal(h.node('#category').value,'trucks','voice keywords still infer their asset category');
assert(run('visibleLots.every((lot,index)=>!index||distanceToLot(visibleLots[index-1])<=distanceToLot(lot))'),'voice results preserve nearest ordering');
assert.equal(result.result.count,2);

result=search('Ситрак',{priceMin:1600000,priceMax:2000000,regionCode:'36',city:'Воронеж',radius:100,sort:'nearest'});
assert.equal(result.renders.length,1);
assert.deepEqual(ids(),[999731006],'both price bounds apply to the actual matching asset');
assert.equal(Number(h.node('#adv-price-min').value),1600000);
assert.equal(Number(h.node('#adv-price-max').value),2000000);
result=search('Ситрак',{radius:10,sort:'nearest'});
assert.equal(result.renders.length,1);
assert.equal(String(h.node('#adv-radius').value),'10');
assert.deepEqual(ids(),[999731001,999731002],'known distance origin enables an explicit radius');
assert.equal(h.node('#region-filter').value,'','old voice region is removed when absent from the new request');
assert.equal(h.node('#city').value,'','old voice city is removed when absent from the new request');
assert.equal(h.node('#budget').value,'','old basic budget cannot conflict with a structured request');

result=search('Ситрак',{priceMin:-1,priceMax:-100,radius:'nonsense',regionCode:'999',city:'НеверныйТестоград',sort:'invalid'});
assert.equal(result.renders.length,1);
assert.equal(h.node('#adv-price-min').value,'');assert.equal(h.node('#adv-price-max').value,'');
assert.equal(h.node('#adv-radius').value,'');assert.equal(h.node('#region-filter').value,'');assert.equal(h.node('#city').value,'');
assert.equal(ids().length,4,'unknown or negative criteria cannot erase legitimate keyword matches');
assert.equal(run('readAdvancedFilters().error'),'');

run('userGeo=null;userRegion={code:"",scope:"all"}');
result=search('Ситрак',{radius:5});
assert.equal(h.node('#adv-radius').value,'','radius without a location is ignored, rather than returning zero');
assert.equal(ids().length,4);assert.equal(run('readAdvancedFilters().error'),'');
assert.equal(result.renders.length,1);

run('userGeo={point:[51.66,39.2],approximate:false};setReels(true)');
result=search('Ситрак',{priceMax:2000000,regionCode:'36',city:'Воронеж',sort:'nearest'});
assert.equal(run('reelsMode'),false,'voice search returns from fullscreen into its result landing');
assert.equal(result.renders.length,1,'leaving fullscreen must not render an intermediate unfiltered catalogue');
assert.deepEqual(ids(),[999731001,999731006]);
const previousIds=ids();let resultScrolls=0,errorScrolls=0;
h.node('#lot-results').scrollIntoView=()=>resultScrolls++;
h.node('#advanced-error').scrollIntoView=()=>errorScrolls++;
result=search('Ситрак',{priceMin:2000000,priceMax:1000000});
assert.equal(result.renders.length,1);
assert(result.result.error,'reversed bounds return a visible validation error');
assert.equal(h.node('#advanced-search').open,true,'the invalid criteria are opened for correction');
assert.deepEqual(ids(),previousIds,'invalid voice range keeps the previous valid result rather than announcing zero');
assert.equal(resultScrolls,0,'invalid voice criteria do not jump to an empty result landing');
assert.equal(errorScrolls,1,'invalid criteria focus the explanation near their controls');

console.log('PASS: atomic voice search criteria, Russian truck aliases, independent/reset price and location filters, radius origin safety, nearest order and fullscreen result landing.');
