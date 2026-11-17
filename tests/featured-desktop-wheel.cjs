const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const source=fs.readFileSync('dist/featured-lots.js','utf8'),css=fs.readFileSync('dist/featured-lots.css','utf8');
function boot({desktop=true,reduced=false}={}){
 const h=setup(),section=h.add('featured-lots','section'),track=h.add('featured-track','div',section),listeners=[];let active=desktop;
 h.add('featured-note','p',section);h.add('featured-empty','p',section);for(const direction of [-1,1])h.add('old-arrow-'+direction,'button',section).setAttribute('data-featured-move',direction);
 track.clientWidth=900;track.scrollWidth=2500;track.scrollLeft=0;
 const c=h.context;Object.assign(c,{URL,navigator:{userAgent:'Windows'},bids:{},cars:Array.from({length:4},(_,i)=>({id:i+1,name:'Лот '+i,category:'cars',price:100000+i,status:'live',ends:new Date(Date.now()+86400000).toISOString(),media:['assets/photos/cars-1.jpg','assets/photos/cars-2.jpg','assets/photos/cars-3.jpg']})),isLotLive:lot=>lot.status==='live',current:lot=>lot.price,userOrigin:()=>null,image:lot=>lot.media[0],categoryNames:{cars:'Авто'},escapeText:value=>String(value??''),money:value=>value+' ₽',FasDesktopWeb:{active:()=>active},getComputedStyle:()=>({lineHeight:'20px'})});
 c.matchMedia=query=>({matches:query.includes('reduced-motion')?reduced:active,addEventListener(type,listener){if(query.includes('min-width'))listeners.push(listener)}});
 c.lotMedia=lot=>lot.media;c.lotMediaItem=(_lot,url)=>({url,type:'image'});
 h.Element.prototype.scrollTo=function(value){if(value.left!==undefined)this.scrollLeft=value.left};
 track.scrollBy=value=>{track.scrollLeft+=value.left;h.calls.push(['scrollBy',value.behavior]);track.dispatchEvent({type:'scroll',target:track})};
 vm.runInContext(source,c);const rail=track.querySelector('.featured-photo-track');rail.clientWidth=190;rail.scrollWidth=570;h.flush();
 const photo=rail.querySelector('.featured-open'),name=track.querySelector('.featured-name');
 const wheel=(target=name,extra={})=>{const event={type:'wheel',target,deltaX:0,deltaY:90,deltaMode:0,cancelable:true,defaultPrevented:false,preventDefault(){this.defaultPrevented=true},...extra};for(const fn of track.events.wheel||[])fn(event);return event};
 const edge=direction=>section.querySelector('[data-featured-edge="'+direction+'"]');
 const click=target=>section.dispatchEvent({type:'click',target,preventDefault(){},stopPropagation(){}});
 return {...h,c,section,track,rail,photo,name,wheel,edge,click,setDesktop(value,nativeChange=false){active=value;if(nativeChange)h.notify();else listeners.forEach(fn=>fn())}};
}

