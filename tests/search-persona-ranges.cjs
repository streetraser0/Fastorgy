const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist'),{boot}=require(path.join(root,'tests/helpers/category-seller-harness.cjs')),{setup}=require(path.join(root,'tests/helpers/quickbar-dom.cjs'));
const h=boot({noMedia:true}),c=h.context,run=h.run,voiceDOM=setup({mobile:true});h.context.document.createElement=voiceDOM.document.createElement;h.context.document.body.appendChild=node=>voiceDOM.document.body.appendChild(node);
let microphoneRequests=0,locationRequests=0;h.context.navigator.geolocation={getCurrentPosition(){locationRequests++;throw Error('must not request location')}};h.context.window.SpeechRecognition=class{constructor(){microphoneRequests++}start(){throw Error('must not start ASR')}};
vm.runInContext(fs.readFileSync(path.join(dist,'voice-assistant.js'),'utf8'),c);const voice=c.window.FasVoiceAssistant;
const base={city:'Воронеж',regionCode:'36',latitude:51.6609,longitude:39.2,price:2800000,start:2800000,step:1000,deposit:0,status:'live',ends:new Date(Date.now()+86400000).toISOString(),condition:'used',year:2020};
const rav={...base,category:'cars',subcategory:'cars',name:'Toyota RAV4',brand:'Toyota',model:'RAV4',fuel:'diesel',transmission:'auto'};
const apartment={...base,category:'property',subcategory:'property',name:'Квартира',rooms:2,area:60};
const fixtures=[
 {...rav,id:991881001},{...rav,id:991881002,year:2019,price:2900000,start:2900000,latitude:51.70},
 {...rav,id:991881003,year:2023},{...rav,id:991881004,transmission:'manual'},{...rav,id:991881005,fuel:'petrol'},{...rav,id:991881006,price:3500000,start:3500000},{...rav,id:991881007,year:null},
 {...apartment,id:991881101,price:5000000,start:5000000},
 {...apartment,id:991881102,rooms:3,price:2000000,start:2000000,latitude:51.70},
 {...apartment,id:991881103,rooms:1,price:3000000,start:3000000,latitude:51.67},
 {...apartment,id:991881104,rooms:4,price:1000000,start:1000000,latitude:51.68},
 {...apartment,id:991881105,rooms:null,price:1500000,start:1500000,latitude:51.69},
 {...apartment,id:991881106,subcategory:'houses',name:'Дом',rooms:3,price:1200000,start:1200000},
 {...apartment,id:991881107,city:'Москва',regionCode:'77',latitude:55.756,longitude:37.617,price:900000,start:900000}
];
run('cars='+JSON.stringify(fixtures)+';ends.length=0;cars.forEach(lot=>ends.push(Date.parse(lot.ends)));invalidateSubscriptionInventory();window.FasKeywordSearch.invalidate();userGeo={point:[51.6608,39.2003],approximate:false};$("#sort").value="nearest";render();');
h.node('#modal-content').querySelector=()=>null;for(const id of ['#modal','#grid','#result-count'])h.node(id).removeAttribute=function(name){delete this[name]};let time=0,timerId=0;const timers=new Map();c.setTimeout=(handler,delay=0)=>{const id=++timerId;timers.set(id,{handler,at:time+delay});return id};c.clearTimeout=id=>timers.delete(id);vm.runInContext(fs.readFileSync(path.join(dist,'app-ui.js'),'utf8'),c);
const ids=()=>Array.from(run('visibleLots.map(lot=>lot.id)'));async function settle(ms=0){time+=ms;for(let i=0;i<35;i++){const jobs=[...timers].filter(([,job])=>job.at<=time);for(const[id,job]of jobs){timers.delete(id);job.handler()}await Promise.resolve()}}

