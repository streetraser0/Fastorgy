const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const source=fs.readFileSync('dist/featured-lots.js','utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
function boot(lots,{origin=null}={}){
 const h=setup({mobile:true}),section=h.add('featured-lots','section');section.hidden=true;
 const track=h.add('featured-track','div',section),note=h.add('featured-note','p',section),empty=h.add('featured-empty','p',section);track.scrollLeft=0;track.scrollWidth=2500;track.clientWidth=500;
 for(const value of ['value','nearby','low','ending','buy-now'])h.add('mode-'+value,'button',section).setAttribute('data-featured-mode',value);
 for(const direction of [-1,1])h.add('move-'+direction,'button',section).setAttribute('data-featured-move',String(direction));
 const c=h.context;c.URL=URL;c.Date=class extends Date{static now(){return now}};c.cars=lots;c.bids={};c.categoryNames={cars:'Авто',trucks:'Грузовики',property:'Недвижимость',electronics:'Электроника',equipment:'Оборудование'};let scans=0,assessments=0,currentOrigin=origin;
 c.isLotLive=lot=>{scans++;return !!lot&&lot.status==='live'&&Date.parse(lot.ends)>Date.now()};c.current=lot=>lot.auctionDirection==='descending'?lot.quote.price:Math.max(lot.price,c.bids[lot.id]?.price||0);c.isOwnLot=lot=>lot.sellerOwnerId==='me';c.userOrigin=()=>currentOrigin;c.distanceFromOrigin=(lot,point)=>Math.abs(lot.distance-(point.offset||0));c.image=lot=>lot.image||'assets/'+lot.category+'.svg';c.escapeText=value=>String(value??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));c.money=value=>value+' ₽';c.FasAuctionModes={quote:lot=>lot.quote};
 const main=fs.readFileSync('dist/index.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1],start=main.indexOf('function normalizeMarketComparables('),end=main.indexOf('function valuationHTML(',start);assert(start>=0&&end>start);vm.runInContext(main.slice(start,end),c);const calculateMarket=c.assessMarket;c.assessMarket=lot=>{assessments++;return calculateMarket(lot)};
 c.openCar=id=>h.calls.push(['open',id]);c.toggleLotFavorite=id=>{c.saved=c.saved.includes(id)?c.saved.filter(item=>item!==id):[...c.saved,id];h.calls.push(['favorite',id])};
 track.scrollBy=options=>{track.scrollLeft+=options.left;h.calls.push(['move',options.behavior])};
 vm.runInContext(source,c);
 const click=target=>section.dispatchEvent({type:'click',target,preventDefault(){},stopPropagation(){}});
 return {...h,section,track,note,empty,click,ids:()=>track.querySelectorAll('[data-featured-lot]').map(node=>Number(node.dataset.featuredLot)),api:c.FasFeaturedLots,scans:()=>scans,assessments:()=>assessments,setOrigin:value=>{currentOrigin=value}};
}
const now=Date.now(),end=ms=>new Date(now+ms).toISOString(),base={status:'live',ends:end(86400000),category:'cars',price:100,distance:5,name:'Тестовый лот'};
const lot=(id,fields={})=>({...base,id,...fields});
{
 const h=boot([lot(1,{distance:1}),lot(2,{category:'trucks',distance:3,price:300,ends:end(100000)}),lot(3,{category:'property',distance:100,price:50}),lot(4,{distance:2,price:5}),lot(5,{category:'electronics',sellerOwnerId:'me',buyNowPrice:200,price:10}),lot(6,{category:'equipment',buyNowPrice:200}),lot(7,{auctionDirection:'descending',quote:{valid:true,canBuy:true,price:120}}),lot(8,{status:'sold'}),lot(9,{ends:end(-1000)}),lot(10,{name:'<img src=x onerror=alert(1)>',image:'javascript:alert(1)',price:999})]);
 assert.equal(h.section.hidden,false);assert(!h.ids().includes(8));assert(!h.ids().includes(9));assert(h.note.textContent.includes('Выберите регион'));assert(!h.track.innerHTML.includes('Ниже рынка'));assert(!h.track.innerHTML.includes('javascript:'));assert(h.track.innerHTML.includes('&lt;img src=x onerror=alert(1)&gt;'));assert(!h.track.innerHTML.includes('<video'));
 h.setOrigin({point:[51,39]});h.api.refresh();const distances=h.ids().map(id=>h.context.cars.find(item=>item.id===id).distance);assert.deepEqual(distances,[...distances].sort((a,b)=>a-b));assert.equal(h.note.textContent,'','nearby carousel omits the removed caption');
 for(const item of h.context.cars.filter(value=>value.category==='cars')){item.comparables=[1,2,3].map(index=>({price:h.context.current(item)*2,url:'https://example.com/cheap/'+index}));item.marketDate=new Date(now-1000).toISOString()}h.api.setMode('low');assert.deepEqual(h.ids(),[],'a cold visitor chooses a type before comparing absolute prices');h.context.FasCatalogBuyerContext=()=>({active:true,category:'cars',lots:h.context.cars.filter(item=>item.category==='cars'),source:h.context.cars});h.api.refresh();assert.deepEqual(h.ids().slice(0,3),[4,1,7],'explicit car scope ranks current car prices without unrelated kitchen/property assets');h.context.FasCatalogBuyerContext=()=>null;h.api.setMode('ending');assert.deepEqual(h.ids(),[2],'ending selection is strictly within 24 hours');
 assert.equal(h.api.setMode('buy-now'),false);assert.deepEqual(h.ids(),[2],'removed Buy Now mode cannot change the current selection');
 h.api.setMode('nearby');assert(h.track.querySelector('[data-live-descending-price="7"]'));const card=h.track.querySelector('[data-featured-lot]'),favorite=card.querySelector('[data-featured-fav]'),firstImage=card.querySelector('img'),id=Number(card.dataset.featuredLot);h.track.scrollLeft=235;const scans=h.scans();h.click(favorite);assert.equal(h.track.scrollLeft,235);assert.strictEqual(h.track.querySelector('img'),firstImage,'favorite keeps card DOM');assert.equal(h.scans()-scans,1+h.ids().length,'favorite checks selected rows and clicked lot, not the full inventory');assert.deepEqual(plain(h.context.saved),[id]);assert(!h.calls.some(([kind])=>kind==='open'),'favorite is separate from open');
 h.click(card.querySelector('[data-featured-open]'));assert(h.calls.some(([kind,value])=>kind==='open'&&value===id));h.context.cars.find(item=>item.id===id).status='sold';const opens=h.calls.filter(([kind])=>kind==='open').length;h.click(card.querySelector('[data-featured-open]'));assert.equal(h.calls.filter(([kind])=>kind==='open').length,opens,'stale sold card never opens');assert(!h.ids().includes(id));
 h.click(h.section.querySelector('[data-featured-move="1"]'));assert(h.track.scrollLeft>235);assert.equal(h.calls.at(-1)[0],'move');
 for(const item of h.context.cars){delete item.comparables;delete item.marketDate}h.api.setMode('value');assert.equal(h.empty.hidden,false);assert(h.empty.textContent.includes('Пока нет лотов с актуальной оценкой'));
}
{
 const comps=price=>[1,2,3].map(id=>({price,url:'https://example.com/analog/'+id})),fresh=new Date(now-86400000).toISOString();
 const values=[lot(21,{price:90,comparables:comps(100),marketDate:fresh}),lot(22,{price:80,comparables:comps(100),marketDate:fresh}),lot(23,{price:70,comparables:comps(100),marketDate:fresh}),lot(24,{price:90.01,comparables:comps(100),marketDate:fresh}),lot(25,{price:91,comparables:comps(100),marketDate:fresh}),lot(26,{price:50,comparables:comps(100),marketDate:new Date(now-31*86400000).toISOString()}),lot(27,{price:50,comparables:comps(100).map(item=>({...item,url:'https://example.com/one'})),marketDate:fresh}),lot(28,{price:50,comparables:comps(100).map(item=>({...item,url:item.url.replace('https:','http:')})),marketDate:fresh})];
 const h=boot(values);assert.deepEqual(h.ids(),[23,22,21],'initial selection promotes only supported >=10% differences');assert.equal(h.section.querySelector('[data-featured-mode="value"]').getAttribute('aria-pressed'),'true');
 assert.equal(h.track.querySelectorAll('[data-value-tier="super"]').length,1);assert.equal(h.track.querySelectorAll('[data-value-tier="great"]').length,1);assert.equal(h.track.querySelectorAll('[data-value-tier="good"]').length,1);assert(h.track.innerHTML.includes('Суперцена · 30%'));assert(h.track.innerHTML.includes('Очень выгодно · 20%'));assert(h.track.innerHTML.includes('Выгодно · 10%'));assert.equal(h.track.querySelectorAll('.featured-value-source').length,3);assert(h.track.innerHTML.includes('По аналогам продавца'));assert(h.track.innerHTML.includes('Комиссии, задаток и расходы не включены'));assert(h.note.textContent.includes('Внешний сервис оценки не подключён'));
 const before=h.assessments(),old=h.track.querySelector('img');h.api.refresh();assert.equal(h.assessments(),before,'cached refresh does not recalculate comparisons');assert.strictEqual(h.track.querySelector('img'),old);
 h.context.bids={21:{price:95}};h.api.refresh();assert.deepEqual(h.ids(),[23,22],'a new bid invalidates advantageous ranking');h.api.setMode('nearby');assert(h.track.querySelector('[data-value-tier="super"]'),'other modes retain supported grades');
 h.context.cars=h.context.cars.map(item=>({...item,marketDate:new Date(now-31*86400000).toISOString()}));h.api.setMode('value');assert.equal(h.empty.hidden,false);assert.equal(h.track.querySelectorAll('.featured-market').length,0,'stale market data cannot retain a price claim');
}
{
 const comparables=[1,2,3].map(id=>({price:10000,url:'https://example.com/boundary/'+id})),marketDate=new Date(now-1000).toISOString();
 const h=boot([9001,9000,8001,8000,7001,7000].map((price,i)=>lot(60+i,{price,comparables,marketDate})));assert.deepEqual(h.ids(),[65,64,63,62,61]);assert.equal(h.track.querySelectorAll('[data-value-tier="good"]').length,2,'10 through 19.99 percent');assert.equal(h.track.querySelectorAll('[data-value-tier="great"]').length,2,'20 through 29.99 percent');assert.equal(h.track.querySelectorAll('[data-value-tier="super"]').length,1,'30 percent begins the top tier');
}
{
 const h=boot([lot(51,{ends:end(24*3600000)}),lot(52,{ends:end(24*3600000-1)}),lot(53,{ends:end(24*3600000+1)}),lot(54,{ends:end(0)})]);h.api.setMode('ending');assert.deepEqual(h.ids(),[52],'exactly 24 hours and already ended are excluded');
}
{
 const h=boot(Array.from({length:1000},(_,i)=>lot(i+100,{category:['cars','trucks','property'][i%3],price:i+1})));assert.equal(h.ids().length,12);const images=h.track.querySelectorAll('img');h.api.refresh();assert.strictEqual(h.track.querySelector('img'),images[0]);assert.equal(h.api.setMode('invalid'),false);h.context.cars=[];h.api.refresh();assert.equal(h.empty.hidden,false);assert.equal(h.track.hidden,true);assert.equal(h.section.querySelector('[data-featured-move="1"]').disabled,true);
}
{
 const {boot:mainBoot}=require('./helpers/category-seller-harness.cjs'),h=mainBoot();
 // This integration fixture needs actual card nodes for the nested-photo
 // handlers. Keep the shared marketplace harness lightweight for its other uses.
 const dom=setup(),trackDOM=new dom.Element('div'),actualTrack=h.node('#featured-track'),photoFrames=[];
 h.context.requestAnimationFrame=h.context.window.requestAnimationFrame=fn=>{photoFrames.push(fn);return photoFrames.length};
 Object.defineProperty(actualTrack,'innerHTML',{get:()=>trackDOM.innerHTML,set:value=>{trackDOM.innerHTML=value}});
 for(const method of ['querySelector','querySelectorAll','contains'])actualTrack[method]=trackDOM[method].bind(trackDOM);
 h.node('#featured-lots').contains=trackDOM.contains.bind(trackDOM);
 vm.runInContext(source,h.context);const initial=actualTrack.innerHTML;assert(initial.includes('featured-card'));assert((initial.match(/data-featured-lot=/g)||[]).length<=12,'actual full catalogue stays bounded');
 assert.equal(actualTrack.querySelector('[data-featured-gallery]').querySelector('.featured-photo-count')?.textContent,'1 / 3','actual canonical demo media supplies the three-photo gallery');
 assert.equal(actualTrack.querySelector('[data-featured-lot]').querySelectorAll('img').length,1,'canonical gallery initially requests only its displayed photo');
 const demoGallery=actualTrack.querySelector('[data-featured-gallery]'),galleryId=Number(demoGallery.dataset.featuredGallery);
 const canonical=JSON.parse(h.run('JSON.stringify(lotMedia(cars.find(lot=>lot.id==='+galleryId+')))'));
 const photoRail=demoGallery.querySelector('.featured-photo-track');assert(photoRail,'canonical photos have their own native scroll rail');assert.equal(demoGallery.querySelector('[data-featured-photo-dir]'),null);
 const scrollDemo=index=>{photoRail.scrollLeft=index*photoRail.clientWidth;photoRail.dispatchEvent({type:'scroll',target:photoRail});for(let n=0;photoFrames.length&&n<30;n++)photoFrames.splice(0).forEach(fn=>fn());return photoRail.querySelector('[data-featured-photo-slide="'+index+'"]').querySelector('img')};
 assert.equal(demoGallery.querySelectorAll('[data-featured-photo-dot]').length,canonical.length);
 assert.equal(scrollDemo(1).getAttribute('data-crop'),canonical[1].crop);assert.equal(demoGallery.querySelector('[data-featured-photo-label]')?.textContent,canonical[1].label,'canonical demo crop is honestly captioned');
 assert.equal(scrollDemo(2).getAttribute('data-crop'),canonical[2].crop);assert.equal(demoGallery.querySelector('[data-featured-photo-label]')?.textContent,canonical[2].label);
 const sample={id:999874001,name:'Реальный расчёт медианы',category:'cars',city:'Воронеж',price:70000,start:70000,step:1000,deposit:0,status:'live',ends:new Date(Date.now()+3600000).toISOString(),marketDate:new Date().toISOString(),comparables:[{price:90000,url:'https://example.com/a'},{price:100000,url:'https://example.com/b'},{price:110000,url:'https://example.com/c'}]};
 h.run('cars.push('+JSON.stringify(sample)+');window.FasFeaturedLots.refresh()');assert(h.node('#featured-track').innerHTML.includes('Суперцена · 30%'));assert(h.node('#featured-track').innerHTML.includes('По аналогам продавца'),'real assessMarket() integrates without fabricated valuation data');
}
console.log('PASS: featured live/diverse/nearby/price/end/buy-now selections, canonical routes, safe static media, native manual movement, stable favorites/scroll/cache, supported value grades and honest market provenance.');
