const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist'),{boot}=require(path.join(root,'tests/helpers/category-seller-harness.cjs')),{setup}=require(path.join(root,'tests/helpers/quickbar-dom.cjs'));
const h=boot({noMedia:true}),c=h.context,run=h.run,voiceDOM=setup({mobile:true});h.context.document.createElement=voiceDOM.document.createElement;h.context.document.body.appendChild=node=>voiceDOM.document.body.appendChild(node);
let microphoneRequests=0,locationRequests=0;h.context.navigator.geolocation={getCurrentPosition(){locationRequests++;throw Error('must not request location')}};h.context.window.SpeechRecognition=class{constructor(){microphoneRequests++}start(){throw Error('must not start ASR')}};
vm.runInContext(fs.readFileSync(path.join(dist,'voice-assistant.js'),'utf8'),c);const voice=c.window.FasVoiceAssistant;
const base={city:'Воронеж',regionCode:'36',latitude:51.665,longitude:39.205,price:1500000,start:1500000,step:1000,deposit:0,status:'live',ends:new Date(Date.now()+86400000).toISOString(),condition:'used',year:2020};
const car={...base,category:'cars',subcategory:'cars',name:'Toyota Hilux',brand:'Toyota',model:'Hilux',bodyType:'pickup',color:'red',mileage:180000};
const apartment={...base,category:'property',subcategory:'property',name:'Квартира',rooms:1,area:55,price:900000,start:900000};
const machine={...base,category:'equipment',subcategory:'equipment',name:'Деревообрабатывающий станок JET',city:'Москва',regionCode:'77',latitude:55.75,longitude:37.61};
const phone={...base,category:'other',subcategory:'phones',name:'Apple iPhone 13',brand:'Apple',model:'iPhone 13',storageGb:256,ramGb:4,price:50000,start:50000};
const fixtures=[
 {...car,id:991771001},{...car,id:991771002,color:'blue'},{...car,id:991771003,name:'Toyota Camry',model:'Camry',bodyType:'sedan'},{...car,id:991771004,mileage:250000},{...car,id:991771005,city:'Москва',regionCode:'77',latitude:55.75,longitude:37.61,mileage:190000},{...car,id:991771006,mileage:null},
 {...apartment,id:991771020},{...apartment,id:991771021,rooms:2},{...apartment,id:991771022,area:70},{...apartment,id:991771023,price:1100000,start:1100000},{...apartment,id:991771024,rooms:null},
 {...machine,id:991771030},{...machine,id:991771031,city:'Воронеж',regionCode:'36',latitude:51.665,longitude:39.205},{...machine,id:991771032,name:'Металлообрабатывающий станок JET'},
 {...phone,id:991771040},{...phone,id:991771041,storageGb:128},{...phone,id:991771042,name:'Samsung Galaxy',brand:'Samsung',model:'Galaxy'},{...phone,id:991771043,storageGb:null},{...phone,id:991771044,category:'other',subcategory:'computers',name:'Ноутбук Apple',model:'MacBook',ramGb:256,storageGb:512},
 {...car,id:991771050,name:'Kia Rio',brand:'Kia',model:'Rio',bodyType:'sedan',city:'Ставрополь',regionCode:'26',latitude:45.04,longitude:41.97},{...car,id:991771051,name:'Kia Rio',brand:'Kia',model:'Rio',bodyType:'sedan',city:'Ставрополь',regionCode:'26',latitude:45.04,longitude:41.97,condition:'new'}
];
run('cars='+JSON.stringify(fixtures)+';ends.length=0;cars.forEach(lot=>ends.push(Date.parse(lot.ends)));invalidateSubscriptionInventory();window.FasKeywordSearch.invalidate();userGeo={point:[51.6608,39.2003],approximate:false};$("#sort").value="nearest";render();');
h.node('#modal-content').querySelector=()=>null;for(const id of ['#modal','#grid','#result-count'])h.node(id).removeAttribute=function(name){delete this[name]};let time=0,timerId=0;const timers=new Map();c.setTimeout=(handler,delay=0)=>{const id=++timerId;timers.set(id,{handler,at:time+delay});return id};c.clearTimeout=id=>timers.delete(id);vm.runInContext(fs.readFileSync(path.join(dist,'app-ui.js'),'utf8'),c);
const ids=()=>Array.from(run('visibleLots.map(lot=>lot.id)'));async function settle(ms=0){time+=ms;for(let i=0;i<35;i++){const jobs=[...timers].filter(([,job])=>job.at<=time);for(const[id,job]of jobs){timers.delete(id);job.handler()}await Promise.resolve()}}
const cases=[
 {query:'найди мне пикап рядом красного цвета с пробегом до 200 тысяч километров',expected:[991771001,991771005]},
 {query:'квартиру однокомнатную до 60 квадратов стоимостью до миллиона рублей',expected:[991771020]},
 {query:'станок деревообрабатывающий в Москве',expected:[991771030]},
 {query:'айфон на 256 гигабайт',expected:[991771040]},
 {query:'б/у машина в Ставрополе',expected:[991771050]},
 {query:'найди мне пикап рядом красного цвета с пробегом до200тысячкилометров',expected:[991771001,991771005]},
 {query:'квартиру однокомнатную до60квадратов стоимостьюдо миллиона рублей',expected:[991771020]},
 {query:'айфон на256гигабайт',expected:[991771040]}
];

