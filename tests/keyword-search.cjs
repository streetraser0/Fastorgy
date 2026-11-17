const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),prices=new Map();let priceReads=0;
const context={window:{},Date,console,current:lot=>{priceReads++;return prices.get(lot.id)??lot.price},getRegionCode:lot=>lot.regionCode||'',regionName:code=>({'36':'Воронежская область','77':'Москва','55':'Омская область'}[code]||'')};
vm.createContext(context);
for(const file of ['category-tree.js','search-intent.js','keyword-search.js'])vm.runInContext(fs.readFileSync(path.join(root,'dist',file),'utf8'),context,{filename:file});
const S=context.window.FasKeywordSearch,T=context.window.FasCategories;
assert(S);for(const method of ['compile','matches','matchesText','matchesCategory','inferCategory','invalidate'])assert.equal(typeof S[method],'function',method);
{
 const apartment={id:90010,category:'property',subcategory:'property',name:'Квартира с лоджией',rooms:2,floor:7,area:65,price:5000000};
 const variants=['2х комнатная квартира','2Х комнатная квартира','2x комнатная квартира','2-х комнатная квартира','2 х комнатная квартира','2хкомнатная квартира','2-комнатная квартира','2‑комнатная квартира','двухкомнатная квартира','двух комнатная квартира','двухкомнатную квартиру','2к квартира','2-к квартира','двушка','двушку','2 bedroom apartment','2-bedroom flat','2bedrooms apartment','2 room apartment'];
 for(const query of variants){
  assert(S.matches(apartment,query),'a natural room phrase uses structured rooms: '+query);
  assert(!S.matches({...apartment,id:90011,rooms:3,floor:2,price:2000000,name:'Квартира, 2 этаж',description:'Название прежнего объявления: 2-комнатная квартира'},query),'room count cannot match a floor, price or stale description: '+query);
  assert(!S.matches({...apartment,id:90012,rooms:12},query),'room counts match exactly: '+query);
 }
 assert.equal(S.compile(variants[0]).intent.criteria.roomsMin,2);assert.equal(S.compile(variants[0]).intent.criteria.roomsMax,2);
 assert(S.matches({id:90013,category:'property',name:'Двухкомнатная квартира с балконом'},'2 room apartment'),'a title remains searchable when structured rooms were not supplied');
 for(const [count,word]of [[1,'однокомнатная'],[3,'трёхкомнатная'],[4,'четырёхкомнатная']]){assert(S.matches({...apartment,id:90100+count,rooms:count},word+' квартира'));assert(!S.matches(apartment,word+' квартира'))}
 assert(S.matches({id:90014,category:'houses',subcategory:'houses',name:'Дом с садом',rooms:2},'2 room house'),'room normalization does not force houses into apartments');
 assert(!S.compile('2x 3').terms.some(term=>term.measure==='rooms'),'dimensions without room words are not apartment requirements');
 assert(!S.compile('BMW X2').terms.some(term=>term.measure==='rooms'),'vehicle model digits remain unchanged');
}
const lots=[
 {id:101,category:'cars',subcategory:'cars',name:'Toyota Camry',brand:'Toyota',model:'Camry',manufacturer:'Toyota Motor',year:2021,city:'Воронеж',regionCode:'36',fuel:'diesel',transmission:'auto',drive:'awd',powerHp:150,mileage:72000,price:1000000,startPrice:900000,step:10000,deposit:50000,buyNowPrice:1200000,reservePrice:950000,condition:'used',sellerType:'bank',bank:'Ромашка Банк',vin:'JTNB11HK203123456',description:'Сохранён салон, проведено обслуживание',defects:'Царапина на крыле',completeness:'Два ключа',docs:'ПТС оригинал',address:'Садовая 5',inspection:'Осмотр в субботу',deliveryRegions:'Липецкая область',deliveryNotes:'Погрузка краном',pickup:true,delivery:true,publicContact:'+7 999 000-11-22'},
 {id:102,category:'cars',name:'BMW X5',brand:'BMW',model:'X5',year:2020,city:'Москва',regionCode:'77',fuel:'petrol',transmission:'auto',powerHp:282,price:3500000},
 {id:103,category:'cars',name:'Mercedes-Benz E 200',brand:'Mercedes-Benz',model:'E 200',year:2019,city:'Москва',price:2800000},
 {id:104,category:'cars',name:'Volkswagen Passat',brand:'Volkswagen',model:'Passat',year:2018,city:'Омск',price:1700000},
 {id:105,category:'trucks',name:'КАМАЗ 5490',brand:'КАМАЗ',model:'5490',city:'Воронеж',regionCode:'36',fuel:'diesel',transmission:'manual',powerHp:401,mileage:160000,price:4200000,sellerType:'leasing'},
 {id:106,category:'property',subcategory:'property',name:'Квартира на набережной',city:'Москва',regionCode:'77',area:78.5,rooms:3,floor:7,totalFloors:12,cadastralNumber:'77:08:0012345:67',year:2017,price:12000000,description:'Вид на реку'},
 {id:107,category:'property',subcategory:'houses',name:'Дом с садом',city:'Воронеж',area:165,rooms:5,year:2018,price:8500000},
 {id:108,category:'commercial',subcategory:'land',name:'Земельный участок',city:'Омск',regionCode:'55',area:1200,price:2700000},
 {id:109,category:'equipment',name:'Станок фрезерный',model:'Mill 500',manufacturer:'Siemens',powerKw:15,serialNumber:'SN-MILL-9001',city:'Воронеж',price:2400000,condition:'new'},
 {id:110,category:'other',subcategory:'computers',name:'Ноутбук Lenovo ThinkPad',brand:'Lenovo',model:'ThinkPad',manufacturer:'Lenovo',serialNumber:'LNV-22-XY',year:2022,city:'Москва',price:55000},
 {id:111,category:'other',subcategory:'furniture',name:'Диван модульный',brand:'Hoff',model:'Модульный диван',city:'Омск',price:32000,condition:'used'},
 {id:112,category:'vessels',name:'Катер Bayliner',brand:'Bayliner',model:'VR5',city:'Омск',price:3000000},
 {id:113,category:'machinery',name:'Экскаватор JCB',brand:'JCB',model:'JS 220',city:'Воронеж',price:6800000},
];
lots.forEach(T.normalizeLot);
const byId=id=>lots.find(lot=>lot.id===id);
const find=query=>{const compiled=S.compile(query);return lots.filter(lot=>S.matches(lot,compiled)).map(lot=>lot.id)};
const has=(id,query)=>assert(S.matches(byId(id),S.compile(query)),id+' matches '+query);
assert.deepEqual(find('Toyota'),find('Тойота'));
for(const query of ['тойота','ТОЙОТА','Toyota, CAMRY!','Камри Тойота','Toyota Камри','дизельный автомат Тойота 2021','Воронеж Toyota diesel','Тойота Воронеже','Toyota Voronezh'])has(101,query);
for(const [id,queries] of [[102,['бмв','БМВ X5']],[103,['Мерседес','Mercedes E 200']],[104,['Фольксваген','VW Passat']]])for(const query of queries)has(id,query);
// A model code remains one requirement even when speech/typing separates its digit.
const ravVariants=['RAV4','RAV 4','RAV-4','РАВ4','Рав 4','Рав-4'];
for(const storedModel of ravVariants){
 const rav={id:114,category:'cars',name:'Toyota '+storedModel,brand:'Toyota',model:storedModel,city:'Воронеж',regionCode:'36',price:2100000};
 for(const queryModel of ravVariants)for(const suffix of [' Воронеж',' Voronezh'])assert(S.matches(rav,queryModel+suffix),storedModel+' matches '+queryModel+suffix);
 for(const query of ['Тойота Рав 4 Воронеж','Toyota RAV 4 Voronezh','Воронеж Рав-4 Тойота'])assert(S.matches(rav,query),storedModel+' matches compound '+query);
 assert(!S.matches(rav,'RAV 4 Москва'),'model spacing preserves every location keyword');
 if(/^[A-Za-zА-Яа-я]+[0-9]+$/.test(storedModel))assert(!S.matches(rav,'4'),'a compact model digit does not become an unrelated numeric field');
}
for(const model of ['RAV40','RAV14','RAV5','RAV']){
 const unrelated={id:115,category:'cars',name:'Toyota '+model,model,description:'Четыре места',rooms:4,city:'Воронеж',price:2100000};
 for(const query of ['RAV4','Рав4','RAV 4','Рав-4'])assert(!S.matches(unrelated,query),'model '+model+' plus another 4 must not impersonate RAV4');
}
for(const [stored,query] of [['Toyota RAV4','Рав 4'],['Toyota РАВ-4','RAV4'],['BMW X5','БМВ Икс 5'],['BMW X 5','БМВ Х5']])assert(S.matchesText(stored,query),'model text '+stored+' / '+query);
assert(!S.matches(byId(101),'Toyota BMW'),'keywords use AND instead of unrelated OR');
assert(!S.matches(byId(101),'Toyota Москва'),'words may not come from another lot');
assert.equal(S.matches(byId(101),'   '),true);

