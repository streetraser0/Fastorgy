/* Recorded input sequences exercise real guarded Back routes; browser QA owns geometry. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const source=fs.readFileSync(path.join(__dirname,'../dist/desktop-dialogs.js'),'utf8');
const functions=source.slice(0,source.indexOf("if(typeof window!=='undefined'"));
const backSource=fs.readFileSync(path.join(__dirname,'../dist/back-swipe.js'),'utf8').split('\nfunction fasDialogSwipeHeaders')[0];
let checks=0;
function boot({active=true,feed=false,reduced=true,pointer=true}={}){
 const h=setup(),listeners={},observerList=[],timers=[],order=[],animations=[];let enabled=active,context={session:1},feedCloses=0,backCalls=0;
 h.content.innerHTML='<h2>Лот</h2><input value="Сохранить">';
 h.modal.getBoundingClientRect=()=>({left:200,right:800,top:100,bottom:600});
 h.grid.getBoundingClientRect=()=>({left:300,right:820,top:0,bottom:800});
 h.context.getSelection=()=>({isCollapsed:true});h.context.scrollX=0;h.context.scrollY=640;
 h.context.FasDialogLifecycle={top:()=>order.filter(d=>d.open&&d.isConnected!==false).at(-1)||null};
 h.context.PointerEvent=pointer?function PointerEvent(){}:undefined;
 h.context.matchMedia=()=>({matches:reduced});
 h.context.MutationObserver=class{constructor(callback){this.callback=callback;this.records=[];observerList.push(this)}observe(){}disconnect(){this.records=[]}takeRecords(){return this.records.splice(0)}};
 h.context.setTimeout=fn=>{timers.push(fn);return timers.length};h.context.clearTimeout=id=>{timers[id-1]=null};
 h.grid.animate=()=>{const animation={canceled:false,cancel(){this.canceled=true}};animations.push(animation);return animation};
 const register=(scope,type,fn,settings)=>{(listeners[type]??=[]).push({scope,fn,capture:settings===true||settings?.capture===true})};
 h.context.addEventListener=(type,fn,settings)=>register('window',type,fn,settings);
 h.document.addEventListener=(type,fn,settings)=>register('document',type,fn,settings);
 h.context.removeEventListener=h.document.removeEventListener=(type,fn)=>{listeners[type]=(listeners[type]||[]).filter(row=>row.fn!==fn)};
 function emit(type,target=h.modal,extra={}){
  const e={type,target,clientX:90,clientY:200,button:0,pointerType:'mouse',pointerId:7,isPrimary:true,detail:type==='click'?1:undefined,defaultPrevented:false,preventDefault(){this.defaultPrevented=true},stopPropagation(){this.stopped=true},stopImmediatePropagation(){this.stopped=true},...extra};
  for(const row of listeners[type]||[])if(row.scope==='window'&&row.capture&&!e.stopped)row.fn(e);
  for(const row of listeners[type]||[])if(row.scope==='document'&&row.capture&&!e.stopped)row.fn(e);
  if(!e.stopped)for(let node=target;node&&!e.stopped;node=node.parentElement){node.dispatchEvent(e);if(typeof node['on'+type]==='function')node['on'+type](e)}
  for(const row of listeners[type]||[])if(!row.capture&&!e.stopped)row.fn(e);
  return e;
 }
 h.Element.prototype.click=function(){return emit('click',this,{detail:0,pointerType:''})};
 const open=dialog=>{dialog.showModal();order.push(dialog)};
 if(feed)h.body.classList.add('reels');else open(h.modal);
 vm.runInContext(backSource,h.context);vm.runInContext(functions,h.context);
 const controller=h.context.createFasDesktopDialogs({document:h.document,window:h.context,active:()=>enabled,back(){backCalls++;return h.context.performFasDialogBack(h.context.FasDialogLifecycle.top())},feedOpen:()=>h.body.classList.contains('reels'),feedContext:()=>context,closeFeed(){feedCloses++;h.body.classList.remove('reels')}});
 function down(target=h.modal,extra={}){return emit(pointer?'pointerdown':'mousedown',target,extra)}
 function up(target=h.modal,extra={}){return emit(pointer?'pointerup':'mouseup',target,extra)}
 function tap(target=h.modal,extra={}){down(target,extra);up(target,extra);return emit('click',target,extra)}
 return {...h,controller,emit,open,down,up,tap,order,animations,backdrop:h.document.querySelector('.desktop-feed-backdrop'),get feedCloses(){return feedCloses},get backCalls(){return backCalls},enable(value){enabled=value;controller.refresh()},setContext(value){context=value},queueMutation(target=h.modal,attributeName='open'){observerList.forEach(o=>o.records.push({type:'attributes',attributeName,target}))},flushMutation(){observerList.forEach(o=>{const r=o.takeRecords();if(r.length)o.callback(r)})},flushTimers(){timers.splice(0).forEach(fn=>fn?.())}};
}
function check(name,run){run();checks++;}
check('outside mouse click dismisses only top and preserves page scroll',()=>{
 const h=boot(),upper=h.add('photo','dialog');upper.getBoundingClientRect=h.modal.getBoundingClientRect;h.open(upper);h.modal.scrollTop=350;
 h.tap(upper);assert.equal(upper.open,false);assert(h.modal.open);assert.equal(h.modal.scrollTop,350);assert.equal(h.context.scrollY,640);assert.equal(h.backCalls,1);
});
check('top order protects lower dialogs, including their old click handlers',()=>{
 const h=boot(),upper=h.add('upper','dialog');h.open(upper);h.modal.onclick=()=>h.modal.close();h.tap(h.modal);assert(h.modal.open&&upper.open);assert.equal(h.backCalls,0);
});
check('seller refusal cannot fall through to an unsafe close',()=>{
 const h=boot();h.modal.classList.add('seller-dialog');let guards=0;h.context.FasSellerUI.back=()=>{guards++;return false};h.modal.onclick=()=>h.modal.close();h.tap();assert(h.modal.open);assert.equal(guards,1);assert.equal(h.backCalls,1);
});
check('guarded seller route may return to dashboard without closing dialog',()=>{
 const h=boot();h.modal.classList.add('seller-dialog');h.context.FasSellerUI.back=()=>{h.content.innerHTML='<h2>Личный кабинет</h2>';return true};h.tap();assert(h.modal.open);assert.match(h.content.innerHTML,/Личный кабинет/);
});
for(const route of ['storefront','map'])check(route+' return is reused',()=>{
 const h=boot();h.modal.classList.add('lot-dialog');let returned=0;h.context.FasSellerStorefront={returnFromLot:()=>route==='storefront'?(returned++,true):false};h.context.FasPropertyMap={returnFromLot:()=>{returned++;return true}};h.tap();assert.equal(returned,1);assert(h.modal.open);
});
check('nested auth returns to previous screen',()=>{
 const h=boot();h.content.innerHTML='<h2>Код</h2><form id="code-form"></form><button id="change-phone">Изменить номер</button>';h.content.querySelector('#change-phone').onclick=()=>{h.content.innerHTML='<h2>Телефон</h2>'};h.tap();assert(h.modal.open);assert.match(h.content.innerHTML,/Телефон/);
});
for(const kind of ['content-to-outside','drag','out-and-back','wrong-pointer','secondary-pointer','right-button','scroll','page-scroll','resize','blur','cancel','replaced','reopened','new-top','selection','consumed','programmatic','wrong-up-target'])check('reject '+kind,()=>{
 const h=boot();h.modal.onclick=e=>{if(e.target===h.modal)h.modal.close()};
 const input=h.content.querySelector('input');
 if(kind==='content-to-outside')h.down(input,{clientX:400});
 else h.down(h.modal,kind==='secondary-pointer'?{isPrimary:false}:kind==='right-button'?{button:2}:{});
 let upExtra={},clickExtra={};
 if(kind==='drag'){upExtra={clientX:40};clickExtra=upExtra}
 if(kind==='out-and-back')h.emit('pointermove',h.modal,{clientX:40});
 if(kind==='wrong-pointer')upExtra={pointerId:8};
 if(kind==='scroll')h.modal.scrollTop=12;
 if(kind==='page-scroll')h.context.scrollY=700;
 if(kind==='resize'||kind==='blur')h.emit(kind);
 if(kind==='cancel')h.emit('pointercancel');
 if(kind==='replaced')h.content.innerHTML='<h2>Новый экран</h2>';
 if(kind==='reopened'){h.modal.close();h.open(h.modal);h.queueMutation()}
 if(kind==='new-top')h.open(h.add('new-top','dialog'));
 if(kind==='selection')h.context.getSelection=()=>({isCollapsed:false});
 if(kind==='consumed')upExtra={defaultPrevented:true};
 if(kind==='programmatic')clickExtra={detail:0};
 h.up(kind==='wrong-up-target'?input:h.modal,upExtra);h.emit('click',h.modal,clickExtra);assert(h.modal.open,kind);assert.equal(h.backCalls,0,kind);
});
check('content and photo-stage pointer events remain untouched',()=>{
 const h=boot(),stage=h.add('stage','div',h.modal);stage.className='photo-viewer-stage';const event=h.tap(stage,{clientX:400,clientY:300});assert(!event.defaultPrevented);assert(h.modal.open);assert.equal(h.backCalls,0);
});
for(const type of ['touch','pen'])check(type+' never invokes desktop Back',()=>{
 const h=boot();const event=h.tap(h.modal,{pointerType:type});assert(!event.defaultPrevented);assert(h.modal.open);assert.equal(h.backCalls,0);
});
check('mobile/native gate disables new handlers',()=>{
 const h=boot({active:false});assert(h.backdrop.hidden);const event=h.tap();assert(!event.defaultPrevented);assert(h.modal.open);h.enable(true);h.down();h.enable(false);h.up();h.emit('click');assert(h.modal.open);
});
check('mouse fallback and touch compatibility suppression',()=>{
 const h=boot({pointer:false});h.tap();assert.equal(h.modal.open,false);h.open(h.modal);h.emit('touchstart');h.down();h.up();h.emit('click',h.modal,{pointerType:''});assert(h.modal.open);
});
check('fullscreen empty backdrop restores via existing feed route',()=>{
 const h=boot({feed:true});assert(!h.backdrop.hidden);h.tap(h.backdrop);assert.equal(h.feedCloses,1);assert(h.backdrop.hidden);assert.equal(h.context.scrollY,640);
});
check('fullscreen content drag ending outside does not close',()=>{
 const h=boot({feed:true});h.down(h.grid,{clientX:450});h.up(h.backdrop);h.emit('click',h.backdrop);assert.equal(h.feedCloses,0);
});
check('dialog over feed closes only that dialog',()=>{
 const h=boot({feed:true});h.open(h.modal);h.tap();assert.equal(h.modal.open,false);assert.equal(h.feedCloses,0);assert(h.body.classList.contains('reels'));
});
check('reduced motion closes without animation',()=>{
 const h=boot({feed:true,reduced:true});h.tap(h.backdrop);assert.equal(h.animations.length,0);assert.equal(h.feedCloses,1);
});
check('collapse runs once and uses original return route',()=>{
 const h=boot({feed:true,reduced:false});h.tap(h.backdrop);assert.equal(h.animations.length,1);assert.equal(h.feedCloses,0);h.tap(h.backdrop);assert.equal(h.animations.length,1);h.flushTimers();assert.equal(h.feedCloses,1);assert(h.animations[0].canceled);
});
for(const kind of ['new-dialog','new-feed','mobile','blur'])check('pending collapse cancels on '+kind,()=>{
 const h=boot({feed:true,reduced:false});h.tap(h.backdrop);
 if(kind==='new-dialog'){h.open(h.modal);h.queueMutation();h.flushMutation()}
 if(kind==='new-feed')h.setContext({session:2});
 if(kind==='mobile')h.enable(false);
 if(kind==='blur')h.emit('blur');
 h.flushTimers();assert.equal(h.feedCloses,0);
});
check('manual feed exit cancels animation before reused catalog can be hidden',()=>{
 const h=boot({feed:true,reduced:false});h.tap(h.backdrop);h.body.classList.remove('reels');h.queueMutation(h.body,'class');h.flushMutation();assert(h.animations[0].canceled);h.flushTimers();assert.equal(h.feedCloses,0);
});
check('empty selectionchange after click does not cancel feed collapse',()=>{const h=boot({feed:true,reduced:false});h.tap(h.backdrop);h.emit('selectionchange');h.flushTimers();assert.equal(h.feedCloses,1)});
check('destroy removes handlers and added backdrop',()=>{const h=boot();h.controller.destroy();h.tap();assert(h.modal.open);assert.equal(h.backdrop.isConnected,false)});
console.log('PASS: '+checks+' desktop backdrop checks: guarded top-only Back, mouse boundaries, form refusal, prior routes, feed restoration, collapse cancellation and reduced motion.');
