const assert=require('node:assert/strict');
const {boot}=require('./helpers/category-seller-harness.cjs');
const h=boot(),run=h.run,S=h.context.window.FasKeywordSearch,T=h.context.window.FasCategories;
const inventory=run('cars.filter(lot=>lot.category==="cars")');
const profileCounts={};for(const lot of inventory){if(lot.bodyType)profileCounts[lot.bodyType]=(profileCounts[lot.bodyType]||0)+1}
assert(inventory.some(lot=>lot.bodyType==='sedan'),'shipped catalogue contains verified sedans');
for(const lot of inventory){if(lot.demoPhotoProfile==='assets/photos/cars-1.jpg'){assert.equal(lot.bodyType,'sedan');assert.equal(lot.color,'white')}if(lot.demoPhotoProfile==='assets/photos/cars-2.jpg'){assert.equal(lot.bodyType,'liftback');assert.equal(lot.color,'black')}if(lot.demoPhotoProfile==='assets/photos/cars-3.jpg'){assert.equal(lot.bodyType,'coupe');assert.equal(lot.color,'gray')}}
for(const id of [1042,1043,1045])assert.equal(inventory.find(lot=>lot.id===id)?.bodyType,undefined,'ambiguous original model does not acquire an invented body type');
for(const id of [1046,1047]){const lot=inventory.find(lot=>lot.id===id);assert.equal(lot.bodyType,'sedan');assert.equal(lot.color,undefined)}
assert(inventory.filter(lot=>S.matches(lot,'Седан')).length>0);assert(inventory.filter(lot=>S.matches(lot,'все седаны рядом')).length>0);
const base={bank:'Контрольный продавец',sellerType:'bank',status:'live',price:1000000,start:1000000,step:1000,deposit:0,ends:'2099-01-01T00:00:00Z',demo:false,category:'cars',subcategory:'cars',city:'Воронеж',regionCode:'36',latitude:51.66,longitude:39.2};
const rows=[
 {id:999795001,name:'Toyota Camry',brand:'Toyota',model:'Camry',bodyType:'sedan',color:'red'},
 {id:999795002,name:'BMW 530i',brand:'BMW',model:'530i',bodyStyle:'Седан',colour:'Красная',city:'Москва',regionCode:'77',latitude:55.756,longitude:37.617},
 {id:999795003,name:'Audi A6',brand:'Audi',model:'A6',body:'saloon',цвет:'красный',city:'Казань',regionCode:'16',latitude:null,longitude:null},
 {id:999795004,name:'Kia K5',brand:'Kia',model:'K5','Тип кузова':'седан','Цвет кузова':'синий',city:'Новосибирск',regionCode:'54',latitude:null,longitude:null},
 {id:999795005,name:'Купе, в описании упомянут седан',brand:'Mercedes-Benz',model:'AMG GT',bodyType:'coupe',color:'blue',description:'Седан красный, универсал — слова для проверки ложных совпадений.'},
 {id:999795006,name:'Красный седан — ошибочный заголовок',brand:'Toyota',model:'RAV4',bodyType:'SUV',color:'white'},
 {id:999795007,name:'BMW 5 серии',brand:'BMW',model:'530i',description:'Можно сравнить с седаном красного цвета.'},
 {id:999795008,name:'Автомобиль без известного города',brand:'Honda',model:'Accord',body_type:'SEDAN',body_color:'red',city:'Место не указано',regionCode:'',latitude:null,longitude:null},
 {id:999795009,name:'Универсал',brand:'Volvo',model:'V60',bodyType:'station wagon',color:'red'},
 {id:999795010,name:'Красный диван',category:'other',subcategory:'furniture',color:'red'},
 {id:999795011,name:'Красный седан Toyota',brand:'Toyota',model:'Corolla'},
 {id:999795012,name:'Белая квартира',category:'property',subcategory:'property',цвет:'white'}
].map(lot=>({...base,...lot}));
run('cars='+JSON.stringify(rows)+';ends.length=0;cars.forEach(lot=>ends.push(Date.parse(lot.ends)));window.FasKeywordSearch.invalidate();window.FasSubscriptionCache.invalidate();userGeo={point:[51.66,39.2],approximate:false};$("#sort").value="nearest";');
const set=values=>[...values].sort((a,b)=>a-b),ids=()=>Array.from(run('visibleLots.map(lot=>lot.id)'));
const sedans=[999795001,999795002,999795003,999795004,999795008,999795011],redSedans=[999795001,999795002,999795003,999795008,999795011];
function search(query,expected){run('applyKeywordSearch('+JSON.stringify(query)+')');assert.deepEqual(set(ids()),set(expected),query);const distances=Array.from(run('visibleLots.map(distanceToLot)'));for(let i=1;i<distances.length;i++)assert(distances[i]>=distances[i-1],query+' stays nearest-first across all cities');return distances}
for(const query of ['Седан','седаны','sedan','sedans','saloon','все седаны рядом','all sedans nearby','в кузове седан']){const distances=search(query,sedans);assert.equal(distances.at(-1),Infinity,'unknown locations remain last');assert.equal(h.node('#category').value,'cars')}
for(const query of ['Красный седан','красная машина седан','red sedan','красного цвета седан']){search(query,redSedans)}
for(const query of ['Универсал','универсалы','station wagon','все универсалы рядом','красный универсал','red wagon','универсал красного цвета'])search(query,[999795009]);
for(const query of ['купе','coupe','coupé','синее купе'])search(query,[999795005]);
for(const query of ['SUV','кроссовер','белая машина'])search(query,[999795006]);
search('красная машина',[...redSedans,999795009]);
search('красный',[...redSedans,999795009,999795010]);assert.equal(h.node('#category').value,'','a color alone does not force cars');
search('белая',[999795006,999795012]);assert.equal(S.inferCategory('красная'),null);
assert(S.matchesCategory(T.get('cars'),'седаны'));assert(!S.matchesCategory(T.get('equipment'),'седан'));assert(S.matches(rows[0],'red'));assert(!S.matches(rows[6],'седан'),'unverified body is never guessed from a model');assert(!S.matches(rows[6],'красный'),'incidental description is not a color attribute');
run('userGeo=null;userRegion={code:"",scope:"all"}');search('все седаны рядом',sedans);assert.equal(run('userOrigin()'),null);assert(run('visibleLots.every(lot=>!Number.isFinite(distanceToLot(lot)))'),'no guessed visitor coordinates');
assert(!S.matches({...base,name:'Красный седан',bodyType:'не указан',color:'не указан'},'седан'),'explicit unknown body stays unknown even under a misleading title');
assert(!S.matches({...base,name:'Красный седан',bodyType:'не указан',color:'не указан'},'красный'),'explicit unknown color stays unknown even under a misleading title');
// Absent structured/title attributes may use only strong primary-attribute
// declarations from the public description; comparisons and accessories do not.
const described=(description,extra={})=>({...base,id:999795099,name:'Контрольный объект',description,...extra});
const labelled=described('Описание автомобиля.\nЦвет кузова: красный.\nТип кузова: седан.');assert(S.matches(labelled,'красный седан'));
assert(S.matches(described('Цвет: синий; Кузов: универсал'),'синий универсал'));
const upholstery=described('Уникальная обивка бордового цвета',{category:'other',subcategory:'furniture',name:'Диван'});assert(S.matches(upholstery,'бордового'),'a declared primary furniture upholstery color remains searchable');
assert(S.matches(described('Цвет обивки: зеленый',{category:'other',subcategory:'furniture',name:'Диван'}),'зеленый'));
for(const description of ['Цвет салона: красный; Цвет чехлов: красный.','Обивка бордового цвета. Чехлы красного цвета.','Можно сравнить с седаном красного цвета.']){const lot=described(description);assert(!S.matches(lot,'красный'),'interior/accessory/comparison is not the body color: '+description);assert(!S.matches(lot,'бордовый'));assert(!S.matches(lot,'седан'))}
assert(!S.matches(described('Обивка бордового цвета',{category:'other',subcategory:'phones',name:'Смартфон'}),'бордовый'),'upholstery fallback is limited to furniture');
for(const extra of [{color:'blue',bodyType:'coupe'},{color:'не указан',bodyType:'не указан'}]){const lot=described('Цвет кузова: красный; Кузов: седан',extra);assert(!S.matches(lot,'красный'));assert(!S.matches(lot,'седан'))}
assert(!S.matches(described('Цвет: красный; Кузов: внедорожник',{name:'Белый седан'}),'красный'));assert(!S.matches(described('Цвет: красный; Кузов: внедорожник',{name:'Белый седан'}),'SUV'),'title attributes outrank description fallback');
for(const description of ['Цвет: не красный','Цвет: красный или синий','Цвет: красный; Цвет: синий'])assert(!S.matches(described(description),'красный'),'negated or conflicting declared colors remain unknown: '+description);
assert(!S.matches(described('Кузов: седан или универсал'),'седан'));
upholstery.description='Уникальная обивка зеленого цвета';S.invalidate();assert(!S.matches(upholstery,'бордового'));assert(S.matches(upholstery,'зеленый'),'edited declarations refresh through normal invalidation');
assert.equal(run('cars.length'),rows.length,'search never manufactures inventory');
console.log('PASS: body/color semantic aliases and combinations, explicit-field priority, honest unknowns, verified shipped photo metadata '+JSON.stringify(profileCounts)+', actual main inference and nearest-first multi-city results with unknown locations last.');
