const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const read=name=>fs.readFileSync(path.join(__dirname,'../dist',name),'utf8'),source=read('featured-lots.js'),MODES=['for-you','value','nearby','low','ending'],KEY='fas-featured-modes-v1',now=Date.now(),hour=3600000;
const end=hours=>new Date(now+hours*hour).toISOString(),fresh=new Date(now-1000).toISOString();
const analogue=price=>[1,2,3].map(id=>({price,url:'https://example.com/analogue/'+id}));
const lot=(id,fields={})=>({id,name:'Автомобиль '+id,category:'cars',subcategory:'cars',brand:'Toyota',make:'Toyota',model:'Camry',city:'Воронеж',regionCode:'36',price:60000,status:'live',ends:end(6),coords:[51.6608,39.22],marketDate:fresh,comparables:analogue(100000),...fields});
const plain=value=>JSON.parse(JSON.stringify(value));
function boot(lots,{origin={point:[51.6608,39.2003],city:'Воронеж',regionCode:'36'},storage=new Map(),quota=false}={}){
 const h=setup({mobile:true}),section=h.add('featured-lots','section'),track=h.add('featured-track','div',section);h.add('featured-note','p',section);h.add('featured-empty','p',section);
 for(const mode of MODES)h.add('mode-'+mode,'button',section).setAttribute('data-featured-mode',mode);
 for(const direction of [-1,1])h.add('arrow-'+direction,'button',section).setAttribute('data-featured-move',String(direction));
 track.scrollLeft=0;track.scrollWidth=6000;track.clientWidth=350;
 const c=h.context;let point=origin,context=null,time=now;const feeds=[];
 Object.assign(c,{URL,Date:class extends Date{static now(){return time}},cars:lots,bids:{},saved:[],categoryNames:{cars:'Автомобили',property:'Квартиры',other:'Прочее'},localStorage:{getItem:key=>storage.get(key)??null,setItem(key,value){if(quota&&key===KEY)throw Error('quota');storage.set(key,value)}},escapeText:value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])),money:value=>value+' ₽',current:lot=>Math.max(lot.price,c.bids[lot.id]?.price||0),isLotLive:lot=>!!lot&&lot.status==='live'&&Date.parse(lot.ends)>time,userOrigin:()=>point,getRegionCode:lot=>lot.regionCode||'',image:()=> 'assets/cars.svg',FasCatalogBuyerContext:()=>context,FasOpenFeaturedFeed:selection=>{feeds.push(selection);return true}});
 vm.runInContext(read('category-tree.js'),c);c.categoryMatches=(lot,selection)=>c.FasCategories.matches(lot,selection);
 const main=read('index.html').match(/<script>([\s\S]*?)<\/script>/)[1],a=main.indexOf('function normalizeMarketComparables('),b=main.indexOf('function valuationHTML(',a);vm.runInContext(main.slice(a,b),c);vm.runInContext(main.match(/function kmBetween\([^\n]+/)[0],c);
 c.lotLocation=lot=>Array.isArray(lot.coords)?{point:lot.coords}:null;
 c.distanceFromOrigin=(lot,from)=>lot.coords&&Array.isArray(from?.point)?c.kmBetween(from.point,lot.coords):Infinity;
 vm.runInContext(read('recommendations.js'),c);vm.runInContext(source,c);
 const click=mode=>section.dispatchEvent({type:'click',target:section.querySelector('[data-featured-mode="'+mode+'"]'),preventDefault(){}});
 return {...h,section,track,c,feeds,storage,api:c.FasFeaturedLots,engine:c.FasRecommendations,click,ids:()=>track.querySelectorAll('[data-featured-lot]').map(node=>Number(node.dataset.featuredLot)),advance(ms){time+=ms},setOrigin:value=>{point=value;c.FasFeaturedLots.refresh()},setContext(category){context={active:true,category,source:c.cars,lots:c.cars.filter(lot=>c.categoryMatches(lot,category))};c.FasFeaturedLots.refresh()},views(type='cars'){for(let i=0;i<6;i++)c.FasRecommendations.record(lot(8000+i,{category:type,subcategory:type}),'open');c.FasFeaturedLots.refresh()}};
}
const selected=h=>h.ids().map(id=>h.c.cars.find(lot=>lot.id===id));
const distance=(h,lot)=>h.c.distanceFromOrigin(lot,h.c.userOrigin());
function nearest(h){const values=selected(h).map(lot=>distance(h,lot));for(let i=1;i<values.length;i++)assert(values[i]>=values[i-1],'combined modes keep known distance first and unknown last')}

