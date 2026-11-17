const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const read=name=>fs.readFileSync(path.join(__dirname,'../dist',name),'utf8'),source=read('lot-close-gesture.js');
function boot({scrollTop=0,grip=false}={}){
 const h=setup({mobile:true}),callbacks=[];let closed=0,taps=0;
 h.context.matchMedia=()=>({matches:false});h.context.MutationObserver=class{constructor(callback){callbacks.push(callback)}observe(){}disconnect(){}};
 h.context.reelsMode=true;h.grid.scrollTop=1234;h.modal.scrollTop=scrollTop;h.modal.classList.add('lot-dialog');
 h.content.innerHTML='<div class="lot-quick-access"><button><svg><path/></svg>Назад</button><img role="button" alt="ФАС торги"></div><div class="lot-swipe-surface"><div class="lot-gallery"><div class="gallery-track"><img role="button" alt="Дом"></div><span class="gallery-count">1 / 3</span></div></div><div class="purchase-body" data-open-lot-id="42"><h2>Жилой дом</h2><strong data-current-lot-price="42">1 000 000 ₽</strong><form id="bid-form" data-lot-id="42"><input id="bid"></form><p class="description">Описание дома</p></div>';
 if(grip){const strip=h.add('return-grip','div',h.content);strip.setAttribute('data-dialog-swipe-header','')}
 h.modal.showModal();const nativeClose=h.modal.close.bind(h.modal);h.modal.close=()=>{closed++;nativeClose()};
 // Use the production installation and registered handlers, not factory calls.
 vm.runInContext(source,h.context);assert.equal(h.modal.dataset.rightSwipeClose,'ready');
 const header=h.content.querySelector('.lot-quick-access'),button=header.querySelector('button');button.addEventListener('click',()=>taps++);
 function emit(type,target,dx=0,dy=0,at=0,extra={}){
  const touch={identifier:7,clientX:180+dx,clientY:260+dy},ending=type==='touchend'||type==='touchcancel';
  const event={type,target,timeStamp:at,cancelable:true,touches:ending?[]:[touch],changedTouches:[touch],prevented:0,preventDefault(){this.prevented++},...extra};
  h.modal.dispatchEvent(event);return event;
 }
 const body=h.content.querySelector('.purchase-body');
 return {...h,header,button,body,photo:h.content.querySelector('.gallery-track').querySelector('img'),description:body.querySelector('.description'),emit,get closed(){return closed},get taps(){return taps},mutate(target){callbacks.forEach(callback=>callback([{type:'childList',target}]))}};
}
for(const targetName of ['header','button','logo','svg','grip'])for(const [dx,dy]of [[120,0],[-120,0],[0,120],[0,-120]]){
 const h=boot({grip:true}),target=targetName==='logo'?h.header.querySelector('img'):targetName==='svg'?h.button.querySelector('path'):targetName==='grip'?h.document.querySelector('#return-grip'):h[targetName];
 h.emit('touchstart',target);const tiny=h.emit('touchmove',target,Math.sign(dx)*2,Math.sign(dy)*2,16);
 assert.equal(tiny.prevented,1,'reserve the first 2px movement before native scrolling can latch on '+targetName);
 // Model a browser deciding after its first move whether it owns the scroll.
 if(!tiny.prevented)h.emit('touchcancel',target,dx,dy,30,{cancelable:false});
 h.emit('touchmove',target,dx,dy,300,{cancelable:false});h.emit('touchend',target,dx,dy,1600,{cancelable:false});
 assert.equal(h.closed,1,'a deliberate slow return survives a noncancelable final event');assert.equal(h.context.reelsMode,true);assert.equal(h.grid.scrollTop,1234);
}
for(const source of ['photo','description']){
 const h=boot({scrollTop:source==='description'?700:0}),target=h[source],dy=source==='photo'?120:-120;
 h.emit('touchstart',target);assert.equal(h.emit('touchmove',target,0,Math.sign(dy)*2,16).prevented,1,'edge pull reserves the first tiny move');h.emit('touchmove',target,0,dy,300);h.emit('touchend',target,0,dy,1300,{cancelable:false});assert.equal(h.closed,1,'claimed edge pull is not lost just because touchend is noncancelable');assert.equal(h.grid.scrollTop,1234);
}
{
 const h=boot();h.emit('touchstart',h.photo);h.emit('touchmove',h.photo,0,120,100);h.emit('touchend',h.photo,0,120,200,{cancelable:false});assert.equal(h.closed,1,'noncancelable end alone cannot discard a completed photo pull');
}
for(const [dx,dy]of [[-120,0],[0,-120]]){
 const h=boot();h.emit('touchstart',h.photo);const first=h.emit('touchmove',h.photo,Math.sign(dx)*2,Math.sign(dy)*2,16),move=h.emit('touchmove',h.photo,dx,dy,100);h.emit('touchend',h.photo,dx,dy,200);assert.equal(h.closed,0);assert.equal(first.prevented+move.prevented,0,'horizontal gallery and upward reading are native from their first movement');
}
{
 const h=boot();h.emit('touchstart',h.photo);assert.equal(h.emit('touchmove',h.photo,2,0,16).prevented,1,'first photo right edge reserves the first tiny movement');h.emit('touchmove',h.photo,120,0,100);h.emit('touchend',h.photo,120,0,1300,{cancelable:false});assert.equal(h.closed,1,'slow right return on the first photo survives noncancelable final events');assert.equal(h.grid.scrollTop,1234);
}
{
 const h=boot(),track=h.photo.closest('.gallery-track');track.scrollLeft=390;h.emit('touchstart',h.photo);const first=h.emit('touchmove',h.photo,2,0,16);track.scrollLeft=0;h.emit('touchmove',h.photo,120,0,100);h.emit('touchend',h.photo,120,0,200);assert.equal(h.closed,0,'returning from a later photo to the first remains one native photo swipe');assert.equal(first.prevented,0);
}
for(const scrollTop of [0,350]){
 const h=boot({scrollTop});h.emit('touchstart',h.description);h.emit('touchmove',h.description,0,-2,16);h.modal.scrollTop=700;h.emit('touchmove',h.description,0,-120,100);h.emit('touchend',h.description,0,-120,200);assert.equal(h.closed,0,'arriving at the bottom mid-scroll never changes reading into return');
}
for(const selector of ['.gallery-count','[data-current-lot-price]','h2']){
 const h=boot();h.emit('touchstart',h.button);h.emit('touchmove',h.button,0,-120,100);const target=h.content.querySelector(selector);target.textContent='Обновлённые данные';h.mutate(target);h.emit('touchend',h.button,0,-120,200);assert.equal(h.closed,1,'cosmetic text updates between event tasks do not cancel the same lot drag: '+selector);
}
for(const change of ['body-replaced','lot-id','content-replaced','overlay','touchcancel','multitouch']){
 const h=boot();h.emit('touchstart',h.button);h.emit('touchmove',h.button,0,-120,100);
 if(change==='body-replaced'){h.body.remove();const body=h.add('new-body','div',h.content);body.setAttribute('data-open-lot-id','43');h.mutate(h.content)}
 if(change==='lot-id')h.body.setAttribute('data-open-lot-id','43');
 if(change==='content-replaced'){h.content.innerHTML='<div data-open-lot-id="43">Другой лот</div>';h.mutate(h.content)}
 if(change==='overlay')h.add('copy-sheet','dialog').showModal();
 if(change==='touchcancel')h.emit('touchcancel',h.button,0,-120,120);
 if(change==='multitouch')h.emit('touchmove',h.button,0,-120,120,{touches:[{},{}]});
 h.emit('touchend',h.button,0,-120,200);assert.equal(h.closed,0,'stale/OS-cancelled/multitouch state never closes a new layer: '+change);assert.equal(h.modal.style.transform||'','');
}
{
 const h=boot();h.emit('touchstart',h.button);h.emit('touchend',h.button,0,0,200);h.click(h.button);assert.equal(h.closed,0);assert.equal(h.taps,1,'ordinary toolbar taps still run their existing click action');
 const input=h.body.querySelector('input');h.emit('touchstart',input);assert.equal(h.emit('touchmove',input,0,120,100).prevented,0);h.emit('touchend',input,0,120,200);assert.equal(h.closed,0,'inputs are never return surfaces');
}
// Selection boundary nodes belong to the actual description DOM. Text-node
// parents model Range boundaries; a selection elsewhere on the page is unrelated.
for(const activation of ['before-start','selectionchange','contextmenu','before-end']){
 const h=boot(),anchor={nodeType:3,parentElement:h.description,parentNode:h.description},selection={isCollapsed:false,anchorNode:anchor,focusNode:h.description,rangeCount:1,getRangeAt(){return {startContainer:anchor,endContainer:h.description,commonAncestorContainer:h.description}}};let active=activation==='before-start';h.context.getSelection=()=>active?selection:{isCollapsed:true,anchorNode:null,focusNode:null,rangeCount:0};
 h.emit('touchstart',h.description);if(activation!=='before-start'){h.emit('touchmove',h.description,120,0,100);active=true;if(activation==='selectionchange'||activation==='contextmenu')for(const listener of h.docEvents[activation]||[])listener({type:activation,target:h.description})}
 const move=h.emit('touchmove',h.description,150,0,150);h.emit('touchend',h.description,150,0,200);assert.equal(h.closed,0,'native selection/copy never becomes a return gesture: '+activation);assert.equal(move.prevented,0);assert.equal(h.modal.style.transform||'','');
}
for(const selectionKind of ['outside','collapsed']){
 const h=boot(),outside=h.add('outside-selected-copy','p');h.context.getSelection=()=>({isCollapsed:selectionKind==='collapsed',anchorNode:selectionKind==='outside'?outside:h.description,focusNode:selectionKind==='outside'?outside:h.description,rangeCount:1});h.emit('touchstart',h.button);h.emit('touchmove',h.button,0,-120,100);for(const listener of h.docEvents.selectionchange||[])listener({type:'selectionchange',target:h.document});h.emit('touchend',h.button,0,-120,200);assert.equal(h.closed,1,'unrelated outside selection or a collapsed caret does not block the header: '+selectionKind);
}
const css=read('feed-close.css');assert(css.includes('@supports(touch-action:pan-up)'),'directional panning is an optional enhancement');assert(css.includes('#modal.lot-dialog .gallery-track,#modal.lot-dialog .lot-swipe-surface img{touch-action:pan-x pan-y pinch-zoom}'),'the fallback overrides the old inline top-gallery pan-x rule and allows native reading');
console.log('PASS: installed lot touch handlers reserve first tiny moves, retain noncancelable ends and slow pulls, tolerate live text mutations, keep native gallery/reading/input/selection, close only from initial edges, and cancel replaced lots/overlays/OS cancellation. This models event semantics; it is not physical Safari QA.');
