const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {setup}=require('./helpers/quickbar-dom.cjs');
const read=name=>fs.readFileSync(path.join(__dirname,'../dist',name),'utf8');
const KEY='fas-featured-modes-v1',now=Date.now(),plain=value=>JSON.parse(JSON.stringify(value));
const inventory=[
 {id:101,name:'Автомобиль',category:'cars',subcategory:'cars',price:100000,status:'live',ends:new Date(now+4*3600000).toISOString(),marketDate:new Date(now-1000).toISOString(),comparables:[1,2,3].map(id=>({price:200000,url:'https://example.com/car/'+id}))},
 {id:202,name:'Квартира без оценки',category:'property',subcategory:'property',price:3000000,status:'live',ends:new Date(now+4*3600000).toISOString()}
];
function boot({modes,history=false,platform='android',desktop=false}={}){
 const h=setup({mobile:!desktop}),c=h.context,section=h.add('featured-lots','section'),header=h.add('featured-heading','div',section);header.className='featured-heading';
 const feed=h.add('home-open-feed','button',header);feed.textContent='Вся лента';
 const modeBox=h.add('featured-modes','div',section);modeBox.className='featured-modes';
 for(const mode of ['for-you','value','nearby','low','ending'])h.add('mode-'+mode,'button',modeBox).setAttribute('data-featured-mode',mode);
 const track=h.add('featured-track','div',section),empty=h.add('featured-empty','p',section);h.add('featured-note','p',section);track.scrollLeft=0;track.scrollWidth=4000;
 for(const id of ['category','region-filter','city','adv-price-min','adv-price-max','adv-radius'])h.add(id,'input');
 h.document.querySelector('#region-filter').value='36';h.document.querySelector('#city').value='Воронеж';
 const storage=new Map([['fas-user-region',JSON.stringify({code:'36',name:'Воронежская область'})]]),writes=[],feeds=[];
 if(modes)storage.set(KEY,JSON.stringify(modes));
 Object.assign(c,{URL,Date:class extends Date{static now(){return now}},navigator:{userAgent:platform==='android'?'Mozilla/5.0 (Linux; Android 15) Mobile':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile',maxTouchPoints:desktop?0:5},cars:plain(inventory),saved:[],bids:{},userRegion:{code:'36',name:'Воронежская область'},FasDesktopWeb:{active:()=>desktop},FasCatalogBuyerContext:()=>null,FasOpenFeaturedFeed:selection=>{feeds.push(plain(selection));return true},localStorage:{getItem:key=>storage.get(key)??null,setItem(key,value){storage.set(key,value);writes.push(key)}},userOrigin:()=>({point:[51,39],city:'Воронеж',regionCode:'36'}),getRegionCode:()=> '36',distanceFromOrigin:()=>1,isLotLive:lot=>lot.status==='live'&&Date.parse(lot.ends)>now,current:lot=>lot.price,image:()=> 'assets/cars.svg',money:value=>value+' ₽',escapeText:value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))});
 if(!desktop)c.Capacitor={isNativePlatform:()=>true,getPlatform:()=>platform};
 vm.runInContext(read('category-tree.js'),c);c.categoryMatches=(lot,category)=>c.FasCategories.matches(lot,category);
 const main=read('index.html').match(/<script>([\s\S]*?)<\/script>/)[1],start=main.indexOf('function normalizeMarketComparables('),end=main.indexOf('function valuationHTML(',start);assert(start>=0&&end>start);vm.runInContext(main.slice(start,end),c);
 vm.runInContext(read('recommendations.js'),c);
 if(history)c.FasRecommendations.record(c.cars[1],'open');
 const loading=read('index.html').match(/<script data-featured-loading-init>([\s\S]*?)<\/script>/);assert(loading,'early loading reserve exists');
 vm.runInContext(loading[1],c);assert.equal(section.inert,true,'loading controls cannot be activated before catalogue initialization');
 vm.runInContext(read('featured-lots.js'),c);vm.runInContext(read('featured-settings.js'),c);
 assert.equal(section.inert,false,'real refresh enables controls for populated and empty selections');assert.equal(section.hasAttribute('data-featured-loading'),false);assert.equal(section.hasAttribute('aria-busy'),false);
 const field=id=>h.document.querySelector('#'+id);
 // Exercise the bound button and the full bubbling route, including the real
 // settings outside-click listener. Opening from an external action must stay open.
 function click(target){const event={type:'click',target,preventDefault(){this.defaultPrevented=true},stopPropagation(){this.stopped=true}};const result=target.onclick?.(event);for(let node=target;node&&!event.stopped;node=node.parentElement)node.dispatchEvent(event);if(!event.stopped)for(const listener of h.docEvents.click||[])listener(event);return result}
 const snapshot=()=>JSON.stringify({storage:[...storage],writes:writes.length,cars:c.cars,saved:c.saved,modes:c.FasFeaturedLots.getModes(),history:c.FasRecommendations.summary(),fields:['category','region-filter','city','adv-price-min','adv-price-max','adv-radius'].map(id=>[id,field(id).value])});
 return {...h,c,section,track,empty,feed,feeds,storage,writes,field,click,snapshot,api:c.FasFeaturedLots};
}
for(const scenario of [
 {name:'fresh Android then low'},
 {name:'saved Android low',modes:['low']},
 {name:'saved Android low + ending',modes:['low','ending']},
 {name:'saved Android low with actual property history',modes:['low'],history:true}
]){
 const h=boot(scenario);
 if(!scenario.modes){h.click(h.field('mode-for-you'));h.click(h.field('mode-low'))}
 assert.equal(h.track.hidden,true,scenario.name+' starts with a genuinely empty relevant selection');
 const before=h.snapshot();assert.equal(h.click(h.feed),false,'the bound All feed action preserves the empty-feed guard');
 assert.equal(h.feeds.length,0,'no unrelated inventory is substituted');assert.equal(h.empty.hidden,false);
 assert(h.calls.some(([kind,text])=>kind==='toast'&&text.includes('По выбранным условиям лотов нет')),'the user gets explicit feedback');
 const action=h.empty.querySelector('[data-featured-empty-settings]');assert(action);assert.equal(action.textContent,'Изменить условия');assert.strictEqual(h.document.activeElement,action);assert.equal(h.empty.scrolled.block,'center');
 assert.equal(h.field('featured-settings-panel').hidden,true,'All feed does not open settings automatically');assert.equal(h.snapshot(),before,'feedback does not write preferences, change region/history, reset modes or inventory');
 h.click(action);assert.equal(h.field('featured-settings-panel').hidden,false,'the explicit action opens the actual settings panel and survives document bubbling');assert.equal(h.field('featured-settings-location-value').textContent,'Воронежская область');assert.equal(h.snapshot(),before,'opening settings remains read-only');
 h.c.FasFeaturedSettings.close();assert.equal(h.snapshot(),before,'closing settings preserves the saved combination');
 h.click(h.feed);assert.equal(h.empty.querySelectorAll('[data-featured-empty-settings]').length,1,'repeated attempts do not accumulate actions');assert.equal(h.snapshot(),before);
 // Changing modes is a separate explicit user choice; only then may the feed open.
 for(const mode of h.api.getModes())h.click(h.field('mode-'+mode));
 assert.equal(h.click(h.feed),true);assert.equal(h.feeds.length,1);assert.deepEqual(h.feeds[0].modes,[]);assert.deepEqual([...h.feeds[0].ids].sort(),[101,202]);
}
for(const options of [{platform:'ios',modes:['nearby']},{desktop:true,modes:['low']}]){
 const h=boot(options),before=h.snapshot();assert.equal(h.click(h.feed),true,'nonempty iOS/desktop feeds still open');assert.equal(h.feeds.length,1);assert(h.feeds[0].ids.length>0);assert.equal(h.empty.hidden,true);assert.equal(h.calls.filter(([kind])=>kind==='toast').length,0);assert.equal(h.snapshot(),before);
}
{
 const h=boot({modes:['low']});h.c.FasFeaturedSettings=undefined;h.click(h.empty.querySelector('[data-featured-empty-settings]'));assert(h.calls.some(([kind])=>kind==='search'),'a missing optional settings module falls back only to the existing explicit search action');assert.deepEqual(plain(h.api.getModes()),['low']);assert.equal(h.feeds.length,0);
}
console.log('PASS: empty All feed gives feedback and a focused explicit settings action; fresh/saved Android low and low+ending, actual property history, unchanged preferences/region/inventory, real settings click propagation, repeated attempts, deliberate mode changes and nonempty iOS/desktop feeds.');
