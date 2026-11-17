const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const source=fs.readFileSync('dist/featured-lots.js','utf8');

function boot(options={}){
 const h=setup(),section=h.add('featured-lots','section'),track=h.add('featured-track','div',section),registrations=new WeakMap();
 h.add('featured-note','p',section);h.add('featured-empty','p',section);
 const media={matches:(options.width??1440)>=1025&&options.fine!==false&&options.hover!==false,callbacks:[],addEventListener(type,fn){this.callbacks.push(fn)}};
 const addListener=h.Element.prototype.addEventListener;
 h.Element.prototype.addEventListener=function(type,listener,settings){const list=registrations.get(this)||[];list.push({type,listener,capture:settings===true||!!settings?.capture,settings});registrations.set(this,list);addListener.call(this,type,listener,settings)};
 h.Element.prototype.setPointerCapture=function(id){this.captured=id};
 h.Element.prototype.hasPointerCapture=function(id){return this.captured===id};
 h.Element.prototype.releasePointerCapture=function(id){if(this.captured===id){this.captured=null;emit(this,'lostpointercapture',{pointerId:id})}};
 Object.defineProperty(h.Element.prototype,'scrollLeft',{get(){return this.left||0},set(value){this.left=value;emit(this,'scroll')}});
 h.Element.prototype.scrollTo=function(value){if(value.left!==undefined)this.scrollLeft=value.left};
 track.clientWidth=900;track.scrollWidth=2500;track.clientHeight=350;
 track.getBoundingClientRect=()=>({top:0,left:0,width:900,height:354,right:900,bottom:354});
 const c=h.context;let now=Date.now(),scans=0,mediaReads=0;
 c.Date=class extends Date{static now(){return now}};c.URL=URL;c.bids={};if(options.pointer!==false)c.PointerEvent=class {};
 c.navigator={userAgent:options.ua||'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',platform:options.platform||'Win32',maxTouchPoints:options.touchPoints||0,userAgentData:{mobile:!!options.mobile}};
 c.Capacitor={isNativePlatform:()=>!!options.native};if(options.nativeClass)h.document.documentElement.classList.add('native-app');
 if(options.sharedGate!==undefined)c.FasDesktopWeb={active:()=>options.sharedGate};
 c.matchMedia=query=>query.includes('min-width: 1025px')?media:{matches:false};
 c.cars=Array.from({length:12},(_,i)=>({id:i+1,name:'Лот '+(i+1),category:'cars',city:'Москва',price:100000+i,status:'live',ends:new Date(now+86400000).toISOString(),media:i===1?['assets/photos/cars-1.jpg']:['assets/photos/cars-1.jpg','assets/photos/cars-2.jpg','assets/photos/cars-3.jpg']}));
 c.isLotLive=lot=>{scans++;return lot.status==='live'};c.current=lot=>lot.price;c.userOrigin=()=>null;c.image=lot=>lot.media[0];c.categoryNames={cars:'Автомобили'};c.escapeText=value=>String(value??'');c.money=value=>value+' ₽';
 c.lotMedia=lot=>{mediaReads++;return lot.media};c.lotMediaItem=(_lot,url)=>({url,type:'image'});
 function emit(target,type,extra={}){
  const event={type,target,pointerType:'mouse',pointerId:7,button:0,buttons:type==='pointerup'?0:1,isPrimary:true,clientX:500,clientY:100,detail:1,defaultPrevented:false,cancelable:true,
   preventDefault(){this.defaultPrevented=true},stopPropagation(){this.stopped=true},stopImmediatePropagation(){this.immediate=true;this.stopped=true},...extra};
  const path=[];for(let node=target;node;node=node.parentElement)path.push(node);
  const invoke=(node,capture)=>{for(const item of registrations.get(node)||[])if(item.type===type&&item.capture===capture){item.listener(event);if(event.immediate)break}};
  for(const node of path.slice().reverse()){invoke(node,true);if(event.stopped)return event}
  for(const node of path){invoke(node,false);if(event.stopped||type==='scroll'||type==='lostpointercapture')return event}
  for(const listener of h.winEvents[type]||[])listener(event);return event;
 }
 function win(type,extra={}){return emit(null,type,extra)}
 vm.runInContext(source,c);
 for(const rail of track.querySelectorAll('.featured-photo-track')){rail.clientWidth=190;rail.scrollWidth=570}
 h.flush();
 const card=id=>track.querySelector('[data-featured-lot="'+id+'"]'),name=id=>card(id).querySelector('.featured-name'),photo=id=>card(id).querySelector('.featured-open'),rail=id=>card(id).querySelector('.featured-photo-track');
 return {...h,c,section,track,media,emit,win,card,name,photo,rail,registrations,advance:n=>{now+=n},scans:()=>scans,mediaReads:()=>mediaReads,
  gesture(target,dx=-120,dy=0){const start=emit(target,'pointerdown'),move=win('pointermove',{clientX:500+dx,clientY:100+dy}),end=win('pointerup',{clientX:500+dx,clientY:100+dy});return {start,move,end}}};
}

