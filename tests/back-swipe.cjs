const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const source=()=>fs.readFileSync(path.join(__dirname,'../dist/back-swipe.js'),'utf8');

function boot(){
 const h=setup({mobile:true});let clock=1000,backs=0;
 h.document.removeEventListener=(type,handler)=>{h.docEvents[type]=(h.docEvents[type]||[]).filter(fn=>fn!==handler)};
 h.context.removeEventListener=(type,handler)=>{h.winEvents[type]=(h.winEvents[type]||[]).filter(fn=>fn!==handler)};
 // The shared DOM model does not implement HTMLElement.click bubbling.
 h.Element.prototype.click=function(){const event={type:'click',target:this,preventDefault(){this.defaultPrevented=true},stopPropagation(){this.stopped=true},stopImmediatePropagation(){this.stopped=true}};for(let current=this;current&&!event.stopped;current=current.parentElement)current.dispatchEvent(event);if(!event.stopped)(h.docEvents.click||[]).forEach(fn=>fn(event));};
 const closest=h.Element.prototype.closest;
 h.Element.prototype.closest=function(selector){if(selector.includes('.feed-menu button')){for(let current=this;current;current=current.parentElement)if(current.tagName==='BUTTON'&&closest.call(current,'.feed-menu'))return current;}return closest.call(this,selector)};
 vm.runInContext(source(),h.context);
 h.content.innerHTML='<h2>Внутреннее окно</h2><div class="back-surface"><span>Описание</span></div>';
 h.modal.showModal();
 const target=h.content.querySelector('.back-surface');
 const controller=h.context.createFasBackSwipe({document:h.document,window:h.context,now:()=>clock,back(dialog){assert.strictEqual(dialog,h.modal);backs++;return true}});
 const event=(node,x,y,time,kind='move',more={})=>({target:node,timeStamp:time,cancelable:true,touches:kind==='end'?[]:[{identifier:4,clientX:x,clientY:y}],changedTouches:kind==='end'?[{identifier:4,clientX:x,clientY:y}]:[],prevented:0,stopped:0,preventDefault(){this.prevented++;this.defaultPrevented=true},stopPropagation(){this.stopped++},stopImmediatePropagation(){this.stopped++},...more});
 function swipe(node=target,dx=120,dy=2,duration=200,extra={}){const start=event(node,25,150,0,'start'),move=event(node,25+dx,150+dy,duration/2,'move',extra),end=event(node,25+dx,150+dy,duration,'end',extra);controller.start(start);controller.move(move);controller.end(end);return {start,move,end}}
 return {...h,controller,target,event,swipe,get backs(){return backs},advance(ms){clock+=ms}};
}