const cheap=[991881104,991881105,991881102,991881103,991881101],nearest=[991881101,991881103,991881104,991881105,991881102];
async function typed(query){run('$("#advanced-reset").onclick();$("#sort").value="nearest";');h.node('#search').value=query;h.node('#search').oninput({target:h.node('#search')});await settle(180);h.node('#filters').onsubmit({preventDefault(){}});await settle();assert.equal(h.node('#search').value,query);return run('window.FasKeywordSearch.compile($("#search").value).intent')}
function spoken(query){run('$("#advanced-reset").onclick();$("#sort").value="nearest";');voice.open();return voice.execute(query)}
(async()=>{
 for(const query of ['Toyota RAV4 дизель автомат от 2019 до 2022 года до 3 млн','Toyota RAV4 дизель автомат от2019до2022года до3млн']){
  const intent=await typed(query);assert.equal(intent.error,'');assert.deepEqual(ids(),[991881001,991881002]);assert.equal(intent.criteria.yearMin,2019);assert.equal(intent.criteria.yearMax,2022);assert.equal(intent.criteria.priceMax,3000000);
  const result=spoken('найди '+query);assert.equal(result.ok,true);assert.deepEqual(ids(),[991881001,991881002]);assert.equal(result.criteria.yearMax,2022);assert.equal(result.criteria.priceMax,3000000);
 }
 for(const query of ['квартира от 2 до 3 комнат','квартира от2до3комнат']){
  const intent=await typed(query);assert.deepEqual(ids(),[991881101,991881102,991881107]);assert.equal(intent.criteria.roomsMin,2);assert.equal(intent.criteria.roomsMax,3);assert.equal(intent.criteria.priceMin,undefined);assert.equal(intent.criteria.priceMax,undefined);assert.equal(intent.residual,'квартира');
  const result=spoken('найди '+query);assert.equal(result.ok,true);assert.deepEqual(ids(),[991881101,991881102,991881107]);assert.equal(result.criteria.roomsMin,2);assert.equal(result.criteria.roomsMax,3);
 }
 for(const adjective of ['недорогая','недорогую','дешёвую','cheap']){
  const query=adjective+' квартира в Воронеже',intent=await typed(query);assert.equal(intent.criteria.sort,'low');assert.equal(intent.criteria.priceMax,undefined);assert.equal(intent.criteria.priceMin,undefined);assert.deepEqual(ids(),cheap,'no invented cap excludes a 5m apartment: '+query);assert.equal(h.node('#sort').value,'low');
  const result=spoken('найди '+query);assert.equal(result.ok,true);assert.equal(result.criteria.sort,'low');assert.equal(result.criteria.priceMax,undefined);assert.equal(result.criteria.priceMin,undefined);assert.deepEqual(ids(),cheap);
 }
 for(const [query,sort,expected]of [
  ['недорогая квартира в Воронеже рядом','nearest',nearest],['рядом недорогую квартиру в Воронеже','low',cheap],
  ['квартира сначала дешевле рядом в Воронеже','nearest',nearest],['квартира рядом сначала дешевле в Воронеже','low',cheap]
 ]){const intent=await typed(query);assert.equal(intent.criteria.sort,sort);assert.equal(h.node('#sort').value,sort);assert.deepEqual(ids(),expected);const result=spoken('найди '+query);assert.equal(result.criteria.sort,sort);assert.deepEqual(ids(),expected);assert.equal(result.criteria.radius,undefined,'nearby never invents a cutoff')}
 await typed('недорогая квартира в Воронеже');h.node('#sort').value='high';h.node('#sort').onchange({target:h.node('#sort')});await settle();h.node('#filters').onsubmit({preventDefault(){}});await settle();assert.equal(h.node('#sort').value,'high','manual sort survives re-submitting the same query');assert.deepEqual(ids(),cheap.slice().reverse());
 for(const query of ['Toyota RAV4 от 2022 до 2019 года до 3 млн','Toyota RAV4 от2022до2019года до3млн','квартира от3до2комнат','квартира от 2 до 3 комнат однокомнатная']){
  const previous=ids();h.node('#search').value=query;h.node('#search').oninput({target:h.node('#search')});await settle(180);assert(run('readAdvancedFilters().error'),query);assert.deepEqual(ids(),previous,'typed invalid range preserves results');voice.open();const result=voice.execute('найди '+query);assert.equal(result.ok,false);assert.equal(result.action,'invalid');assert.deepEqual(ids(),previous,'spoken invalid range preserves results');voice.close();
 }
 run('$("#advanced-reset").onclick()');const P=c.window.FasQueryIntent,S=c.window.FasKeywordSearch;
 assert.equal(P.parse('выгодная квартира').criteria.sort,undefined,'value requires an assessment and is not silently cheap');
 for(const query of ['BMW 2002','1900 Css','Austin 10 Hp','2020']){const intent=S.compile(query).intent;assert.equal(intent.criteria.priceMin,undefined);assert.equal(intent.criteria.priceMax,undefined);assert.equal(intent.criteria.yearMin,undefined)}
 const city=spoken('find apartment near Moscow');assert.equal(city.ok,true);assert.equal(city.criteria.city,'Москва','near-city phrase remains an explicit location');assert.deepEqual(ids(),[991881107]);
 assert.equal(microphoneRequests,0);assert.equal(locationRequests,0);assert.equal(run('Object.keys(bids).length'),0);timers.clear();
 console.log('PASS: persona year+budget boundaries, room ranges, cheap without a cap, last explicit sort/manual override, typed+voice invalid recovery, models and exact locations.');
})().catch(error=>{console.error(error);process.exitCode=1});
