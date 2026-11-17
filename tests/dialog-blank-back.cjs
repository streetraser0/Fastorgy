/* Actual Back routes and recorded pointer/touch targets; no browser geometry/device claim. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const source=fs.readFileSync(path.join(__dirname,'../dist/back-swipe.js'),'utf8');
const functions=source.replace("if(typeof document!=='undefined'&&typeof window!=='undefined')installFasBackSwipe();",'');
function boot({pointer=true,auto=false,html='<h2>Окно</h2><div class="blank"><span>Сведения</span><textarea></textarea></div>'}={}){
 const h=setup({mobile:true}),listeners={},observers=[];let now=1000;
 h.content.innerHTML=html;h.modal.showModal();
 h.document.addEventListener=(type,fn,options)=>{(listeners[type]??=[]).push({fn,capture:options===true||options?.capture===true})};
 h.document.removeEventListener=(type,fn)=>{listeners[type]=(listeners[type]||[]).filter(row=>row.fn!==fn)};
 h.context.removeEventListener=(type,fn)=>{h.winEvents[type]=(h.winEvents[type]||[]).filter(row=>row!==fn)};
 h.context.PointerEvent=pointer?function PointerEvent(){}:undefined;
 h.context.MutationObserver=class{constructor(fn){this.callback=fn;this.pending=[];observers.push(this)}observe(target){this.target=target}disconnect(){this.target=null;this.pending=[]}takeRecords(){return this.pending.splice(0)}};
 function emit(type,target,extra={}){
  const e={type,target,clientX:160,clientY:160,button:0,detail:type==='click'?1:undefined,pointerId:3,isPrimary:true,defaultPrevented:false,preventDefault(){this.defaultPrevented=true},stopPropagation(){this.stopped=true},stopImmediatePropagation(){this.stopped=true},...extra};
  for(const row of listeners[type]||[])if(row.capture&&!e.stopped)row.fn(e);
  if(!e.stopped)for(let node=target;node&&!e.stopped;node=node.parentElement){node.dispatchEvent(e);if(typeof node['on'+type]==='function')node['on'+type](e)}
  for(const row of listeners[type]||[])if(!row.capture&&!e.stopped)row.fn(e);
  return e;
 }
 h.Element.prototype.click=function(){return emit('click',this,{detail:0})};
 vm.runInContext(auto?source:functions,h.context);
 const controller=auto?h.context.FasBackSwipe:h.context.createFasDialogBlankBack({document:h.document,window:h.context,now:()=>now});
 function down(target,extra={}){return emit(pointer?'pointerdown':'mousedown',target,extra)}
 function up(target,extra={}){return emit(pointer?'pointerup':'mouseup',target,extra)}
 function tap(target,extra={}){down(target,extra);up(target,extra);return emit('click',target,extra)}
 return {...h,controller,emit,down,up,tap,listeners,advance(ms){now+=ms},queueOpenMutation(target=h.modal){for(const observer of observers)if(observer.target===target)observer.pending.push({type:'attributes',attributeName:'open',target})}};
}
for(const tag of ['div','section','article','header','footer','aside','nav','form','fieldset','ul','ol','dl']){
 const h=boot(),target=h.add('whitespace',tag,h.content),saved=h.content.querySelector('textarea');saved.value='Не терять';h.modal.scrollTop=410;
 target.innerHTML='<span>Содержимое дочернего элемента</span>';
 const event=h.tap(target);assert.equal(event.defaultPrevented,true,tag+' whitespace dispatches guarded Back');assert.equal(h.modal.open,false);assert.equal(saved.value,'Не терять');assert.equal(h.modal.scrollTop,410);
}
for(const pointer of [true,false]){
 const h=boot({pointer});let oldClose=0;h.modal.onclick=event=>{if(event.target===h.modal){oldClose++;h.modal.close()}};
 h.content.innerHTML='<h2>Код</h2><form id="code-form"></form><button id="change-phone">Изменить номер</button>';
 let changes=0;h.content.querySelector('#change-phone').onclick=()=>{changes++;h.content.innerHTML='<h2>Ввод телефона</h2><input value="+7999">'};
 h.tap(h.modal);assert.equal(changes,1,'dialog padding uses its previous screen');assert.equal(oldClose,0,'legacy backdrop-close cannot pop the restored screen');assert(h.modal.open);
}
for(const html of ['<div class="blank"><input></div>','<div class="blank"><textarea></textarea></div>','<div class="blank"><select></select></div>','<div class="blank"><label>Название</label></div>','<div class="blank"><button><span>Открыть</span></button></div>','<div class="blank"><a href="#home"><span>Ссылка</span></a></div>','<div class="blank"><details><summary>Условия</summary><div>Подробности</div></details></div>','<div class="blank"><div contenteditable="true"></div></div>','<div class="blank"><div role="button"></div></div>','<div class="blank"><img></div>','<div class="blank"><svg><path/></svg></div>','<div class="blank"><canvas></canvas></div>','<div class="blank"><picture></picture></div>','<div class="blank"><iframe></iframe></div>','<div class="blank"><video></video></div>','<div class="blank"><audio></audio></div>','<div class="blank"><p>Описание</p></div>','<div class="blank"><h2>Заголовок</h2></div>']){
 const h=boot({html}),area=h.content.querySelector('.blank'),target=area.children.at(-1);h.tap(target);assert(h.modal.open,'native/content hit stays: '+html);
}
for(const name of ['gallery-track','lot-gallery','photo-viewer-stage','photo-viewer-canvas','lot-swipe-surface','car-photo','seller-media-grid','seller-tabs','seller-progress','seller-editor-nav','leaflet-container','property-map-canvas','property-map-maparea']){
 const h=boot(),area=h.add('native-area','div',h.content);area.className=name;const target=h.add('native-padding','div',area);h.tap(target);assert(h.modal.open,name+' preserves its native hit surface');
}
for(const attr of ['data-swipe-native','data-no-swipe','data-no-blank-back','hidden','inert']){
 const h=boot(),area=h.add('native-area','div',h.content);area.setAttribute(attr,'');h.tap(area);assert(h.modal.open,attr+' prevents blank Back');
}
{
 const h=boot(),target=h.content.querySelector('.blank');let custom=0;target.onclick=()=>custom++;h.tap(target);assert(h.modal.open);assert.equal(custom,1,'custom click handlers keep their content action');
}
{
 const h=boot(),target=h.content.querySelector('.blank');target.textContent='Описание';h.tap(target);assert(h.modal.open,'text without geometric support stays selectable');
}
{
 const h=boot(),target=h.content.querySelector('.blank'),text={nodeType:3,nodeValue:'Описание',rects:[{left:80,right:240,top:80,bottom:110}]};target.childNodes=[text];
 h.document.createRange=()=>({selectNodeContents(node){this.node=node},getClientRects(){return this.node.rects},detach(){}});
 h.tap(target,{clientX:160,clientY:100});assert(h.modal.open,'a direct text rectangle retains its click');
 h.tap(target,{clientX:160,clientY:160});assert.equal(h.modal.open,false,'padding outside direct text remains blank');
}
for(const kind of ['drag','out-and-back','scroll','inner-scroll','wheel-scroll-event','contextmenu','selection','overlay','closed','reopened','replaced','keyboard','consumed','other-target','wrong-pointer','multi-pointer','cancel','hidden','detached','outside','scrollbar','click-coordinate']){
 const h=boot(),target=h.content.querySelector('.blank');h.down(target);
 if(kind==='drag')h.emit('pointermove',target,{clientX:180});
 if(kind==='out-and-back'){h.emit('pointermove',target,{clientX:180});h.emit('pointermove',target,{clientX:160})}
 if(kind==='scroll')h.modal.scrollTop=50;
 if(kind==='inner-scroll')target.scrollTop=10;
 if(kind==='wheel-scroll-event')h.emit('scroll',target);
 if(kind==='contextmenu')h.emit('contextmenu',target);
 if(kind==='selection')h.context.getSelection=()=>({isCollapsed:false,anchorNode:target});
 if(kind==='overlay'){const next=h.add('overlay','dialog');next.showModal()}
 if(kind==='closed')h.modal.close();
 if(kind==='reopened'){h.modal.close();h.modal.showModal();h.queueOpenMutation()}
 if(kind==='replaced')h.content.innerHTML='<h2>Другой экран</h2><div class="blank"></div>';
 if(kind==='wrong-pointer')h.emit('pointermove',target,{pointerId:55});
 if(kind==='multi-pointer')h.emit('pointerdown',target,{pointerId:4,isPrimary:false});
 if(kind==='cancel')h.emit('pointercancel',target);
 if(kind==='hidden')h.document.hidden=true;
 if(kind==='detached')target.remove();
 if(kind==='outside')h.emit('pointermove',target,{clientX:900});
 if(kind==='scrollbar'){target.offsetWidth=200;target.clientWidth=180;target.getBoundingClientRect=()=>({left:0,top:0,right:200,bottom:700,width:200,height:700});h.down(target,{clientX:190})}
 h.up(target);const event=h.emit('click',kind==='other-target'?h.content:target,kind==='keyboard'?{detail:0}:kind==='consumed'?{defaultPrevented:true}:kind==='click-coordinate'?{clientX:200}:{});
 assert.equal(event.stopped,undefined,kind+' does not turn into a new Back');
 if(kind!=='closed')assert(h.modal.open,kind+' preserves current screen');
}
{
 const h=boot(),target=h.content.querySelector('.blank');h.down(target);h.up(target);h.emit('click',target);h.modal.showModal();h.emit('click',target);assert(h.modal.open,'the original completed tap cannot close twice');
}
{
 const h=boot(),saved=h.content.querySelector('textarea');saved.value='Черновик ставки';const overlay=h.add('overlay','dialog');overlay.innerHTML='<header><h2>Подробности</h2></header><div class="blank"></div>';overlay.showModal();
 h.tap(h.content.querySelector('.blank'));assert(overlay.open&&h.modal.open,'underlying dialog whitespace is inactive');
 h.tap(overlay.querySelector('.blank'));assert.equal(overlay.open,false);assert(h.modal.open);assert.equal(saved.value,'Черновик ставки');
}
{
 const h=boot();h.modal.classList.add('seller-dialog');let attempts=0,unsafe=0;h.context.FasSellerUI.back=()=>{attempts++;return false};h.modal.onclick=()=>{unsafe++;h.modal.close()};h.tap(h.modal);assert.equal(attempts,1);assert.equal(unsafe,0);assert(h.modal.open,'refused dirty seller navigation preserves the same editor');
}
{
 const h=boot({html:'<h2>Профиль</h2><form id="seller-profile-form"><div class="blank"></div><input></form>'});let attempts=0;h.context.FasSellerUI.prepareNavigation=()=>{attempts++;return false};h.tap(h.content.querySelector('.blank'));assert.equal(attempts,1);assert(h.modal.open,'profile save failure cannot fall through to close');
}
{
 const h=boot({html:'<h2>Лоты</h2><div class="blank"></div><div data-seller-delete-confirmation><button data-seller-delete-cancel>Отмена</button></div>'});const panel=h.content.querySelector('[data-seller-delete-confirmation]');panel.hidden=false;let cancels=0;panel.querySelector('button').onclick=()=>{cancels++;panel.hidden=true};h.tap(h.content.querySelector('.blank'));assert.equal(cancels,1);assert(h.modal.open,'first Back dismisses only pending deletion');h.tap(h.content.querySelector('.blank'));assert.equal(h.modal.open,false);
}
{
 const h=boot(),picker=h.add('category-picker','dialog');picker.innerHTML='<div class="category-browser"></div>';picker.showModal();let closes=0;picker.onclick=event=>{if(event.target.matches('.category-browser')){closes++;event.preventDefault();picker.close()}};h.tap(picker.querySelector('.category-browser'));assert.equal(closes,1);assert.equal(picker.open,false);assert(h.modal.open,'category retains its own blank dismiss and cannot pop the underlying dialog');
}
{
 const h=boot({pointer:false}),target=h.content.querySelector('.blank'),point={identifier:9,clientX:160,clientY:160};h.emit('touchstart',target,{touches:[point]});h.emit('touchend',target,{touches:[],changedTouches:[point]});h.emit('mousedown',target);h.emit('mouseup',target);h.emit('click',target);assert.equal(h.modal.open,false,'touch tap survives synthetic compatibility mouse events');
}
{
 const h=boot({pointer:false}),target=h.content.querySelector('.blank'),point={identifier:9,clientX:160,clientY:160};h.emit('touchstart',target,{touches:[point]});h.emit('touchmove',target,{touches:[{...point,clientX:190}]});h.emit('touchend',target,{touches:[],changedTouches:[point]});h.emit('mousedown',target);h.emit('mouseup',target);h.emit('click',target);assert(h.modal.open,'compatibility click after a touch drag is not a fresh blank tap');
}
{
 const h=boot(),target=h.content.querySelector('.blank');h.controller.destroy();h.tap(target);assert(h.modal.open,'destroy disconnects the blank tap controller');
}
{
 const h=boot({auto:true}),target=h.content.querySelector('.blank');h.tap(target);assert.equal(h.modal.open,false,'normal installation enables blank Back without a second controller');
}
{
 const h=boot({auto:true,pointer:false}),overlay=h.add('overlay','dialog');overlay.innerHTML='<h2>Верхнее окно</h2><div class="blank"></div>';overlay.showModal();const target=overlay.querySelector('.blank'),point={identifier:9,clientX:60,clientY:160};
 h.emit('touchstart',target,{touches:[point]});h.emit('touchmove',target,{touches:[{...point,clientX:180}]});h.emit('touchend',target,{touches:[],changedTouches:[{...point,clientX:180}]});assert.equal(overlay.open,false);assert(h.modal.open);
 const ghost=h.emit('click',h.content.querySelector('.blank'),{sourceCapabilities:{firesTouchEvents:true}});assert(ghost.defaultPrevented,'registered swipe suppresses the retargeted compatibility click');assert(h.modal.open,'swipe plus compatibility click cannot return two screens');
}
for(const route of ['storefront','map']){
 const h=boot(),target=h.content.querySelector('.blank');h.modal.classList.add('lot-dialog');let returns=0;h.context.FasSellerStorefront={returnFromLot(){if(route==='storefront'){returns++;return true}return false}};h.context.FasPropertyMap={returnFromLot(){returns++;return true}};h.tap(target);assert.equal(returns,1);assert(h.modal.open,route+' return reuses the existing route instead of closing its restored state');
}
{
 const h=boot(),target=h.content.querySelector('.blank');target.shadowRoot={};h.tap(target);assert(h.modal.open,'shadow controls retain native handling');
}
console.log('PASS: blank pointer/mouse/touch taps use top-dialog guarded Back, retain native controls/text/media/maps, preserve category dismissal and unsaved forms, and reject drag/scroll/selection/stale/reopened/synthetic actions. No physical browser or device geometry is claimed.');
