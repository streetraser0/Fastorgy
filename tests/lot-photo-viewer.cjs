const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const {setup}=require('./helpers/quickbar-dom.cjs');
const read=name=>fs.readFileSync(path.join(__dirname,'../dist',name),'utf8');
function boot({pointer=true}={}){
 const h=setup({mobile:true}),c=h.context,document=h.document,events={},timers=new Map();let time=1000,timerId=0,favorites=0;
 document.addEventListener=(type,handler,options)=>(events[type]??=[]).push({handler,capture:options===true||options?.capture===true});
 c.Date=class extends Date{static now(){return time}};c.URL=URL;c.PointerEvent=pointer?function(){}:undefined;c.scrollX=0;c.scrollY=840;c.scrollTo=({top})=>{c.scrollY=top};c.setTimeout=(handler,delay=0)=>{const id=++timerId;timers.set(id,{handler,at:time+delay});return id};c.clearTimeout=id=>timers.delete(id);
 c.categoryNames={cars:'Автомобили',property:'Недвижимость'};c.escapeText=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 c.FasSellerMedia={isSafeObjectUrl:url=>url==='blob:trusted-image'};
 c.cars=[{id:42,name:'Toyota <img src=x onerror=alert(1)>',category:'cars',image:'https://example.com/a.jpg',media:[{url:'https://example.com/a.jpg',label:'Снаружи'},{url:'https://example.com/movie.mp4',type:'video'},{url:'assets/photos/equipment-01.jpg',label:'Деталь'},{url:'blob:trusted-image',label:'Свое фото'},{url:'blob:untrusted-image'},{url:'javascript:alert(1)'},{url:'https://user:pass@example.com/private.jpg'}]}];
 c.toggleLotFavorite=id=>{favorites++;if(c.saved.includes(id))c.saved=c.saved.filter(value=>value!==id);else c.saved=[...c.saved,id];return c.saved.includes(id)};
 c.render=()=>{throw Error('The photo viewer must not re-render the lot feed')};c.reelsMode=true;c.feedIndex=25;
 const html=read('index.html');for(const name of ['lotMediaItem','image','lotMedia','gallery']){const start=html.indexOf('function '+name+'(');assert(start>=0,name+' production helper exists');const line=html.slice(start,html.indexOf('\n',start));vm.runInContext(line,c)}
 h.grid.innerHTML=c.gallery(c.cars[0]);h.grid.scrollTop=8400;h.grid.scrollLeft=0;
 h.content.innerHTML='<textarea id="unsaved-photo-note">Мой текст</textarea>'+c.gallery(c.cars[0],true);h.modal.classList.add('lot-dialog');h.modal.scrollTop=380;h.modal.showModal();
 const track=h.content.querySelector('.gallery-track');track.scrollLeft=390;document.querySelectorAll('video').forEach(video=>{video.paused=false;video.pause=function(){this.paused=true}});
 vm.runInContext(read('lot-photo-viewer.js'),c);vm.runInContext(read('back-swipe.js'),c);
 const dialog=document.querySelector('#lot-photo-viewer'),field=selector=>dialog.querySelector(selector);
 function emit(type,target,extra={}){
  const event={type,target,cancelable:true,defaultPrevented:false,preventDefault(){this.defaultPrevented=true},stopPropagation(){this.stopped=true},stopImmediatePropagation(){this.stopped=true;this.immediate=true},...extra};
  for(const entry of events[type]||[])if(entry.capture){entry.handler(event);if(event.immediate)break}
  if(!event.stopped)for(let node=target;node&&!event.stopped;node=node.parentElement){node['on'+type]?.(event);node.dispatchEvent(event)}
  if(!event.stopped)for(const entry of events[type]||[])if(!entry.capture)entry.handler(event);
  return event;
 }
 function advance(ms){time+=ms;for(let i=0;i<30;i++){const due=[...timers].filter(([,item])=>item.at<=time);if(!due.length)return;for(const[id,item]of due){timers.delete(id);item.handler()}}throw Error('unbounded photo timers')}
 const photo=()=>field('.photo-viewer-canvas').querySelector('img'),thumbs=()=>track.querySelectorAll('img');
 return {...h,api:c.FasLotPhotos,dialog,field,track,emit,advance,photo,thumbs,favorites:()=>favorites,timers:()=>timers.size};
}
{
 const h=boot(),editor=h.content.querySelector('#unsaved-photo-note'),underlying=h.content.innerHTML,thumb=h.thumbs()[1];
 const event=h.emit('click',thumb,{detail:1,pointerType:'touch'});assert(event.stopped);assert.equal(h.api.state().open,false);h.advance(319);assert.equal(h.api.state().open,false);h.advance(1);
 assert.equal(h.api.state().open,true);assert.equal(h.api.state().count,3,'videos and rejected URLs are omitted from the fullscreen photo list');assert.equal(h.api.state().index,1);assert.equal(h.photo().getAttribute('src'),'assets/photos/equipment-01.jpg');assert.equal(h.field('[data-photo-count]').textContent,'2 / 3');
 assert.equal(h.modal.open,true);assert.strictEqual(h.content.querySelector('#unsaved-photo-note'),editor);assert.equal(h.content.innerHTML,underlying);assert.equal(h.modal.scrollTop,380);assert.equal(h.grid.scrollTop,8400);assert.equal(h.track.scrollLeft,390);assert.equal(h.context.feedIndex,25);assert(h.track.querySelector('video').paused);
 assert.equal(h.field('#lot-photo-viewer-name').querySelector('img'),null,'lot names are text, not HTML');
 for(let i=0;i<20;i++)h.emit('click',h.field('[data-photo-zoom-in]'));assert.equal(h.api.state().scale,4);assert.equal(h.field('[data-photo-zoom-in]').disabled,true);assert.equal(h.field('.photo-viewer-canvas').style.width,'400%');
 const old=h.photo();h.emit('click',h.field('[data-photo-next]'));assert.equal(h.api.state().index,2);assert.equal(h.api.state().scale,1);assert.equal(h.photo().getAttribute('src'),'blob:trusted-image');assert.equal(h.field('[data-photo-next]').disabled,true);old.dispatchEvent({type:'error'});assert.equal(h.field('[data-photo-status]').textContent,'Для деталей увеличьте фото','stale image errors cannot overwrite the replacement photo');
 h.emit('dblclick',h.photo());assert.equal(h.api.state().scale,2);h.emit('click',h.field('[data-photo-reset]'));assert.equal(h.api.state().scale,1);
 const escape=h.emit('keydown',h.field('.photo-viewer-stage'),{key:'Escape'});assert(escape.stopped,'Escape cannot reach the underlying feed handler');assert.equal(h.api.state().open,false);assert.equal(h.modal.open,true);assert.equal(h.grid.scrollTop,8400);assert.equal(h.track.scrollLeft,390);assert.equal(h.modal.scrollTop,380);assert.equal(h.context.feedIndex,25);assert.equal(h.context.reelsMode,true);assert.equal(h.document.activeElement,thumb);assert.equal(h.timers(),0);
}
{
 const h=boot(),image=h.thumbs()[0];h.emit('click',image,{detail:1,pointerType:'touch'});h.advance(100);h.emit('click',image,{detail:2,pointerType:'touch'});h.advance(500);assert.equal(h.api.state().open,false);assert.equal(h.favorites(),1);assert.deepEqual(Array.from(h.context.saved),[42]);
 h.emit('click',image,{detail:1,pointerType:'touch'});h.advance(100);h.emit('click',image,{detail:2,pointerType:'touch'});h.advance(500);assert.equal(h.favorites(),1,'double tap adds once and never silently removes a saved lot');
 h.emit('click',image,{detail:1,pointerType:'touch'});h.emit('scroll',h.track);h.advance(500);assert.equal(h.api.state().open,false,'scroll cancels a pending photo open');
 h.emit('pointerdown',image,{pointerId:1,isPrimary:true,button:0,clientX:30,clientY:60});h.emit('pointermove',image,{pointerId:1,clientX:100,clientY:65});h.emit('pointerup',image,{pointerId:1,clientX:100,clientY:65});h.emit('click',image,{detail:1,pointerType:'touch'});h.advance(500);assert.equal(h.api.state().open,false,'a horizontal gallery drag ghost-click cannot open the viewer');
 h.emit('pointerdown',image,{pointerId:1,isPrimary:true,button:0,clientX:30,clientY:60});h.emit('pointerdown',image,{pointerId:2,isPrimary:false,button:0,clientX:35,clientY:60});h.emit('click',image,{detail:1,pointerType:'touch'});h.advance(500);assert.equal(h.api.state().open,false,'multitouch is not interpreted as a photo tap');
 h.emit('click',image,{detail:1,pointerType:'touch'});const nested=h.add('replacement-dialog','dialog');nested.showModal();h.advance(500);assert.equal(h.api.state().open,false,'a newer dialog cancels a stale delayed opening');nested.close();
 h.emit('keydown',image,{key:'Enter'});assert.equal(h.api.state().open,true,'keyboard activation is immediate');assert.equal(h.context.FasBackSwipe.back(),true);assert.equal(h.api.state().open,false);assert.equal(h.modal.open,true,'generic Back closes only the photo overlay');
}
{
 const h=boot({pointer:false}),image=h.thumbs()[0];const touch=(x,y)=>({identifier:7,clientX:x,clientY:y});
 h.emit('touchstart',image,{touches:[touch(10,10)]});h.emit('touchmove',image,{touches:[touch(100,10)]});h.emit('touchend',image,{touches:[],changedTouches:[touch(100,10)]});h.emit('click',image,{detail:1});h.advance(500);assert.equal(h.api.state().open,false,'older touch-only browsers keep horizontal gallery swipes native');
 h.api.open(42,0,image);const stage=h.field('.photo-viewer-stage'),large=h.photo();h.emit('touchstart',large,{timeStamp:1000,touches:[touch(220,100)]});h.emit('touchend',large,{timeStamp:1200,touches:[],changedTouches:[touch(80,100)]});assert.equal(h.api.state().index,1,'an unzoomed left swipe advances a photo');
 h.emit('click',h.field('[data-photo-zoom-in]'));h.emit('touchstart',h.photo(),{timeStamp:2000,touches:[touch(220,100)]});h.emit('touchend',h.photo(),{timeStamp:2200,touches:[],changedTouches:[touch(80,100)]});assert.equal(h.api.state().index,1,'zoomed panning does not change the image');h.api.close();
 assert.equal(h.api.open(99999),false);assert.equal(h.timers(),0);
}
function openSizedPhoto(h,{width=1200,height=800}={}){
 h.api.open(42,0,h.thumbs()[0]);const stage=h.field('.photo-viewer-stage'),image=h.photo();stage.clientWidth=390;stage.clientHeight=600;
 stage.getBoundingClientRect=()=>({left:0,top:70,width:390,height:600,right:390,bottom:670});
 image.naturalWidth=width;image.naturalHeight=height;image.getBoundingClientRect=()=>({left:0,top:70,width:390,height:600,right:390,bottom:670});
 return {stage,image};
}
function pointerTap(h,target,x=15,y=90,extra={}){
 const point={pointerId:1,button:0,isPrimary:true,clientX:x,clientY:y,...extra};h.emit('pointerdown',target,point);h.emit('pointerup',target,point);return h.emit('click',target,{detail:1,pointerType:'mouse',...point});
}
for(const type of ['mouse','touch']){
 const h=boot(),{image}=openSizedPhoto(h),editor=h.content.querySelector('#unsaved-photo-note'),old=h.content.innerHTML;
 const event=pointerTap(h,image,15,90,{pointerType:type});assert.equal(h.api.state().open,false,'actual letterbox belongs to background, despite full-stage IMG target: '+type);assert(event.stopped);assert.equal(h.modal.open,true);assert.strictEqual(h.content.querySelector('#unsaved-photo-note'),editor);assert.equal(h.content.innerHTML,old);assert.equal(h.modal.scrollTop,380);assert.equal(h.track.scrollLeft,390);assert.equal(h.grid.scrollTop,8400);
}
{
 const h=boot({pointer:false}),{image}=openSizedPhoto(h),touch={identifier:1,clientX:15,clientY:90};h.emit('touchstart',image,{touches:[touch]});h.emit('touchend',image,{touches:[],changedTouches:[touch]});h.emit('click',image,{detail:1,clientX:15,clientY:90});assert.equal(h.api.state().open,false,'touch-only fallback closes one layer on a confirmed background tap');assert.equal(h.modal.open,true);
}
for(const kind of ['image','inside-to-outside','blank-drag','right-button','hold','scroll','zoom','nested','photo-changed','keyboard','pointer-cancel','multitouch','unloaded','outside-stage']){
 const h=boot(),{image,stage}=openSizedPhoto(h),point={pointerId:1,button:0,isPrimary:true,clientX:15,clientY:90};
 if(kind==='image'||kind==='inside-to-outside'){point.clientX=195;point.clientY=370}
 if(kind==='right-button')point.button=2;if(kind==='unloaded')image.naturalWidth=0;if(kind==='outside-stage')point.clientX=500;
 h.emit('pointerdown',image,point);const end={...point};
 if(kind==='inside-to-outside'){end.clientX=15;end.clientY=90;h.emit('pointermove',image,end)}
 if(kind==='blank-drag'){h.emit('pointermove',image,{...point,clientX:100});h.emit('pointermove',image,point)}
 if(kind==='hold')h.advance(700);if(kind==='scroll')stage.scrollTop=20;
 if(kind==='zoom')h.emit('click',h.field('[data-photo-zoom-in]'));
 if(kind==='nested')h.add('nested-over-photo','dialog').showModal();
 if(kind==='photo-changed')h.emit('click',h.field('[data-photo-next]'));
 if(kind==='pointer-cancel')h.emit('pointercancel',image,point);
 if(kind==='multitouch')h.emit('pointerdown',image,{...point,pointerId:2,isPrimary:false});
 h.emit('pointerup',image,end);h.emit('click',image,{detail:kind==='keyboard'?0:1,...end});assert.equal(h.api.state().open,true,'not a background tap: '+kind);assert.equal(h.modal.open,true);
}
{
 const h=boot(),{image}=openSizedPhoto(h,{width:800,height:1600});pointerTap(h,image,10,370);assert.equal(h.api.state().open,false,'portrait side letterbox is also real background');
}
function photoSwipe(h,dx,dy,{multi=false,cancel=false,zoom=false,next=false,overlay=false,slow=false,viewportZoom=false}={}){
 const {image}=openSizedPhoto(h);if(next)h.emit('click',h.field('[data-photo-next]'));if(zoom)h.emit('click',h.field('[data-photo-zoom-in]'));if(viewportZoom)h.context.visualViewport.scale=2;
 const target=h.photo(),touch=(x,y)=>({identifier:3,clientX:x,clientY:y});h.emit('touchstart',target,{timeStamp:1000,touches:[touch(150,300)]});
 h.emit('touchmove',target,{timeStamp:1010,touches:[touch(150+dx/20,300+dy/20)]});
 if(multi)h.emit('touchmove',target,{timeStamp:1050,touches:[touch(150,300),{identifier:4,clientX:210,clientY:300}]});
 if(cancel)h.emit('touchcancel',target,{touches:[],changedTouches:[]});if(overlay)h.add('above-viewer','dialog').showModal();
 h.emit('touchmove',target,{timeStamp:1200,touches:[touch(150+dx,300+dy)]});h.emit('touchend',target,{timeStamp:slow?2600:1300,touches:[],changedTouches:[touch(150+dx,300+dy)]});return image;
}
for(const [dx,dy,options,closed,photoIndex]of [
 [0,120,{},true,0],[0,120,{slow:true},true,0],[120,0,{},true,0],[-120,0,{},false,1],[120,0,{next:true},false,0],
 [0,-120,{},false,0],[20,20,{},false,0],[80,80,{},false,0],[0,120,{zoom:true},false,0],[-120,0,{zoom:true},false,0],
 [0,120,{multi:true},false,0],[0,120,{cancel:true},false,0],[0,120,{overlay:true},false,0],[0,120,{viewportZoom:true},false,0]
]){
 const h=boot();photoSwipe(h,dx,dy,options);assert.equal(h.api.state().open,!closed,'photo gesture '+JSON.stringify([dx,dy,options]));assert.equal(h.api.state().index,photoIndex);assert.equal(h.modal.open,true);assert.equal(h.grid.scrollTop,8400);assert.equal(h.modal.scrollTop,380);
}
{
 const h=boot();photoSwipe(h,0,120,{});const ghost=h.emit('click',h.thumbs()[0],{detail:1,pointerType:'touch'});assert(ghost.stopped);h.advance(500);assert.equal(h.api.state().open,false,'compatibility click after return does not reopen the photo');
}
console.log('PASS: trusted fullscreen photo gallery, retained lot/feed DOM and scroll, letterbox geometry for landscape/portrait, mouse/touch/fallback confirmed background taps, keyboard/drag/zoom/scroll/multitouch/stale-top guards, pull-down and first-photo return, horizontal paging, native zoom/pan and ghost-click suppression.');
