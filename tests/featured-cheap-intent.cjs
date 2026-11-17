const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const path=require('path');const read=name=>fs.readFileSync(path.join(__dirname,'../dist',name),'utf8');
const featured=read('featured-lots.js'),recommendations=read('recommendations.js');
const now=Date.now(),end=new Date(now+86400000).toISOString();
const lot=(id,fields={})=>({id,status:'live',ends:end,category:'cars',subcategory:'cars',price:10000,distance:1,name:'Лот '+id,make:'Toyota',model:'Camry',year:2021,...fields});
function boot(lots,{saved=[],origin={point:[51,39]}}={}){
 const h=setup({mobile:true}),section=h.add('featured-lots','section'),track=h.add('featured-track','div',section),note=h.add('featured-note','p',section);h.add('featured-empty','p',section);track.scrollLeft=0;track.scrollWidth=4000;track.clientWidth=500;
 h.add('category','select');h.add('region-filter','select');h.add('city','select');h.add('brand','select');h.add('budget','select');h.add('sort','select');
 for(const value of ['for-you','value','nearby','low','ending','buy-now'])h.add('mode-'+value,'button',section).setAttribute('data-featured-mode',value);
 for(const direction of [-1,1])h.add('move-'+direction,'button',section).setAttribute('data-featured-move',String(direction));
 const c=h.context,stored=new Map(),calls={seed:0,select:0,live:0,distance:0};let point=origin,time=now,scope={active:false,lots:[],category:'',source:lots};
 c.URL=URL;c.Date=class extends Date{static now(){return time}};c.localStorage={getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value)};c.cars=lots;c.saved=saved;c.bids={};c.categoryNames={cars:'Авто',trucks:'Грузовики',property:'Недвижимость',electronics:'Электроника'};
 c.isLotLive=value=>{calls.live++;return !!value&&value.status==='live'&&Date.parse(value.ends)>time};c.current=value=>Math.max(value.price,c.bids[value.id]?.price||0);c.userOrigin=()=>point;c.distanceFromOrigin=(value,from)=>{calls.distance++;return Math.abs(value.distance-(from.offset||0))};c.isOwnLot=()=>false;c.image=value=>'assets/'+value.category+'.svg';c.escapeText=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));c.money=value=>value+' ₽';
 c.FasCatalogBuyerContext=()=>scope;c.categoryMatches=(value,selection)=>c.FasCategories.matches(value,selection);
 c.FasPartnerBranding={html:value=>'<span class="partner-brand">Партнёр '+value.id+'</span>'};
 vm.runInContext(read('category-tree.js'),c);vm.runInContext(read('search-typos.js'),c);vm.runInContext(read('search-intent.js'),c);vm.runInContext(read('keyword-search.js'),c);
 const main=read('index.html').match(/<script>([\s\S]*?)<\/script>/)[1],start=main.indexOf('function normalizeMarketComparables('),finish=main.indexOf('function valuationHTML(',start);assert(start>=0&&finish>start);vm.runInContext(main.slice(start,finish),c);
 vm.runInContext(recommendations,c);
 const engine=c.FasRecommendations;
 c.FasRecommendations={...engine,beginSession(...args){calls.seed++;return engine.beginSession(...args)},select(...args){calls.select++;return engine.select(...args)}};
 c.toggleLotFavorite=id=>{const value=c.cars.find(item=>item.id===id),liked=!c.saved.includes(id);c.saved=liked?[...c.saved,id]:c.saved.filter(item=>item!==id);engine.record(value,liked?'favorite':'unfavorite')};
 c.openCar=id=>{engine.record(c.cars.find(item=>item.id===id),'open');h.calls.push(['open',id])};
 vm.runInContext(featured,c);
 return {...h,track,section,note,engine,stored,setScope(value){scope={active:true,lots:[],category:'',source:c.cars,...value}},clearScope(){scope={active:false,lots:[],category:'',source:c.cars};for(const id of ['search','category'])c.document.querySelector('#'+id).value=''},advanceDays(days){time+=days*86400000},counters:calls,api:c.FasFeaturedLots,ids:()=>track.querySelectorAll('[data-featured-lot]').map(node=>Number(node.dataset.featuredLot)),setOrigin:value=>{point=value},click:target=>section.dispatchEvent({type:'click',target,preventDefault(){},stopPropagation(){}})};
}