{
 const h=boot(),events=h.swipe();assert.equal(h.backs,1);assert.equal(events.move.prevented,1);assert.equal(events.end.prevented,1);h.controller.end(events.end);assert.equal(h.backs,1,'one gesture navigates once');
 const click=h.event(h.target,145,152,210,'move',{detail:1,sourceCapabilities:{firesTouchEvents:true}});h.controller.suppressClick(click);assert.equal(click.prevented,1,'synthetic tap cannot activate a row after swiping');
 h.swipe();h.advance(451);const nextClick=h.event(h.target,145,152,710,'move',{detail:1,sourceCapabilities:{firesTouchEvents:true}});h.controller.suppressClick(nextClick);assert.equal(nextClick.prevented,0,'click suppression expires even without a synthetic click');
}
for(const [dx,dy,time]of [[-150,0,200],[0,-160,200],[0,170,200],[100,95,200],[40,0,200],[75,0,400]]){const h=boot();h.swipe(h.target,dx,dy,time);assert.equal(h.backs,0,'ignored gesture '+[dx,dy,time])}
{const h=boot();h.swipe(h.target,140,0,1800);assert.equal(h.backs,1,'a deliberate long drag has no artificial 900ms deadline')}
for(const [dx,dy]of [[120,0],[-120,0],[0,120],[0,-120]])for(const tag of ['div','button','a','img','span']){
 const h=boot(),header=h.add('header','div',h.content);header.className='support-header';const target=h.add('header-hit',tag,header);if(tag==='img'||tag==='span')target.setAttribute('role','button');
 const first=h.event(target,180,260,0,'start'),early=h.event(target,180+Math.sign(dx)*2,260+Math.sign(dy)*2,20),finish=h.event(target,180+dx,260+dy,1800,'end',{cancelable:false});h.controller.start(first);h.controller.move(early);assert.equal(early.prevented,1,'the first 2px reserves a header before native scroll claims it');h.controller.end(finish);assert.equal(h.backs,1,'all header hit targets return in four directions on a slow/noncancelable finish');assert.equal(finish.prevented,0);
}
{
 const h=boot();h.swipe(h.target,60,0,60);assert.equal(h.backs,1,'short fast deliberate swipe works');
}
{
 const h=boot(),result=h.swipe(h.target,120,0,200,{cancelable:false});assert.equal(h.backs,1);assert.equal(result.move.prevented+result.end.prevented,0,'native noncancelable events are not prevented');
}
{
 const h=boot();h.controller.start(h.event(h.target,25,150,0));h.controller.end(h.event(h.target,145,150,150,'end',{cancelable:false}));assert.equal(h.backs,1,'coalesced swipe works without intermediate touchmove');
}
for(const tag of ['input','textarea','select','video','audio','button']){const h=boot(),control=h.add('control',tag,h.target);h.swipe(control);assert.equal(h.backs,0,tag+' keeps native interaction')}
for(const attr of ['contenteditable','role']){const h=boot(),control=h.add('custom','div',h.target);control.setAttribute(attr,attr==='role'?'button':'true');h.swipe(control);assert.equal(h.backs,0,attr+' keeps native interaction')}
for(const name of ['gallery-track','lot-gallery','seller-tabs','seller-progress']){const h=boot(),area=h.add('scrollable','div',h.target);area.className=name;const child=h.add('scroll-text','span',area);h.swipe(child);assert.equal(h.backs,0,name+' keeps its horizontal controls')}
for(const type of ['existing','during','contextmenu']){const h=boot();let selection=null;h.context.getSelection=()=>selection;if(type==='existing')selection={isCollapsed:false,anchorNode:{nodeType:3,parentElement:h.target}};h.controller.start(h.event(h.target,25,150,0));if(type==='during'){selection={isCollapsed:false,focusNode:{nodeType:3,parentElement:h.target}};h.docEvents.selectionchange.forEach(fn=>fn())}if(type==='contextmenu')h.docEvents.contextmenu.forEach(fn=>fn({target:h.target}));h.controller.move(h.event(h.target,145,150,100));h.controller.end(h.event(h.target,145,150,1800,'end'));assert.equal(h.backs,0,'native text selection/context menu cancels '+type)}
for(const type of ['collapsed','outside']){const h=boot(),outside=h.add('outside','p');h.context.getSelection=()=>({isCollapsed:type==='collapsed',anchorNode:outside});h.swipe();assert.equal(h.backs,1,'a collapsed caret or outside selection is not a false blocker')}
{const h=boot();h.controller.start(h.event(h.target,25,150,0));h.modal.scrollTop=20;h.controller.end(h.event(h.target,145,150,200,'end'));assert.equal(h.backs,0,'body scrolling during a touch never turns into Back')}
for(const selector of ['class','data-category-node','data-category-use','buyer-recent-item']){const h=boot(),button=h.add('category-row','button',h.target);if(selector==='class')button.className='category-browser-row';else if(selector==='buyer-recent-item')button.className=selector;else button.setAttribute(selector,'electronics');const text=h.add('row-title','span',button);h.swipe(text);assert.equal(h.backs,1,'navigation row permits back swipe '+selector)}
{
 const h=boot(),menu=h.add('menu','div',h.target);menu.className='feed-menu';const button=h.add('menu-route','button',menu);h.swipe(button);assert.equal(h.backs,1,'menu navigation rows permit back');
}
for(const kind of ['closed','detached','content-replaced','heading-replaced','heading-text-changed','modal-overlaid','wrong-id','multi-touch','cancel']){
 const h=boot();h.controller.start(h.event(h.target,25,150,0));
 if(kind==='closed')h.modal.close();
 if(kind==='detached')h.target.remove();
 if(kind==='content-replaced')h.content.innerHTML='<h2>Другое окно</h2><p>Другое содержимое</p>';
 if(kind==='heading-replaced'){h.content.querySelector('h2').remove();const heading=h.add('new-title','h2',h.content);heading.textContent='Другой заголовок'}
 if(kind==='heading-text-changed')h.content.querySelector('h2').textContent='Новый уровень';
 if(kind==='modal-overlaid'){const top=h.add('support-dialog','dialog');top.showModal()}
 if(kind==='cancel')h.controller.cancel();
 const more=kind==='wrong-id'?{touches:[{identifier:99,clientX:145,clientY:150}]}:kind==='multi-touch'?{touches:[{},{}]}:{};
 h.controller.move(h.event(h.target,145,150,100,'move',more));h.controller.end(h.event(h.target,145,150,200,'end'));assert.equal(h.backs,0,kind+' cancels stale gesture');
}
{
 const h=boot();h.modal.classList.add('lot-dialog');h.swipe();assert.equal(h.backs,0,'lot keeps its existing directional handler');
}
{
 const h=boot();h.modal.close();h.context.reelsMode=true;h.swipe(h.grid);assert.equal(h.backs,0,'feed delegates its own gestures');h.context.reelsMode=false;h.swipe(h.body);assert.equal(h.backs,0,'landing never navigates outside the app');
}
{
 const h=boot();h.controller.destroy();h.swipe();assert.equal(h.backs,0,'destroyed controller is inactive');
}

