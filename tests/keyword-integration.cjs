const assert=require('assert/strict');
const {boot}=require('./helpers/category-seller-harness.cjs');
const h=boot(),run=h.run;
run("window.FasGlobalSearch('BMW')");const english=run('visibleLots.map(c=>c.id).join()');assert(english);
run("window.FasGlobalSearch('БМВ')");assert.equal(run('visibleLots.map(c=>c.id).join()'),english,'English and Russian brand aliases find the same inventory');
run("tab='fav';saved=[];$('#category').value='electronics';$('#adv-model').value='несуществующая модель';window.FasGlobalSearch('БМВ')");
assert.equal(run('tab'),'all');assert.equal(h.node('#category').value,'cars','recognized BMW query selects its asset type');assert.equal(h.node('#adv-model').value,'');assert(run('visibleLots.length')>0);

const base={bank:'Тестовый продавец',sellerType:'bank',status:'live',city:'Воронеж',regionCode:'36',price:100000,step:1000,deposit:0,ends:new Date(Date.now()+86400000).toISOString(),demo:false};
const fixtures=[
 {id:990000001,category:'cars',subcategory:'cars',name:'Toyota Camry',brand:'Toyota',model:'Camry',fuel:'diesel',transmission:'auto',year:2021,vin:'TESTVIN987654321'},
 {id:990000002,category:'trucks',subcategory:'trucks',name:'КамАЗ 65115',brand:'КамАЗ',fuel:'diesel',mileage:120000,powerHp:300},
 {id:990000003,category:'property',subcategory:'property',name:'Квартира с балконом',area:90,rooms:3,floor:2},
 {id:990000004,category:'equipment',subcategory:'equipment',name:'Фрезерный станок',manufacturer:'Haas',serialNumber:'SERIALHAAS123',powerKw:22},
 {id:990000005,category:'other',subcategory:'phones',name:'Смартфон Samsung Galaxy',brand:'Samsung',model:'Galaxy',description:'Экран без повреждений'},
 {id:990000006,category:'other',subcategory:'furniture',name:'Диван для гостиной',description:'Синяя обивка',manufacturer:'Hoff'},
 {id:990000007,category:'property',subcategory:'property',name:'Квартира с лоджией',area:72,rooms:2,floor:7}
].map(f=>({...base,...f}));
run('cars.push(...'+JSON.stringify(fixtures)+');ends.push(...cars.slice(-7).map(c=>Date.parse(c.ends)));saveLots()');
for(const [query,id]of [['Камри дизель Воронеж',990000001],['diesel voronezh toyota',990000001],['truck diesel',990000002],['apartment',990000003],['Haas 22',990000004],['phone samsung',990000005],['sofa',990000006],['TESTVIN987654321',990000001],['SERIALHAAS123',990000004]]){
 run('window.FasGlobalSearch('+JSON.stringify(query)+')');assert(run('visibleLots.some(c=>c.id==='+id+')'),'global keyword results: '+query);
}
// Room constraints use the structured field, including when titles have no number.
run("userGeo={point:[51.66,39.2],approximate:false};$('#sort').value='nearest'");
for(const query of ['2х комнатная квартира','2-комнатная квартира','двухкомнатная квартира','2 room apartment']){
 run('window.FasGlobalSearch('+JSON.stringify(query)+')');
 assert(run('visibleLots.some(lot=>lot.id===990000007)'),'room-count global query finds an unnumbered apartment title: '+query);
 assert(!run('visibleLots.some(lot=>lot.id===990000003)'),'a three-room apartment on floor two does not match: '+query);
 assert(run('visibleLots.every(lot=>lot.category==="property"&&Number(lot.rooms)===2)'),'all results meet the actual room constraint: '+query);
 assert.equal(h.node('#category').value,'property','room-count queries retain automatic property category: '+query);
 assert(run('visibleLots.every((lot,index)=>!index||distanceToLot(visibleLots[index-1])<=distanceToLot(lot))'),'room filtering preserves nearest-first order: '+query);
}
run("$('#category').value='cars';$('#adv-model').value='Камри';$('#search').value='';render()");assert(run('visibleLots.some(c=>c.id===990000001)'),'advanced model accepts Russian alias');
run("$('#region-filter').value='36';$('#budget').value='3000000';window.FasGlobalSearch('Toyota')");assert.equal(h.node('#region-filter').value,'36');assert.equal(h.node('#budget').value,'3000000');assert(run("visibleLots.every(c=>getRegionCode(c)==='36'&&current(c)<=3000000)"));
const criteria={query:'Камри дизель',values:Object.fromEntries(run('ADV_IDS').map(key=>[key,'']))};
assert(run('matchesSavedSearch('+JSON.stringify(criteria)+',cars.find(c=>c.id===990000001))'),'saved search uses the same bilingual keyword logic');
run("cars.find(c=>c.id===990000006).description='Уникальная обивка бордового цвета';saveLots();window.FasGlobalSearch('бордового')");assert(run('visibleLots.some(c=>c.id===990000006)'),'edited public text refreshes cached search data');
console.log('PASS: shared bilingual catalogue/saved/advanced search, structured room-count phrases and nearest ordering, all asset types and fields, category reset, retained region/budget and edited-record cache invalidation.');
