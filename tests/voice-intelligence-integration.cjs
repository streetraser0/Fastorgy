const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {boot}=require('./helpers/category-seller-harness.cjs');
const {setup}=require('./helpers/quickbar-dom.cjs');

// Keep the real catalogue, criteria route and render. Only the voice dialog uses
// the richer small DOM from the existing microphone lifecycle test harness.
const h=boot({noMedia:true}),run=h.run,voiceDOM=setup({mobile:true});
h.context.document.createElement=voiceDOM.document.createElement;
h.context.document.body.appendChild=node=>voiceDOM.document.body.appendChild(node);
let microphoneRequests=0,locationRequests=0;
h.context.navigator.geolocation={getCurrentPosition(){locationRequests++;throw Error('Voice must not request location.')}};
h.context.window.SpeechRecognition=class{constructor(){microphoneRequests++}start(){throw Error('Voice must not start recording.')}};
vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/voice-assistant.js'),'utf8'),h.context);
const voice=h.context.window.FasVoiceAssistant,dialog=voiceDOM.document.querySelector('#voice-dialog');
const base={city:'Воронеж',regionCode:'36',price:1500000,start:1500000,step:1000,deposit:0,status:'live',ends:new Date(Date.now()+86400000).toISOString(),latitude:51.66,longitude:39.21,bids:0,demo:false,condition:'used'};
const camry={...base,category:'cars',subcategory:'cars',brand:'Toyota',model:'Camry',name:'Toyota Camry',year:2021,mileage:120000,fuel:'petrol',transmission:'auto'};
const apartment={...base,category:'property',subcategory:'property',brand:'',model:'',name:'Квартира',area:65,rooms:2};
const fixtures=[
 {...camry,id:999741001},
 {...camry,id:999741002,year:2018},
 {...camry,id:999741003,mileage:180000},
 {...camry,id:999741004,transmission:'manual'},
 {...camry,id:999741005,price:1000000,start:1000000,longitude:40.1},
 {...camry,id:999741006,fuel:'diesel',condition:'repair'},
 {...apartment,id:999741007},
 {...apartment,id:999741008,area:90,rooms:3},
 {...apartment,id:999741009,area:50,rooms:1},
 {...base,id:999741010,category:'trucks',subcategory:'trucks',brand:'КАМАЗ',model:'5490',name:'КАМАЗ 5490',year:2020,mileage:300000,fuel:'diesel',transmission:'manual'}
];
run('cars='+JSON.stringify(fixtures)+';ends.length=0;cars.forEach(lot=>ends.push(Date.parse(lot.ends)));invalidateSubscriptionInventory();window.FasKeywordSearch.invalidate();userGeo={point:[51.66,39.2],approximate:false};$("#sort").value="nearest";render();window.voiceIntegrationRenders=0;window.voiceIntegrationOriginalRender=render;render=function(...args){window.voiceIntegrationRenders++;return window.voiceIntegrationOriginalRender.apply(this,args)};');
const ids=()=>Array.from(run('visibleLots.map(lot=>lot.id)'));
const field=id=>h.node('#adv-'+id).value;
function execute(text){run('window.voiceIntegrationRenders=0');voice.open();const result=voice.execute(text);assert.equal(run('window.voiceIntegrationRenders'),result.ok&&['search','reset'].includes(result.action)?1:0,'only a successful search or reset renders the catalogue once: '+text);return result}

let result=execute('найди Toyota Camry не старше 2020 года с пробегом до 150 тыс. км только автомат');
assert.equal(result.ok,true);assert.equal(result.query,'Toyota Camry');
assert.equal(result.criteria.yearMin,2020);assert.equal(result.criteria.mileageMax,150000);assert.equal(result.criteria.transmission,'auto');
assert.equal(result.criteria.radius,undefined,'mileage in kilometres must not become a location radius');
assert.equal(result.criteria.priceMax,undefined,'a year or mileage must not become a budget');
assert.equal(field('year-min'),'2020');assert.equal(field('mileage-max'),'150000');assert.equal(field('transmission'),'auto');
assert.deepEqual(ids(),[999741001,999741006,999741005]);
assert(voice.state().lastFeedback.includes('2020')&&voice.state().lastFeedback.includes('150'),'the applied year and mileage are visible in the interpretation');
result=execute('find Toyota Camry year from 2020 to 2022 mileage under 150 thousand km transmission automatic');
assert.equal(result.ok,true);assert.equal(result.query,'Toyota Camry');assert.equal(result.criteria.yearMin,2020);assert.equal(result.criteria.yearMax,2022);assert.equal(result.criteria.mileageMax,150000);assert.equal(result.criteria.transmission,'auto');assert.deepEqual(ids(),[999741001,999741006,999741005]);