for(const [id,queries] of [
 [101,['car Toyota','bank Toyota','used Camry','automatic diesel','полный привод','150 hp','72000 km','1000000','1 000 000','900000','10000','50000','1200000','950000','JTNB11HK203123456','Садовая','субботу','Липецкая','погрузка','царапина','ключа','ПТС','самовывоз','delivery','79990001122','Ромашка']],
 [105,['truck 5490','leasing КАМАЗ','manual diesel','401 hp']],
 [106,['apartment Москва','квартира 78.5','3 rooms','77:08:0012345:67']],
 [107,['house 165','дом 2018']],
 [108,['land 1200','земельный участок']],
 [109,['equipment Siemens','станок 15','SN-MILL-9001','new Siemens']],
 [110,['laptop Lenovo','computer ThinkPad','LNV-22-XY']],
 [111,['furniture Hoff','sofa Омск']],
 [112,['boat Bayliner']],
 [113,['excavator JCB']],
])for(const query of queries)has(id,query);
const numeric={id:999,category:'equipment',name:'Механизм',price:150000,powerHp:90};
assert.equal(S.matches(numeric,'150'),false,'numeric query does not prefix-match a larger price');
assert.equal(S.matches(numeric,'150 hp'),false,'price prefix cannot impersonate a power value');
assert.equal(S.matches(numeric,'90 hp'),true);