{
 const h=boot(),target=h.name(1);assert(h.track.classList.contains('featured-desktop-drag'));
 const down=h.emit(target,'pointerdown');assert.equal(down.defaultPrevented,false,'mouse press preserves ordinary button activation');
 const checks=h.scans(),reads=h.mediaReads();h.win('pointermove',{clientX:495});assert.equal(h.track.scrollLeft,0,'sub-threshold movement stays a click');
 const move=h.win('pointermove',{clientX:379.5});assert(move.defaultPrevented);assert.equal(h.track.scrollLeft,120.5,'mouse movement follows a fractional native offset');assert.equal(h.track.captured,7);assert(h.track.classList.contains('is-desktop-dragging'));
 h.win('pointermove',{clientX:300});assert.equal(h.track.scrollLeft,200);assert.equal(h.scans(),checks);assert.equal(h.mediaReads(),reads,'outer drag never reads catalogue media');
 h.win('pointerup',{clientX:300});assert(!h.track.classList.contains('is-desktop-dragging'));assert.equal(h.track.captured,null,'release outside the strip clears capture');
 assert(h.emit(target,'click').defaultPrevented);assert(!h.calls.some(([type])=>type==='open'),'release click cannot open a card after dragging');
 h.emit(target,'pointerdown');h.win('pointerup');h.emit(target,'click');assert(h.calls.some(([type,id])=>type==='open'&&id===1),'an immediate intentional click remains usable');
 h.gesture(target,90);assert.equal(h.track.scrollLeft,110,'dragging right reverses the outer rail');
 h.gesture(target,500);assert.equal(h.track.scrollLeft,0);h.gesture(target,-10000);assert.equal(h.track.scrollLeft,1600,'outer offset stays bounded');
 for(const type of ['touchstart','touchmove'])assert.equal(h.track.events[type],undefined,'native '+type+' is not intercepted');
}

{
 const h=boot(),rail=h.rail(1),target=h.photo(1);h.gesture(target,-115);h.flush();
 assert.equal(rail.scrollLeft,115);assert.equal(h.track.scrollLeft,0,'photo drag cannot move the surrounding lots');assert.equal(h.card(1).querySelector('[data-featured-gallery]').dataset.featuredPhotoIndex,'1');
 h.gesture(target,-1000);h.flush();assert.equal(rail.scrollLeft,380);assert.equal(h.track.scrollLeft,0,'last photo does not chain into the outer rail');
 h.gesture(target,1000);h.flush();assert.equal(rail.scrollLeft,0);assert.equal(h.track.scrollLeft,0,'first photo stays in its own album');
 h.gesture(h.photo(2),-155);assert.equal(h.track.scrollLeft,155,'a single-photo card drags the outer rail');
 assert(h.emit(h.photo(2),'click').defaultPrevented);assert(!h.calls.some(([type])=>type==='open'));
 h.advance(500);h.emit(h.photo(2),'click');assert(h.calls.some(([type,id])=>type==='open'&&id===2));
}

