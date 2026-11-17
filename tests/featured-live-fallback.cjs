const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {setup}=require('./helpers/quickbar-dom.cjs');
const source=fs.readFileSync('dist/featured-lots.js','utf8'),engineSource=fs.readFileSync('dist/recommendations.js','utf8'),now=Date.now(),end=new Date(now+86400000).toISOString();
const lot=(id,fields={})=>({id,status:'live',ends:end,category:'cars',subcategory:'cars',price:1000000,distance:1,name:'Лот '+id,brand:'Toyota',model:'Camry',year:2021,...fields});
const other=Array.from({length:20},(_,index)=>lot(100+index,{category:index%2?'other':'property',subcategory:index%2?'phones':'houses',brand:'',model:'',distance:20-index}));
function boot(lots){
 const h=setup({mobile:true}),section=h.add('featured-lots','section'),track=h.add('featured-track','div',section);h.add('featured-note','p',section);const empty=h.add('featured-empty','p',section);track.scrollLeft=0;track.scrollWidth=4000;track.clientWidth=500;
 const c=h.context;c.URL=URL;c.Date=class extends Date{static now(){return now}};const storage=new Map();c.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};c.cars=lots;c.saved=[];c.bids={};c.categoryNames={cars:'Авто',property:'Недвижимость',other:'Электроника'};let scans=0;
 c.isLotLive=value=>{scans++;return !!value&&value.status==='live'&&Date.parse(value.ends)>now};c.current=value=>value.price;c.isOwnLot=()=>false;c.userOrigin=()=>({point:[51.66,39.2]});c.distanceFromOrigin=value=>value.distance;c.image=value=>'assets/'+value.category+'.svg';c.escapeText=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));c.money=value=>value+' ₽';
 vm.runInContext(engineSource,c);vm.runInContext(source,c);
 return {...h,track,empty,api:c.FasFeaturedLots,engine:c.FasRecommendations,ids:()=>track.querySelectorAll('[data-featured-lot]').map(node=>Number(node.dataset.featuredLot)),scans:()=>scans};
}
const nearest=other.slice().sort((a,b)=>a.distance-b.distance||a.id-b.id).slice(0,12).map(value=>value.id);
for(const unavailable of [{ends:new Date(now-1000).toISOString()},{status:'sold'},{status:'paused'},{price:0}]){
 const remembered=lot(1),h=boot([remembered,...other.map(value=>({...value}))]);h.engine.record(remembered,'favorite');h.api.refresh();assert.deepEqual(h.ids(),[1]);
 Object.assign(remembered,unavailable);h.api.refresh({force:true});assert.deepEqual(h.ids(),nearest,'unavailable recommendations fall back to the nearest live assets across categories');assert.equal(h.empty.hidden,true);assert.equal(h.ids().length,12);assert.equal(h.engine.summary().favoriteCount,1,'fallback preserves learned interests');assert.equal(h.engine.summary().signalCount,1,'fallback does not train interests from unrelated inventory');
 const calls=h.scans(),firstImage=h.track.querySelector('img');h.api.refresh();assert(h.scans()-calls<=12,'the fallback selection remains cached instead of walking the catalogue again');assert.strictEqual(h.track.querySelector('img'),firstImage);
 h.context.cars.push(lot(2,{distance:50}));h.api.refresh();assert.deepEqual(h.ids(),[2],'a newly available analogue restores personalized selection without resetting the profile');
}
const partial=boot([lot(1),lot(2,{distance:5}),...other.map(value=>({...value}))]);partial.engine.record(partial.context.cars[0],'favorite');partial.api.refresh();assert.deepEqual(partial.ids(),[1,2]);partial.context.cars[0].status='sold';partial.api.refresh();assert.deepEqual(partial.ids(),[2],'one remaining eligible analogue keeps the personalized set scoped');
const ended=lot(1,{status:'sold'}),empty=boot([ended,lot(2,{category:'property',subcategory:'houses',brand:'',model:'',status:'sold'})]);empty.engine.record(ended,'favorite');empty.api.refresh();assert.deepEqual(empty.ids(),[],'a catalogue without any eligible inventory remains honestly empty');assert.equal(empty.empty.hidden,false);
console.log('PASS: personalized mini-feed recovers from ended/sold/paused/invalid-price-only candidates with cached bounded nearest-first live inventory, while preserving interests and eligible analogues.');
