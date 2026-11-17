const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {boot}=require('./helpers/category-seller-harness.cjs');
const root=path.resolve(__dirname,'..'),h=boot({noMedia:true}),run=h.run;
const lots=run('cars'),regions=run('RF_REGIONS'),samples=lots.filter(lot=>lot.demoVehicleSample==='kamaz-5490');
assert.equal(lots.length,52870);assert.equal(samples.length,85);
assert.equal(new Set(lots.map(lot=>lot.id)).size,lots.length);
const oldLots=lots.filter(lot=>lot.demoVehicleSample!=='kamaz-5490');
const identity=rows=>JSON.stringify(rows.map(({id,category,subcategory,name,image,price,brand,model})=>({id,category,subcategory,name,image,price,brand,model})));
assert.equal(oldLots.length,52785);
const data={Date};vm.createContext(data);for(const file of ['category-tree.js','demo-profiles.js','catalog-data.js'])vm.runInContext(fs.readFileSync(path.join(root,'dist',file),'utf8'),data);
const originalGenerated=data.seedDemoLots([]).filter(lot=>lot.demoVehicleSample!=='kamaz-5490');
assert.equal(crypto.createHash('sha256').update(identity(originalGenerated)).digest('hex'),'4d558a8f44ffbf11229cbd5e8f77ae13f2689c9b29b6889d3a9a6ca47a0d3d12','all previously generated IDs, identities, photos, prices and their order are preserved');
assert.deepEqual(lots.slice(0,oldLots.length).map(lot=>lot.id),oldLots.map(lot=>lot.id),'new examples append after the existing inventory');
for(const region of regions){
 const found=samples.filter(lot=>lot.regionCode===region.code);assert.equal(found.length,1);const lot=found[0];
 assert.equal(lot.category,'trucks');assert.equal(lot.subcategory,'trucks');assert.equal(lot.brand,'КамАЗ');assert.equal(lot.manufacturer,'КамАЗ');assert.equal(lot.model,'5490');
 assert(lot.demo&&lot.specsDemo&&lot.demoCatalogVersion===3);assert.equal(lot.image,'assets/trucks.svg');assert.equal(lot.media.length,0);
 assert(lot.description.includes('не реальное предложение'));assert(lot.description.includes('не фотография КамАЗ 5490'));assert(lot.completeness.includes('не показывает имущество в указанном регионе'));
 assert(!lot.vin&&!lot.VIN);assert(run('isLotLive(cars.find(lot=>lot.id==='+lot.id+'))'));
 assert.equal(h.context.window.FasDemoPhotos.resolve(lot),lot.image,'no other truck make supplies its photograph');
}
assert(/FAS · DEMO|ДЕМО · ИЛЛЮСТРАЦИЯ КАТЕГОРИИ/.test(fs.readFileSync(path.join(root,'dist/assets/trucks.svg'),'utf8')));
const order=lots.map(lot=>lot.id).join(',');run('cars=seedDemoLots(cars)');assert.equal(run('cars.map(lot=>lot.id).join(",")'),order,'repeat hydration does not add duplicate examples or reorder inventory');
assert(run('cars.filter(lot=>lot.demoVehicleSample==="kamaz-5490").every(lot=>lot.image==="assets/trucks.svg"&&lot.media.length===0)'),'rehydration never adds unrelated photographs or alternate views to the illustration');

