/* Nested native photo rails: offsets are browser events, never a custom swipe-step. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const source=fs.readFileSync('dist/featured-lots.js','utf8'),css=fs.readFileSync('dist/featured-lots.css','utf8');
const image=n=>'assets/photos/cars-'+n+'.jpg';
const escape=value=>String(value??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));

function boot({single=false,reduced=false,pointer=false}={}){
 const h=setup({mobile:true}),section=h.add('featured-lots','section'),track=h.add('featured-track','div',section);
 let renderedPhotoWidth=null;const resizeObservers=[];
 h.add('featured-note','p',section);h.add('featured-empty','p',section);track.clientWidth=330;track.scrollWidth=2300;track.scrollLeft=145;
 const descriptor=Object.getOwnPropertyDescriptor(h.Element.prototype,'innerHTML');
 Object.defineProperty(track,'innerHTML',{get(){return descriptor.get.call(this)},set(value){
  const detach=node=>{node.isConnected=false;node.children.forEach(detach)};
  this.children.forEach(node=>{detach(node);node.parentElement=null});descriptor.set.call(this,value);
  if(renderedPhotoWidth!==null)for(const rail of this.querySelectorAll('.featured-photo-track'))rail.clientWidth=renderedPhotoWidth;
 }});
 const nativeAdd=h.Element.prototype.addEventListener;
 h.Element.prototype.addEventListener=function(type,listener,options){(this.listenerOptions??={})[type]=options;nativeAdd.call(this,type,listener,options)};
 h.Element.prototype.scrollTo=function(options){if(options.left!==undefined)this.scrollLeft=options.left;if(options.top!==undefined)this.scrollTop=options.top;
  h.calls.push(['native-scroll',this,options.behavior]);this.dispatchEvent({type:'scroll',target:this})};
 const c=h.context;let now=Date.now(),profile='alice',scans=0,mediaReads=0;
 c.Date=class extends Date{static now(){return now}};if(pointer)c.PointerEvent=class {};c.URL=URL;c.URLSearchParams=URLSearchParams;
 c.ResizeObserver=class{constructor(fn){this.fn=fn;this.targets=new Set();resizeObservers.push(this)}observe(target){this.targets.add(target)}unobserve(target){this.targets.delete(target)}disconnect(){this.targets.clear()}};
 const storage=new Map();c.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
 c.cars=Array.from({length:15},(_,i)=>({id:i+1,name:'Лот '+(i+1),category:'cars',city:'Воронеж',price:100000+i,status:'live',ends:new Date(now+86400000).toISOString(),media:single?[image(1)]:[image(1),image(2),image(3)]}));
 c.bids={};c.current=lot=>lot.price;c.isLotLive=lot=>{scans++;return lot.status==='live'};c.userOrigin=()=>null;c.image=lot=>lot.media[0]||image(1);c.categoryNames={cars:'Автомобили'};c.money=value=>value+' ₽';c.escapeText=escape;
 c.FasSellerUI.getProfile=()=>({id:profile});c.FasSellerMedia={isSafeObjectUrl:url=>url==='blob:trusted-current-photo'};
 c.lotMedia=lot=>{mediaReads++;return lot.media};c.lotMediaItem=(_lot,value)=>{const item=typeof value==='string'?{url:value}:value;return item&&typeof item.url==='string'?{...item,type:item.type||(/\.(?:mp4|webm)(?:[?#]|$)/i.test(item.url)?'video':'image')}:null};
 c.matchMedia=()=>({matches:reduced});vm.runInContext(fs.readFileSync('dist/responsive-media.js','utf8'),c);vm.runInContext(source,c);
 function emit(target,type,extra={}){
  assert(target,'event target exists for '+type);
  const event={type,target,defaultPrevented:false,cancelable:true,detail:1,
   preventDefault(){if(this.cancelable)this.defaultPrevented=true},stopPropagation(){this.stopped=true},stopImmediatePropagation(){this.stopped=true;this.immediate=true},...extra};
  for(let node=target;node;node=node.parentElement){event.currentTarget=node;for(const fn of node.events?.[type]||[]){fn(event);if(event.immediate)break}if(event.stopped||type==='scroll')break}
  return event;
 }
 const card=id=>track.querySelector('[data-featured-lot="'+id+'"]'),box=id=>card(id)?.querySelector('.featured-photo');
 const rail=id=>box(id)?.querySelector('.featured-photo-track'),index=id=>Number(box(id)?.dataset.featuredPhotoIndex||0);
 const slide=(id,n=index(id))=>rail(id)?.querySelector('[data-featured-photo-slide="'+n+'"]')||box(id)?.querySelector('.featured-open');
 const img=(id,n=index(id))=>slide(id,n)?.querySelector('img'),count=id=>box(id)?.querySelector('.featured-photo-count')?.textContent;
 function scroll(id,position,{flush=true,node=rail(id)}={}){node.scrollLeft=position*node.clientWidth;emit(node,'scroll');if(flush)h.flush();return node}
 const touch=(identifier,x,y)=>({identifier,clientX:x,clientY:y});
 function motion(id,{dx=-80,dy=1,elapsed=4000}={}){const node=rail(id),start=touch(7,150,90),end=touch(7,150+dx,90+dy);
  const a=emit(node,'touchstart',{touches:[start],timeStamp:0});h.flush();const before={scans,mediaReads};
  const b=emit(node,'touchmove',{touches:[end],timeStamp:elapsed/2}),work={scans:scans-before.scans,mediaReads:mediaReads-before.mediaReads};
  const z=emit(node,'touchend',{touches:[],changedTouches:[end],timeStamp:elapsed});return {start:a,move:b,end:z,work};}
 return {...h,c,section,track,card,box,rail,slide,img,index,count,emit,scroll,touch,motion,api:c.FasFeaturedLots,
  scans:()=>scans,mediaReads:()=>mediaReads,advance:n=>{now+=n},setProfile:value=>{profile=value},setRenderedPhotoWidth:value=>{renderedPhotoWidth=value},
  resizePhotos(width){for(const rail of track.querySelectorAll('.featured-photo-track'))rail.clientWidth=width;for(const observer of resizeObservers)observer.fn([...observer.targets].map(target=>({target,contentRect:{width:target.clientWidth}})));h.flush()}};
}

function dots(h,id,total,active){const all=h.box(id).querySelectorAll('[data-featured-photo-dot]');assert.equal(all.length,total,'one indicator per photograph, without truncation');assert.equal(all.filter(node=>node.getAttribute('aria-current')==='true').length,1);assert.equal(all[active].getAttribute('aria-current'),'true');return all}

{
 const rule=css.match(/\.featured-photo-track\s*\{([^}]+)\}/)?.[1];assert(rule,'a local native photo rail is styled');const compact=rule.replace(/\s+/g,'');
 assert(compact.includes('overflow-x:auto'));assert(/scroll-snap-type:x(?:mandatory|proximity)/.test(compact));assert(compact.includes('touch-action:pan-xpan-ypinch-zoom'));assert(compact.includes('overscroll-behavior-x:contain'));
 const dotStyle=css.match(/\.featured-photo-dots\s*>\s*span\s*\{([^}]+)\}/)?.[1];assert(dotStyle&&/transition:[^;]*(?:opacity|transform)/.test(dotStyle),'active indicators have a small smooth animation');assert(/\.featured-photo-dots\s*>\s*span\.active\s*\{[^}]*transform:\s*scale\(/.test(css));
 assert(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.featured-photo-dots\s*>\s*span\s*\{[^}]*transition:\s*none/s.test(css),'system reduced motion disables the indicator transition');
 const h=boot(),photos=h.track.querySelectorAll('img');assert.equal(h.track.querySelectorAll('[data-featured-lot]').length,12);assert.equal(photos.length,12,'only the selected photograph initially has an IMG in each card');
 assert.equal(photos.filter(node=>node.getAttribute('loading')==='eager').length,2);assert.equal(photos.filter(node=>node.getAttribute('fetchpriority')==='high').length,2);
 assert.equal(h.rail(1).querySelectorAll('[data-featured-photo-slide]').length,3);assert.equal(h.img(1,1),null);assert.equal(h.img(1,2),null);assert.equal(h.count(1),'1 / 3');const dotNodes=dots(h,1,3,0);
 assert.equal(h.track.querySelector('[data-featured-photo-dir]'),null,'no photo arrows or step controls overlay the images');
 for(const type of ['touchstart','touchmove','pointerdown','pointermove','wheel'])assert.equal(h.track.events[type],undefined,'outer rail keeps native '+type);
 for(const type of ['touchstart','touchmove','touchend'])assert.equal(h.rail(1).listenerOptions[type]?.passive,true,'local '+type+' cannot block the browser');
 const outer=h.track.scrollLeft,card=h.card(1),gesture=h.motion(1);assert([gesture.start,gesture.move,gesture.end].every(event=>!event.defaultPrevented));
 assert.equal(h.index(1),0,'touchend without browser scrolling must not step the photograph');dots(h,1,3,0);assert.equal(h.track.scrollLeft,outer);
 assert(h.img(1,1),'touchstart primes the adjacent frame');assert.equal(h.img(1,2),null,'touchstart does not fetch distant frames');assert.equal(gesture.work.scans,0);assert.equal(gesture.work.mediaReads,0);
 h.scroll(1,.25);assert.equal(h.index(1),0);assert.equal(h.rail(1).scrollLeft,h.rail(1).clientWidth*.25,'fractional native offsets are not overridden');assert.equal(h.img(1,2),null);
 h.scroll(1,.75);assert.equal(h.index(1),1);assert.equal(h.count(1),'2 / 3');assert.equal(h.img(1).getAttribute('data-responsive-original'),image(2));dots(h,1,3,1);
 assert.strictEqual(h.box(1).querySelector('[data-featured-photo-dot]'),dotNodes[0],'scrolling updates existing indicators');assert.strictEqual(h.card(1),card);assert.equal(h.track.scrollLeft,outer);assert.equal(h.index(2),0);
 h.scroll(1,1.3);assert(h.img(1,2),'the visible trailing frame loads on demand');assert.equal(h.index(1),1);h.scroll(1,2);assert.equal(h.count(1),'3 / 3');dots(h,1,3,2);assert.equal(h.track.scrollLeft,outer);
 const before=h.calls.filter(([type])=>type==='open').length;h.emit(h.img(1),'click');assert.equal(h.calls.filter(([type])=>type==='open').length,before,'scroll ghost click does not open the lot');
 h.emit(h.slide(1),'click',{detail:0});assert.equal(h.calls.filter(([type])=>type==='open').length,before+1,'keyboard activation remains available');
 h.advance(1000);h.emit(h.img(1),'click');assert(h.calls.some(([type,id])=>type==='open'&&id===1));const current=h.img(1);
 h.emit(h.box(1).querySelector('[data-featured-fav]'),'click');assert.deepEqual(Array.from(h.c.saved),[1]);assert.equal(h.index(1),2);assert.strictEqual(h.img(1),current);assert.equal(h.track.scrollLeft,outer);
}

{
 const h=boot(),outer=h.track.scrollLeft,vertical=h.motion(1,{dx:2,dy:90});assert.equal(vertical.move.defaultPrevented,false);assert.equal(h.index(1),0);
 const first=h.touch(1,50,50),second=h.touch(2,100,50),rail=h.rail(1);
 const events=[h.emit(rail,'touchstart',{touches:[first,second]}),h.emit(rail,'touchmove',{touches:[h.touch(1,0,50),h.touch(2,160,50)]}),h.emit(rail,'touchend',{touches:[],changedTouches:[first,second]})];assert(events.every(event=>!event.defaultPrevented));assert.equal(h.index(1),0);
 h.emit(rail,'touchstart',{touches:[first]});h.emit(rail,'touchcancel',{touches:[]});h.emit(rail,'touchend',{touches:[],changedTouches:[h.touch(1,-80,50)]});assert.equal(h.index(1),0);
 const key=h.emit(h.slide(1),'keydown',{key:'ArrowRight'});assert.equal(key.defaultPrevented,true);h.flush();assert.equal(h.index(1),1);assert.equal(h.track.scrollLeft,outer);assert(h.calls.some(([type,node,behavior])=>type==='native-scroll'&&node===rail&&behavior==='smooth'));
 h.emit(rail,'keydown',{key:'ArrowRight'});h.flush();assert.equal(h.index(1),2);h.emit(rail,'keydown',{key:'ArrowRight'});h.flush();assert.equal(h.index(1),2);assert.equal(h.track.scrollLeft,outer);
 h.emit(h.slide(1),'keydown',{key:'ArrowLeft',ctrlKey:true});h.flush();assert.equal(h.index(1),2);h.emit(h.slide(1),'keydown',{key:'ArrowLeft'});h.flush();assert.equal(h.index(1),1);
 h.emit(h.track,'keydown',{key:'ArrowRight'});assert(h.track.scrollLeft>outer);
 const reduced=boot({reduced:true});reduced.emit(reduced.slide(1),'keydown',{key:'ArrowRight'});reduced.flush();assert.equal(reduced.index(1),1);assert(reduced.calls.some(([type,node,behavior])=>type==='native-scroll'&&node===reduced.rail(1)&&behavior==='auto'));
 const single=boot({single:true});assert.equal(single.box(1).getAttribute('data-featured-gallery'),null);assert.equal(single.rail(1),null);assert.equal(single.count(1),'1 / 1');dots(single,1,1,0);assert.equal(single.track.querySelector('[data-featured-photo-dir]'),null);
 for(const type of ['touchstart','touchmove','pointerdown','pointermove'])assert.equal(single.slide(1).events[type],undefined);single.emit(single.slide(1),'click');assert(single.calls.some(([type,id])=>type==='open'&&id===1));
}

{
 const h=boot();h.scroll(1,-.4);assert.equal(h.index(1),0);dots(h,1,3,0);assert.equal(h.img(1,2),null,'negative rubber-band offset must not load the last frame');
 h.scroll(1,4.2);assert.equal(h.index(1),2);assert.equal(h.count(1),'3 / 3');dots(h,1,3,2);
 h.scroll(1,1);h.resizePhotos(215);assert.equal(h.rail(1).scrollLeft,215,'width changes restore the selected frame instead of the previous pixel offset');assert.equal(h.index(1),1);
 h.setRenderedPhotoWidth(0);h.c.reelsMode=true;h.c.cars=h.c.cars.map(lot=>({...lot,name:lot.name+' обновлён'}));h.api.refresh();h.flush();assert.equal(h.rail(1).clientWidth,0);
 h.c.reelsMode=false;h.resizePhotos(180);assert.equal(h.index(1),1);assert.equal(h.rail(1).scrollLeft,180,'a rail rebuilt while hidden restores on layout visibility without a window resize');
}

{
 const h=boot();h.flush();const reads=h.mediaReads(),checks=h.scans();for(let n=0;n<50;n++)h.scroll(1,n/50,{flush:false});
 assert.equal(h.mediaReads(),reads,'native scroll events queue work without rescanning photo data');assert.equal(h.scans(),checks,'scroll events do not synchronously revisit the catalogue');h.flush();
 assert.equal(h.index(1),1);assert(h.mediaReads()-reads<=1,'a burst is validated once per animation frame');
}

{
 const h=boot(),sameRail=h.rail(1);h.c.cars=h.c.cars.slice();h.api.refresh();assert.strictEqual(h.rail(1),sameRail,'unchanged visible models keep their DOM');
 h.scroll(1,1);assert.equal(h.index(1),1,'inventory identity changes must not permanently disable an unchanged gallery');assert.equal(h.count(1),'2 / 3');assert(h.img(1));
}

{
 const h=boot();h.scroll(1,1);const outer=h.track.scrollLeft,chosen=h.img(1).getAttribute('data-responsive-original');h.c.cars=h.c.cars.map(lot=>({...lot,price:lot.price+500}));h.api.refresh();h.flush();
 assert.equal(h.img(1).getAttribute('data-responsive-original'),chosen);assert.equal(h.rail(1).scrollLeft,h.rail(1).clientWidth,'price redraw restores the real native offset');assert.equal(h.track.scrollLeft,outer);
 h.c.cars=h.c.cars.map(lot=>lot.id===1?{...lot,media:[image(3),image(1),image(2)]}:lot);h.api.refresh();h.flush();assert.equal(h.index(1),2);assert.equal(h.img(1).getAttribute('data-responsive-original'),chosen);
 h.c.cars=h.c.cars.map(lot=>lot.id===1?{...lot,media:[image(1),image(3)]}:lot);h.api.refresh();h.flush();assert.equal(h.index(1),0);
 h.scroll(1,.7,{flush:false});const priceRail=h.rail(1);h.c.cars=h.c.cars.map(lot=>({...lot,price:lot.price+10}));h.api.refresh();h.flush();assert.strictEqual(h.rail(1),priceRail,'price-only updates retain the browser scroll node');assert.equal(h.index(1),1);assert.equal(h.rail(1).scrollLeft,h.rail(1).clientWidth*.7,'price updates preserve fractional scrolling');
 h.scroll(1,0);h.scroll(1,1,{flush:false});const oldRail=h.rail(1);h.c.cars=h.c.cars.map(lot=>({...lot,name:lot.name+' обновлён'}));h.api.refresh();h.flush();assert.equal(h.index(1),0,'queued work from the old rail cannot move its replacement');assert.equal(oldRail.isConnected,false);
 h.scroll(1,1);h.setProfile('bob');h.api.refresh();h.flush();assert.equal(h.index(1),0);h.scroll(1,1,{flush:false});h.setProfile('carol');h.flush();assert.equal(h.index(1),0,'profile change invalidates queued native work');
 const blocked=boot();blocked.scroll(1,1,{flush:false});blocked.modal.open=true;blocked.flush();assert.equal(blocked.index(1),0);blocked.modal.open=false;blocked.scroll(1,1,{flush:false});blocked.document.hidden=true;blocked.flush();assert.equal(blocked.index(1),0);
 const changed=boot();changed.scroll(1,1,{flush:false});changed.c.cars[0].media=[image(3),image(2)];changed.flush();assert.equal(changed.index(1),0);assert.equal(changed.img(1).getAttribute('data-responsive-original'),image(3));changed.scroll(1,1,{flush:false});changed.c.cars[0].status='sold';changed.flush();assert.equal(changed.card(1),null);
}

{
 const h=boot();let photo=h.img(1);h.emit(photo,'error');assert.equal(photo.getAttribute('srcset'),null);assert.equal(photo.getAttribute('src'),image(1));h.emit(photo,'error');assert.equal(photo.getAttribute('src'),'assets/cars.svg');
 const failed=photo;h.scroll(1,1);photo=h.img(1);assert.equal(photo.getAttribute('data-responsive-original'),image(2));assert(!photo.dataset.featuredFallback);assert(!photo.dataset.responsiveTried);assert(photo.getAttribute('srcset')?.includes('cars-2-'));
 const current=photo.getAttribute('src');h.emit(failed,'error');assert.equal(photo.getAttribute('src'),current);h.emit(photo,'error');assert.equal(photo.getAttribute('src'),image(2));
 h.c.cars=h.c.cars.map(lot=>lot.id===1?{...lot,media:[{type:'video',url:'https://example.com/movie.mp4'},image(3),image(3),'javascript:alert(1)','https://name:password@example.com/private.jpg','blob:foreign-photo',image(1)]}:lot);h.api.refresh();h.flush();assert.equal(h.count(1),'1 / 2');h.scroll(1,1);assert.equal(h.img(1).getAttribute('data-responsive-original'),image(1));assert(!h.track.innerHTML.includes('javascript:'));
}

{
 const h=boot(),label='Фрагмент того же фото · демо',detail='Крупный фрагмент того же фото · демо';h.c.cars[0].media=[{url:image(1),label:'Демонстрационное фото'},{url:image(1)+'?view=1',crop:'left',label},{url:image(1)+'?view=2',crop:'detail',label:detail}];h.api.refresh();const preview=h.img(1).getAttribute('src');
 h.scroll(1,1);assert.equal(h.img(1).getAttribute('src'),preview);assert.equal(h.img(1).getAttribute('data-crop'),'left');assert.equal(h.box(1).querySelector('[data-featured-photo-label]')?.textContent,label);assert(h.slide(1).getAttribute('aria-label').includes(label));h.scroll(1,2);assert.equal(h.img(1).getAttribute('data-crop'),'detail');assert.equal(h.box(1).querySelector('[data-featured-photo-label]')?.textContent,detail);h.scroll(1,1);assert.equal(h.img(1).getAttribute('data-crop'),'left');
 for(const [crop,position,scale]of [['left','20% center','1.25'],['detail','70% center','1.45']]){const rule=css.match(new RegExp('\\.featured-open img\\[data-crop="'+crop+'"\\]\\s*\\{([^}]+)\\}'))?.[1];assert(rule);assert(rule.replace(/\s+/g,'').includes('object-position:'+position.replace(/\s+/g,'')));assert(rule.includes('scale('+scale+')'))}
 const hostile='<img src=x onerror="alert(1)"><script>bad()</script>';h.c.cars[0].media=[{url:image(1),label:hostile,crop:'left" onerror="bad()'},image(2)];h.api.refresh();assert.equal(h.box(1).querySelector('[data-featured-photo-label]')?.textContent,hostile);assert.equal(h.img(1).getAttribute('data-crop'),null);assert.equal(h.track.querySelectorAll('img').length,12);assert.equal(h.box(1).querySelector('script'),null);h.c.cars[0].media=[image(1),image(2)];h.api.refresh();assert.equal(h.box(1).querySelector('[data-featured-photo-label]')?.hidden,true);
 const many=Array.from({length:22},(_,i)=>'https://example.com/actual-photo-'+i+'.jpg');h.c.cars[0].media=many;h.api.refresh();dots(h,1,22,0);assert.equal(h.rail(1).querySelectorAll('img').length,1,'many indicators do not eagerly request all images');h.scroll(1,21);dots(h,1,22,21);
}

{
 const h=boot({pointer:true}),rail=h.rail(1),point=h.touch(7,150,90);
 h.emit(rail,'pointerdown',{pointerType:'touch',pointerId:9,button:0,isPrimary:true,clientX:150,clientY:90});
 h.emit(rail,'touchstart',{touches:[point]});
 for(const listener of h.winEvents.pointerup||[])listener({type:'pointerup',pointerType:'touch',pointerId:9,clientX:150,clientY:90});
 h.emit(rail,'touchend',{touches:[],changedTouches:[point]});h.emit(h.img(1),'click');
 assert(h.calls.some(([type,id])=>type==='open'&&id===1),'native touch pointerup before touchend must preserve a normal tap');
 const mouse=boot({pointer:true});mouse.scroll(1,1);mouse.emit(mouse.rail(1),'pointerdown',{pointerType:'mouse',pointerId:3,button:0,isPrimary:true,clientX:100,clientY:80});
 for(const listener of mouse.winEvents.pointerup||[])listener({type:'pointerup',pointerType:'mouse',pointerId:3,clientX:200,clientY:80});
 mouse.resizePhotos(180);assert.equal(mouse.rail(1).scrollLeft,180,'mouse release outside the rail cannot leave a stuck press blocking resize');
}

console.log('PASS: native nested photo offsets/passive motion and exact indicators, no arrows/custom touch-step; on-demand frames, independent rail, keyboard/reduced motion, context/URL restoration, canonical media/crops and retries. Native scrolling is modelled, not a physical-browser gesture test.');