result=execute('а теперь дешевле');
assert.equal(result.ok,true);assert.equal(result.query,'Toyota Camry');assert.equal(result.criteria.sort,'low');
assert.equal(result.criteria.yearMin,2020);assert.equal(result.criteria.mileageMax,150000);assert.equal(result.criteria.transmission,'auto');
assert.deepEqual(ids(),[999741005,999741001,999741006]);
result=execute('расширь радиус до 50 км');
assert.equal(result.ok,true);assert.equal(result.query,'Toyota Camry');assert.equal(result.criteria.radius,'50');assert.equal(result.criteria.sort,'low');
assert.equal(result.criteria.mileageMax,150000);assert.deepEqual(ids(),[999741001,999741006]);

const beforeInvalid=ids();
for(const text of ['найди Toyota Camry год от 2022 до 2020','найди Toyota Camry пробег от 200 тысяч до 100 тысяч км','найди квартиру площадь от 80 до 40 м2','найди квартиру комнат от 3 до 2']){
 result=execute(text);assert.equal(result.ok,false,text);assert.equal(result.action,'invalid',text);assert.equal(dialog.open,true,text);assert.deepEqual(ids(),beforeInvalid,'invalid range preserves the previous successful results');
}
for(const text of ['сделай ставку 100000','оплати лот 42','publish listing','delete draft']){
 result=execute(text);assert.equal(result.ok,false);assert.equal(result.action,'blocked');assert.deepEqual(ids(),beforeInvalid);
}
result=execute('повтори поиск');
assert.equal(result.ok,true);assert.equal(result.query,'Toyota Camry');assert.equal(result.criteria.radius,'50');assert.equal(result.criteria.sort,'low');
run('userGeo=null;userRegion={code:"",scope:"all"}');
result=execute('а теперь дешевле');
assert.equal(result.ok,true);assert.equal(result.query,'Toyota Camry');assert.equal(result.criteria.radius,undefined,'a followup drops a stored radius after its origin disappears');assert.equal(field('radius'),'');
assert.equal(result.criteria.yearMin,2020);assert.equal(result.criteria.mileageMax,150000);assert.equal(result.criteria.transmission,'auto');assert.equal(result.criteria.sort,'low');
assert(result.warnings.some(text=>text.includes('Ваш регион')),'the interpretation explains the missing radius origin');assert(!result.applied.some(text=>text.startsWith('Радиус:')),'unapplied radius is absent from the applied interpretation');assert.deepEqual(ids(),[999741005,999741001,999741006]);
run('userGeo={point:[51.66,39.2],approximate:false}');
result=execute('найди Toyota Camry в Москве до двух миллионов рублей');
assert.equal(result.ok,true);assert.equal(h.node('#city').value,'Москва');assert.equal(result.criteria.city,'Москва');assert.deepEqual(ids(),[]);
result=execute('а теперь в Воронежской области');
assert.equal(result.ok,true);assert.equal(result.query,'Toyota Camry');assert.equal(result.criteria.regionCode,'36');assert.equal(result.criteria.city,undefined,'region-only refinement removes the previously selected city');assert.equal(result.criteria.priceMax,2000000);
assert.equal(h.node('#region-filter').value,'36');assert.equal(h.node('#city').value,'');assert.equal(ids().length,6,'the new region returns matching lots beyond the old city');assert(ids().includes(999741001));

