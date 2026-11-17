const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const read=name=>fs.readFileSync(path.join(__dirname,'../dist',name),'utf8');
const now=Date.now(),hour=3600000;
const apartment=(id,distance,fields={})=>({id,category:'property',subcategory:'property',status:'live',ends:new Date(now+23*hour).toISOString(),name:'Квартира '+id,city:'Воронеж',regionCode:'36',price:4000000,year:2020,area:54,rooms:2,distance,...fields});
function inventory(){return [
 apartment(11,800,{city:'Семилуки'}),
 apartment(12,20,{ends:new Date(now+2*hour).toISOString()}),
 apartment(13,1),
 ...Array.from({length:18},(_,index)=>apartment(100+index,2+index,{ends:new Date(now+(3+index%10)*hour).toISOString()})),
 apartment(21,.01,{city:'Москва',regionCode:'77',ends:new Date(now+1000).toISOString()}),
 apartment(22,.5,{city:'Москва',regionCode:'77',ends:new Date(now+hour).toISOString()}),
 apartment(901,.001,{status:'sold'}),
 apartment(902,.001,{ends:new Date(now-1).toISOString()}),
 apartment(903,.001,{ends:new Date(now+24*hour).toISOString()}),
 apartment(904,.001,{ends:new Date(now+24*hour+1).toISOString()}),
 apartment(905,.001,{status:'scheduled'}),
 apartment(906,.001,{ends:new Date(now).toISOString()}),
 apartment(907,.001,{ends:'not a date'}),
 apartment(908,.001,{category:'cars',subcategory:'cars',name:'Toyota Camry',brand:'Toyota',model:'Camry',price:2000000,year:2021}),
 apartment(909,.001,{category:'electronics',subcategory:'phones',name:'Apple iPhone',brand:'Apple',price:50000}),
 apartment(910,.001,{subcategory:'houses',name:'Загородный дом'})
]}
function boot(lots){
 const h=setup({mobile:true}),section=h.add('featured-lots','section'),track=h.add('featured-track','div',section),note=h.add('featured-note','p',section);h.add('featured-empty','p',section);
 for(const mode of ['for-you','value','nearby','low','ending'])h.add('mode-'+mode,'button',section).setAttribute('data-featured-mode',mode);
 for(const direction of [-1,1])h.add('move-'+direction,'button',section).setAttribute('data-featured-move',String(direction));
 track.scrollLeft=0;track.scrollWidth=5000;track.clientWidth=500;
 const c=h.context,stored=new Map(),selections=[],feeds=[];let point={point:[51,39],city:'Воронеж',regionCode:'36'};
 Object.assign(c,{URL,Date:class extends Date{static now(){return now}},cars:lots,saved:[],bids:{},categoryNames:{property:'Квартиры',cars:'Авто',electronics:'Электроника'},localStorage:{getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value)},isLotLive:lot=>!!lot&&lot.status==='live'&&Date.parse(lot.ends)>now,current:lot=>lot.price,userOrigin:()=>point,getRegionCode:lot=>lot.regionCode||'',distanceFromOrigin:lot=>lot.distance,isOwnLot:()=>false,image:lot=>'assets/'+lot.category+'.svg',escapeText:value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])),money:value=>value+' ₽',FasOpenFeaturedFeed:options=>{feeds.push(options);return true}});
 c.CITY_CENTERS={'Воронеж':[51,39],'Семилуки':[51.1,39.1],'Москва':[55,37]};
 vm.runInContext(read('category-tree.js'),c);vm.runInContext(read('recommendations.js'),c);const engine=c.FasRecommendations;
 c.FasRecommendations={...engine,select(input,options){selections.push(options);return engine.select(input,options)}};
 vm.runInContext(read('featured-lots.js'),c);
 return {...h,section,track,note,engine,selections,feeds,api:c.FasFeaturedLots,setOrigin:value=>{point=value},ids:()=>track.querySelectorAll('[data-featured-lot]').map(node=>Number(node.dataset.featuredLot))};
}
function recordInterests(h){
 // A favorite in another category must not override repeated actual views.
 assert.equal(h.engine.record(h.context.cars.find(lot=>lot.id===908),'favorite'),true);
 for(let index=0;index<6;index++)assert.equal(h.engine.record(apartment(5000+index,5),'open'),true);
}
const interesting=lot=>lot.category==='property'&&lot.subcategory==='property';
const eligible=lot=>interesting(lot)&&lot.status==='live'&&Date.parse(lot.ends)>now&&Date.parse(lot.ends)-now<24*hour;
const ordered=(lots,region='36')=>lots.filter(eligible).sort((a,b)=>Number(b.regionCode===region)-Number(a.regionCode===region)||a.distance-b.distance||a.id-b.id).map(lot=>lot.id);

{
 const h=boot(inventory());recordInterests(h);
 const byViews=Array.from(h.engine.select(h.context.cars,{byViews:true}));assert(byViews.some(lot=>lot.id===13));assert(byViews.every(interesting),'view-only selection excludes a favorite-only car, electronics and another property leaf');
 assert.equal(h.api.setMode('ending'),true);assert(h.selections.some(options=>options?.byViews===true),'ending explicitly asks for viewed-category candidates');
 const expected=ordered(h.context.cars);assert.equal(expected.length,23);assert.deepEqual(h.ids(),expected.slice(0,12),'preview prioritizes the user region and distance, rather than deadline or city');
 assert(expected.indexOf(11)<expected.indexOf(21),'a far same-region apartment precedes an almost adjacent outside-region apartment');
 assert(expected.indexOf(13)<expected.indexOf(12),'within a region distance beats the sooner deadline');
 assert.equal(typeof h.api.openFeed,'function','all eligible rows have a public feed action');h.api.openFeed();assert.equal(h.feeds.length,1);
 const request=h.feeds.at(-1);assert.equal(request.mode,'ending');assert(Array.isArray(request.ids));assert.deepEqual(Array.from(request.ids),expected,'feed receives all 23 eligible rows, rather than only 12 preview cards');
 for(const id of [901,902,903,904,905,906,907,908,909,910])assert(!request.ids.includes(id),'ending excludes unavailable, >=24h or uninteresting lot '+id);
 const previous=h.ids();assert.equal(h.api.setMode('buy-now'),false,'buy-now is no longer a home selection');assert.deepEqual(h.ids(),previous,'an unsupported mode cannot alter the current carousel');
}
{
 const h=boot(inventory());recordInterests(h);h.api.setMode('ending');h.setOrigin({point:[51,39],city:'Воронеж',regionCode:'77'});h.api.refresh();assert.deepEqual(h.ids(),ordered(h.context.cars,'77').slice(0,12),'changing only the region invalidates cached region priority');
 h.api.openFeed();assert.deepEqual(Array.from(h.feeds.at(-1).ids),ordered(h.context.cars,'77'));
 // A card outside the preview may become unavailable before the full feed opens.
 h.context.cars.find(lot=>lot.id===11).status='sold';h.api.openFeed();assert(!h.feeds.at(-1).ids.includes(11),'the full feed rechecks availability beyond the 12 visible cards');
}
{
 const markup=read('index.html');assert(!/data-featured-mode\s*=\s*["']buy-now["']/i.test(markup),'home markup no longer includes the Buy Now tab');
 assert(/data-featured-mode\s*=\s*["']ending["']/i.test(markup),'the strict under-24-hour selection remains in the home modes');
}
console.log('PASS: ending uses repeatedly viewed categories, strict live <24h boundaries, user-region then distance ordering, all eligible feed IDs beyond the preview, late availability changes and removal of the home Buy Now tab.');