const apartment=(id,price,extra={})=>lot(id,{category:'property',subcategory:'property',name:'Двухкомнатная квартира '+id,make:'',brand:'',model:'',year:2020,area:54,rooms:2,price,distance:2,marketDate:new Date(now-86400000).toISOString(),comparables:[1,2,3].map(index=>({price:price*2,url:'https://example.com/flat/'+index})),...extra});
function inventory(){return [
 apartment(101,4000000),apartment(102,3000000),apartment(103,5000000),
 lot(201,{category:'other',subcategory:'kitchenware',name:'Кухонный набор',make:'',model:'',price:5000,distance:.1,marketDate:new Date(now-86400000).toISOString(),comparables:[1,2,3].map(index=>({price:10000,url:'https://example.com/kitchen/'+index}))}),
 lot(202,{category:'other',subcategory:'home_appliances',name:'Холодильник',make:'',model:'',price:15000,distance:.2}),
 lot(301,{name:'Mercedes-Benz E 200',brand:'Mercedes-Benz',make:'Mercedes-Benz',model:'E 200',price:80000,distance:1}),
 lot(401,{category:'property',subcategory:'houses',name:'Загородный дом',make:'',model:'',price:2000000,distance:1}),
 apartment(901,1,{status:'sold'}),apartment(902,1,{ends:new Date(now-1).toISOString()})
]}
const selected=h=>h.ids().map(id=>h.context.cars.find(value=>value.id===id));
function apartmentRows(h,message){assert(h.ids().length>=2,message+' has multiple real analogues');assert(selected(h).every(value=>h.context.FasCategories.canonicalId(value)==='property'),message+' excludes kitchen, cars and houses')}
function contextFor(h,{category='',query=''}={}){
 const rows=h.context.cars.filter(value=>h.context.isLotLive(value)&&(!category||h.context.FasCategories.matches(value,category))&&(!query||h.context.FasKeywordSearch.matches(value,query)));
 h.document.querySelector('#category').value=category;h.document.querySelector('#search').value=query;h.setScope({active:!!category||!!query,lots:rows,category});h.api.refresh();return rows;
}
{
 const h=boot(inventory());h.api.setMode('low');
 assert.deepEqual(h.ids(),[],'a cold low-price profile requests a type instead of calling kitchenware cheaper than property');
 assert(h.empty?.hidden===false||h.section.querySelector('#featured-empty').hidden===false);
 assert(/категор|тип|поиск/i.test(h.note.textContent+' '+h.section.querySelector('#featured-empty').textContent),'cold state explains how to choose a relevant type');
 contextFor(h,{query:'двухкомнатная квартира'});apartmentRows(h,'apartment query');assert.deepEqual(h.ids(),[102,101,103]);
 contextFor(h,{category:'property'});apartmentRows(h,'explicit apartment category');assert.deepEqual(h.ids(),[102,101,103]);
 h.context.bids={102:{price:6000000}};h.api.refresh();assert.deepEqual(h.ids(),[101,103],'a current bid that eliminates the discount removes the lot from cheap advantageous selections');
 assert.equal(h.track.querySelector('[data-featured-lot="102"]'),null);
 assert.equal(h.track.querySelectorAll('[data-value-tier]').length,2,'remaining cheap lots have actual current analogue support');
 contextFor(h,{category:'kitchenware'});assert.deepEqual(h.ids(),[201],'switching category invalidates the old apartment pool');
 contextFor(h,{query:'такого объекта не существует'});assert.deepEqual(h.ids(),[],'a real empty active search cannot fall back to unrelated cheap inventory');
}
{
 const h=boot(inventory());h.engine.clear();h.clearScope();h.engine.record(h.context.cars[0],'favorite');h.api.setMode('low');apartmentRows(h,'favorite apartment');
 h.engine.clear();h.api.refresh();assert.deepEqual(h.ids(),[],'reset removes favorite-derived intent without silently reimporting saved objects');
 h.engine.record(h.context.cars[0],'open');h.api.refresh();apartmentRows(h,'opened apartment');
 h.engine.record(h.context.cars.find(value=>value.id===301),'open');h.engine.record(h.context.cars[0],'favorite');h.api.refresh();apartmentRows(h,'favorite apartment outweighs incidental unrelated open');
 const before=h.engine.summary().signalCount;h.engine.setMode('all');h.api.refresh();assert.equal(h.engine.getMode(),'all');assert.deepEqual(h.ids(),[],'opting out disables hidden interest-based cheap recommendations');
 assert.equal(h.engine.record(h.context.cars[1],'open'),false);assert.equal(h.engine.summary().signalCount,before);
 contextFor(h,{category:'property'});apartmentRows(h,'an explicit current category remains usable after opting out');assert.equal(h.engine.getMode(),'all','choosing low never silently opts back into personalization');
}
{
 const h=boot(inventory().map(value=>({...value,ends:new Date(now+30*86400000).toISOString()})));assert.equal(typeof h.engine.recordSearch,'function');assert.equal(typeof h.engine.priceCandidates,'function');
 h.engine.clear();h.clearScope();h.engine.recordSearch({category:'property',rooms:2,query:'Секретный адрес квартиры 12345'});h.api.setMode('low');apartmentRows(h,'recent structured apartment search');
 const candidate=h.engine.priceCandidates(h.context.cars);assert.equal(candidate.category,'property');assert(candidate.lots.length>=2);assert(candidate.lots.every(value=>h.context.FasCategories.canonicalId(value)==='property'));
 assert(![...h.stored.values()].some(value=>value.includes('Секретный адрес')||value.includes('12345')),'search history stores category/rooms rather than raw user speech or query text');
 h.engine.clear();h.api.refresh();assert.deepEqual(h.ids(),[],'reset clears structured search as well as view/favorite signals');
 h.engine.recordSearch({category:'kitchenware'});h.api.refresh();assert.deepEqual(h.ids(),[201],'a new structured category replaces old apartment intent');
 h.engine.clear();h.engine.recordSearch({category:'property',rooms:2});h.advanceDays(8);assert(h.context.cars.some(value=>h.context.isLotLive(value)),'expiry check still has eligible live inventory');h.api.refresh();assert.deepEqual(h.ids(),[],'search-only intent expires after seven days');
}
{
 const comps=value=>[1,2,3].map(index=>({price:value,url:'https://example.com/market/'+index})),fresh=new Date(now-86400000).toISOString();
 const lots=[
 apartment(501,3000000,{comparables:comps(5000000),marketDate:fresh}),
 apartment(502,2000000,{comparables:comps(4000000).slice(0,2),marketDate:fresh}),
 apartment(503,2500000,{comparables:comps(5000000),marketDate:new Date(now-31*86400000).toISOString()}),
 apartment(504,2800000,{comparables:comps(5000000).map(value=>({...value,url:'https://example.com/same-source'})),marketDate:fresh}),
 lot(601,{category:'other',subcategory:'kitchenware',name:'Кухонный набор',make:'',model:'',price:50,comparables:comps(100),marketDate:fresh})
 ];
 const h=boot(lots);contextFor(h,{category:'property'});h.api.setMode('low');
 assert.deepEqual(h.ids(),[501],'unassessed, stale and duplicate-source objects cannot enter cheap advantageous candidates');assert.equal(h.track.querySelectorAll('[data-value-tier]').length,1,'only three distinct current analogues support a market grade');
 assert(h.track.querySelector('[data-featured-lot="501"]').querySelector('[data-value-tier]').textContent.includes('Суперцена · 40%'));assert(h.track.innerHTML.includes('По аналогам продавца'));
 for(const id of [502,503,504])assert.equal(h.track.querySelector('[data-featured-lot="'+id+'"]'),null,'missing/stale/duplicate sources cannot enter cheap deals');
 h.context.bids={501:{price:4900000}};h.api.refresh();assert.equal(h.track.querySelectorAll('[data-value-tier]').length,0,'a new bid that removes the supported discount removes the badge');
 h.api.setMode('value');assert.deepEqual(h.ids(),[],'no eligible assessed apartment cannot fall back to an unrelated assessed kitchen');
}

