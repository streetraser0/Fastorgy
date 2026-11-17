const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const featured=fs.readFileSync('dist/featured-lots.js','utf8'),recommendations=fs.readFileSync('dist/recommendations.js','utf8');
const now=Date.now(),end=new Date(now+86400000).toISOString();
const lot=(id,fields={})=>({id,status:'live',ends:end,category:'cars',subcategory:'cars',price:10000,distance:1,name:'Лот '+id,make:'Toyota',model:'Camry',year:2021,...fields});
function boot(lots,{saved=[],origin={point:[51,39]}}={}){
 const h=setup({mobile:true}),section=h.add('featured-lots','section'),track=h.add('featured-track','div',section),note=h.add('featured-note','p',section);h.add('featured-empty','p',section);track.scrollLeft=0;track.scrollWidth=4000;track.clientWidth=500;
 for(const value of ['for-you','value','nearby','low','ending','buy-now'])h.add('mode-'+value,'button',section).setAttribute('data-featured-mode',value);
 for(const direction of [-1,1])h.add('move-'+direction,'button',section).setAttribute('data-featured-move',String(direction));
 const c=h.context,stored=new Map(),calls={seed:0,select:0,live:0,distance:0};let point=origin;
 c.URL=URL;c.Date=class extends Date{static now(){return now}};c.localStorage={getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value)};c.cars=lots;c.saved=saved;c.bids={};c.categoryNames={cars:'Авто',trucks:'Грузовики',property:'Недвижимость',electronics:'Электроника'};
 c.isLotLive=value=>{calls.live++;return !!value&&value.status==='live'&&Date.parse(value.ends)>now};c.current=value=>Math.max(value.price,c.bids[value.id]?.price||0);c.userOrigin=()=>point;c.distanceFromOrigin=(value,from)=>{calls.distance++;return Math.abs(value.distance-(from.offset||0))};c.isOwnLot=()=>false;c.image=value=>'assets/'+value.category+'.svg';c.escapeText=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));c.money=value=>value+' ₽';
 c.FasPartnerBranding={html:value=>'<span class="partner-brand">Партнёр '+value.id+'</span>'};
 vm.runInContext(recommendations,c);
 const engine=c.FasRecommendations;
 c.FasRecommendations={...engine,beginSession(...args){calls.seed++;return engine.beginSession(...args)},select(...args){calls.select++;return engine.select(...args)}};
 c.toggleLotFavorite=id=>{const value=c.cars.find(item=>item.id===id),liked=!c.saved.includes(id);c.saved=liked?[...c.saved,id]:c.saved.filter(item=>item!==id);engine.record(value,liked?'favorite':'unfavorite')};
 c.openCar=id=>{engine.record(c.cars.find(item=>item.id===id),'open');h.calls.push(['open',id])};
 vm.runInContext(featured,c);
 return {...h,track,section,note,engine,counters:calls,api:c.FasFeaturedLots,ids:()=>track.querySelectorAll('[data-featured-lot]').map(node=>Number(node.dataset.featuredLot)),setOrigin:value=>{point=value},click:target=>section.dispatchEvent({type:'click',target,preventDefault(){},stopPropagation(){}})};
}
{
 const lots=Array.from({length:24},(_,i)=>lot(i+1,{distance:i+1}));lots.push(lot(99,{category:'property',subcategory:'houses',distance:1000,make:'',model:''}));
 const h=boot(lots);
 assert.equal(h.section.querySelector('[data-featured-mode="for-you"]').getAttribute('aria-pressed'),'true','recommendations is the initial tab when its engine exists');
 assert.deepEqual(h.ids(),Array.from({length:12},(_,i)=>i+1),'a cold profile shows the nearest twelve, without category diversity pushing out nearer lots');
 assert.equal(h.counters.seed,1);assert.equal(h.counters.select,1);assert(h.note.textContent.includes('этом устройстве'));assert.equal(h.track.querySelectorAll('.partner-brand').length,12,'recommendation cards preserve partner branding');
 const before={...h.counters},firstImage=h.track.querySelector('img');
 for(let i=0;i<40;i++){h.track.scrollLeft=i*5;h.track.dispatchEvent({type:'scroll'})}
 assert.deepEqual(h.counters,before,'native horizontal scrolling performs no catalogue, distance or recommendation scans');
 for(let i=0;i<10;i++)h.api.refresh();
 assert.equal(h.counters.select,before.select,'unchanged refreshes reuse the candidate selection');assert.equal(h.counters.seed,1,'refresh never seeds interests again');assert.strictEqual(h.track.querySelector('img'),firstImage,'cached refresh keeps the card elements');
 h.setOrigin({point:[51,39],offset:20});h.api.refresh();assert.equal(h.ids()[0],20,'changing location recalculates nearest order');
 h.context.tab='favorites';h.context.document.querySelector('#search').value='not a matching phrase';h.context.visibleLots=[];h.api.refresh();assert.equal(h.ids()[0],20,'catalogue search filters cannot narrow the featured candidates');
}
{
 const cars=[lot(1,{distance:500}),lot(2,{distance:2,make:'Honda',model:'Civic'}),lot(3,{category:'property',subcategory:'houses',distance:1,make:'',model:''}),lot(4,{category:'electronics',subcategory:'laptops',distance:3,make:'',model:'',manufacturer:'Lenovo'})];
 const h=boot(cars);assert.deepEqual(h.ids(),[3,2,4,1]);
 h.track.scrollLeft=120;h.click(h.track.querySelector('[data-featured-fav="1"]'));
 assert.deepEqual(h.ids(),[2,1],'a fresh favorite immediately brings similar cars into the candidate set');assert.equal(h.track.scrollLeft,120,'refreshing interests preserves horizontal position');assert.equal(h.counters.seed,1);
 assert.equal(h.ids()[0],2,'nearby car precedes a distant favorite with an exact brand/model match');assert.equal(h.counters.select,2,'an interest revision refreshes selection');
 h.context.openCar(4);h.api.refresh();assert.deepEqual(h.ids(),[4],'actual viewed categories take precedence over favorite-only categories');assert(h.note.textContent.includes('просматриваемые категории'));
 h.engine.clear();h.api.refresh();assert.deepEqual(h.ids(),[3,2,4,1],'clearing interests returns the full nearest-first fallback');assert.equal(h.engine.summary().signalCount,0);assert.equal(h.counters.seed,1,'clearing does not re-import saved favorites');
 h.engine.record(cars[0],'favorite');h.api.refresh();assert.deepEqual(h.ids(),[2,1]);h.engine.setMode('all');h.api.refresh();assert.deepEqual(h.ids(),[3,2,4,1],'disabling recommendations restores all candidates');assert(h.note.textContent.includes('отключена'));
 h.api.setMode('for-you');assert.equal(h.engine.getMode(),'for-you','selecting the For You tab explicitly opts back in');assert.deepEqual(h.ids(),[2,1]);h.api.setMode('nearby');assert.equal(h.engine.getMode(),'for-you','browsing nearby does not disable the interest profile');h.api.setMode('for-you');h.click(h.track.querySelector('[data-featured-fav="1"]'));assert.deepEqual(h.ids(),[3,2,4,1],'removing the only favorite clears its influence');
}
{
 const lots=[lot(1,{distance:40}),lot(2,{distance:1,make:'Honda',model:'Civic'}),lot(3,{category:'property',subcategory:'houses',distance:.5,make:'',model:''})],h=boot(lots,{saved:[1]});
 assert.deepEqual(h.ids(),[2,1],'existing favorites are imported for the first recommendation selection');assert.equal(h.counters.seed,1);assert.equal(h.engine.summary().favoriteCount,1);
 h.api.setMode('low');assert.deepEqual(h.ids(),[],'without current supported valuation data no lot is presented as a cheap advantageous offer');
 h.api.setMode('for-you');assert.deepEqual(h.ids(),[2,1]);h.context.bids={1:{price:20000}};h.api.refresh();assert.equal(h.track.querySelector('[data-featured-lot="1"]').querySelector('.featured-price').textContent,'20000 ₽','live bid changes invalidate displayed prices');
 h.context.cars[1].status='sold';h.api.refresh();assert.deepEqual(h.ids(),[1],'sold recommended lots cannot remain actionable');
 h.context.cars=[lot(8,{category:'electronics',subcategory:'laptops',make:'',model:'',distance:9}),lot(9,{category:'property',subcategory:'houses',make:'',model:'',distance:2})];h.api.refresh();assert.deepEqual(h.ids(),[9,8],'no matching interests falls back to all live assets rather than an empty strip');
}
console.log('PASS: featured actual-engine cold/favorite/open/similar/reset/all/no-match recommendations, strict geographical order, twelve-card bound, stable cache/scroll, live prices and partner branding.');