{
 const h=boot();assert(h.wheel().defaultPrevented);assert.equal(h.track.scrollLeft,90);assert(h.track.classList.contains('is-desktop-wheeling'),'wheel burst temporarily releases snap');h.flush();assert(!h.track.classList.contains('is-desktop-wheeling'),'native snapping is restored after the burst');
 assert(h.wheel(h.name,{deltaY:3,deltaMode:1}).defaultPrevented);assert.equal(h.track.scrollLeft,150,'line units use the actual line height');
 assert(h.wheel(h.name,{deltaY:1,deltaMode:2}).defaultPrevented);assert.equal(h.track.scrollLeft,1050,'page units move one horizontal viewport');
 h.track.scrollLeft=0;assert(!h.wheel(h.name,{deltaY:-90}).defaultPrevented,'first edge lets the page scroll');assert.equal(h.track.scrollLeft,0);
 h.track.scrollLeft=1600;assert(!h.wheel().defaultPrevented,'last edge lets the page scroll');assert.equal(h.track.scrollLeft,1600);
 h.track.scrollLeft=0;h.wheel(h.name,{deltaY:10000});assert.equal(h.track.scrollLeft,1600,'oversized wheel delta is bounded');
}
{
 const h=boot();for(const extra of [{ctrlKey:true},{metaKey:true},{altKey:true},{shiftKey:true},{deltaX:1},{deltaX:100,deltaY:1},{cancelable:false},{deltaY:0},{deltaY:NaN},{deltaY:Infinity}]){assert(!h.wheel(h.name,extra).defaultPrevented);assert.equal(h.track.scrollLeft,0,'zoom, native horizontal trackpad and noncancelable events are preserved')}
 const already=h.wheel(h.name,{defaultPrevented:true});assert(already.defaultPrevented);assert.equal(h.track.scrollLeft,0);
 h.modal.open=true;assert(!h.wheel().defaultPrevented);assert.equal(h.track.scrollLeft,0);h.modal.open=false;
 h.c.reelsMode=true;assert(!h.wheel().defaultPrevented);assert.equal(h.track.scrollLeft,0);
}
{
 const h=boot();assert(h.wheel(h.photo,{deltaY:150}).defaultPrevented);assert.equal(h.rail.scrollLeft,150);assert.equal(h.track.scrollLeft,0,'nested photos receive their own vertical-wheel motion');
 h.rail.dispatchEvent({type:'scroll',target:h.rail});h.flush();assert.equal(h.rail.closest('[data-featured-gallery]').dataset.featuredPhotoIndex,'1');
 h.rail.scrollLeft=380;assert(!h.wheel(h.photo).defaultPrevented);assert.equal(h.track.scrollLeft,0,'the photo edge releases page scrolling instead of chaining to lots');
 h.rail.scrollLeft=0;assert(!h.wheel(h.photo,{deltaY:-90}).defaultPrevented);h.wheel(h.photo,{deltaX:90,deltaY:90});assert.equal(h.rail.scrollLeft,0,'horizontal photo trackpad stays native');
}
{
 const h=boot(),box=h.rail.closest('[data-featured-gallery]');assert.equal(h.c.FasFeaturedLots.previewPhoto(box,2),true);assert.equal(h.rail.scrollLeft,380);assert.equal(box.dataset.featuredPhotoIndex,'2');assert(h.rail.children[2].querySelector('img'),'hover loads the requested trusted frame');assert.equal(h.track.scrollLeft,0,'hover never moves the outer lot rail');
 h.rail.dispatchEvent({type:'scroll',target:h.rail});h.flush();h.click(h.rail.children[2]);assert(h.calls.some(([type,id])=>type==='open'&&id===1),'immediate ordinary click after hover is not mistaken for a drag ghost click');
 assert.equal(h.c.FasFeaturedLots.previewPhoto(box,99),false);h.modal.open=true;assert.equal(h.c.FasFeaturedLots.previewPhoto(box,0),false);h.modal.open=false;
 h.setDesktop(false);assert.equal(h.c.FasFeaturedLots.previewPhoto(box,0),false,'native/mobile contexts do not activate desktop hover preview');
}
{
 const h=boot();assert.equal(h.section.querySelectorAll('[data-featured-edge]').length,2);assert.equal(h.section.querySelectorAll('[data-featured-move]').length,4,'existing heading arrows remain');
 assert.equal(h.track.querySelector('[data-featured-edge]'),null,'edge controls do not move with the scroll content');assert.equal(h.edge(1).type,'button');assert.equal(h.edge(1).getAttribute('aria-controls'),'featured-track');assert(h.edge(1).getAttribute('aria-label'));assert(h.edge(-1).disabled);assert(!h.edge(1).disabled);
 const before=h.track.scrollLeft;h.edge(1).dispatchEvent({type:'mouseenter',target:h.edge(1)});assert.equal(h.track.scrollLeft,before,'hover never auto-scrolls');h.click(h.edge(1));assert(h.track.scrollLeft>before);assert.equal(h.calls.at(-1)[1],'smooth');
 h.track.scrollLeft=1600;h.track.dispatchEvent({type:'scroll',target:h.track});assert(h.edge(1).disabled);assert(!h.edge(-1).disabled);h.click(h.edge(-1));assert(h.track.scrollLeft<1600);
 h.setDesktop(false,true);assert.equal(h.section.querySelector('[data-featured-edge]'),null);assert.strictEqual(h.track.parentElement,h.section,'mobile/native context returns to the original markup');const left=h.track.scrollLeft;assert(!h.wheel().defaultPrevented);assert.equal(h.track.scrollLeft,left);
 h.setDesktop(true);assert.equal(h.section.querySelectorAll('[data-featured-edge]').length,2);assert.equal(h.track.events.wheel.length,1,'viewport transitions do not duplicate handlers');
 const mobile=boot({desktop:false});assert.equal(mobile.track.events.wheel,undefined);assert.equal(mobile.edge(1),null,'mobile does not create the desktop controls');
 const reduced=boot({reduced:true});reduced.click(reduced.edge(1));assert.equal(reduced.calls.at(-1)[1],'auto');
 assert(css.includes('.featured-viewport:focus-within > .featured-edge:not(:disabled)'),'keyboard focus exposes edge controls');assert(css.includes('animation: none !important'),'reduced motion disables triangle animation');
}
console.log('PASS: desktop vertical wheel routes bounded native offsets to outer/photo rails with deltaMode support, preserves Ctrl zoom/horizontal trackpad/page edges, and adds gated accessible hover/focus edge buttons without hover scrolling.');