{
 const h=boot(),name=h.name(1);h.gesture(name,-5);h.emit(name,'click');assert.equal(h.track.scrollLeft,0);assert.equal(h.calls.filter(([type])=>type==='open').length,1);
 const vertical=h.gesture(name,-15,80);assert(!vertical.move.defaultPrevented);assert.equal(h.track.scrollLeft,0);
 const favorite=h.card(1).querySelector('[data-featured-fav]'),input=h.add('test-input','input',h.track),link=h.add('test-link','a',h.track),seller=h.add('test-seller','button',h.track);
 for(const control of [favorite,input,link,seller]){const gesture=h.gesture(control);assert(!gesture.move.defaultPrevented);assert.equal(h.track.scrollLeft,0,'interactive controls keep their mouse handling')}
 h.emit(favorite,'click');assert.deepEqual(Array.from(h.c.saved),[1]);
 h.emit(h.track,'pointerdown',{clientY:352});h.win('pointermove',{clientX:200,clientY:352});h.win('pointerup');assert.equal(h.track.scrollLeft,0,'native scrollbar is not treated as a card drag');
 for(const extra of [{pointerType:'touch'},{pointerType:'pen'},{button:1},{button:2},{isPrimary:false},{defaultPrevented:true},{ctrlKey:true},{altKey:true},{metaKey:true},{shiftKey:true}]){
  h.emit(name,'pointerdown',extra);assert.equal(h.win('pointermove',{clientX:200,...extra}).defaultPrevented,!!extra.defaultPrevented);h.win('pointerup');assert.equal(h.track.scrollLeft,0);
 }
 h.track.scrollWidth=h.track.clientWidth;h.gesture(name);assert.equal(h.track.scrollLeft,0,'short selections do not claim a drag');
}

{
 for(const options of [{width:390},{width:1024},{fine:false},{hover:false},{ua:'Mozilla/5.0 (Linux; Android 14; Tablet)'},{ua:'Mozilla/5.0 (iPad)'},{ua:'Mozilla/5.0 (iPhone)'},{platform:'MacIntel',touchPoints:5},{mobile:true},{native:true},{nativeClass:true},{pointer:false},{sharedGate:false}]){
  const h=boot(options);assert(!h.track.classList.contains('featured-desktop-drag'),JSON.stringify(options));assert.equal(h.track.events.pointerdown,undefined,'excluded platforms do not bind an outer pointer handler');h.gesture(h.name(1));assert.equal(h.track.scrollLeft,0);
 }
 const h=boot({width:1024});h.media.matches=true;h.media.callbacks.forEach(fn=>fn());assert(h.track.classList.contains('featured-desktop-drag'));h.gesture(h.name(1));assert.equal(h.track.scrollLeft,120,'resizing into desktop enables dragging');
 h.emit(h.name(1),'pointerdown');h.win('pointermove',{clientX:400});h.media.matches=false;h.media.callbacks.forEach(fn=>fn());const left=h.track.scrollLeft;
 assert(!h.track.classList.contains('featured-desktop-drag'));assert(!h.track.classList.contains('is-desktop-dragging'));h.win('pointermove',{clientX:100});assert.equal(h.track.scrollLeft,left,'leaving desktop cancels an in-flight drag');
}

{
 for(const type of ['pointercancel','lostpointercapture','blur','pagehide']){
  const h=boot();h.emit(h.name(1),'pointerdown');h.win('pointermove',{clientX:400});
  if(type==='lostpointercapture')h.emit(h.track,type);else h.win(type);
  assert(!h.track.classList.contains('is-desktop-dragging'),type+' removes the drag state');const left=h.track.scrollLeft;h.win('pointermove',{clientX:200});assert.equal(h.track.scrollLeft,left);
 }
 const h=boot();h.gesture(h.name(1));h.emit(h.name(1),'click',{detail:0});assert(h.calls.some(([type])=>type==='open'),'keyboard activation is not swallowed after a mouse drag');
 h.emit(h.photo(1),'pointerdown');h.win('pointermove',{clientX:400});const old=h.rail(1);h.c.cars=h.c.cars.map(lot=>({...lot,name:lot.name+' новый'}));h.c.FasFeaturedLots.refresh();assert(!old.classList.contains('is-desktop-dragging'));const left=h.rail(1).scrollLeft;h.win('pointermove',{clientX:200});assert.equal(h.rail(1).scrollLeft,left,'replacement DOM cannot inherit a pending drag');
 const modal=boot();modal.emit(modal.name(1),'pointerdown');modal.modal.open=true;assert(!modal.win('pointermove',{clientX:200}).defaultPrevented);assert.equal(modal.track.scrollLeft,0,'opening a dialog cancels a pending home drag');
}

console.log('PASS: desktop-only mouse dragging follows native outer/photo offsets, preserves clicks and controls, suppresses release clicks, cleans up capture and context changes, and excludes mobile/tablet/native contexts. Native browser geometry and gestures require the browser integration check.');
