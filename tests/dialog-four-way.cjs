/* Registered handlers, real header names and native-priority boundaries; no browser geometry claims. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const root=path.resolve(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,'dist',name),'utf8');
const headers=[['lot-photo-viewer.js','photo-viewer-header'],['payment-ui.js','payment-header'],['support.js','support-header'],['voice-assistant.js','voice-header'],['sales-analytics.js','sales-analytics-header'],['category-ui.js','category-browser-head'],['property-map.js','property-map-header'],['seller-ratings.js','rating-head'],['buyer-tools.js','buyer-copy-heading'],['buyer-tools.js','buyer-recent-heading'],['auction-history.js','auction-history-heading'],['auction-notifications.js','my-bids-title'],['seller-ui.js','seller-heading'],['index.html','dialog-brand']];
function boot(header='support-header',seller=false){
 const h=setup({mobile:true});let returns=0;
 h.Element.prototype.click=function(){const event={type:'click',target:this,detail:0,preventDefault(){},stopPropagation(){this.stopped=true},stopImmediatePropagation(){this.stopped=true}};for(let node=this;node&&!event.stopped;node=node.parentElement)node.dispatchEvent(event);if(!event.stopped)for(const fn of h.docEvents.click||[])fn(event)};
 h.content.innerHTML='<div class="'+header+'"><h2>Внутреннее окно</h2><button type="button"><svg><path/></svg>Закрыть</button><img role="button" alt="ФАС торги"></div><div class="body-text">Сохранённое содержимое<input><textarea></textarea><select></select><details><summary>Подробнее</summary><p>Описание</p></details><div class="photo-viewer-stage"><img></div><div class="leaflet-container"><span>Карта</span></div></div>';
 h.modal.showModal();if(seller){h.modal.classList.add('seller-dialog');h.context.FasSellerUI.back=()=>{returns++;return false}};
 vm.runInContext(read('back-swipe.js'),h.context);if(seller)vm.runInContext(read('seller-back-gesture.js'),h.context);
 function event(type,target,x,y,time,extra={}){return{type,target,timeStamp:time,cancelable:true,touches:type==='touchend'?[]:[{identifier:7,clientX:x,clientY:y}],changedTouches:type==='touchend'?[{identifier:7,clientX:x,clientY:y}]:[],prevented:0,preventDefault(){this.prevented++},stopPropagation(){},stopImmediatePropagation(){},...extra}}
 function emit(e){for(const fn of h.docEvents[e.type]||[])fn(e);return e}
 function swipe(target,dx,dy,extra={}){const initial=emit(event('touchstart',target,180,260,0)),first=emit(event('touchmove',target,180+Math.sign(dx)*2,260+Math.sign(dy)*2,20)),last=emit(event('touchend',target,180+dx,260+dy,1800,{cancelable:false,...extra}));return {initial,first,last}}
 return {...h,event,emit,swipe,get returns(){return returns}};
}
for(const [file,header]of headers){assert(read(file).includes(header),'the header really exists in '+file);for(const [dx,dy]of [[120,0],[-120,0],[0,-120],[0,120]])for(const hit of ['h2','button','path','img']){
 const h=boot(header),target=h.content.querySelector('.'+header).querySelector(hit),saved=h.content.querySelector('textarea');saved.value='Не терять';h.modal.scrollTop=240;const events=h.swipe(target,dx,dy);
 assert.equal(events.first.prevented,1,header+' '+hit+' reserves its first 2px');assert.equal(events.last.prevented,0,'noncancelable finish is not prevented');assert.equal(h.modal.open,false,header+' '+hit+' returns in four directions');assert.equal(saved.value,'Не терять');assert.equal(h.modal.scrollTop,240);
}}
for(const selector of ['input','textarea','select','summary','details p','.photo-viewer-stage img','.leaflet-container span']){
 const h=boot(),target=selector.includes(' ')?h.content.querySelector(selector.split(' ')[0]).querySelector(selector.split(' ')[1]):h.content.querySelector(selector);for(const [dx,dy]of [[120,0],[-120,0],[0,120],[0,-120]]){const events=h.swipe(target,dx,dy);assert.equal(h.modal.open,true,selector+' retains native gestures');assert.equal(events.first.prevented+events.last.prevented,0)}
}
for(const [dx,dy]of [[120,0],[-120,0],[0,-120],[0,120]]){
 const h=boot('seller-heading',true),target=h.content.querySelector('.seller-heading button')||h.content.querySelector('.seller-heading').querySelector('button'),events=h.swipe(target,dx,dy);
 assert.equal(h.returns,1,'generic and seller registered listeners dispatch only once');assert.equal(h.modal.open,true,'refused seller Back keeps the same form');assert.equal(events.first.prevented,1);
 const ghost=h.emit({...h.event('click',target,180,260,1900),detail:1});assert(ghost.prevented>0,'a refused Back cannot become a click on the form');
}
for(const [dx,dy]of [[120,0],[-120,0],[0,-120],[0,120]]){const h=boot(),close=h.add('modal-close','button',h.modal);close.className='close';const events=h.swipe(close,dx,dy);assert.equal(events.first.prevented,1);assert.equal(h.modal.open,false,'the main modal close control is a header even outside the content wrapper')}
{
 const h=boot(),underlying=h.content.firstChild,overlay=h.add('nested-dialog','dialog');overlay.innerHTML='<header class="payment-header"><h2>Оплата</h2><button>Закрыть</button></header>';overlay.showModal();const events=h.swipe(overlay.querySelector('button'),0,-120);assert.equal(overlay.open,false);assert(h.modal.open);assert.equal(h.content.firstChild,underlying);assert.equal(events.first.prevented,1);
}
{
 const h=setup({mobile:true});h.content.innerHTML='<h2>Окно без шапки</h2><textarea></textarea>';h.modal.showModal();vm.runInContext(read('back-swipe.js'),h.context);const grip=h.modal.querySelector('.fas-dialog-grip');assert(grip,'plain dialogs get a discoverable grip without replacing their form');assert.equal(grip.getAttribute('type'),null);assert.equal(grip.type,'button');const field=h.content.querySelector('textarea');field.value='Мой ввод';h.context.FasBackSwipe.refreshHeaders();assert.equal(h.modal.querySelectorAll('.fas-dialog-grip').length,1);assert.equal(h.content.querySelector('textarea'),field);assert.equal(field.value,'Мой ввод');
}
const css=read('back-swipe.css');assert(/@supports\(touch-action:pinch-zoom\)/.test(css));assert(/min-height:44px/.test(css));assert(!/\.photo-viewer-stage\s*\{[^}]*touch-action:(?:none|pinch-zoom)\s*[;}]/.test(css),'native photo zoom and panning are not overridden');
console.log('PASS: registered four-way Back on every real dialog header and button/logo, 2px reservation, slow/noncancelable completion, native fields/details/photo/map, guarded seller single dispatch, top-dialog preservation and form-safe fallback grip.');
