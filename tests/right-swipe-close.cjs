const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const code=fs.readFileSync(path.join(__dirname,'../dist/lot-close-gesture.js'),'utf8');
function fixture(options={}){
 const h=setup({mobile:true}),observers=[];let closed=0,clock=1000,returns=0;
 h.context.matchMedia=()=>({matches:!!options.reduced});h.context.reelsMode=true;h.grid.scrollTop=1234;h.modal.style.transform='';h.modal.style.opacity='';
 h.modal.classList.add('lot-dialog');h.modal.scrollTop=options.scrollTop||0;h.content.innerHTML='<div class="lot-quick-access"><img alt="ФАС торги" role="button"><span>Панель лота</span><button><svg></svg>Ставка</button></div><div class="lot-swipe-surface"><div class="lot-gallery"><div class="gallery-track"><img alt="Фото" role="button" tabindex="0"><img alt="Ещё фото" role="button" tabindex="0"></div></div></div><div class="free-description">Описание имущества</div>';h.modal.showModal();
 const originalClose=h.modal.close.bind(h.modal);h.modal.close=()=>{closed++;originalClose()};
 class Observer{constructor(fn){this.fn=fn;observers.push(this)}observe(){}disconnect(){this.disconnected=true}}
 h.context.MutationObserver=Observer;vm.runInContext(code,h.context);
 const controller=h.context.createFasRightSwipeClose({dialog:h.modal,document:h.document,window:h.context,now:()=>clock,MutationObserver:Observer,returnToCatalog(){returns++}});
 const header=h.content.querySelector('.lot-quick-access'),body=h.content.querySelector('.free-description'),gallery=h.content.querySelector('.gallery-track'),photo=gallery.querySelector('img');gallery.scrollLeft=0;gallery.clientWidth=300;gallery.scrollWidth=600;
 const event=(target,x,y,time,end=false,extra={})=>({target,timeStamp:time,cancelable:true,touches:end?[]:[{identifier:7,clientX:x,clientY:y}],changedTouches:end?[{identifier:7,clientX:x,clientY:y}]:[],prevented:0,preventDefault(){this.prevented++},stopPropagation(){},stopImmediatePropagation(){},...extra});
 const swipe=(target=header,dx=120,dy=0,duration=200)=>{const a=event(target,180,260,0),b=event(target,180+dx,260+dy,duration/2),c=event(target,180+dx,260+dy,duration,true);controller.start(a);controller.move(b);controller.end(c);return {start:a,move:b,end:c}};
 return {...h,controller,header,freeBody:body,gallery,photo,event,swipe,observers,get closed(){return closed},get returns(){return returns},advance(ms){clock+=ms}};
}
for(const [dx,dy] of [[120,0],[-120,0],[0,120],[0,-120]])for(const scrollTop of [0,500]){
 const h=fixture({scrollTop}),events=h.swipe(h.header,dx,dy);assert.equal(h.closed,1,'free header closes in every direction at every scroll position');assert(events.move.prevented);assert.equal(h.modal.style.transform,'');assert.equal(h.modal.style.opacity,'');assert.equal(h.context.reelsMode,true,'modal return keeps the underlying feed open');assert.equal(h.grid.scrollTop,1234);assert.equal(h.returns,0,'modal return never exits the underlying feed');h.controller.end(events.end);assert.equal(h.closed,1);
}
for(const scrollTop of [0,500])for(const dy of [-150,150]){const h=fixture({scrollTop}),events=h.swipe(h.freeBody,0,dy);assert.equal(h.closed,0,'description vertical scrolling never dismisses');assert.equal(events.move.prevented+events.end.prevented,0)}
{
 const h=fixture({scrollTop:500});h.swipe(h.freeBody,120);assert.equal(h.closed,1,'existing right return remains available on free body');
}
for(const offset of [0,150,300])for(const scrollTop of [0,500])for(const [dx,dy] of [[120,0],[-120,0],[0,-120],[0,120]]){const h=fixture({scrollTop});h.gallery.scrollLeft=offset;const events=h.swipe(h.photo,dx,dy);const returns=scrollTop===0&&(dy>0||dx>0&&offset===0);assert.equal(h.closed,Number(returns),'top photo returns down, or right from its initial first frame; later frames keep native paging');if(!returns)assert.equal(events.move.prevented+events.end.prevented,0)}
{
 const h=fixture();h.gallery.querySelectorAll('img')[1].remove();h.gallery.scrollWidth=h.gallery.clientWidth;const events=h.swipe(h.photo,120,0);assert.equal(h.closed,1,'one-photo featured lot has the same right-return edge');assert(events.move.prevented);assert.equal(h.context.reelsMode,true);assert.equal(h.grid.scrollTop,1234);
}
for(const scenario of ['later-reaches-first','first-changes-index','first-track-replaced','page-zoom','pinch']){
 const h=fixture();if(scenario==='later-reaches-first')h.gallery.scrollLeft=300;if(scenario==='page-zoom')h.context.visualViewport.scale=2;
 h.controller.start(h.event(h.photo,180,260,0));h.controller.move(h.event(h.photo,182,260,16));
 if(scenario==='later-reaches-first')h.gallery.scrollLeft=0;
 if(scenario==='first-changes-index')h.gallery.scrollLeft=300;
 if(scenario==='first-track-replaced')h.gallery.remove();
 if(scenario==='pinch')h.controller.move(h.event(h.photo,200,260,30,false,{touches:[{},{}]}));
 h.controller.move(h.event(h.photo,300,260,100));h.controller.end(h.event(h.photo,300,260,200,true));assert.equal(h.closed,0,scenario+' does not turn pagination or zoom into Back');
}
{
 const h=fixture(),button=h.add('photo-next','button',h.gallery);h.swipe(button,120,0);assert.equal(h.closed,0,'right-drag on a gallery navigation button remains a control');
}
for(const selector of ['button','svg','img'])for(const [dx,dy] of [[120,0],[-120,0],[0,-120],[0,120]]){const h=fixture();const target=h.header.querySelector(selector),events=h.swipe(target,dx,dy);assert.equal(h.closed,1,'actual toolbar '+selector+' hit target returns in all four directions');assert(events.move.prevented)}
for(const tag of ['a','custom'])for(const [dx,dy] of [[120,0],[-120,0],[0,-120],[0,120]]){const h=fixture(),target=h.add('header-control',tag==='custom'?'span':tag,h.header);if(tag==='custom')target.setAttribute('role','button');h.swipe(target,dx,dy);assert.equal(h.closed,1,tag+' toolbar action also serves as a deliberate swipe target')}
for(const selector of ['button','svg','img']){const h=fixture(),target=h.header.querySelector(selector),events=h.swipe(target,0,0);assert.equal(h.closed,0,'ordinary '+selector+' tap stays with its original click action');assert.equal(events.move.prevented+events.end.prevented,0);const click=h.event(target,180,260,210,false,{detail:1});h.controller.suppressClick(click);assert.equal(click.prevented,0,'a tap does not arm the ghost-click gate')}
for(const tag of ['input','textarea','select','label','summary','video','audio']){const h=fixture(),target=h.add('control',tag,h.header);h.swipe(target,0,-150);assert.equal(h.closed,0,tag+' keeps native interaction')}
for(const tag of ['button','a']){const h=fixture(),target=h.add('body-control',tag,h.freeBody);h.swipe(target,120,0);assert.equal(h.closed,0,'body '+tag+' remains a control')}
{
 const h=fixture();let returned=0;h.context.FasPropertyMap={returnFromLot(){returned++;h.modal.open=false;return true}};h.swipe(h.header.querySelector('button'),0,-120);assert.equal(returned,1);assert.equal(h.closed,0,'map-aware dismissal never closes the restored underlying lot');assert.equal(h.grid.scrollTop,1234);
}
for(const [dx,dy] of [[120,0],[-120,0],[0,-120],[0,120]]){const h=fixture(),target=h.header.querySelector('button');h.controller.start(h.event(target,180,260,0));h.controller.move(h.event(target,180+dx,260+dy,100,false,{cancelable:false}));h.controller.end(h.event(target,180+dx,260+dy,200,true,{cancelable:false}));assert.equal(h.closed,1,'coalesced native toolbar events still return')}

