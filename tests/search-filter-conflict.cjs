const assert=require('assert/strict'),fs=require('fs'),vm=require('vm');
const {boot}=require('./helpers/category-seller-harness.cjs');
const h=boot(),run=h.run;
assert.equal(typeof h.context.window.FasSyncKeywordCategory,'function','main search must expose its shared category synchronization');
const originalCount=run('cars.length'),now=Date.now();
const base={bank:'Тестовый банк',sellerType:'bank',status:'live',city:'Воронеж',regionCode:'36',price:1000000,start:1000000,step:1000,deposit:0,year:2022,condition:'used',ends:new Date(now+86400000).toISOString(),demo:false};
const fixtures=[
 {id:990010001,category:'cars',subcategory:'cars',name:'Toyota RAV4',brand:'Toyota',model:'RAV4',fuel:'diesel',transmission:'auto'},
 {id:990010002,category:'other',subcategory:'cameras',name:'Фотоаппарат Canon EOS',brand:'Canon',model:'EOS'},
 {id:990010003,category:'property',subcategory:'property',name:'Квартира с балконом',area:70,rooms:2},
 {id:990010004,category:'other',subcategory:'phones',name:'Смартфон Samsung Galaxy',brand:'Samsung',model:'Galaxy'},
 {id:990010005,category:'equipment',subcategory:'equipment',name:'Фрезерный станок Haas',manufacturer:'Haas'},
 {id:990010006,category:'other',subcategory:'furniture',name:'Диван для гостиной',manufacturer:'Hoff'}
].map(lot=>({...base,...lot}));
run('cars.push(...'+JSON.stringify(fixtures)+');ends.push(...cars.slice(-6).map(c=>Date.parse(c.ends)));saveLots()');
const sync=value=>{h.node('#search').value=value;run('window.FasSyncKeywordCategory('+JSON.stringify(value)+');render()')};
const submit=value=>{h.node('#search').value=value;h.node('#filters').onsubmit({preventDefault(){}})};

// Browsing a chosen category without a keyword still respects that category.
h.node('#category').value='cameras';sync('');
assert.equal(h.node('#category').value,'cameras');
assert(run('visibleLots.some(c=>c.id===990010002)'));
assert(!run('visibleLots.some(c=>c.id===990010001)'));

// Reproduce the screenshot with a real test record, never a fabricated production result.
h.node('#brand').value='Canon';h.node('#city').value='Воронеж';h.node('#region-filter').value='36';h.node('#budget').value='3000000';
for(const id of ['model','maker','fuel','transmission','drive','mileage-min','power-min','area-min','rooms-min','floor-min','kw-min'])h.node('#adv-'+id).value='несовместимое значение';
h.node('#adv-price-min').value='100000';h.node('#adv-price-max').value='2500000';h.node('#adv-year-min').value='2020';h.node('#adv-condition').value='used';
sync('Рав 4 Воронеж');
assert.equal(h.node('#category').value,'cars');assert.equal(h.node('#brand').value,'');
for(const id of ['model','maker','fuel','transmission','drive','mileage-min','power-min','area-min','rooms-min','floor-min','kw-min'])assert.equal(h.node('#adv-'+id).value,'','incompatible type-specific filter cleared: '+id);
for(const [id,value]of [['city','Воронеж'],['region-filter','36'],['budget','3000000'],['adv-price-min','100000'],['adv-price-max','2500000'],['adv-year-min','2020'],['adv-condition','used']])assert.equal(h.node('#'+id).value,value,'independent constraint preserved: '+id);
assert(run('visibleLots.some(c=>c.id===990010001)'),'Russian spaced RAV4 query must find the matching lot after category synchronization');

// Enter/button submission uses the same inference for new keyword text.
for(const query of ['RAV4 Voronezh','RAV 4 Воронеж','Рав-4 Воронеж','Тойота Рав 4 Воронеж']){
 h.node('#category').value='cameras';submit(query);
 assert.equal(h.node('#category').value,'cars',query);
 assert(run('visibleLots.some(c=>c.id===990010001)'),query);
}

// A user can intentionally narrow an unchanged query after automatic selection.
h.node('#category').value='cameras';h.node('#category').onchange();submit(h.node('#search').value);
assert.equal(h.node('#category').value,'cameras','unchanged query must not fight explicit category selection');
sync('Квартира Воронеж');assert.equal(h.node('#category').value,'property');assert(run('visibleLots.some(c=>c.id===990010003)'));
sync('смартфон Samsung Воронеж');assert.equal(h.node('#category').value,'phones');assert(run('visibleLots.some(c=>c.id===990010004)'));
sync('фрезерный станок Воронеж');assert.equal(h.node('#category').value,'equipment');assert(run('visibleLots.some(c=>c.id===990010005)'));
sync('диван Воронеж');assert.equal(h.node('#category').value,'furniture');assert(run('visibleLots.some(c=>c.id===990010006)'));
sync('Воронеж');assert.equal(h.node('#category').value,'','unrecognized replacement clears the previous automatic category');
sync('Рав4');assert.equal(h.node('#category').value,'cars');sync('');assert.equal(h.node('#category').value,'','clearing keyword clears its automatically selected category');
h.node('#category').value='cameras';h.node('#category').onchange();sync('');assert.equal(h.node('#category').value,'cameras');
assert.equal(run('cars.length'),originalCount+fixtures.length,'category inference must not manufacture inventory');

// The stale category restored from the device must be reconciled before rendering.
const restored=boot({records:{'fas-search-preferences-v1':JSON.stringify({version:1,basic:{search:'Рав 4 Воронеж',category:'cameras','region-filter':'36',budget:'3000000',city:'Воронеж',brand:'Canon'},advanced:{model:'EOS','price-min':'100000'},tab:'all'})}});
restored.node('#modal-content').querySelector=()=>null;
restored.node('#modal').removeAttribute=function(name){delete this[name]};
vm.runInContext(fs.readFileSync('dist/app-ui.js','utf8'),restored.context);
assert.equal(restored.node('#search').value,'','a new page does not restore the legacy keyword');
assert.equal(restored.node('#category').value,'','a legacy query-derived category is not restored without its query');
restored.node('#search').value='Рав 4 Воронеж';restored.node('#filters').onsubmit({preventDefault(){}});
assert.equal(restored.node('#category').value,'cars','entering a new vehicle query repairs contradictory old camera filters');
assert.equal(restored.node('#brand').value,'');assert.equal(restored.node('#adv-model').value,'');
assert.equal(restored.node('#region-filter').value,'36');assert.equal(restored.node('#budget').value,'3000000');assert.equal(restored.node('#city').value,'Воронеж');assert.equal(restored.node('#adv-price-min').value,'100000');
console.log('PASS: screenshot search scope, RAV4 spellings and all asset types, explicit narrowing, independent filters, restored preferences and inventory integrity.');
