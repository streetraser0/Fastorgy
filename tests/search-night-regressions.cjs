'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {boot}=require('./helpers/category-seller-harness.cjs'),{setup}=require('./helpers/quickbar-dom.cjs');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
const base={bank:'Контрольный продавец',sellerType:'bank',status:'live',startsAt:'2026-01-01T00:00:00Z',ends:'2099-01-01T00:00:00Z',step:1000,deposit:0,demo:false,city:'Воронеж',regionCode:'36',latitude:51.66,longitude:39.2,condition:'used',price:900000,start:900000};
const lot=(id,category,name,extra={})=>({...base,id:997630000+id,category,subcategory:category,name,...extra});
const rows=[
 lot(1,'property','Квартира',{area:60,rooms:1}),lot(2,'property','Квартира',{area:70,rooms:1,price:800000}),lot(3,'property','Квартира',{area:60,rooms:1,price:1100000}),
 lot(4,'property','Квартира',{area:60,rooms:1,city:'Москва',regionCode:'77',latitude:55.75,longitude:37.61,price:800000}),lot(5,'property','Квартира',{area:60,rooms:1,city:'Место неизвестно',regionCode:'',latitude:null,longitude:null,price:700000}),
 lot(10,'phones','Apple iPhone 13',{category:'other',storageGb:256,price:45000}),lot(11,'phones','Apple iPhone 13',{category:'other',storageGb:512,price:40000}),lot(12,'phones','Apple iPhone 13',{category:'other',storageGb:256,price:60000}),lot(13,'phones','Apple iPhone 14',{category:'other',storageGb:256,price:35000}),lot(14,'phones','Apple iPhone',{category:'other',storageGb:1024,price:90000}),
 lot(20,'cars','Toyota Corolla',{brand:'Toyota',model:'Corolla',year:2020,mileage:50000,bodyType:'sedan',color:'blue',price:1500000}),
 lot(21,'cars','Toyota Corolla',{brand:'Toyota',model:'Corolla',year:2021,mileage:50000,bodyType:'sedan',color:'blue',price:1400000}),
 lot(22,'cars','Toyota Corolla',{brand:'Toyota',model:'Corolla',year:2020,mileage:50000,bodyType:'sedan',color:'blue',price:2500000}),
 lot(23,'cars','Toyota Corolla',{brand:'Toyota',model:'Corolla',year:2020,mileage:80000,bodyType:'sedan',color:'red',price:1500000,description:'Не требует ремонта. Без повреждений. Пробег подтвержден.'}),
 lot(24,'cars','Toyota Hilux',{brand:'Toyota',model:'Hilux',bodyType:'pickup',color:'blue',mileage:0,price:1500000}),lot(25,'cars','Toyota Hilux',{brand:'Toyota',model:'Hilux',bodyType:'pickup',color:'red',mileage:180000,price:1500000}),
 lot(26,'cars','Toyota Hilux',{brand:'Toyota',model:'Hilux',bodyType:'pickup',mileage:220000,price:1500000}),lot(27,'cars','Toyota Hilux',{brand:'Toyota',model:'Hilux',bodyType:'pickup',mileage:null,price:1500000}),lot(28,'cars','Toyota Corolla',{brand:'Toyota',model:'Corolla',year:2018,mileage:30000,bodyType:'sedan',price:2000000}),
 lot(30,'equipment','Деревообрабатывающий станок',{powerKw:10,price:90000}),lot(31,'equipment','Деревообрабатывающий станок',{powerKw:20,price:80000}),lot(32,'equipment','Деревообрабатывающий станок',{powerKw:10,price:150000}),
 lot(40,'computers','Ноутбук',{category:'other',ramGb:16,storageGb:512,price:80000}),lot(41,'computers','Ноутбук',{category:'other',ramGb:32,storageGb:512,price:70000}),lot(42,'computers','Ноутбук',{category:'other',ramGb:16,storageGb:512,price:120000}),
 lot(50,'trucks','Седельный тягач SITRAK C7H Евро 5',{brand:'SITRAK',model:'C7H',year:2020,price:1500000}),lot(51,'trucks','Седельный тягач SITRAK C7H Евро 5',{brand:'SITRAK',model:'C7H',year:2025,price:1400000})
];
const h=boot({noMedia:true,fixtureInventory:rows}),c=h.context,S=c.window.FasKeywordSearch,run=h.run;
run('userGeo={point:[51.66,39.2],approximate:false};$("#sort").value="nearest";render();');
h.node('#modal-content').querySelector=()=>null;for(const id of ['#modal','#grid','#result-count'])h.node(id).removeAttribute=function(name){delete this[name]};
let time=0,timerId=0;const timers=new Map();c.setTimeout=(fn,delay=0)=>{timers.set(++timerId,{fn,at:time+delay});return timerId};c.clearTimeout=id=>timers.delete(id);
vm.runInContext(fs.readFileSync(path.join(dist,'app-ui.js'),'utf8'),c);
const voiceDOM=setup({mobile:true});c.document.createElement=voiceDOM.document.createElement;c.document.body.appendChild=node=>voiceDOM.document.body.appendChild(node);
let mic=0,geo=0;c.window.SpeechRecognition=class{constructor(){mic++}};c.navigator.geolocation={getCurrentPosition(){geo++}};
vm.runInContext(fs.readFileSync(path.join(dist,'voice-assistant.js'),'utf8'),c);const voice=c.window.FasVoiceAssistant;
const ids=()=>Array.from(run('visibleLots.map(lot=>lot.id)')),full=values=>values.map(id=>997630000+id),sort=values=>[...values].sort((a,b)=>a-b),plain=value=>JSON.parse(JSON.stringify(value));
async function settle(ms=0){time+=ms;for(let pass=0;pass<30;pass++){for(const[id,job]of[...timers])if(job.at<=time){timers.delete(id);job.fn()}await Promise.resolve()}}
async function typed(query,reset=true){if(reset)run('$("#advanced-reset").onclick();$("#sort").value="nearest";');h.node('#search').value=query;h.node('#search').oninput({target:h.node('#search')});await settle(180);h.node('#filters').onsubmit({preventDefault(){}});await settle();return S.compile(query).intent}
const cases=[
 ['квартира 60 м² до 1 млн',[1,4,5],{areaMin:60,areaMax:60,priceMax:1000000}],
 ['квартира площадью 60 м² до 1 млн',[1,4,5],{areaMin:60,areaMax:60,priceMax:1000000}],
 ['айфон 256 гб до 50 тысяч',[10,13],{storageGbMin:256,storageGbMax:256,priceMax:50000}],
 ['автомобиль 2020 года до 2 млн',[20,23],{yearMin:2020,yearMax:2020,priceMax:2000000}],
 ['автомобиль пробег 50000 км до 2 млн',[20,21],{mileageMin:50000,mileageMax:50000,priceMax:2000000}],
 ['станок 10 кВт до 100 тысяч',[30],{powerKwMin:10,powerKwMax:10,priceMax:100000}],
 ['ноутбук ОЗУ 16 ГБ до 100 тысяч',[40],{ramGbMin:16,ramGbMax:16,priceMax:100000}],
 ['пикап с пробегом до200000км до2млн',[24,25],{mileageMax:200000,priceMax:2000000}],
 ['пикап с пробегом до5000км до2млн',[24],{mileageMax:5000,priceMax:2000000}],
 ['машина без пробега',[24],{mileageMin:0,mileageMax:0}],
 ['айфон 13 256 ГБ до 50 тысяч',[10],{storageGbMin:256,storageGbMax:256,priceMax:50000}],
 ['айфон 1 024 ГБ до 100 тысяч',[14],{storageGbMin:1024,storageGbMax:1024,priceMax:100000}],
 ['тягач Евро 5 2020 года до 2 млн',[50],{yearMin:2020,yearMax:2020,priceMax:2000000}],
 ['автомобиль дешевле2000000',[20,21,23,24,25,26,27,28],{priceMax:2000000}],
 ['автомобиль дешевле двух миллионов рублей',[20,21,23,24,25,26,27,28],{priceMax:2000000}],
 ['автомобиль дороже 2 млн',[22,28],{priceMin:2000000}],
 ['car cheaper than two million rubles',[20,21,23,24,25,26,27,28],{priceMax:2000000}],
 ['car more expensive than 2000000',[22,28],{priceMin:2000000}]
];
(async()=>{
 for(const[query,wanted,criteria]of cases){
  const intent=await typed(query);assert.equal(intent.error,'',query);for(const[key,value]of Object.entries(criteria))assert.equal(intent.criteria[key],value,query+': '+key);assert.deepEqual(sort(ids()),sort(full(wanted)),'typed: '+query);
  voice.open();const parsed=voice.execute('найди '+query);assert.equal(parsed.ok,true,'voice: '+query);for(const[key,value]of Object.entries(criteria))assert.equal(parsed.criteria[key],value,'voice: '+query+': '+key);assert.deepEqual(sort(ids()),sort(full(wanted)),'voice: '+query);voice.close();
 }
 // Comparators use the same inclusive budget convention as до/от and expose those labels.
 for(const[query,key,label]of [['автомобиль дешевле 2000 рублей','priceMax','до'],['автомобиль дороже 2000 рублей','priceMin','от']]){const intent=S.compile(query).intent;assert.equal(intent.criteria[key],2000);assert(intent.labels.some(text=>text.includes(label+' 2')));for(const price of [1999,2000,2001]){const row={...rows.find(row=>row.id===997630020),id:997631000+price,price,start:price};assert.equal(S.matches(row,query),key==='priceMax'?price<=2000:price>=2000,query+' boundary '+price)}}
 for(const[query,order]of [['автомобиль дешевле','low'],['автомобиль дороже','high'],['car cheaper','low'],['car more expensive','high']]){const intent=S.compile(query).intent;assert.equal(intent.criteria.sort,order);assert.equal(intent.criteria.priceMax,undefined);assert.equal(intent.criteria.priceMin,undefined)}
 const ruUpper=S.compile('автомобиль не дороже 2 млн').intent,ruLower=S.compile('автомобиль не дешевле 2 млн').intent;assert.equal(ruUpper.error,'');assert.equal(ruUpper.criteria.priceMax,2000000);assert.equal(ruLower.error,'');assert.equal(ruLower.criteria.priceMin,2000000);
 // A saved search preserves both the raw phrase and its complete effective match set.
 await typed(cases[0][0]);assert.deepEqual(ids(),full([1,4,5]),'distance order is near, farther, unknown last');
 run('window.auditOpenSubscriptions=openSubscriptions;openSubscriptions=()=>{};saveCurrentSearch();openSubscriptions=window.auditOpenSubscriptions;');const saved=plain(run('pendingSavedSearch'));assert.deepEqual(sort(rows.filter(row=>run('matchesSavedSearch('+JSON.stringify(saved)+','+JSON.stringify(row)+')')).map(row=>row.id)),sort(full([1,4,5])));
 await typed('айфон 256 гб до 50 тысяч');run('applySavedSearch('+JSON.stringify(saved)+')');assert.equal(h.node('#search').value,cases[0][0]);assert.deepEqual(ids(),full([1,4,5]));
 // An explicit manual category remains strict instead of broadening silently.
 run('setCategoryValue("phones");window.FasRestoreManualKeywordCategory($("#search").value);render()');assert.deepEqual(ids(),[]);await typed(cases[0][0]);
 const old=ids();for(const query of ['автомобиль до 20 тысяч долларов','айфон до 500 евро','машина за 20000 USD','автомобиль до $20000','автомобиль до EUR 20000','car under 20 thousand dollars','phone under 500 euros','машина дешевлеEUR20000','car cheaper than USD20000','car not cheaper than two million rubles','car no more expensive than 2000000 rubles','седан или универсал','квартира 1 или 2 комнаты','седан or универсал','автомобиль не старше пяти лет','машина моложе 5 лет','car not older than five years','седан не красный','седан кроме красного','автомобиль не на дизеле','машина не требует ремонта','машина без пробега по России']){
  const intent=await typed(query,false);assert(intent.error,query+' produces actionable clarification');assert.deepEqual(ids(),old,'typed invalid request preserves previous results: '+query);assert(h.node('#advanced-error').textContent,'visible filter error');
  voice.open();const parsed=voice.execute('найди '+query);assert.equal(parsed.ok,false,query);assert.equal(parsed.action,'invalid',query);assert.deepEqual(ids(),old,'voice invalid request preserves previous results: '+query);voice.close();
 }
 assert.equal(S.matches(rows.find(row=>row.id===997630023),'седан не красный'),false,'negative prose cannot positively satisfy an excluded color');assert.equal(S.matches(rows.find(row=>row.id===997630023),'машина без пробега'),false,'absence of body damage never proves zero mileage');
 for(const[query,expected]of [
  ['квартира от40м² до60',{areaMin:40,areaMax:60}],['квартира от40м² до60м²',{areaMin:40,areaMax:60}],['автомобиль от2018г до2020',{yearMin:2018,yearMax:2020}],
  ['автомобиль пробег от50км до100тысячкм',{mileageMin:50,mileageMax:100000}],['ноутбук SSD от256ГБ до512',{storageGbMin:256,storageGbMax:512}],['ноутбук SSD от256ГБ до512ГБ',{storageGbMin:256,storageGbMax:512}]
 ]){const intent=S.compile(query).intent;assert.equal(intent.error,'',query);for(const[key,value]of Object.entries(expected))assert.equal(intent.criteria[key],value,query)}
 assert(S.compile('ноутбук SSD от256ГБ до1ТБ').intent.error,'mixed memory units require clarification');
 for(const query of ['машина в радиусе10км','машина до10км от меня','машина до20000км от Москвы','седан рядом до50000км','до10км']){const intent=S.compile(query).intent;assert.equal(intent.criteria.mileageMin,undefined,query+' is not mileage');assert.equal(intent.criteria.mileageMax,undefined,query+' is not mileage');assert.equal(intent.criteria.priceMax,undefined,query+' is not a rouble budget')}
 for(const query of ['Toyota Camry не старше 2020 года до 2 млн','автомобиль не дороже 2 млн','тягач Euro 5','тягач 2020 Евро 5 до 2 млн','автомобиль без синхронизаторов','квартира без голубей','станок без универсального патрона'])assert.equal(S.compile(query).intent.error,'',query+' is not a trait/currency false alarm');
 const ambiguous=S.compile('пикап до200000км до2млн').intent;assert.equal(ambiguous.criteria.priceMax,2000000,'unlabelled kilometres never become a 200k rouble budget');assert.equal(ambiguous.criteria.mileageMax,undefined,'bare kilometres do not acquire invented mileage semantics');voice.open();const distance=voice.execute('найди пикап до200000км до2млн');assert(distance.warnings?.some(text=>/радиус|расстояни/.test(text)),'unsupported bare distance asks for clarification');assert.equal(distance.criteria.priceMax,2000000);assert.equal(distance.criteria.mileageMax,undefined);voice.close();
 // The original new-visit rule is retained after using the new criteria.
 await typed(cases[0][0]);run('saved=[cars[0].id];persist(["fas-favs"])');const reopened=boot({noMedia:true,fixtureInventory:rows,records:{...h.records}});assert.equal(reopened.node('#search').value,'');assert.equal(reopened.node('#category').value,'');assert.deepEqual(Array.from(reopened.run('saved')),Array.from(run('saved')));
 assert.equal(mic,0);assert.equal(geo,0);assert.equal(run('cars.length'),rows.length);timers.clear();
 console.log('PASS: held-out quantity/budget separation across five asset types, exact unit ranges, real typed+voice filters, safe currency/trait clarification, zero-mileage evidence, saved search, nearest/unknown/manual category and fresh-visit context.');
})().catch(error=>{console.error(error);process.exitCode=1});
