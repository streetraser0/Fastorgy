const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {boot}=require('./helpers/category-seller-harness.cjs'),{setup}=require('./helpers/quickbar-dom.cjs');
const h=boot({noMedia:true}),run=h.run,c=h.context,S=c.window.FasKeywordSearch;
const base={bank:'Проверочный продавец',sellerType:'bank',status:'live',price:1000000,start:1000000,step:1000,deposit:0,ends:'2099-01-01T00:00:00Z',demo:false,category:'trucks',subcategory:'trucks',city:'Воронеж',regionCode:'36',latitude:51.66,longitude:39.2};
const fixture=(id,extra)=>({...base,id:999798000+id,...extra});
const rows=[
 fixture(1,{name:'Седельный тягач SITRAK C7H',brand:'SITRAK',model:'C7H'}),
 fixture(2,{name:'Седельный тягач SHACMAN X3000',brand:'SHACMAN',model:'X3000',city:'Москва',regionCode:'77',latitude:55.756,longitude:37.617}),
 fixture(3,{category:'cars',subcategory:'cars',name:'Kia K5',brand:'Kia',model:'K5',assemblyCountry:'Россия',city:'Калининград',regionCode:'39',latitude:54.71,longitude:20.51}),
 fixture(4,{category:'cars',subcategory:'cars',name:'Hyundai Solaris',brand:'Hyundai',model:'Solaris',city:'Казань',regionCode:'16',latitude:55.79,longitude:49.12}),
 fixture(5,{category:'cars',subcategory:'cars',name:'LADA Vesta',brand:'Лада',model:'Vesta'}),
 fixture(6,{name:'Седельный тягач КамАЗ 5490',brand:'КамАЗ',model:'5490',city:'Москва',regionCode:'77',latitude:55.756,longitude:37.617}),
 fixture(7,{category:'machinery',subcategory:'machinery',name:'Погрузчик XCMG LW300',brand:'XCMG',model:'LW300',city:'Новосибирск',regionCode:'54',latitude:55.03,longitude:82.92}),
 fixture(8,{name:'Седельный тягач неизвестной марки',brand:'Неизвестно',description:'В описании для сравнения упомянуты китайский SITRAK и корейская Hyundai.'}),
 fixture(9,{name:'Седельный тягач SITRAK за пределами России',brand:'SITRAK',model:'C7H',saleCountryCode:'FR',city:'Париж',regionCode:'',latitude:48.85,longitude:2.35}),
 fixture(10,{category:'cars',subcategory:'cars',name:'LADA Vesta за пределами России',brand:'LADA',model:'Vesta',locationCountry:'France',city:'Париж',regionCode:'',latitude:48.85,longitude:2.35}),
 fixture(11,{category:'cars',subcategory:'cars',name:'Haval Jolion',brand:'Haval',model:'Jolion',assemblyCountry:'Россия',city:'Тула',regionCode:'71',latitude:54.19,longitude:37.62}),
 fixture(12,{category:'other',subcategory:'home_appliances',name:'Холодильник Hyundai',brand:'Hyundai',manufacturer:'Hyundai'}),
 fixture(13,{name:'Седельный тягач SITRAK без заполненной марки',brand:'',manufacturer:''}),
 fixture(14,{name:'Седельный тягач неустановленной марки без места',brand:'Новая марка',city:'Не указано',regionCode:'',latitude:null,longitude:null}),
 fixture(15,{category:'cars',subcategory:'cars',name:'UAZ Patriot',brand:'УАЗ',model:'Patriot'}),
 fixture(16,{name:'Грузовик ГАЗ NEXT',brand:'ГАЗ',model:'NEXT'}),
 fixture(17,{category:'machinery',subcategory:'machinery',name:'Экскаватор Hyundai R210',brand:'Hyundai',model:'R210'}),
 fixture(18,{category:'cars',subcategory:'cars',name:'Geely Monjaro',brand:'Geely',model:'Monjaro',assemblyCountry:'Беларусь'}),
 fixture(19,{name:'Самосвал SHACMAN X3000',brand:'SHACMAN',model:'X3000',bodyType:'dump truck',description:'Сравнение с седельным тягачом.'}),
 fixture(20,{name:'Седельный тягач — ошибочный заголовок',brand:'FAW',assetKind:'dump truck'})
];
run('cars='+JSON.stringify(rows)+';ends.length=0;cars.forEach(lot=>ends.push(Date.parse(lot.ends)));invalidateSubscriptionInventory();window.FasKeywordSearch.invalidate();userGeo={point:[51.66,39.2],approximate:false};$("#sort").value="nearest";render();');
const ids=()=>Array.from(run('visibleLots.map(lot=>lot.id)')),id=n=>999798000+n,sorted=values=>[...values].sort((a,b)=>a-b);
const Chinese=[1,2,7,9,11,13,18,19,20],Korean=[3,4,17],Russian=[5,6,10,15,16],Russia=rows.filter(lot=>![9,10,14].includes(lot.id-999798000)).map(lot=>lot.id);
const cases=[
 ['китайский тягач',[1,2,9,13]],['Chinese truck',[1,2,9,13,19,20]],['китайские тягачи в России',[1,2,13]],
 ['корейские машины',Korean],['Korean vehicles',Korean],['южнокорейская машина',Korean],
 ['русские машины в России',[5,6,15,16]],['российские автомобили',[5,10,15]],['Russian vehicles',Russian],
 ['китайская спецтехника',[7]],['Chinese machinery',[7]],['китайские машины',Chinese],['российский тягач',[6]],
 ['в России',null],['Russia',null]
];
// The actual input debounce and submit layer exercise raw typed keywords too.
h.node('#modal-content').querySelector=()=>null;for(const key of ['#modal','#grid','#result-count'])h.node(key).removeAttribute=function(name){delete this[name]};
let timerId=0,time=0;const timers=new Map();c.setTimeout=(fn,delay=0)=>{timers.set(++timerId,{fn,at:time+delay});return timerId};c.clearTimeout=key=>timers.delete(key);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/app-ui.js'),'utf8'),c);
async function settle(ms=0){time+=ms;for(let pass=0;pass<40;pass++){for(const[key,job]of [...timers])if(job.at<=time){timers.delete(key);job.fn()}await Promise.resolve()}}
function check(query,expected){assert.deepEqual(sorted(ids()),sorted(expected),query);const distances=Array.from(run('visibleLots.map(distanceToLot)'));for(let index=1;index<distances.length;index++)assert(distances[index]>=distances[index-1],query+' keeps nearest-first order across cities')}
(async()=>{
 for(const[query,expectedIds]of cases){run('$("#advanced-reset").onclick();$("#sort").value="nearest";');h.node('#search').value=query;h.node('#search').oninput({target:h.node('#search'),isComposing:false});await settle(180);h.node('#filters').onsubmit({preventDefault(){}});await settle();check(query,expectedIds?expectedIds.map(id):Russia)}
 for(const query of ['Chinese','китайский','Korean','корейские','Russian','российский'])assert.equal(S.inferCategory(query),null,'country alone cannot force a passenger-car category: '+query);
 assert.equal(S.compile('Korean').corrections.length,0,'Korean is a known origin term rather than Lorean');
 const catalogue=JSON.parse(fs.readFileSync(path.join(__dirname,'../dist/data/car-catalog.json'),'utf8'));
 for(const make of catalogue.makes.filter(make=>make.country==='cn'))assert(S.matches({...base,id:999799999,name:make.name,brand:make.name},'Chinese'),'every explicit trusted CN catalogue origin remains searchable: '+make.name);
 assert(!S.matches(rows[18],'Chinese tractor unit'),'a Chinese dump truck is not a tractor unit');assert(!S.matches(rows[19],'китайский тягач'),'explicit subtype overrides an inaccurate tractor title');assert(S.matches(rows[5],'tractor unit'));assert(!S.matches(rows[5],'tractor'),'bare English tractor retains the farm-machine meaning');

 assert(S.matches(rows[2],'корейские'));assert(!S.matches(rows[2],'русские'),'Russian assembly and Russian sale region do not change a Korean brand origin');
 assert(S.matches(rows[10],'Chinese'));assert(!S.matches(rows[10],'Russian'),'Russian-built Haval remains a Chinese brand');
 assert(!S.matches(rows[7],'Chinese'),'incidental description cannot invent an unknown brand origin');assert(!S.matches(rows[11],'Korean'),'a non-vehicle manufacturer does not force an automotive national-origin interpretation');
 assert(S.matches(rows[8],'Chinese'));assert(!S.matches(rows[8],'в России'),'sale-country scope is independent of brand origin');assert(S.matches(rows[9],'Russian'));assert(!S.matches(rows[9],'Russia'));
 // Cached base documents gain country facets lazily and reset after data changes.
 const changed={...rows[0],brand:'Неизвестно'};assert(S.matches(changed,'SITRAK'));assert(!S.matches(changed,'Chinese'));changed.brand='SHACMAN';S.invalidate();assert(S.matches(changed,'Chinese'));
 // Real voice execution shares the same intent without microphone/geolocation requests.
 const voiceDOM=setup({mobile:true});c.document.createElement=voiceDOM.document.createElement;c.document.body.appendChild=node=>voiceDOM.document.body.appendChild(node);
 let microphone=0,geolocation=0;c.window.SpeechRecognition=class{constructor(){microphone++}start(){throw Error('Unexpected microphone')}};c.navigator.geolocation={getCurrentPosition(){geolocation++}};
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/voice-assistant.js'),'utf8'),c);const voice=c.window.FasVoiceAssistant;
 for(const[query,wanted]of cases.filter(([query])=>['китайский тягач','корейские машины','русские машины в России'].includes(query))){voice.open();const result=voice.execute('найди '+query);assert(result.ok,query);await settle();check('voice: '+query,wanted.map(id))}
 assert.equal(microphone,0);assert.equal(geolocation,0);assert.equal(run('cars.length'),rows.length,'origin search never creates inventory');
 console.log('PASS: verified brand-country tags, Russian/English nationality forms, independent Russian sale-country scope, assembly/unknown/non-vehicle negatives and actual typed/voice nearest-first searches.');
})().catch(error=>{console.error(error);process.exitCode=1});