// Load the actual category trigger and asynchronous input layer. The base
// harness supplies the catalogue; these DOM methods are irrelevant to layout.
const label=h.node('kamaz-category-label');
const createElement=h.context.document.createElement;h.context.document.createElement=(...args)=>{const element=createElement(...args);element.appendChild=child=>child;return element};
h.context.document.body.appendChild=()=>{};h.node('#category').insertAdjacentElement=()=>{};
h.node('[data-browse-categories]').querySelector=selector=>selector==='span'?label:null;
vm.runInContext(fs.readFileSync(path.join(root,'dist/category-ui.js'),'utf8'),h.context);
h.node('#modal-content').querySelector=()=>null;
for(const selector of ['#modal','#grid'])h.node(selector).removeAttribute=function(name){delete this[name]};
const timers=new Map();let timerId=0;
h.context.setTimeout=callback=>{timers.set(++timerId,callback);return timerId};h.context.clearTimeout=id=>timers.delete(id);
vm.runInContext(fs.readFileSync(path.join(root,'dist/app-ui.js'),'utf8'),h.context);
async function settle(){for(let pass=0;pass<8;pass++){while(timers.size){const jobs=[...timers.values()];timers.clear();jobs.forEach(callback=>callback())}await Promise.resolve()}}
async function input(query){h.node('#search').value=query;h.node('#search').oninput({isComposing:false});await settle()}
async function submit(){await h.node('#filters').onsubmit({preventDefault(){}});await settle()}
function assertKamazResults(query){
 assert.equal(h.node('#category').value,'trucks',query+' selects the actual truck category');assert.equal(label.textContent,'Грузовики и автобусы',query+' synchronizes the visible category trigger');
 assert.equal(run('visibleLots.length'),85);assert(run('visibleLots.every(lot=>lot.demoVehicleSample==="kamaz-5490")'));
 assert.equal(run('visibleLots[0].city'),'Воронеж');
 assert(run('visibleLots.every((lot,index)=>!index||distanceToLot(visibleLots[index-1])<=distanceToLot(lot))'),'nearest-first results preserve distance order');
}
(async()=>{
 run('userGeo={point:[51.66,39.2],approximate:false};$("#sort").value="nearest"');
 for(const query of ['Камаз','KAMAZ','КамАЗ 5490']){await input(query);assertKamazResults(query);await submit();assertKamazResults(query+' submitted')}
 // A zero-result exact model remains classified as a truck, and never borrows
 // a nearby model or an unrelated make to fill the empty state.
 await input('КамАЗ 54901');await submit();assert.equal(run('visibleLots.length'),0);assert.equal(h.node('#category').value,'trucks');assert.equal(label.textContent,'Грузовики и автобусы');
 // A same-query explicit category selection remains an intentional constraint.
 await input('Камаз');h.node('#category').value='cars';await h.node('#category').onchange();await settle();await submit();
 assert.equal(h.node('#category').value,'cars');assert.equal(label.textContent,'Легковые автомобили');assert.equal(run('visibleLots.length'),0);
 await input('KAMAZ');assertKamazResults('new make query after an explicit category');
 // Regional saved user changes and occupied IDs survive regeneration.
 const sample=samples[0],edited={...sample,demoEdited:true,name:'Мой изменённый КамАЗ',brand:'Марка из редактора',model:'Моя модель',price:7777777,description:'Описание собственника',image:'https://example.com/my-truck.jpg',ends:new Date(Date.now()-86400000).toISOString()},snapshot=JSON.stringify(edited);
 h.context.kamazEdited=edited;run('window.kamazRegenerated=seedDemoLots([kamazEdited])');
 assert.equal(JSON.stringify(edited),snapshot);assert.equal(run('window.kamazRegenerated.length'),52870);assert.equal(run('window.kamazRegenerated.filter(lot=>lot.demoVehicleSample==="kamaz-5490"&&lot.regionCode===kamazEdited.regionCode).length'),1);
 const collision={id:9100000,demo:false,name:'Личный лот',category:'other',subcategory:'phones',description:'Мои данные'};h.context.kamazCollision=collision;
 run('window.kamazCollisionLots=seedDemoLots([kamazCollision])');assert.equal(run('window.kamazCollisionLots.find(lot=>lot.id===9100000)'),collision);assert.equal(run('new Set(window.kamazCollisionLots.map(lot=>lot.id)).size'),52871);
 const collisionIds=run('window.kamazCollisionLots.map(lot=>lot.id).join(",")');assert.equal(run('seedDemoLots(window.kamazCollisionLots).map(lot=>lot.id).join(",")'),collisionIds);
 console.log('PASS: 85 truthful KamАЗ illustration demos append without changing existing inventory; normal input/submit synchronizes the visible truck category, exact make/model and nearest order; edited lots, zero results and ID collisions stay safe.');
})().catch(error=>{console.error(error);process.exitCode=1});