function routeFixture(html,kind='modal'){
 const h=setup({mobile:true});h.Element.prototype.click=function(){const event={type:'click',target:this,preventDefault(){}};for(let current=this;current;current=current.parentElement)current.dispatchEvent(event)};
 h.content.innerHTML=html;if(/seller-(?:listing|profile)-form/.test(html))h.modal.classList.add('seller-dialog');if(html.includes('checkout-modal'))h.modal.classList.add('plans-dialog');h.modal.showModal();vm.runInContext(source(),h.context);return h;
}
{
 const h=routeFixture('<h2>Мои ставки</h2><button data-my-bids-back>В кабинет</button>');let returns=0;
 h.content.querySelector('[data-my-bids-back]').addEventListener('click',()=>returns++);
 assert.equal(h.context.FasBackSwipe.back(),true);assert.equal(returns,1,'bids opened from the cabinet use their own return action');assert.equal(h.modal.open,true,'return action preserves the cabinet dialog');
}
{
 const h=routeFixture('<h2>Новая публикация</h2><button data-seller-dashboard>Мои объявления</button><form id="seller-listing-form"><textarea>Мой текст</textarea></form>');let saved=0;const button=h.content.querySelector('[data-seller-dashboard]');button.addEventListener('click',()=>{saved++;h.context.FasSellerUI.openDashboard('all')});assert.equal(h.context.FasBackSwipe.back(),true);assert.equal(saved,1,'editor uses its saving back action');assert(h.calls.some(([kind])=>kind==='account'));
}
{
 const h=routeFixture('<h2>Профиль</h2><form id="seller-profile-form"></form>');let tab;h.context.FasSellerUI.openDashboard=value=>tab=value;assert.equal(h.context.FasBackSwipe.back(),true);assert.equal(tab,'all');
}
{
 const h=routeFixture('<h2>SMS-код</h2><form id="code-form"></form><button id="change-phone">Изменить номер</button>');let changes=0;h.content.querySelector('#change-phone').addEventListener('click',()=>changes++);assert.equal(h.context.FasBackSwipe.back(),true);assert.equal(changes,1);
}
{
 const h=routeFixture('<div class="checkout-modal"><h2>Тариф</h2></div>');let comparisons=0;h.context.openPlans=()=>comparisons++;assert.equal(h.context.FasBackSwipe.back(),true);assert.equal(comparisons,1);
}
{
 const h=routeFixture('<h2>Демопокупка</h2><button data-seller-view="42">Вернуться к лоту</button><button data-seller-confirm-buy="42">Подтвердить</button>');let viewed=0;h.content.querySelector('[data-seller-view]').addEventListener('click',()=>viewed++);assert.equal(h.context.FasBackSwipe.back(),true);assert.equal(viewed,1,'purchase confirmation returns to the lot via its original action');assert.equal(h.modal.open,true);
}
for(const id of ['support-dialog','seller-rating-dialog']){
 const h=routeFixture('<h2>Карточка под окном</h2>'),before=h.content.firstChild;const overlay=h.add(id,'dialog');overlay.innerHTML='<h2>Вложенное окно</h2><p>Текст</p>';overlay.showModal();assert.equal(h.context.FasBackSwipe.back(),true);assert.equal(overlay.open,false);assert.equal(h.modal.open,true);assert.strictEqual(h.content.firstChild,before,'underlying form/lot remains intact');
}