for(const [dx,dy,duration] of [[40,0,200],[120,110,200],[0,-80,400]]){const h=fixture();h.swipe(h.header,dx,dy,duration);assert.equal(h.closed,0,'short or diagonal gestures do not dismiss')}
for(const duration of [1200,4000]){const h=fixture();h.swipe(h.header,120,0,duration);assert.equal(h.closed,1,'a deliberate full-distance drag works at an unhurried pace')}
for(const scrollTop of [700,1100]){const h=fixture({scrollTop}),events=h.swipe(h.freeBody,0,-120);assert.equal(h.closed,1,'an upward pull that starts at the bottom returns');assert(events.move.prevented)}
{
 const h=fixture({scrollTop:500});h.controller.start(h.event(h.freeBody,180,260,0));h.modal.scrollTop=700;h.controller.move(h.event(h.freeBody,180,140,100));h.controller.end(h.event(h.freeBody,180,140,200,true));assert.equal(h.closed,0,'reaching the bottom while reading cannot turn that scroll into a close gesture');
}
for(const reason of ['overlay','changed','multitouch','wrong-finger','cancel','destroy']){
 const h=fixture();h.controller.start(h.event(h.header,180,260,0));
 if(reason==='overlay'){const viewer=h.add('photo-viewer','dialog');viewer.showModal()}
 if(reason==='changed')h.content.innerHTML='<h2>Другой лот</h2>';
 if(reason==='cancel')h.controller.cancel();if(reason==='destroy')h.controller.destroy();
 const extra=reason==='multitouch'?{touches:[{},{}]}:reason==='wrong-finger'?{touches:[{identifier:99,clientX:180,clientY:110}]}:reason==='noncancelable'?{cancelable:false}:{};
 h.controller.move(h.event(h.header,180,110,100,false,extra));h.controller.end(h.event(h.header,180,110,200,true,extra));assert.equal(h.closed,0,reason+' cancels stale dismissal');assert.equal(h.modal.style.transform,'');
}
{
 const h=fixture();h.controller.start(h.event(h.header,180,260,0));h.controller.end(h.event(h.header,180,140,100,true));assert.equal(h.closed,1,'a coalesced header swipe still works');
}
{
 const h=fixture({reduced:true}),events=h.swipe();assert.equal(h.closed,1);assert.equal(h.modal.style.transform,'');assert(events.move.prevented,'reduced motion retains the gesture without translation');
}
{
 const h=fixture();h.swipe();const ghost=h.event(h.freeBody,180,260,210,false,{detail:1});h.controller.suppressClick(ghost);assert.equal(ghost.prevented,1,'closing cannot click an underlying lot');
 h.modal.showModal();h.swipe();h.advance(451);const later=h.event(h.freeBody,180,260,800,false,{detail:1});h.controller.suppressClick(later);assert.equal(later.prevented,0,'ghost-click guard expires');
}
{
 const h=fixture(),main=fs.readFileSync(path.join(__dirname,'../dist/index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1],inline=main.slice(main.indexOf('let lotSwipeState='),main.indexOf('function openCar('));
 h.context.$=selector=>h.document.querySelector(selector);vm.runInContext(inline,h.context);assert.equal(h.modal.dataset.rightSwipeClose,'ready');
 for(const target of [h.header,h.photo,h.freeBody]){h.context.lotSwipeStart(h.event(target,180,260,0));assert.equal(vm.runInContext('lotSwipeState',h.context),null,'installed controller disables duplicate legacy up recognizer')}
}
assert(!/\b(?:render|setReels|scrollTo|pushState|history\.back)\s*\(/.test(code),'dismissal only closes its dialog and preserves the background policy');
console.log('PASS: actual toolbar button/logo four-way return, top-photo pull-down, map-aware return preserves the active feed and position; description/photo/control native behavior, nested/stale/coalesced/reduced-motion guards, ghost clicks and legacy recognizer delegation.');
