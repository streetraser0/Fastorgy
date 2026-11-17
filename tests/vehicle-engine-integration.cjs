const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {boot}=require('./helpers/category-seller-harness.cjs'),{setup}=require('./helpers/quickbar-dom.cjs');
const read=name=>fs.readFileSync('dist/'+name,'utf8'),h=boot({noMedia:true,fixtureInventory:[]});
for(const file of ['vehicle-engine-facts.js','lot-presentation.js'])vm.runInContext(read(file),h.context);
const now=Date.now(),base={id:999882901,name:'Тест двигателя',bank:'Продавец',city:'Москва',regionCode:'77',price:1000000,start:1000000,step:10000,deposit:0,condition:'used',year:2022,mileage:20000,status:'live',startsAt:new Date(now-3600000).toISOString(),ends:new Date(now+86400000).toISOString(),comparables:[],description:'Сведения продавца'};
function parse(html){const d=setup(),root=d.add('result');root.innerHTML=html;return root}
const facts=root=>['type','volume','power'].map(key=>root.querySelector('[data-engine-fact="'+key+'"]')?.textContent);
for(const data of [
 {category:'cars',subcategory:'cars',fuel:'petrol',engineVolume:2.5,powerHp:150},
 {category:'trucks',subcategory:'trucks',fuel:'diesel',engineVolume:12.4,powerKw:300},
 {category:'cars',subcategory:'cars',fuel:'electric',powerKw:150},
 {category:'trucks',subcategory:'trucks'},
 {category:'other',subcategory:'motorcycles',fuel:'petrol',engineVolume:.4,powerHp:42}
]){
 const lot={...base,...data},expected=Array.from(h.context.window.FasVehicleEngineFacts.read(lot).rows,row=>row.value);h.run('cars=['+JSON.stringify(lot)+'];bids={};');
 const before=h.run('JSON.stringify(cars[0])');
 for(const platform of ['android','ios','desktop']){
  h.context.navigator.userAgent=platform;h.context.window.Capacitor={isNativePlatform:()=>platform!=='desktop',getPlatform:()=>platform};
  h.run('reelsMode=false');const card=parse(h.run('cardHTML(cars[0])'));assert.deepEqual(facts(card),expected,platform+' catalogue shows the same fields');assert.equal(card.querySelectorAll('[data-engine-fact="power"]').length,1);
  assert.equal(card.querySelectorAll('[data-lot-fact="fuel"]').length,0,'old fuel chip is replaced by the common engine block');assert.equal(card.querySelectorAll('[data-lot-fact="power"]').length,0,'old horsepower-only chip does not duplicate converted power');
  h.run('reelsMode=true');assert.deepEqual(facts(parse(h.run('cardHTML(cars[0])'))),expected,platform+' full feed');h.run('reelsMode=false');
  h.run('openCar('+lot.id+')');const detail=parse(h.node('#modal-content').innerHTML),attributes=detail.querySelector('.object-attributes');assert.deepEqual(facts(attributes),expected,platform+' detail table');assert.equal(attributes.querySelectorAll('[data-engine-fact="power"]').length,1);assert(detail.querySelector('#bid-form'),'the original bid form remains');
 }
 assert.equal(h.run('JSON.stringify(cars[0])'),before,'rendering does not mutate inventory or fill missing figures');
}
for(const data of [{category:'property',subcategory:'houses',area:140,powerHp:150},{category:'equipment',powerKw:7.5},{category:'other',subcategory:'phones',powerKw:2},{category:'trucks',subcategory:'trailers'}]){
 h.run('cars=['+JSON.stringify({...base,...data})+'];');assert.equal(parse(h.run('cardHTML(cars[0])')).querySelector('[data-vehicle-engine]'),null);assert(!h.run('objectDetailsHTML(cars[0])').includes('data-engine-fact'),'unrelated property and trailers never receive engine specifications');
}
{
 const d=setup({mobile:true}),c=d.context,section=d.add('featured-lots','section'),track=d.add('featured-track','div',section);d.add('featured-note','p',section);d.add('featured-empty','p',section);
 Object.assign(c,{URL,cars:[{...base,category:'trucks',fuel:'diesel',engineVolume:12.4,powerHp:420}],bids:{},saved:[],userOrigin:()=>null,isLotLive:()=>true,current:lot=>lot.price,image:()=> 'assets/trucks.svg',money:value=>value+' ₽',escapeText:value=>String(value??'')});
 for(const file of ['category-tree.js','vehicle-engine-facts.js','featured-lots.js'])vm.runInContext(read(file),c);
 assert.deepEqual(facts(track),['Дизельный','12,4 л','420 л.с. / 308,9 кВт'],'the upper strip consumes the same renderer');assert.equal(track.querySelectorAll('[data-engine-fact]').length,3);
 c.cars[0].powerHp=300;c.FasFeaturedLots.refresh();assert.equal(facts(track)[2],'300 л.с. / 220,6 кВт','changed source facts invalidate the rendered model');assert(track.querySelector('[data-buyer-share]'),'share remains present');
}
const css=read('vehicle-engine-facts.css');assert(css.includes('flex-wrap:wrap')&&css.includes('overflow-wrap:anywhere')&&css.includes('minmax(0,1fr)'),'facts can wrap down to narrow phone cards');assert(!/display\s*:\s*none|position\s*:\s*(absolute|fixed)|touch-action/.test(css),'engine facts stay in normal reading order without hiding or intercepting gestures');
console.log('PASS: actual catalogue, full-feed, detail and featured renderers share all three engine values across Android/iOS/desktop contexts; missing/EV/truck/motorcycle fixtures, no stale legacy chips, no inventory mutation and nonvehicle exclusions. Browser QA verifies real geometry.');