{
 const h=boot([
  lot(1,{city:'Воронеж',coords:[52.6608,39.2003],price:40000}),
  lot(2,{city:'Семилуки',coords:[51.6608,39.201],price:80000,comparables:analogue(200000)}),
  lot(3,{city:'Новая Усмань',coords:[51.6608,39.201],price:50000}),
  lot(4,{coords:null,price:10000}),lot(5,{price:95000}),lot(6,{marketDate:new Date(now-31*86400000).toISOString()}),
  lot(7,{comparables:[]}),lot(8,{ends:end(24)}),lot(9,{ends:end(24.01)}),lot(10,{status:'sold'}),
  lot(11,{category:'property',subcategory:'property',name:'Квартира',price:10000,coords:[51.6608,39.20031]})
 ]);h.views();
 h.api.setMode('for-you');assert(h.ids().indexOf(1)<h.ids().indexOf(2),'legacy single For You remains city-first');
 h.click('nearby');assert.deepEqual(plain(h.api.getModes()),['for-you','nearby']);assert(h.ids().indexOf(2)<h.ids().indexOf(1),'For You + Nearby gives strict nearest order');assert(!h.ids().includes(11),'AND keeps watched car group');nearest(h);
 h.click('nearby');assert.deepEqual(plain(h.api.getModes()),['for-you'],'second click removes only that criterion');
 h.api.setModes(['for-you','value']);assert.deepEqual(h.ids(),[2,3,8,9,1,4],'real deals intersect watched types; nearest then market advantage');
 h.api.setModes(['for-you','low']);assert.deepEqual(h.ids(),[3,2,8,9,1,4],'combined cheap uses price only to break equal distances, never before distance');
 h.api.setModes(['low','value','for-you']);assert.deepEqual(plain(h.api.getModes()),['for-you','value','low']);assert.deepEqual(h.ids(),[3,2,8,9,1,4]);
 h.api.setModes(['for-you','value','low','ending']);assert.deepEqual(h.ids(),[3,2,1,4]);assert(!h.ids().includes(8),'exact24h is excluded');assert(!h.ids().includes(9));
 h.setContext('property');assert.deepEqual(h.ids(),[],'manual property selection AND watched cars remains empty without unrelated fallback');
 h.api.setModes([]);assert.deepEqual(h.ids(),[11],'no modes shows eligible current category without forcing For You');assert(MODES.every(mode=>h.section.querySelector('[data-featured-mode="'+mode+'"]').getAttribute('aria-pressed')==='false'));
 h.api.setModes(['for-you','ending']);assert.deepEqual(h.ids(),[]);assert.equal(h.api.openFeed(),false,'empty intersection cannot open another feed');
}
{
 const inventory=Array.from({length:28},(_,i)=>lot(100+i,{coords:[51.6608,39.201+i*.005],price:40000+i*500}));
 inventory.push(lot(500,{category:'property',subcategory:'property',price:50000}),lot(501,{category:'other',subcategory:'kitchenware',price:10000}),lot(502,{status:'paused'}));
 const h=boot(inventory);h.views();const either=h.c.FasCategories.selectionValue(['cars','property']);h.setContext(either);
 for(let mask=0;mask<32;mask++){
  const modes=MODES.filter((_,i)=>mask&(1<<i));assert.equal(h.api.setModes(modes),true);assert.deepEqual(plain(h.api.getModes()),modes);
  assert.equal(h.section.querySelectorAll('[aria-pressed="true"]').length,modes.length);assert.equal(new Set(h.ids()).size,h.ids().length);
  assert(selected(h).every(lot=>lot.status==='live'&&h.c.categoryMatches(lot,either)),'all32sets keep current OR category scope and active items');
  if(modes.length!==1)nearest(h);
  const original=plain(h.api.getModes());for(const mode of MODES){h.click(mode);const next=MODES.filter(value=>value===mode?!original.includes(value):original.includes(value));assert.deepEqual(plain(h.api.getModes()),next);h.click(mode);assert.deepEqual(plain(h.api.getModes()),original)}
 }
 h.api.setModes(['for-you','value','ending']);assert.equal(h.ids().length,12);assert.equal(h.api.openFeed(),true);
 const feed=h.feeds.at(-1);assert.deepEqual(plain(feed.modes),['for-you','value','ending']);assert.equal(feed.ids.length,28,'full feed includes every qualifying item beyond preview12');assert.equal(feed.scopeIds.length,28);
 assert(feed.ids.every(id=>id>=100&&id<128));assert.equal(new Set(feed.ids).size,28);
 h.c.cars.find(lot=>lot.id===127).status='sold';h.api.openFeed();assert(!h.feeds.at(-1).ids.includes(127),'late unavailability is checked beyond the visible preview');
 const copy=h.api.getModes();copy.length=0;assert.equal(h.api.getModes().length,3,'getModes does not expose mutable state');
}
{
 const h=boot([lot(31,{coords:null,price:20000}),lot(32,{coords:[51.66,39.21],price:60000})]);h.views();h.api.setModes(['for-you','low']);assert.deepEqual(h.ids(),[32,31]);
 h.setOrigin({point:[51.6608,39.2003],approximate:true,regionCode:'36'});assert.deepEqual(h.ids(),[32,31],'declared regional-center fallback is a real reference, not invented GPS');
 h.setOrigin(null);assert.deepEqual(h.ids(),[31,32],'without an origin only the declared price tie-break remains');assert(!h.track.innerHTML.includes(' км'));
 h.setOrigin({city:'Воронеж',regionCode:'36'});assert.deepEqual(h.ids(),[31,32]);assert(!h.track.innerHTML.includes(' км'),'a city label alone cannot manufacture distance');
}
for(const [key,raw,expected]of [
 [KEY,JSON.stringify([]),[]],[KEY,JSON.stringify(['ending','value','value','unknown','for-you']),['for-you','value','ending']],
 [KEY,JSON.stringify({version:1,mode:'value'}),['value']],['fas-featured-mode-v1','low',['low']],['fas-featured-mode',JSON.stringify('ending'),['ending']],
 [KEY,'{broken',['for-you']],[KEY,JSON.stringify(['invalid']),['for-you']],[KEY,JSON.stringify({version:99,modes:[]}),['for-you']]
]){
 const storage=new Map([[key,raw]]),h=boot([lot(1)],{storage});assert.deepEqual(plain(h.api.getModes()),expected,'legacy/invalid state '+raw);
 h.api.setModes(['nearby','value','nearby']);assert.deepEqual(JSON.parse(storage.get(KEY)),['value','nearby']);const reload=boot([lot(1)],{storage});assert.deepEqual(plain(reload.api.getModes()),['value','nearby']);
}
{
 const h=boot([lot(1)],{quota:true});assert.equal(h.api.setModes([]),true);assert.deepEqual(plain(h.api.getModes()),[]);assert.equal(h.api.state().storageAvailable,false);
 assert.equal(h.api.setMode('buy-now'),false);assert.equal(h.api.setModes(['unknown']),false);assert.deepEqual(plain(h.api.getModes()),[]);
}
{
 const h=boot([lot(61),lot(62,{ends:new Date(now+24*hour+1000).toISOString()}),lot(63,{category:'property',subcategory:'property',ends:end(3)})]);h.views();h.api.setModes(['for-you','value','ending']);h.api.openFeed();
 const request=h.feeds.at(-1);assert.deepEqual(plain(request.ids),[61]);assert.deepEqual(plain(request.scopeIds),[61,62],'the full source scope keeps a matching asset before its 24h entry, without unrelated property');
 const pool=h.c.cars.filter(lot=>request.scopeIds.includes(lot.id));
 h.advance(1000);assert.deepEqual(plain(h.api.orderLots(pool,request.modes).map(lot=>lot.id)),[61],'exact24h remains excluded inside an already opened feed');
 h.advance(1);assert.deepEqual(plain(h.api.orderLots(pool,request.modes).map(lot=>lot.id)),[61,62],'saved broad scope lets the real clock boundary admit the newly matching lot');
 h.api.invalidate();h.api.refresh();assert.deepEqual(h.ids(),[61,62],'the same boundary refresh updates the preview');
}
{
 const {boot:mainBoot}=require('./helpers/category-seller-harness.cjs'),h=mainBoot();
 const make=(id,category,price,hours)=>({id,name:'Комбо '+id,category,subcategory:category,city:'Воронеж',regionCode:'36',price,start:price,step:1000,deposit:0,status:'live',ends:end(hours),latitude:51.67,longitude:39.21,marketDate:fresh,comparables:analogue(price*2)});
 h.run('cars.push('+JSON.stringify(make(999721001,'cars',50000,3))+','+JSON.stringify(make(999721002,'cars',60000,36))+','+JSON.stringify(make(999721003,'property',100000,2))+');ends.push(...cars.slice(-3).map(lot=>Date.parse(lot.ends)));$("#advanced-reset").onclick();$("#category").value="cars";$("#search").value="Комбо";render()');
 vm.runInContext(read('recommendations.js'),h.context);vm.runInContext(source,h.context);h.run('window.FasFeaturedLots.setModes(["value","nearby","ending"])');
 assert.equal(h.run('window.FasFeaturedLots.openFeed()'),true);assert.equal(h.run('reelsMode'),true);assert.deepEqual(plain(h.run('recommendationSession.featureModes')),['value','nearby','ending']);assert.deepEqual(plain(h.run('visibleLots.map(lot=>lot.id)')),[999721001]);
 h.run('setReels(false)');assert.equal(h.node('#search').value,'Комбо');assert.equal(h.node('#category').value,'cars','combined full feed returns to the original manual search');
}
console.log('PASS: all32 independent mode sets, strict intersections and selected-category OR, real assessments, nearest/tie/unknown ordering, empty/no-mode behavior, normalized persistence/migration, complete feeds beyond12 and actual query-return bridge.');