const privateData={id:9999,category:'cars',name:'Toyota',price:100,sellerOwnerId:'privateownerneedle',mediaRefs:[{id:'medialocalneedle'}],personalNote:'privateratingneedle',profile:{phone:'privatephoneneedle'},ownerPhone:'privateownerphoneneedle'};
for(const query of ['privateownerneedle','medialocalneedle','privateratingneedle','privatephoneneedle','privateownerphoneneedle'])assert.equal(S.matches(privateData,query),false,'internal data is excluded: '+query);
const changed={id:12345,category:'equipment',name:'Компрессор',description:'Старое описание',price:1000};
assert(S.matches(changed,'компрессор'));changed.description='Уникальная обновлённая характеристика';S.invalidate();assert(S.matches(changed,'обновленная'),'explicit invalidation updates public text');
prices.set(12345,4321);assert(S.matches(changed,'4321'),'current displayed price remains searchable after a bid');

for(const [id,query] of [['cars','Toyota'],['transport','Тойота'],['cars','car'],['trucks','truck'],['houses','house'],['real_estate','property'],['equipment','equipment'],['computers','laptop'],['electronics','electronics'],['furniture','furniture']])assert(S.matchesCategory(T.get(id),query,T.groupOf(id)?.label),id+' category matches '+query);
assert.equal(S.matchesCategory(T.get('phones'),'Toyota','Электроника'),false,'brand does not turn unrelated category into cars');
for(const [query,category] of [
 ['Рав 4 Воронеж','cars'],['RAV-4 Voronezh','cars'],['Тойота','transport'],['Toyota forklift','machinery'],['Тойота погрузчик','machinery'],['Mercedes truck','trucks'],['JCB','machinery'],
 ['квартира Воронеж','property'],['house Москва','houses'],['дом','houses'],['участок','land'],['гараж','garages'],['коммерческая недвижимость','commercial'],['недвижимость','real_estate'],
 ['станок Siemens','equipment'],['смартфон Samsung','phones'],['tablet','phones'],['ноутбук Lenovo','computers'],['сервер','computer_parts'],['материнская плата','computer_parts'],['фотоаппарат','cameras'],['телевизор','audio_video'],['PlayStation','games'],['принтер','office_electronics'],
 ['диван','furniture'],['холодильник','home_appliances'],['бытовая техника','home_appliances'],['посуда','kitchenware'],['постельное белье','home_textiles'],['цемент','building_materials'],['теплица','garden'],['инструмент','tools'],['товары для дома','home_garden'],
 ['готовый бизнес','ready_business'],['сырье','business_materials'],['бизнес','business'],['прицеп','trailers'],['снегоход','snowmobiles'],['квадроцикл','atvs'],['мотоцикл','motorcycles'],['катер','vessels'],
 ['телефон ноутбук','electronics'],['квартира дом','real_estate'],['машина телевизор', 'audio_video'],['домашний текстиль','home_textiles'],['сад и огород','garden'],
])assert.equal(S.inferCategory(query),category,'confident category '+query);
for(const query of ['Тойота Рав 4 Воронеж','Toyota RAV 4 Voronezh','Тойота РАВ-4','Toyota РАВ4','Тойота RAV4'])assert.equal(S.inferCategory(query),'cars','specific model narrows a mixed maker: '+query);
assert.equal(S.inferCategory('Toyota'),'transport','a mixed make without a model stays broad');
assert.equal(S.inferCategory('SITRAK RAV4'),'transport','contradictory truck-only make and passenger model do not force a wrong leaf');
for(const query of ['', 'Воронеж', '2021', '150 hp','новый','Москва 1000000', 'Toyota BMW','машины']){
 // Multiple car brands still express one vehicle category, unlike unknown text.
 if(query==='Toyota BMW')assert.equal(S.inferCategory(query),'transport');else assert.equal(S.inferCategory(query),null,'no category guess from '+query);
}
for(const query of ['car camera','квартира смартфон','грузовик диван'])assert.equal(S.inferCategory(query),null,'conflicting asset types do not silently pick one '+query);
assert(S.matches(byId(111),'товары для дома'),'group keyword matches member inventory');
for(const [subcategory,query] of [['cameras','camera'],['audio_video','аудио'],['games','игры'],['kitchenware','посуда'],['home_textiles','домашний текстиль'],['building_materials','стройматериалы'],['garden','сад'],['home_appliances','бытовая техника'],['ready_business','готовый бизнес'],['business_materials','сырье']])assert(S.matches({id:55555,category:'other',subcategory,name:'Имущество',price:1000},query),'category type keyword '+subcategory+' / '+query);
assert(!S.matches({id:55556,category:'other',subcategory:'home_appliances',name:'Стиральная машина',price:1000},'холодильник'),'a home-appliance category is not proof that the asset is a refrigerator');
const catalogue=JSON.parse(fs.readFileSync(path.join(root,'dist/data/car-catalog.json'),'utf8'));
for(const [i,make] of catalogue.makes.entries()){
 const lot={id:20000+i,category:'cars',name:'Автомобиль',brand:make.name};
 for(const alias of [make.name,...make.aliases].filter(value=>/[A-Za-zА-Яа-яЁё0-9]/.test(value)))assert(S.matches(lot,alias),'catalogue make/alias remains searchable: '+make.name+' / '+alias);
}
for(const [text,query] of [['Toyota Camry','Тойота Камри'],['Дизельный погрузчик','diesel forklift'],['150 hp','150 hp'],['78.5 sqm','78.5 sqm'],['Цена 1 000 000','1000000']])assert(S.matchesText(text,query),'plain text query '+text+' / '+query);
assert.equal(S.matchesText('Toyota Camry','Toyota BMW'),false,'plain text keeps every keyword requirement');
// Plain-word lookups do not calculate dynamic prices or require a numeric index.
const lazy={id:99001,category:'equipment',name:'Компрессор Atlas',description:'Ресурс 23000 km',powerHp:150,price:1000};priceReads=0;
assert(S.matches(lazy,'Atlas'));assert.equal(priceReads,0,'plain keywords skip current-price lookup');
assert(S.matches(lazy,'hp'),'unit-only query builds structured measure tags after a word search');
assert(S.matches(lazy,'150 hp'),'structured power remains searchable after lazy indexing');
assert(S.matches(lazy,'23000 km'),'text measurements remain searchable after lazy indexing');
prices.set(lazy.id,43210);assert(S.matches(lazy,'43210 rub'),'dynamic price is evaluated when the numeric query needs it');
assert(!S.matches(lazy,'2300 km'),'lazy measurements keep exact numeric comparison');
console.log('PASS: bilingual and mixed-order keywords, vehicle aliases, all asset types/public fields, exact numbers, private-field exclusion, cache refresh and category discovery.');
