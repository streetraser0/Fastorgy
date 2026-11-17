const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const read=name=>fs.readFileSync(path.join(__dirname,'../dist',name),'utf8'),now=Date.now(),hour=3600000,KEY='fas-featured-modes-v1';
const plain=value=>JSON.parse(JSON.stringify(value)),end=hours=>new Date(now+hours*hour).toISOString(),fresh=new Date(now-1000).toISOString();
const analogues=price=>[1,2,3].map(id=>({price,url:'https://example.com/analogue/'+id}));
const lot=(id,fields={})=>({id,name:'Горящий лот '+id,category:'cars',subcategory:'cars',brand:'Toyota',make:'Toyota',model:'Camry',city:'Москва',regionCode:'77',price:60000,status:'live',ends:end(6),coords:[55.75,37.62],marketDate:fresh,comparables:analogues(100000),...fields});
function boot(lots,{desktop=false,storage=new Map()}={}){
 const h=setup({mobile:true}),section=h.add('featured-lots','section'),track=h.add('featured-track','div',section);h.add('featured-note','p',section);h.add('featured-empty','p',section);
 for(const mode of ['for-you','value','nearby','low','ending','hot'])h.add('mode-'+mode,'button',section).setAttribute('data-featured-mode',mode);
 track.scrollLeft=0;track.scrollWidth=6000;track.clientWidth=350;
 const c=h.context;let time=now,context=null;const feeds=[];
 Object.assign(c,{URL,Date:class extends Date{static now(){return time}},cars:lots,bids:{},saved:[],categoryNames:{cars:'Автомобили',property:'Квартиры',other:'Прочее'},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},escapeText:value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])),money:value=>value+' ₽',current:lot=>Math.max(lot.price,c.bids[lot.id]?.price||0),isLotLive:lot=>!!lot&&lot.status==='live'&&Date.parse(lot.ends)>time,userOrigin:()=>({point:[55.75,37.62],city:'Москва',regionCode:'77'}),getRegionCode:lot=>lot.regionCode||'',image:()=> 'assets/cars.svg',FasCatalogBuyerContext:()=>context,FasOpenFeaturedFeed:selection=>{feeds.push(selection);return true},FasDesktopWeb:{active:()=>desktop}});
 vm.runInContext(read('category-tree.js'),c);c.categoryMatches=(lot,selection)=>c.FasCategories.matches(lot,selection);
 const main=read('index.html').match(/<script>([\s\S]*?)<\/script>/)[1],a=main.indexOf('function normalizeMarketComparables('),b=main.indexOf('function valuationHTML(',a);vm.runInContext(main.slice(a,b),c);vm.runInContext(main.match(/function kmBetween\([^\n]+/)[0],c);
 c.lotLocation=lot=>Array.isArray(lot.coords)?{point:lot.coords}:null;c.distanceFromOrigin=(lot,from)=>lot.coords?c.kmBetween(from.point,lot.coords):Infinity;
 vm.runInContext(read('recommendations.js'),c);vm.runInContext(read('featured-lots.js'),c);
 return {...h,c,section,track,feeds,storage,node:selector=>c.document.querySelector(selector),api:c.FasFeaturedLots,ids:()=>track.querySelectorAll('[data-featured-lot]').map(node=>Number(node.dataset.featuredLot)),advance(ms){time+=ms},setContext(category,ids){context={active:true,category,source:c.cars,lots:c.cars.filter(lot=>c.categoryMatches(lot,category)&&(!ids||ids.includes(lot.id)))};c.FasFeaturedLots.refresh()},views(category='cars'){for(let i=0;i<6;i++)c.FasRecommendations.record(lot(8000+i,{category,subcategory:category}),'open');c.FasFeaturedLots.refresh()}};
}
for(const desktop of [false,true]){
 const h=boot([
  lot(1,{price:60000,coords:[59.93,30.31]}),lot(2,{price:80000}),lot(3,{price:30000,coords:[43.12,131.9]}),
  lot(4,{ends:end(12)}),lot(5,{ends:end(12.0001)}),lot(6,{ends:end(0)}),lot(7,{ends:end(-1)}),lot(8,{status:'sold'}),lot(9,{status:'scheduled'}),
  lot(10,{marketDate:new Date(now-31*86400000).toISOString()}),lot(11,{comparables:[]}),lot(12,{marketDate:new Date(now+1000).toISOString()}),lot(13,{price:95000}),
  lot(14,{ends:'invalid'}),lot(15,{price:90000,ends:new Date(now+1).toISOString()}),lot(16,{price:0})
 ],{desktop});
 assert.equal(h.api.setMode('hot'),true);assert.deepEqual(h.ids(),[3,1,2,15],'discount dominates distance; only live strict <12h and >=10% real advantage qualifies');
 assert(h.track.innerHTML.includes('По аналогам продавца'),'market source remains disclosed');
 assert(!h.node('#featured-note').textContent.includes('Сначала ближайшие'),'hot never describes its order as distance-first');
 h.api.openFeed();assert.deepEqual(plain(h.feeds.at(-1).ids),h.ids());
 h.c.bids={3:{price:99000}};h.api.refresh();assert(!h.ids().includes(3),'a new current bid can remove an outdated bargain immediately');
 h.advance(1);h.api.refresh();assert(!h.ids().includes(15),'a lot is removed at its actual end, with no grace period');
 h.api.setModes(['nearby','hot']);assert.deepEqual(h.ids(),[4,1,2],'hot combinations retain advantage first; exact12h candidate enters after clock advances');
 assert(h.node('#featured-note').textContent.includes('Меньше 12 часов'));
}
{
 const h=boot([lot(1),lot(2,{category:'property',subcategory:'property',name:'Квартира',make:'',model:'',brand:'',price:10000})],{desktop:true});h.views();h.api.setMode('hot');assert.deepEqual(h.ids(),[1],'hot respects repeated viewed categories');
 h.setContext('property',[2]);assert.deepEqual(h.ids(),[2],'an explicit desktop property search is authoritative, with no cars leaking in');
 h.api.setModes(['for-you','hot']);assert.deepEqual(h.ids(),[],'combined criteria remain a strict intersection');assert.equal(h.api.openFeed(),false,'empty hot combination cannot open an unrelated feed');
}
{
 const storage=new Map(),h=boot([lot(1)],{storage});h.api.setModes(['hot','value','hot']);assert.deepEqual(plain(h.api.getModes()),['value','hot']);assert.deepEqual(JSON.parse(storage.get(KEY)),['value','hot']);const reload=boot([lot(1)],{storage});assert.deepEqual(plain(reload.api.getModes()),['value','hot']);assert.equal(reload.section.querySelector('[data-featured-mode="hot"]').getAttribute('aria-pressed'),'true');
 const empty=boot([lot(1,{comparables:[]}),lot(2,{ends:end(13)})]);empty.api.setMode('hot');assert.deepEqual(empty.ids(),[]);assert(empty.node('#featured-empty').textContent.includes('менее чем через 12 часов'));assert.equal(empty.api.openFeed(),false);assert.equal(empty.feeds.length,0);
}
for(const modes of [['hot'],['ending','hot']]){
 const h=boot([lot(1,{ends:new Date(now+12*hour+1000).toISOString()}),lot(2,{price:80000})]);h.api.setModes(modes);assert.deepEqual(h.ids(),[2]);h.api.openFeed();const request=h.feeds.at(-1);assert(plain(request.scopeIds).includes(1),'scope retains a future candidate for a running full feed');
 h.advance(1000);h.api.refresh();assert.deepEqual(h.ids(),[2],'exact 12h excluded from cached preview');assert.deepEqual(plain(h.api.orderLots(h.c.cars,request.modes).map(lot=>lot.id)),[2]);
 h.advance(1);h.api.refresh();assert.deepEqual(h.ids(),[1,2],'cache admits newly eligible hot lot at 12h minus 1ms, without manual invalidation');assert.deepEqual(plain(h.api.orderLots(h.c.cars,request.modes).map(lot=>lot.id)),[1,2]);
}
{
 const inventory=Array.from({length:28},(_,i)=>lot(100+i,{price:20000+i*1000}));const h=boot(inventory);h.api.setMode('hot');assert.equal(h.ids().length,12);h.api.openFeed();assert.equal(h.feeds.at(-1).ids.length,28,'full hot feed includes all matching lots beyond preview12');
 assert.deepEqual(plain(h.feeds.at(-1).ids),inventory.map(lot=>lot.id));h.c.cars[27].status='paused';h.api.openFeed();assert(!h.feeds.at(-1).ids.includes(127),'late availability changes outside preview are rechecked');
 const oldModes=['for-you','value','nearby','low','ending'];for(let mask=0;mask<32;mask++){const modes=[...oldModes.filter((_,i)=>mask&(1<<i)),'hot'];assert(h.api.setModes(modes));const prices=h.ids().map(id=>h.c.cars.find(lot=>lot.id===id).price);assert(prices.every((p,i)=>i===0||p>=prices[i-1]),'equal market values order by actual discount in every hot combination');}
}
{
 const {boot:mainBoot}=require('./helpers/category-seller-harness.cjs'),h=mainBoot();const item=lot(999721901,{price:50000,start:50000,step:1000,deposit:0,name:'Горячий тест',ends:end(5),latitude:55.75,longitude:37.62});
 h.run('cars.push('+JSON.stringify(item)+');ends.push(Date.parse(cars.at(-1).ends));$("#advanced-reset").onclick();$("#category").value="cars";$("#search").value="Горячий тест";render()');
 vm.runInContext(read('recommendations.js'),h.context);vm.runInContext(read('featured-lots.js'),h.context);h.run('window.FasFeaturedLots.setMode("hot")');assert.equal(h.run('window.FasFeaturedLots.openFeed()'),true);
 assert.deepEqual(plain(h.run('recommendationSession.featureModes')),['hot'],'real index bridge retains hot instead of replacing it with For You');assert.deepEqual(plain(h.run('visibleLots.map(lot=>lot.id)')),[item.id]);assert(h.run('activeAuctionTimeWindows({ends:""}).includes(12*3600000-1)'),'running hot feed registers strict time boundary');
 h.run('setReels(false)');assert.equal(h.node('#search').value,'Горячий тест');assert.equal(h.node('#category').value,'cars','feed return preserves original search');
}
console.log('PASS: hot live <12h boundaries and cache admission, actual-price/fresh-analogue advantage ordering, personalization/search/intersections, empty state, persistence, all matching feed rows and real feed/time-window bridge.');
