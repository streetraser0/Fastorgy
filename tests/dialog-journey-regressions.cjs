const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {setup}=require('./helpers/quickbar-dom.cjs');
const read=name=>fs.readFileSync(path.join(__dirname,'../dist',name),'utf8');

// Execute the real feed Escape registration rather than a second implementation
// of its condition. The small DOM models keyboard bubbling and native cancel.
function feed(){
 const h=setup({mobile:true}),c=h.context,listeners={};
 h.Element.prototype.replaceChildren=function(...children){for(const child of this.children)child.parentElement=null;this.children=[];for(const child of children)this.appendChild(child)};
 c.$=selector=>h.document.querySelector(selector);c.navigator={};c.reelsMode=true;h.body.classList.add('reels');h.grid.scrollTop=5300;
 h.document.addEventListener=(type,handler,options)=>(listeners[type]??=[]).push({handler,capture:options===true||options?.capture===true});
 const html=read('index.html'),anchor=html.indexOf("$('#close-reels').onclick"),start=html.indexOf("document.addEventListener('keydown',",anchor),end=html.indexOf('});',start)+3;
 assert(anchor>=0&&start>anchor&&end>start,'the actual feed keyboard registration is present');
 vm.runInContext(html.slice(start,end),c,{filename:'actual-feed-escape-handler'});
 const load=name=>vm.runInContext(read(name),c,{filename:name});
 function key(target,value='Escape',{prevented=false}={}){
  const event={type:'keydown',key:value,target,defaultPrevented:prevented,preventDefault(){this.defaultPrevented=true},stopPropagation(){this.stopped=true},stopImmediatePropagation(){this.stopped=true;this.immediate=true}};
  for(const entry of listeners.keydown||[])if(entry.capture&&!event.immediate)entry.handler(event);
  if(!event.stopped)for(let node=target;node&&!event.stopped;node=node.parentElement)node.dispatchEvent(event);
  if(!event.stopped)for(const entry of listeners.keydown||[])if(!entry.capture&&!event.immediate)entry.handler(event);
  if(value==='Escape'&&!event.defaultPrevented){const top=h.document.querySelectorAll('dialog[open]').filter(dialog=>dialog.open).at(-1);if(top){const cancel={type:'cancel',target:top,defaultPrevented:false,preventDefault(){this.defaultPrevented=true}};top.dispatchEvent(cancel);if(!cancel.defaultPrevented)top.close()}}
  return event;
 }
 return {...h,c,load,key};
}

for(const kind of ['payment','map','voice','local-ai','support']){
 const h=feed();let dialog;
 if(kind==='payment'){h.load('payment-ui.js');assert(h.c.FasPayments.open({id:42,name:'Лот из ленты',buyNowPrice:250000}).ok);dialog=h.document.querySelector('#payment-dialog')}
 if(kind==='map'){h.load('property-map.js');h.c.FasPropertyMap.configure({getLots:()=>[],getAllLots:()=>[],getOrigin:()=>null});assert(h.c.FasPropertyMap.open());dialog=h.document.querySelector('#property-map-dialog')}
 if(kind==='voice'){h.load('voice-assistant.js');h.c.FasVoiceAssistant.open();dialog=h.document.querySelector('#voice-dialog')}
 if(kind==='local-ai'){h.load('local-ai-policy.js');h.load('local-ai.js');assert(h.c.FasLocalAI.open());dialog=h.document.querySelector('#local-ai-dialog')}
 if(kind==='support'){h.load('support.js');h.c.FasSupport.open();dialog=h.document.querySelector('#support-dialog')}
 assert(dialog?.open,kind+' is a real separate overlay');assert.equal(h.modal.open,false);
 h.key(dialog.querySelector('h2')||dialog);
 assert.equal(dialog.open,false,kind+' handles its own native Escape');
 assert.equal(h.c.reelsMode,true,kind+' Escape must return to the feed instead of exiting it');
 assert.equal(h.grid.scrollTop,5300,kind+' retains the selected feed position');
 assert.equal(h.calls.filter(([type])=>type==='reels').length,0,kind+' must not invoke the feed route while its overlay is open');
 h.key(h.grid);assert.equal(h.c.reelsMode,false,'the next bare-feed Escape still exits normally');
}
{
 const h=feed();h.key(h.grid,'Escape',{prevented:true});assert.equal(h.c.reelsMode,true,'another handled Escape is never consumed again');
 h.key(h.grid,'ArrowDown');assert.equal(h.c.reelsMode,true,'other keys do not invoke Escape navigation');
 const modal=h.modal;modal.showModal();h.key(modal);assert.equal(modal.open,false);assert.equal(h.c.reelsMode,true,'the main modal also returns to the same feed');
 h.key(h.grid);assert.equal(h.c.reelsMode,false);
}