result=execute('find apartment area from 40 to 80 m2 rooms from 2 to 3');
assert.equal(result.ok,true);assert.equal(result.query,'apartment');assert.equal(result.criteria.areaMin,40);assert.equal(result.criteria.areaMax,80);assert.equal(result.criteria.roomsMin,2);assert.equal(result.criteria.roomsMax,3);
assert.equal(field('area-min'),'40');assert.equal(field('area-max'),'80');assert.equal(field('rooms-min'),'2');assert.equal(field('rooms-max'),'3');
assert.equal(field('mileage-max'),'','new searches clear the previous vehicle filters');assert.equal(field('radius'),'','new searches clear the previous radius');assert.deepEqual(ids(),[999741007]);
result=execute('найди квартиру площадь от 40,5 до 80,5 м2 комнат от 2 до 3');
assert.equal(result.ok,true);assert.equal(result.criteria.areaMin,40.5);assert.equal(result.criteria.areaMax,80.5);assert.equal(field('area-min'),'40.5');assert.equal(field('area-max'),'80.5');assert.deepEqual(ids(),[999741007]);

result=execute('найди Toyota Camry');assert.equal(result.ok,true);
result=execute('только автомат');assert.equal(result.ok,true);assert.equal(result.query,'Toyota Camry');assert.equal(result.criteria.transmission,'auto');assert(!ids().includes(999741004));
result=execute('найди Toyota Camry топливо дизель коробка автомат состояние требует ремонта');
assert.equal(result.ok,true);assert.equal(field('fuel'),'diesel');assert.equal(field('transmission'),'auto');assert.equal(field('condition'),'repair');assert.deepEqual(ids(),[999741006]);

for(const query of ['КАМАЗ 5490','BMW 2002','Canon EOS R5','Насос 30 кВт','автомат для продажи кофе']){
 const parsed=voice.parse('найди '+query);assert.equal(parsed.query,query,'model/identifier and ordinary product words stay in the keyword query');assert.equal(parsed.criteria.priceMax,undefined);assert.equal(parsed.criteria.yearMin,undefined);assert.equal(parsed.criteria.transmission,undefined);
}
const sharedYear=voice.parse('найди Toyota RAV4 2021');assert.equal(sharedYear.query,'Toyota RAV4');assert.equal(sharedYear.criteria.yearMin,2021);assert.equal(sharedYear.criteria.yearMax,2021,'spoken year uses the same exact field as typed search');
result=execute('найди КАМАЗ 5490 не старше 2020 года');assert.equal(result.ok,true);assert.equal(result.query,'КАМАЗ 5490');assert.deepEqual(ids(),[999741010]);

// The actual criteria entry point accepts only validated, named values. Arbitrary
// property names cannot address DOM controls, and enum values are exact matches.
run('window.voiceIntegrationRenders=0');
run('window.FasGlobalSearch("Toyota Camry",{criteria:'+JSON.stringify({yearMin:2020,yearMax:2022,mileageMax:150000,transmission:'auto',fuel:'diesel',condition:'repair',search:'injected',model:'not a requested model',yearMaxInjected:1,areaMin:-1,roomsMax:1.5})+'})');
assert.equal(run('window.voiceIntegrationRenders'),1);assert.equal(h.node('#search').value,'Toyota Camry');assert.equal(field('model'),'');assert.equal(field('area-min'),'');assert.equal(field('rooms-max'),'');assert.deepEqual(ids(),[999741006]);
run('window.FasGlobalSearch("Toyota Camry",{criteria:'+JSON.stringify({yearMin:5490,mileageMin:-1,roomsMin:1.5,areaMin:-5,transmission:'automatic',fuel:'diesel<script>',condition:'broken'})+'})');
for(const key of ['year-min','mileage-min','rooms-min','area-min','transmission','fuel','condition'])assert.equal(field(key),'','invalid structured criteria are ignored: '+key);
assert.equal(run('readAdvancedFilters().error'),'');

result=execute('сбрось поиск');assert.equal(result.ok,true);assert.equal(h.node('#search').value,'');
for(const key of ['year-min','mileage-max','area-min','rooms-min','radius','fuel','transmission','condition'])assert.equal(field(key),'','reset clears '+key);
result=execute('только автомат');assert.equal(result.ok,false,'a contextual refinement cannot resurrect a search after reset');
assert.equal(microphoneRequests,0,'typed and parsed commands never start the microphone');assert.equal(locationRequests,0,'radius never requests geolocation');
assert.equal(run('Object.keys(bids).length'),0,'voice searches do not bid');
console.log('PASS: real catalogue voice integration for year, mileage, property, enums, contextual followups, reset, range validation, identifier preservation and safe criteria application.');