{
 const source=value=>[1,2,3].map(index=>({price:value,url:'https://example.com/tier/'+index})),date=new Date(now-1000).toISOString();
 const h=boot([apartment(701,3000000,{comparables:source(5000000),marketDate:date}),apartment(702,2000000,{comparables:source(4000000),marketDate:date}),apartment(703,1000000,{comparables:source(1250000),marketDate:date})]);
 contextFor(h,{category:'property'});h.api.setMode('low');assert.deepEqual(h.ids(),[702,701],'choose the best supported value tier first, then its lowest current prices; a cheaper lower-value tier is excluded');
}
{
 const {boot:mainBoot}=require('./helpers/category-seller-harness.cjs'),h=mainBoot();
 vm.runInContext(recommendations,h.context);
 const lots=inventory().map(value=>({...value,bank:'Тестовый банк',city:'Воронеж',regionCode:'36',start:value.price,step:1000,deposit:0}));
 h.run('cars='+JSON.stringify(lots)+';ends.length=0;cars.forEach(value=>ends.push(Date.parse(value.ends)));invalidateSubscriptionInventory();window.FasKeywordSearch.invalidate();$("#advanced-reset").onclick();');
 assert.equal(typeof h.context.window.FasCatalogBuyerContext,'function','real inline search exposes its last successful candidate snapshot');
 h.run('window.FasGlobalSearch("двухкомнатная квартира")');
 assert(h.run('window.FasCatalogBuyerContext().active'));
 assert(h.run('window.FasCatalogBuyerContext().lots===visibleLots'));
 assert(h.run('window.FasCatalogBuyerContext().source===cars'));
 assert(h.run('window.FasCatalogBuyerContext().lots.length>=2'));
 assert(h.run('window.FasCatalogBuyerContext().lots.every(value=>window.FasCategories.canonicalId(value)==="property")'));
 assert.equal(h.run('window.FasRecommendations.priceCandidates(cars).category'),'property','successful real search records its structured property intent');
 h.run('$("#advanced-reset").onclick();$("#category").value="kitchenware";$("#category").onchange();');
 assert.equal(h.run('window.FasCatalogBuyerContext().category'),'kitchenware');
 assert(h.run('window.FasCatalogBuyerContext().lots.every(value=>window.FasCategories.canonicalId(value)==="kitchenware")'));
}

{
 const h=boot(inventory());h.engine.recordSearch({category:'property',rooms:2});h.api.setMode('low');
 h.setScope({active:true,explicitAll:true,lots:h.context.cars,category:''});h.api.refresh();
 assert(h.ids().includes(201),'explicit all includes supported cheap offers in every selected group instead of silently retaining old apartment intent');
}
console.log('PASS: relevant cheap intent from active query/category, favorites/views and bounded structured search; current-bid ordering, cold/opt-out/reset/switch behavior, honest fresh-analogue grades and actual inline search snapshot.');
