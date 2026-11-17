const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const read=name=>fs.readFileSync(path.join(__dirname,'../dist',name),'utf8');
const now=Date.now(),future=new Date(now+86400000).toISOString();
const centers={'Воронеж':[51.6608,39.2003],'Семилуки':[51.683,39.033]};
const property=(id,distance,fields={})=>({id,category:'property',subcategory:'property',status:'live',ends:future,name:'Квартира '+id,city:'Воронеж',year:2020,price:4000000,distance,...fields});
const car=(id,distance,fields={})=>({id,category:'cars',subcategory:'cars',status:'live',ends:future,name:'Автомобиль '+id,brand:'Toyota',model:'Camry',year:2021,price:2000000,distance,city:'Воронеж',...fields});
const comps=price=>[1,2,3].map(id=>({price,url:'https://example.com/real-analogue/'+id}));
function inventory(){return [
 property(111,50,{price:1000000000}),
 property(112,5,{price:6000000}),
 property(113,1,{city:'Семилуки',price:1000000,marketDate:new Date(now-1000).toISOString(),comparables:comps(10000000)}),
 property(114,2,{city:'Новая Усмань',price:7000000}),
 property(115,20,{price:4000000}),
 car(201,.5),car(202,3,{brand:'Honda',model:'Civic'}),
 property(901,.01,{status:'sold'}),property(902,.01,{ends:new Date(now-1).toISOString()})
]}
function boot(lots,{origin={point:[51.6608,39.2003],city:'Воронеж'},cityCenters=centers,saved=[]}={}){
 const h=setup({mobile:true}),section=h.add('featured-lots','section'),track=h.add('featured-track','div',section),note=h.add('featured-note','p',section);h.add('featured-empty','p',section);
 for(const mode of ['for-you','value','nearby','low','ending'])h.add('mode-'+mode,'button',section).setAttribute('data-featured-mode',mode);
 for(const direction of [-1,1])h.add('move-'+direction,'button',section).setAttribute('data-featured-move',String(direction));
 track.scrollWidth=4000;track.clientWidth=500;track.scrollLeft=0;
 const c=h.context,stored=new Map();let point=origin;
 Object.assign(c,{URL,Date:class extends Date{static now(){return now}},cars:lots,saved,bids:{},categoryNames:{cars:'Авто',property:'Квартиры'},localStorage:{getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value)},isLotLive:lot=>!!lot&&lot.status==='live'&&Date.parse(lot.ends)>now,current:lot=>Math.max(lot.price,c.bids[lot.id]?.price||0),userOrigin:()=>point,distanceFromOrigin:(lot,from)=>Math.abs(lot.distance-(from.offset||0)),isOwnLot:()=>false,image:lot=>'assets/'+lot.category+'.svg',escapeText:value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])),money:value=>value+' ₽'});
 if(cityCenters!==null)c.CITY_CENTERS=cityCenters;
 vm.runInContext(read('category-tree.js'),c);
 const main=read('index.html').match(/<script>([\s\S]*?)<\/script>/)[1],start=main.indexOf('function normalizeMarketComparables('),end=main.indexOf('function valuationHTML(',start);assert(start>=0&&end>start);vm.runInContext(main.slice(start,end),c);const geo=main.match(/function kmBetween\([^\n]+/);assert(geo);vm.runInContext(geo[0],c);
 vm.runInContext(read('recommendations.js'),c);const engine=c.FasRecommendations;
 vm.runInContext(read('featured-lots.js'),c);
 return {...h,section,track,note,engine,api:c.FasFeaturedLots,setOrigin:value=>{point=value},ids:()=>track.querySelectorAll('[data-featured-lot]').map(node=>Number(node.dataset.featuredLot))};
}
function propertyViews(h){
 // Separate opened objects avoid the intentional one-contribution/day cap.
 for(let i=0;i<6;i++)assert.equal(h.engine.record(property(500+i,5),'open'),true);
 h.api.refresh();
}
const nearestAll=[201,113,114,202,112,115,111];
{
 const h=boot(inventory());
 assert.deepEqual(h.ids(),nearestAll,'a cold profile keeps the ordinary nearest-first fallback');
 h.engine.record(h.context.cars.find(lot=>lot.id===201),'favorite');propertyViews(h);
 assert.deepEqual(h.ids(),[112,115,111,113,114],'viewed apartments beat favorited cars; far in-city precedes adjacent outside-city, then distance');
 assert(h.ids().every(id=>id<200),'only the most-viewed category is eligible');
 h.engine.recordSearch({category:'cars'});h.api.refresh();assert.deepEqual(h.ids(),[112,115,111,113,114],'structured cheap-search history cannot replace the actually viewed category in For You');
 assert.equal(h.ids().indexOf(111)<h.ids().indexOf(113),true,'a billion-rouble in-city apartment still precedes the cheap outside-city apartment');
 assert.equal(h.context.assessMarket(h.context.cars.find(lot=>lot.id===113)).available,true,'the outside-city property really has supported market data');
 assert.equal(h.context.assessMarket(h.context.cars.find(lot=>lot.id===113)).delta,-90,'the strong real discount cannot drive For You order');
 h.api.setMode('nearby');assert.deepEqual(h.ids(),[113,114,112,115,111],'Nearby uses the same viewed category but strict distance without a city-first tier');
 h.api.setMode('for-you');assert.deepEqual(h.ids(),[112,115,111,113,114]);
 assert.equal(h.api.setMode('buy-now'),false,'the removed home-widget buy-now tab is not an active mode');
 // A price/bid change can update labels, but cannot reorder viewed categories.
 h.context.bids={112:{price:2000000000}};h.api.refresh();assert.deepEqual(h.ids(),[112,115,111,113,114]);
 assert.equal(h.track.querySelector('[data-featured-lot="112"]').querySelector('.featured-price').textContent,'2000000000 ₽');
 h.setOrigin({point:[51.6608,39.2003],city:'Семилуки'});h.api.refresh();assert.deepEqual(h.ids(),[113,114,112,115,111],'same coordinates with a changed explicit city invalidate the ordering cache');
 h.setOrigin({point:[51.6608,39.2003]});h.api.refresh();assert.deepEqual(h.ids(),[112,115,111,113,114],'nearest known city within 30 km supplies the city priority');
 h.setOrigin({point:[0,0]});h.api.refresh();assert.deepEqual(h.ids(),[113,114,112,115,111],'far from every known city falls back to distance alone');
 h.setOrigin(null);h.api.refresh();assert.deepEqual(h.ids(),[111,112,113,114,115],'without location there is no fabricated city or distance order');
 h.setOrigin({point:[51.6608,39.2003],approximate:true});h.api.refresh();assert.deepEqual(h.ids(),[112,115,111,113,114],'a declared approximate region reference can use its inferred city');
 h.engine.setMode('all');h.api.refresh();assert.equal(h.engine.getMode(),'all');assert.deepEqual(h.ids(),nearestAll,'opt-out restores ordinary nearest ordering across the full live inventory');
 assert.equal(h.engine.record(property(599,1),'open'),false,'view recording remains disabled after opt-out');
}
{
 const h=boot(inventory(),{cityCenters:null,origin:{point:[51.6608,39.2003]}});propertyViews(h);
 assert.deepEqual(h.ids(),[113,114,112,115,111],'a missing city dictionary cannot manufacture an in-city priority');
 h.setOrigin({point:[51.6608,39.2003],city:'Воронеж'});h.api.refresh();assert.deepEqual(h.ids(),[112,115,111,113,114],'an explicit city remains usable without a city-center dictionary');
 h.setOrigin(null);h.api.refresh();assert.deepEqual(h.ids(),[111,112,113,114,115]);
}
{
 const h=boot(inventory());h.engine.record(h.context.cars.find(lot=>lot.id===201),'favorite');h.api.refresh();
 assert.deepEqual(h.ids(),[201,202],'without any views, favorite category supplies the relevant candidate type');
 h.engine.clear();h.api.refresh();assert.deepEqual(h.ids(),nearestAll,'clearing history returns the ordinary cold fallback');
}
{
 const lots=Array.from({length:16},(_,index)=>property(1000+index,index+1));lots.push(car(2000,1000));
 const h=boot(lots);
 for(let i=0;i<9;i++)h.engine.record(property(600+i,1),'open');
 for(let i=0;i<8;i++)h.engine.record(car(700+i,1),'open');
 h.api.setMode('nearby');
 assert.deepEqual(h.ids(),Array.from({length:12},(_,index)=>1000+index),'category variety cannot push a thousand-kilometre car ahead of the twelve nearest eligible apartments');
}
console.log('PASS: For You follows viewed categories before favorites, ignores price/deal scores, prioritizes the user city then distance, and handles city cache changes, inferred/approximate/missing locations, cold/reset/favorite fallbacks and opt-out.');
