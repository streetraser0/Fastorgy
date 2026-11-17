const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {boot}=require('./helpers/category-seller-harness.cjs');
const h=boot(),run=h.run;
vm.runInContext(fs.readFileSync('dist/lot-discovery.js','utf8'),h.context);
const base={bank:'Тестовый продавец',sellerType:'private',status:'live',city:'Воронеж',regionCode:'36',price:100000,start:100000,step:1000,deposit:0,ends:new Date(Date.now()+86400000).toISOString(),description:'контрольнаяметка',demo:false,latitude:0};
const examples=[['trucks','trucks','Тягач SITRAK C7H','SITRAK','C7H','Ситрак'],['other','furniture','Диван для гостиной','Hoff','Диван','диван'],['property','property','Квартира с балконом','','','квартира'],['equipment','equipment','Токарный станок','','','станок'],['other','phones','Смартфон Samsung Galaxy','Samsung','Galaxy','смартфон']];
const fixtures=examples.flatMap(([category,subcategory,name,brand,model],index)=>[.02,2].map((longitude,position)=>({...base,id:991170000+index*2+position,category,subcategory,name,brand,model,longitude:longitude+index*.01})));
run('cars='+JSON.stringify(fixtures)+';ends.length=0;cars.forEach(lot=>ends.push(Date.parse(lot.ends)));window.FasSubscriptionCache.invalidate();window.FasKeywordSearch.invalidate();userGeo={point:[0,0],approximate:false};$("#sort").value="nearest";');
for(const lot of fixtures.filter((_,index)=>index%2===0))run('window.FasLotDiscovery.markViewed('+lot.id+')');
for(const [index,example] of examples.entries()){
 run('window.FasGlobalSearch('+JSON.stringify(example[5])+')');
 assert.equal(run('visibleLots.map(lot=>lot.id).join(",")'),[991170000+index*2,991170001+index*2].join(','),'keyword '+example[5]+' sorts by distance even when closest is viewed');
}
run('window.FasGlobalSearch("контрольнаяметка")');
assert.equal(h.node('#category').value,'','unknown property descriptions search across asset categories');
assert.equal(run('visibleLots.length'),fixtures.length);
assert(run('visibleLots.every((lot,index)=>!index||distanceToLot(visibleLots[index-1])<=distanceToLot(lot))'));
run('reelsMode=true;render()');
assert(run('visibleLots.every((lot,index)=>!index||distanceToLot(visibleLots[index-1])<=distanceToLot(lot))'),'filtered feed retains nearest search results');
run('reelsMode=false;$("#search").value="";resetDiscoverySession();render()');
assert(run('visibleLots.every((lot,index)=>!index||distanceToLot(visibleLots[index-1])<=distanceToLot(lot))'),'ordinary browsing uses the same explicit nearest-first order');
assert.equal(run('visibleLots[0].id'),fixtures[0].id,'the closest viewed lot remains first in ordinary browsing');
assert(run('window.FasLotDiscovery.hasViewed(visibleLots[0].id)'),'viewed status does not displace a closer lot');
assert(run('visibleLots.findIndex(lot=>lot.id===991170000)<visibleLots.findIndex(lot=>lot.id===991170001)'),'nearby viewed inventory precedes farther unseen inventory');
assert.equal(run('cars.length'),fixtures.length,'search never fabricates matching inventory');
console.log('PASS: keywords across five asset types and descriptions, strict nearest order for viewed/new search results and filtered feed, with ordinary browsing also keeping distance ahead of viewed status.');
