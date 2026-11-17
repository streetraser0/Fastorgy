const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const read=name=>fs.readFileSync(path.join(__dirname,'../dist',name),'utf8'),now=Date.now(),hour=3600000,MODES=['for-you','value','nearby','low','ending'];
const types=['property','land','equipment','cars'];
const lot=(id,type,extra={})=>({id,category:type==='land'?'property':type,subcategory:type,name:type+' '+id,city:'Москва',regionCode:'77',price:100000+id*1000,status:'live',ends:new Date(now+6*hour).toISOString(),marketDate:new Date(now-1000).toISOString(),comparables:[1,2,3].map(index=>({price:(100000+id*1000)*2,url:'https://example.com/analogue/'+index})),distance:id,...extra});
const inventory=()=>types.flatMap((type,n)=>Array.from({length:5},(_,i)=>lot(n*5+i+1,type)));
function boot(lots=inventory(),{desktop=true}={}){
 const h=setup(),section=h.add('featured-lots','section'),track=h.add('featured-track','div',section),empty=h.add('featured-empty','p',section);h.add('featured-note','p',section);
 for(const mode of MODES)h.add('mode-'+mode,'button',section).setAttribute('data-featured-mode',mode);
 track.clientWidth=900;track.scrollWidth=4000;track.scrollLeft=0;
 const c=h.context,storage=new Map(),feeds=[],mediaListeners=[];let context=null,active=desktop,priceCalls=0;
 Object.assign(c,{URL,Date:class extends Date{static now(){return now}},cars:lots,bids:{},saved:[],categoryNames:{property:'Недвижимость',equipment:'Оборудование',cars:'Автомобили'},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},current:value=>Math.max(value.price,c.bids[value.id]?.price||0),isLotLive:value=>!!value&&value.status==='live'&&Date.parse(value.ends)>now,userOrigin:()=>({point:[55,37],city:'Москва',regionCode:'77'}),distanceFromOrigin:value=>value.distance,getRegionCode:value=>value.regionCode,image:()=> 'assets/cars.svg',escapeText:value=>String(value??''),money:value=>value+' ₽',FasCatalogBuyerContext:()=>context,FasDesktopWeb:{active:()=>active},FasOpenFeaturedFeed:value=>{feeds.push(value);return true}});
 c.matchMedia=query=>({matches:false,addEventListener(type,callback){if(query.includes('min-width'))mediaListeners.push(callback)}});
 vm.runInContext(read('category-tree.js'),c);c.categoryMatches=(value,category)=>c.FasCategories.matches(value,category);
 const main=read('index.html').match(/<script>([\s\S]*?)<\/script>/)[1],start=main.indexOf('function normalizeMarketComparables('),end=main.indexOf('function valuationHTML(',start);vm.runInContext(main.slice(start,end),c);
 vm.runInContext(read('recommendations.js'),c);const engine=c.FasRecommendations;
 c.FasRecommendations={...engine,priceCandidates(...args){priceCalls++;return engine.priceCandidates(...args)}};
 vm.runInContext(read('featured-lots.js'),c);
 const ids=()=>track.querySelectorAll('[data-featured-lot]').map(node=>Number(node.dataset.featuredLot));
 return {...h,c,section,track,empty,engine,storage,feeds,api:c.FasFeaturedLots,ids,priceCalls:()=>priceCalls,
  rows:()=>ids().map(id=>c.cars.find(value=>value.id===id)),
  interests(){for(const [n,type]of types.slice(0,3).entries())for(let i=0;i<6-n;i++)assert(engine.record(lot(1000+n*10+i,type),'open'));for(let i=0;i<8;i++)engine.record(lot(2000+i,'cars'),'favorite');engine.recordSearch({category:'cars'});c.FasFeaturedLots.refresh()},
  setContext(value){context={active:true,source:c.cars,category:'',query:'',lots:c.cars,...value};c.FasFeaturedLots.refresh()},
  setDesktop(value,notify=false){active=value;if(notify)mediaListeners.forEach(callback=>callback());else c.FasFeaturedLots.refresh()}};
}
const categories=h=>new Set(h.rows().map(value=>h.c.FasCategories.canonicalId(value)));
function viewedOnly(h,label){assert(h.ids().length>0,label+' is populated');assert(h.rows().every(value=>['property','land','equipment'].includes(h.c.FasCategories.canonicalId(value))),label+' uses viewed groups rather than unrelated favorites/search history')}

