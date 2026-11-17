const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
const {boot}=require(path.join(root,'tests/helpers/category-seller-harness.cjs'));const h=boot(),c=h.context;
const now=Date.now(),base={bank:'Проверочный продавец',sellerType:'bank',status:'live',startsAt:new Date(now-3600000).toISOString(),ends:new Date(now+86400000).toISOString(),step:10000,deposit:0,description:'Проверочный актив. Сведения заданы только для аудита.',city:'Воронеж',regionCode:'36',latitude:51.665,longitude:39.205,year:2020,condition:'used',price:2000000};
const lot=(id,category,subcategory,name,extra={})=>({...base,id,category,subcategory,name,...extra});
const fixtures=[
 lot(990880001,'cars','cars','Toyota Camry',{brand:'Toyota',model:'Camry',bodyType:'sedan',color:'red',fuel:'petrol',transmission:'auto',price:1800000}),
 lot(990880002,'cars','cars','Kia K5',{brand:'Kia',model:'K5',bodyType:'sedan',color:'blue',fuel:'petrol',transmission:'auto',price:1600000}),
 lot(990880003,'cars','cars','Lada Vesta SW',{brand:'Lada',model:'Vesta SW',bodyType:'wagon',color:'red',fuel:'petrol',transmission:'manual',price:1300000,latitude:51.70,longitude:39.20}),
 lot(990880004,'cars','cars','Subaru Legacy Wagon',{brand:'Subaru',model:'Legacy',bodyType:'wagon',color:'white',price:2200000,city:'Москва',regionCode:'77',latitude:55.756,longitude:37.617}),
 lot(990880005,'cars','cars','Ford Focus',{brand:'Ford',model:'Focus',bodyType:'wagon',color:'black',price:600000,city:'Место не указано',regionCode:'',latitude:null,longitude:null}),
 lot(990880006,'cars','cars','BMW 320i',{brand:'BMW',model:'320i',bodyType:'sedan',color:'blue',transmission:'auto',year:2020,price:3500000}),
 lot(990880007,'cars','cars','BMW 520i',{brand:'BMW',model:'520i',bodyType:'sedan',color:'red',transmission:'auto',year:2021,mileage:2020,price:5000000}),
 lot(990880008,'cars','cars','BMW 318i',{brand:'BMW',model:'318i',bodyType:'sedan',color:'red',transmission:'manual',year:2020,price:2000000}),
 lot(990880009,'cars','cars','Mercedes-Benz C 200',{brand:'Mercedes-Benz',model:'C 200',bodyType:'coupe',color:'red',transmission:'auto',year:2020,price:2020000}),
 lot(990880010,'cars','cars','BMW 730i',{brand:'BMW',model:'730i',bodyType:'sedan',color:'black',transmission:'auto',year:2018,price:2020}),
 lot(990880020,'property','property','Квартира с балконом',{rooms:2,area:60,floor:3,totalFloors:9,price:4500000}),
 lot(990880021,'property','property','Квартира с террасой',{rooms:2,area:70,floor:5,totalFloors:9,price:6000000}),
 lot(990880022,'property','property','Квартира в центре',{rooms:3,area:55,floor:4,totalFloors:5,price:4000000}),
 lot(990880023,'property','property','Квартира-студия',{rooms:0,area:20,floor:2,totalFloors:5,price:2000000}),
 lot(990880024,'property','property','Квартира большой площади',{rooms:2,area:95,floor:4,totalFloors:5,price:4900000}),
 lot(990880025,'property','property','Квартира без обмеров',{rooms:2,area:null,price:4700000}),
 lot(990880026,'property','houses','Жилой дом',{rooms:2,area:65,totalFloors:2,price:4200000}),
 lot(990880030,'machinery','machinery','Экскаватор JCB JS220',{brand:'JCB',model:'JS220',fuel:'diesel',price:2700000}),
 lot(990880031,'machinery','machinery','Экскаватор Hyundai R210',{brand:'Hyundai',model:'R210',fuel:'diesel',price:4200000}),
 lot(990880032,'machinery','machinery','Экскаватор компактный',{brand:'Test',model:'Mini',fuel:'petrol',price:2500000}),
 lot(990880033,'machinery','machinery','Трактор Беларус 82.1',{brand:'Беларус',model:'82.1',fuel:'diesel',price:2100000}),
 lot(990880040,'other','computers','Ноутбук Lenovo ThinkPad',{brand:'Lenovo',model:'ThinkPad',ramGb:16,storageGb:512,screenSize:15.6,price:65000}),
 lot(990880041,'other','computers','Ноутбук Acer',{brand:'Acer',model:'Aspire',ramGb:8,storageGb:16,screenSize:14,price:20000}),
 lot(990880042,'other','computers','Ноутбук ASUS',{brand:'ASUS',model:'VivoBook',ramGb:16,storageGb:256,screenSize:15.6,price:55000}),
 lot(990880043,'other','computers','Ноутбук Dell',{brand:'Dell',model:'Latitude',ramGb:32,storageGb:512,screenSize:15.6,price:85000}),
 lot(990880044,'other','phones','Смартфон Samsung',{brand:'Samsung',model:'Galaxy',ramGb:16,storageGb:256,price:45000}),
 lot(990880050,'cars','cars','Toyota RAV4',{brand:'Toyota',model:'RAV4',bodyType:'suv',color:'red',transmission:'auto',year:2020,price:2800000}),
 lot(990880051,'cars','cars','Audi A4',{brand:'Audi',model:'A4',bodyType:'sedan',year:2020,price:2400000})
];
h.run('cars='+JSON.stringify(fixtures)+';ends.length=0;cars.forEach(lot=>ends.push(Date.parse(lot.ends)));invalidateSubscriptionInventory();window.FasKeywordSearch.invalidate();userGeo={point:[51.6608,39.2003],approximate:false};$("#sort").value="nearest";render();');
// Install the actual typed-input debounce, IME and submit enhancement. No voice API is loaded.
h.node('#modal-content').querySelector=()=>null;for(const id of ['#modal','#grid','#result-count'])h.node(id).removeAttribute=function(name){delete this[name]};
let time=0,timerId=0;const timers=new Map();c.setTimeout=(handler,delay=0)=>{const id=++timerId;timers.set(id,{handler,at:time+delay});return id};c.clearTimeout=id=>timers.delete(id);
vm.runInContext(fs.readFileSync(path.join(dist,'app-ui.js'),'utf8'),c);
const snapshot=()=>({ids:Array.from(h.run('visibleLots.map(lot=>lot.id)')),category:h.node('#category').value,sort:h.node('#sort').value,query:h.node('#search').value,advanced:JSON.parse(h.run('JSON.stringify(readAdvancedFilters().values)')),error:h.run('readAdvancedFilters().error'),countText:h.node('#result-count').textContent});
async function settle(ms=0){time+=ms;for(let cycle=0;cycle<35;cycle++){const jobs=[...timers].filter(([,job])=>job.at<=time);for(const [id,job]of jobs){timers.delete(id);job.handler()}await Promise.resolve()}}
const specs=[
 {query:'красный седан',expected:[990880001,990880007,990880008],criterion:'bodyType=sedan AND color=red; colour/body metadata is intentionally not repeated in fixture titles'},
 {query:'универсал рядом',mustInclude:[990880003],mustExclude:[990880001,990880002,990880006,990880020],orderedRelevant:[990880003,990880004,990880005],criterion:'bodyType=wagon; nearby is an ordering intent, no unstated fixed radius is invented; unknown location follows known positions'},
 {query:'седан до 2 млн',expected:[990880001,990880002,990880008,990880010],criterion:'bodyType=sedan AND currentPrice<=2000000'},
 {query:'двухкомнатная квартира до 5 миллионов',expected:[990880020,990880024,990880025],criterion:'canonical apartment leaf, rooms=2 AND currentPrice<=5000000'},
 {query:'квартира от 40 до 80 м2',expected:[990880020,990880021,990880022],criterion:'canonical apartment leaf AND 40<=area<=80; unknown area is excluded'},
 {query:'экскаватор дизель до 3 млн',expected:[990880030],criterion:'excavator object type AND fuel=diesel AND currentPrice<=3000000'},
 {query:'ноутбук 16 гб',expected:[990880040,990880042],criterion:'laptop, RAM=16 GB; 16 GB disk with 8 GB RAM is a negative control',ambiguity:'Unqualified GB could denote storage in some product contexts; this audit uses the common laptop-RAM interpretation and reports any storage-only match separately.'},
 {query:'BMW 2020 автомат',expected:[990880006],criterion:'BMW, year=2020, automatic; BMW2021 with mileage2020 and BMW2018 priced2020 are negative numeric-field controls'},
 {query:'Toyota RAV4',expected:[990880050],criterion:'model-number control: RAV4 is a vehicle model, never a price=4 filter'},
 {query:'BMW 318i',expected:[990880008],criterion:'alphanumeric model control: 318i must remain a model identifier'}
];
(async()=>{
 const rows=[];
 for(const spec of specs){
  h.run('$("#advanced-reset").onclick();$("#sort").value="nearest";');h.node('#search').value=spec.query;h.node('#search').oninput({target:h.node('#search'),isComposing:false});await settle(180);const typed=snapshot();
  h.node('#filters').onsubmit({preventDefault(){},target:h.node('#filters')});await settle();const submitted=snapshot(),compiled=JSON.parse(h.run('JSON.stringify(window.FasKeywordSearch.compile('+JSON.stringify(spec.query)+'))'));
  const expected=spec.expected,actual=new Set(submitted.ids),missing=(expected||spec.mustInclude||[]).filter(id=>!actual.has(id)),unexpected=expected?submitted.ids.filter(id=>!expected.includes(id)):(spec.mustExclude||[]).filter(id=>actual.has(id));
  const order=spec.orderedRelevant?.filter(id=>actual.has(id)),orderActual=spec.orderedRelevant?submitted.ids.filter(id=>spec.orderedRelevant.includes(id)):null;
  rows.push({...spec,typed,submitted,compiled,missing,unexpected,orderingCorrect:order?JSON.stringify(order)===JSON.stringify(orderActual):null,pass:!missing.length&&!unexpected.length&&(!order||JSON.stringify(order)===JSON.stringify(orderActual))});
 }
 const structuredCases=[
  {name:'apartment rooms and budget through actual controls',query:'квартира',category:'property',fields:{'adv-rooms-min':'2','adv-rooms-max':'2','adv-price-max':'5000000'},expected:[990880020,990880024,990880025]},
  {name:'apartment area range through actual controls',query:'квартира',category:'property',fields:{'adv-area-min':'40','adv-area-max':'80'},expected:[990880020,990880021,990880022]},
  {name:'excavator fuel and budget through actual controls',query:'экскаватор',category:'machinery',fields:{'adv-fuel':'diesel','adv-price-max':'3000000'},expected:[990880030]},
  {name:'BMW year and transmission through actual controls',query:'BMW',category:'cars',fields:{'adv-year-min':'2020','adv-year-max':'2020','adv-transmission':'auto'},expected:[990880006]},
  {name:'car price component through actual budget control; body-type is separate',query:'',category:'cars',fields:{budget:'2000000'},expected:[990880001,990880002,990880003,990880005,990880008,990880010]}
 ];
 const structured=[];
 for(const control of structuredCases){h.run('$("#advanced-reset").onclick();');h.node('#search').value=control.query;h.run('setCategoryValue('+JSON.stringify(control.category)+');window.FasRestoreManualKeywordCategory('+JSON.stringify(control.query)+');syncSearchFields();');for(const[id,value]of Object.entries(control.fields))h.node('#'+id).value=value;h.node('#advanced-form').onsubmit({preventDefault(){},target:h.node('#advanced-form')});await settle();const actual=snapshot();structured.push({...control,actual,pass:JSON.stringify(actual.ids.slice().sort())===JSON.stringify(control.expected.slice().sort())});}
 const reducedQueries=['двухкомнатная квартира','экскаватор дизель','ноутбук 16','универсал','Subaru Legacy','Subaru Legacy рядом'];
 const lexicalControls=reducedQueries.map(query=>({query,ids:Array.from(h.run('cars.filter(lot=>window.FasKeywordSearch.matches(lot,'+JSON.stringify(query)+')).map(lot=>lot.id)'))}));
 for(const row of rows){assert(row.pass,row.query+': '+JSON.stringify({missing:row.missing,unexpected:row.unexpected,ids:row.submitted.ids}));assert.equal(row.submitted.query,row.query,'typed raw query remains visible');assert.equal(row.submitted.error,'');assert.deepEqual(row.submitted.advanced,rows[0].submitted.advanced,'interpreted criteria do not overwrite manual controls');}
 for(const control of structured)assert(control.pass,control.name);
 // Existing manual constraints remain an AND, including after semantic parsing.
 h.run('$("#advanced-reset").onclick();');h.node('#adv-price-min').value='1700000';h.node('#search').value='седан до 2 млн';h.node('#search').oninput({target:h.node('#search')});await settle(180);
 assert.deepEqual(snapshot().ids,[990880001,990880008]);assert.equal(h.node('#adv-price-min').value,'1700000');
 // Invalid semantic ranges preserve prior results and do not scroll past errors.
 const previous=snapshot().ids;let scrolled=0;h.node('#lot-results').scrollIntoView=()=>scrolled++;
 h.node('#search').value='квартира от 80 до 40 м2';h.node('#search').oninput({target:h.node('#search')});await settle(180);h.node('#filters').onsubmit({preventDefault(){}});await settle();
 assert.match(snapshot().error,/Площадь/);assert.deepEqual(snapshot().ids,previous);assert.equal(scrolled,0);assert.match(h.node('#advanced-error').textContent,/Площадь/);
 h.node('#search').value='квартира от 40 до 80 м2';h.node('#adv-price-min').value='';h.node('#search').oninput({target:h.node('#search')});await settle(180);assert.equal(snapshot().error,'');assert.deepEqual(snapshot().ids,[990880020,990880021,990880022]);
 // Compiled price predicates must read the live bid on every match.
 h.run('window.dynamicTypedQuery=window.FasKeywordSearch.compile("седан до 2 млн")');assert(h.run('window.FasKeywordSearch.matches(cars[0],window.dynamicTypedQuery)'));
 h.run('bids[cars[0].id]={price:2100000}');assert.equal(h.run('window.FasKeywordSearch.matches(cars[0],window.dynamicTypedQuery)'),false);h.run('delete bids[cars[0].id]');assert(h.run('window.FasKeywordSearch.matches(cars[0],window.dynamicTypedQuery)'));
 // An explicit city is still a lexical city constraint, never guessed GPS.
 h.run('$("#advanced-reset").onclick();userGeo=null;');h.node('#search').value='Subaru Legacy Москва';h.node('#search').oninput({target:h.node('#search')});await settle(180);assert.deepEqual(snapshot().ids,[990880004]);assert.equal(h.run('userGeo'),null);
 // Unknown position stays after located matches when an origin is available.
 h.run('$("#advanced-reset").onclick();userGeo={point:[51.6608,39.2003],approximate:false};');h.node('#sort').value='low';h.node('#search').value='универсал рядом';h.node('#search').oninput({target:h.node('#search')});await settle(180);assert.deepEqual(snapshot().ids,[990880003,990880004,990880005]);assert.equal(h.node('#sort').value,'nearest');
 assert.equal(typeof c.window.FasVoice,'undefined','typed tests never execute a voice command');timers.clear();
 console.log('natural typed search: 8 semantic queries + models, manual AND, live bid, error recovery, location and raw query PASS');
})().catch(error=>{console.error(error);process.exitCode=1});