function photo(){
 const h=setup({mobile:true}),c=h.context,listeners={},timers=new Map();let now=1000,nextTimer=0,favorites=0;
 c.Date=class extends Date{static now(){return now}};c.PointerEvent=function(){};
 c.setTimeout=(handler,delay=0)=>{const id=++nextTimer;timers.set(id,{handler,at:now+delay});return id};c.clearTimeout=id=>timers.delete(id);
 h.document.addEventListener=(type,handler,options)=>(listeners[type]??=[]).push({handler,capture:options===true||options?.capture===true});
 c.cars=[{id:42,name:'Фото из сохранённой карточки',media:[{url:'assets/photos/cars-1.jpg',type:'image',label:'Основное фото'}]}];c.lotMedia=lot=>lot.media;c.lotMediaItem=(lot,item)=>item;c.toggleLotFavorite=()=>{favorites++;return true};
 h.content.innerHTML='<textarea id="typed-bid-note">Не потерять введённые данные</textarea><div class="lot-gallery" data-gallery-lot="42"><div class="gallery-track"><img src="assets/preview.webp" alt="Фото"></div></div>';
 h.modal.showModal();h.modal.classList.add('lot-dialog');h.modal.scrollTop=430;h.grid.scrollTop=5300;
 const note=h.content.querySelector('#typed-bid-note'),track=h.content.querySelector('.gallery-track'),image=track.querySelector('img');track.scrollLeft=390;
 vm.runInContext(read('lot-photo-viewer.js'),c,{filename:'lot-photo-viewer.js'});
 function emit(type,target,extra={}){const event={type,target,detail:1,pointerType:'touch',preventDefault(){this.defaultPrevented=true},stopPropagation(){this.stopped=true},stopImmediatePropagation(){this.stopped=true;this.immediate=true},...extra};for(const entry of listeners[type]||[])if(entry.capture&&!event.immediate)entry.handler(event);if(!event.stopped)for(let node=target;node&&!event.stopped;node=node.parentElement)node.dispatchEvent?.(event);if(!event.stopped)for(const entry of listeners[type]||[])if(!entry.capture&&!event.immediate)entry.handler(event);return event}
 function advance(ms){now+=ms;for(let round=0;round<20;round++){const due=[...timers].filter(([,timer])=>timer.at<=now);if(!due.length)return;for(const[id,timer]of due){timers.delete(id);timer.handler()}}throw Error('unbounded photo timer')}
 return {...h,c,api:c.FasLotPhotos,note,track,image,emit,advance,get pendingTimers(){return timers.size},get favorites(){return favorites}};
}
for(const eventType of ['close','cancel']){
 const h=photo();h.emit('click',h.image);assert.equal(h.pendingTimers,1);assert.equal(h.api.state().open,false);
 const overlay=h.add('transient-'+eventType,'dialog');overlay.showModal();h.advance(80);
 if(eventType==='cancel')h.emit('cancel',overlay);
 overlay.close();h.emit('close',overlay);h.advance(400);
 assert.equal(h.api.state().open,false,eventType+' prevents an old photo timer from reviving after A → overlay → A');
 assert.equal(h.pendingTimers,0);assert.equal(h.content.querySelector('#typed-bid-note'),h.note);assert.equal(h.modal.scrollTop,430);assert.equal(h.grid.scrollTop,5300);assert.equal(h.track.scrollLeft,390);
 h.emit('click',h.image);h.advance(320);assert.equal(h.api.state().open,true,'a fresh explicit tap works after cancellation');h.api.close();
 assert.equal(h.content.querySelector('#typed-bid-note'),h.note);assert.equal(h.modal.scrollTop,430);
}
{
 const h=photo();h.emit('click',h.image);h.advance(319);assert.equal(h.api.state().open,false);h.advance(1);assert.equal(h.api.state().open,true,'the normal 320ms favorite window is retained');h.api.close();
 h.emit('click',h.image);h.advance(100);h.emit('click',h.image,{detail:2});h.advance(400);assert.equal(h.api.state().open,false);assert.equal(h.favorites,1,'double tap remains a favorite action rather than opening a photo');
}
console.log('PASS: Escape closes real payment/map/voice/local-AI/support overlays without leaving the feed; prevented/bare-feed/main-modal routes stay correct, and close/cancel interrupts stale deferred photo opens while retaining normal taps, favorites and underlying state. Browser/device behavior is not asserted.');