// The actual category module determines whether back means parent level or close.
{
 const h=setup({mobile:true}),{context,Element,document}=h;
 Element.prototype.click=function(){const event={type:'click',target:this,preventDefault(){}};for(let current=this;current;current=current.parentElement)current.dispatchEvent(event)};
 Element.prototype.insertAdjacentElement=function(where,node){if(where==='afterend'&&this.parentElement){const p=this.parentElement,i=p.children.indexOf(this);node.parentElement=p;p.children.splice(i+1,0,node)}else this.appendChild(node)};
 const native=h.add('category','select');native.onchange=()=>{};context.escapeText=value=>String(value??'');context.cars=[{id:1,category:'cars'}];
 for(const file of ['category-tree.js','category-ui.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist',file),'utf8'),context);
 h.modal.showModal();h.content.innerHTML='<h2>Редактор</h2><textarea>Не терять</textarea>';const editor=h.content.firstChild;
 context.FasCategoryUI.open({purpose:'sell',group:'electronics'});const picker=document.querySelector('#category-picker');
 vm.runInContext(source(),context);
 const row=picker.querySelector('[data-category-node="phones"]'),event=(x,time,ending=false)=>({target:row,timeStamp:time,cancelable:false,touches:ending?[]:[{identifier:2,clientX:x,clientY:160}],changedTouches:ending?[{identifier:2,clientX:x,clientY:160}]:[],preventDefault(){throw Error('noncancelable events cannot be prevented')}});
 h.docEvents.touchstart.at(-1)(event(25,0));h.docEvents.touchmove.at(-1)(event(145,100));h.docEvents.touchend.at(-1)(event(145,200,true));
 assert(picker.open,'back from category group keeps picker open');assert.equal(picker.querySelector('.category-browser-head h2').textContent,'Категория');assert.strictEqual(h.content.firstChild,editor);assert.equal(native.value,'','row swipe goes back instead of selecting its category');
 assert.equal(context.FasBackSwipe.back(),true);assert.equal(picker.open,false);assert.equal(h.modal.open,true);assert.strictEqual(h.content.firstChild,editor,'back from picker root preserves seller editor');
}
console.log('PASS: right-swipe back routes, category levels, nested preservation, navigation rows, controls, thresholds, cancellation and bounded synthetic-click suppression.');