{
 const h=boot();h.interests();const history=h.engine.summary();
 for(const mode of MODES){h.api.setMode(mode);viewedOnly(h,mode);assert.deepEqual([...categories(h)].sort(),['equipment','land','property']);assert.equal(h.api.openFeed(),true);assert.equal(h.feeds.at(-1).ids.length,15,'full feed includes preferred inventory beyond the preview');assert(h.feeds.at(-1).ids.every(id=>id<=15));}
 for(let mask=0;mask<32;mask++){
  const modes=MODES.filter((_,i)=>mask&(1<<i));h.api.setModes(modes);if(mask)viewedOnly(h,modes.join('+'));else{assert(h.api.openFeed());assert.equal(h.feeds.at(-1).ids.length,20,'no modes retains all available categories')}
 }
 assert.equal(h.priceCalls(),0,'desktop never collapses the viewed groups through one-category priceCandidates');assert.equal(h.engine.summary().signalCount,history.signalCount);assert.equal(h.engine.summary().openCount,history.openCount,'selection never fabricates history');
 h.api.setModes(['value']);h.section.dispatchEvent({type:'click',target:h.section.querySelector('[data-featured-mode="low"]'),preventDefault(){}});assert.deepEqual(Array.from(h.api.getModes()),['value','low'],'click remains the established AND toggle');
}

{
 const h=boot();for(const mode of MODES){h.api.setMode(mode);assert(h.ids().length>0,mode+' has an honest cold-start inventory fallback');assert.equal(h.engine.summary().signalCount,0);assert.equal(h.engine.summary().openCount,0)}
 h.interests();h.engine.setMode('all');h.api.setMode('value');h.api.openFeed();assert.equal(h.feeds.at(-1).ids.length,20,'opt-out ignores historical interest narrowing');assert.equal(h.engine.getMode(),'all','price mode does not opt back into personalization');
 h.engine.clear();h.api.refresh();assert.equal(h.engine.summary().signalCount,0);assert(h.ids().length>0);
}

{
 const h=boot();h.interests();const cars=h.c.cars.filter(value=>value.category==='cars');
 h.setContext({lots:cars,query:'Автомобиль'});
 for(const mode of MODES){h.api.setMode(mode);assert.deepEqual([...categories(h)],['cars'],'applied explicit text search remains authoritative in '+mode)}
 h.api.setModes(['low','value']);assert.deepEqual(h.ids(),[],'multi-mode AND keeps the explicit search intersected with viewed groups');assert.equal(h.api.openFeed(),false);
 h.setContext({lots:cars,category:'cars'});h.api.setMode('low');assert.deepEqual([...categories(h)],['cars'],'explicit selected category remains authoritative');
 h.setContext({lots:h.c.cars,explicitAll:true});h.api.setMode('value');h.api.openFeed();assert.equal(h.feeds.at(-1).ids.length,20,'explicit all-category single mode stays all');
 h.setContext({lots:[],query:'Отсутствующий лот'});for(const mode of MODES){h.api.setMode(mode);assert.deepEqual(h.ids(),[],'empty active searches cannot fall back outside their scope')}
 const narrowed=boot();narrowed.interests();narrowed.setContext({lots:[narrowed.c.cars[1],narrowed.c.cars[7]]});for(const mode of MODES){narrowed.api.setMode(mode);assert(narrowed.ids().every(id=>[2,8].includes(id)),'price/radius-filtered pool cannot be widened')}
}

{
 const h=boot();h.interests();h.api.setMode('low');viewedOnly(h,'desktop');h.setDesktop(false);assert.deepEqual([...categories(h)],['cars'],'legacy mobile still uses its saved search/price category');assert(h.priceCalls()>0);
 h.setDesktop(true,true);viewedOnly(h,'desktop after viewport transition');
 const cold=boot();cold.api.setMode('low');assert(cold.ids().length);cold.setDesktop(false);assert.deepEqual(cold.ids(),[],'cold mobile keeps its original choose-category state');cold.setDesktop(true);assert(cold.ids().length);
}

{
 const h=boot(inventory().map(value=>({...value,comparables:[]})));h.interests();h.api.setMode('value');assert.deepEqual(h.ids(),[],'viewed categories do not manufacture market estimates');h.api.setMode('low');assert.deepEqual(h.ids(),[]);assert(h.empty.innerHTML.includes('Нет подходящих выгодных лотов с актуальной оценкой'));assert(!h.empty.innerHTML.includes('добавьте интересный лот в избранное'));
 const late=boot(inventory().map(value=>({...value,ends:new Date(now+24*hour).toISOString()})));late.interests();late.api.setMode('ending');assert.deepEqual(late.ids(),[],'exactly 24 hours remains outside the strict ending selection');late.api.setMode('for-you');viewedOnly(late,'other modes retain future live lots');
}

{
 const h=boot();h.interests();for(const lot of h.c.cars)if(lot.category!=='cars')lot.status='ended';
 for(const mode of ['for-you','nearby']){h.api.setMode(mode);h.api.refresh({force:true});assert.deepEqual(h.ids(),[],'expired preferred groups do not become unrelated cars on desktop');}
}
console.log('PASS: all desktop modes share viewed property/land/equipment groups before honest price/value/ending constraints; explicit search, strict AND, full feeds, cold/opt-out privacy and legacy mobile behavior survive gate changes.');
