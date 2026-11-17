const assert=require('node:assert/strict');
const {boot}=require('./helpers/category-seller-harness.cjs');
const h=boot(),run=h.run;
const base={bank:'Тестовый продавец',sellerType:'private',status:'live',city:'Москва',regionCode:'77',price:1000000,start:1000000,step:1000,deposit:0,ends:new Date(Date.now()+86400000).toISOString(),demo:false,category:'property',subcategory:'property',floor:9};
const fixtures=[
 {...base,id:991270001,name:'Правильный кадастровый район',cadastralNumber:'77:08:0012345:67'},
 {...base,id:991270002,name:'Другой кадастровый район',cadastralNumber:'77:67:0012345:08'},
 {...base,id:991270003,name:'Тягач',category:'trucks',subcategory:'trucks',vin:'JTNB11HK203123456',serialNumber:'SN-MILL-9001'}
];
run('cars='+JSON.stringify(fixtures)+';ends.length=0;cars.forEach(lot=>ends.push(Date.parse(lot.ends)));invalidateSubscriptionInventory();window.FasKeywordSearch.invalidate();');
for(const [query,expected] of [
 ['77:08',[991270001]],['77:08:0012345',[991270001]],['77:08:0012345:',[991270001]],['77:08:001',[]],
 ['77:08:0012345:67:9',[]],['77:08::67',[]],
 ['VIN № JTNB11HK203123456',[991270003]],['VIN: «JTNB11HK203123456».',[991270003]],
 ['Кадастровый номер № 77:08:0012345:67',[991270001]],['«77:08:0012345:67».',[991270001]],
 ['Serial № SN-MILL-9001',[991270003]],['Серийный номер № SN-MILL-9001',[991270003]],['Serial No. SN-MILL-9001',[991270003]]
]){
 run('applyKeywordSearch('+JSON.stringify(query)+')');
 assert.deepEqual(Array.from(run('visibleLots.map(lot=>lot.id)')),expected,query+' uses the true main filtering path');
 assert.equal(run('window.FasKeywordSearch.compile('+JSON.stringify(query)+').corrections.length'),0,'identifiers do not receive spelling corrections');
}
assert.equal(run('cars.length'),fixtures.length,'search does not manufacture matches');
console.log('PASS: actual search honors copied №/No. labels, outer punctuation and ordered cadastral prefixes, rejecting invalid full shapes instead of matching unrelated numeric fields.');