(async()=>{
 const outputs=[];for(const spec of cases){
  run('$("#advanced-reset").onclick()');voice.open();const spoken=voice.execute(spec.query);assert.equal(spoken.ok,true,spec.query);assert.equal(spoken.action,'search');assert.deepEqual(ids(),spec.expected,'voice: '+spec.query);assert.equal(run('readAdvancedFilters().error'),'');
  run('$("#advanced-reset").onclick()');h.node('#search').value=spec.query;h.node('#search').oninput({target:h.node('#search')});await settle(180);h.node('#filters').onsubmit({preventDefault(){}});await settle();assert.deepEqual(ids(),spec.expected,'typed: '+spec.query);assert.equal(h.node('#search').value,spec.query,'raw typed phrase remains editable');
  const intent=run('window.FasKeywordSearch.compile($("#search").value).intent');assert.equal(intent.error,'');outputs.push({query:spec.query,spoken,intent});
 }
 const pickup=outputs[0];assert.equal(pickup.spoken.criteria.mileageMax,200000);assert.equal(pickup.spoken.criteria.radius,undefined,'mileage is not a radius');assert.equal(pickup.intent.criteria.sort,'nearest');assert.equal(h.run('userGeo.point[0]'),51.6608,'explicit searches never move the user origin');
 const apartment=outputs[1];for(const parsed of [apartment.spoken,apartment.intent]){assert.equal(parsed.criteria.roomsMin,1);assert.equal(parsed.criteria.roomsMax,1);assert.equal(parsed.criteria.areaMax,60);assert.equal(parsed.criteria.priceMax,1000000)}
 assert.equal(outputs[2].spoken.criteria.city,'Москва');assert.equal(outputs[2].intent.criteria.city,'Москва');assert.equal(outputs[3].spoken.criteria.storageGbMin,256);assert.equal(outputs[3].intent.criteria.storageGbMax,256);assert(outputs[3].spoken.applied.some(label=>label.includes('256')&&label.includes('ГБ')),'voice interpretation shows applied phone storage');
 for(const parsed of [outputs[4].spoken,outputs[4].intent]){assert.equal(parsed.criteria.city,'Ставрополь');assert.equal(parsed.criteria.condition,'used')}
 voice.execute('найди мне пикап рядом красного цвета с пробегом до200тысячкилометров');voice.execute('а теперь дешевле');const nearer=voice.execute('а теперь рядом');assert.equal(nearer.ok,true);assert.equal(nearer.criteria.sort,'nearest','an explicit nearby refinement overrides the former cheap ordering');assert.deepEqual(ids(),[991771001,991771005]);
 voice.execute('айфон на256гигабайт');const cheapPhone=voice.execute('а теперь дешевле');assert.equal(cheapPhone.criteria.storageGbMin,256);assert(cheapPhone.applied.some(label=>label.includes('256')&&label.includes('ГБ')),'refined searches retain interpreted phone storage feedback');assert.deepEqual(ids(),[991771040]);
 const before=ids();for(const command of ['купи айфон на 256 гигабайт','оплати лот 991771040','сделай ставку 100000','publish listing','delete draft']){voice.open();const blocked=voice.execute(command);assert.equal(blocked.ok,false);assert.equal(blocked.action,'blocked');assert.deepEqual(ids(),before,'financial or destructive voice command never changes catalogue state')}
 assert.equal(microphoneRequests,0);assert.equal(locationRequests,0);assert.equal(run('Object.keys(bids).length'),0);assert.equal(run('readAdvancedFilters().error'),'');timers.clear();
 console.log('PASS: 5 user natural scenarios and compact-unit variants through actual voice execute and typed input, exact cities, pickup/color/mileage, apartment dimensions/budget, phone storage and blocked commands without ASR.');
})().catch(error=>{console.error(error);process.exitCode=1});
