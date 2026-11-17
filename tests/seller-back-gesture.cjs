const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {setup}=require('./helpers/quickbar-dom.cjs'),{boot,raw}=require('./helpers/category-seller-harness.cjs');
const source=fs.readFileSync(path.join(__dirname,'../dist/seller-back-gesture.js'),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
function fixture(){
 const h=setup({mobile:true});let backs=0,clock=1000;
 h.modal.classList.add('seller-dialog');h.content.innerHTML='<div class="dialog-brand"><img alt="ФАС торги"></div><div class="seller-heading"><h2>Новое объявление</h2><p>Размещение имущества</p></div><div class="free-content">Описание</div>';h.modal.showModal();
 h.context.FasSellerUI.back=()=>{backs++;return true};vm.runInContext(source,h.context);
 const controller=h.context.createFasSellerBackGesture({document:h.document,window:h.context,now:()=>clock,back:()=>{backs++;return true}});
 const header=h.content.querySelector('.dialog-brand'),body=h.content.querySelector('.free-content');
 const event=(target,x,y,time,end=false,extra={})=>({target,timeStamp:time,cancelable:true,touches:end?[]:[{identifier:9,clientX:x,clientY:y}],changedTouches:end?[{identifier:9,clientX:x,clientY:y}]:[],prevented:0,preventDefault(){this.prevented++},stopPropagation(){},stopImmediatePropagation(){},...extra});
 function swipe(target=header,dx=120,dy=0,duration=200,extra={}){const start=event(target,180,260,0),move=event(target,180+dx,260+dy,duration/2,false,extra),end=event(target,180+dx,260+dy,duration,true,extra);controller.start(start);controller.move(move);controller.end(end);return {start,move,end}}
 return {...h,controller,header,freeBody:body,event,swipe,get backs(){return backs},advance(ms){clock+=ms}};
}
for(const [dx,dy] of [[120,0],[-120,0],[0,120],[0,-120]]){const h=fixture(),events=h.swipe(h.header,dx,dy);assert.equal(h.backs,1,'all header directions return once: '+[dx,dy]);assert.equal(events.move.prevented,1);h.controller.end(events.end);assert.equal(h.backs,1)}
for(const tag of ['button','a','img','span'])for(const [dx,dy]of [[120,0],[-120,0],[0,120],[0,-120]]){const h=fixture(),target=h.add('header-control',tag,h.header);if(tag==='span'||tag==='img')target.setAttribute('role','button');h.controller.start(h.event(target,180,260,0));const first=h.event(target,180+Math.sign(dx)*2,260+Math.sign(dy)*2,20);h.controller.move(first);assert.equal(first.prevented,1,'seller header reserves the first 2px');const end=h.event(target,180+dx,260+dy,1800,true,{cancelable:false});h.controller.end(end);assert.equal(h.backs,1,'seller header action/logo slow drag returns without requiring a cancelable end');assert.equal(end.prevented,0)}
{const h=fixture(),events=h.swipe(h.header,0,0);assert.equal(h.backs,0);assert.equal(events.move.prevented+events.end.prevented,0,'a toolbar tap remains its original action')}
for(const [dx,dy] of [[120,0],[-120,0]]){const h=fixture();h.swipe(h.freeBody,dx,dy);assert.equal(h.backs,1,'free content supports horizontal back')}
for(const scrollTop of [0,300,700])for(const dy of [-150,150]){const h=fixture();h.modal.scrollTop=scrollTop;const events=h.swipe(h.freeBody,0,dy);assert.equal(h.backs,0,'content keeps native vertical scroll at every edge');assert.equal(events.move.prevented+events.end.prevented,0)}
for(const [dx,dy,duration] of [[30,0,200],[100,95,200],[0,75,400]]){const h=fixture();h.swipe(h.header,dx,dy,duration);assert.equal(h.backs,0,'short or diagonal gestures do not navigate')}
for(const tag of ['input','textarea','select','label','summary','video','audio']){const h=fixture(),control=h.add('control',tag,h.header);h.swipe(control);assert.equal(h.backs,0,tag+' retains native behavior')}
for(const name of ['gallery-track','seller-media-grid','seller-tabs','seller-editor-nav','leaflet-container']){const h=fixture(),area=h.add('scrollable','div',h.header);area.className=name;h.swipe(area);assert.equal(h.backs,0,name+' retains its gestures')}
for(const type of ['existing','during','contextmenu']){const h=fixture();let selection=null;h.context.getSelection=()=>selection;if(type==='existing')selection={isCollapsed:false,anchorNode:{nodeType:3,parentElement:h.freeBody}};h.controller.start(h.event(h.freeBody,180,260,0));if(type==='during'){selection={isCollapsed:false,focusNode:{nodeType:3,parentElement:h.freeBody}};h.docEvents.selectionchange.forEach(fn=>fn())}if(type==='contextmenu')h.docEvents.contextmenu.forEach(fn=>fn({target:h.freeBody}));h.controller.move(h.event(h.freeBody,300,260,100));h.controller.end(h.event(h.freeBody,300,260,1800,true));assert.equal(h.backs,0,'seller native text selection/context menu cancels '+type)}
for(const type of ['collapsed','outside']){const h=fixture(),outside=h.add('outside','p');h.context.getSelection=()=>({isCollapsed:type==='collapsed',anchorNode:outside});h.swipe();assert.equal(h.backs,1,'collapsed/outside selection is not a seller false blocker')}
for(const kind of ['overlay','changed','closed','cancelled','multi-touch']){
 const h=fixture();h.controller.start(h.event(h.header,180,260,0));
 if(kind==='overlay'){const category=h.add('category-picker','dialog');category.showModal()}
 if(kind==='changed')h.content.innerHTML='<h2>Личный кабинет</h2>';
 if(kind==='closed')h.modal.close();if(kind==='cancelled')h.controller.cancel();
 const extra=kind==='multi-touch'?{touches:[{},{}]}:kind==='noncancelable'?{cancelable:false}:{};
 h.controller.move(h.event(h.header,180,110,100,false,extra));h.controller.end(h.event(h.header,180,110,200,true,extra));assert.equal(h.backs,0,kind+' invalidates an in-flight gesture');
}
{
 const h=fixture();h.swipe();const click=h.event(h.header,300,260,210,false,{detail:1});h.controller.suppressClick(click);assert.equal(click.prevented,1);h.swipe();h.advance(451);const later=h.event(h.header,300,260,700,false,{detail:1});h.controller.suppressClick(later);assert.equal(later.prevented,0,'ghost-click guard expires');h.controller.destroy();h.swipe();assert.equal(h.backs,2,'destroyed controller is inert');
}
{
 const h=fixture();h.controller.destroy();vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/back-swipe.js'),'utf8'),h.context);
 for(const [type,event] of [['touchstart',h.event(h.header,180,260,0)],['touchmove',h.event(h.header,300,260,100)],['touchend',h.event(h.header,300,260,200,true)]])for(const listener of h.docEvents[type])listener(event);
 assert.equal(h.backs,1,'generic back and seller gestures do not both dispatch');
}

(async()=>{
 {
  const h=boot();h.run('window.FasSellerUI.openEditor("draft-initial")');h.setRaw({...raw,name:'Сохранить перед возвратом',description:'Изменённое описание без ожидания таймера автосохранения.'});
  assert.equal(h.run('window.FasSellerUI.back()'),true);assert.match(h.node('#modal-content').innerHTML,/Личный кабинет/);assert.equal(JSON.parse(h.records['fas-seller-workspace-v1']).drafts[0].data.name,'Сохранить перед возвратом');
 }
 {
  const h=boot();h.run('window.FasSellerUI.openEditor("draft-initial")');h.setRaw({...raw,name:'Не терять при переполненной памяти'});const before=h.node('#modal-content').innerHTML,set=h.context.localStorage.setItem;h.context.localStorage.setItem=()=>{throw Error('quota')};
  assert.equal(h.run('window.FasSellerUI.back()'),false);assert.equal(h.node('#modal-content').innerHTML,before);assert.equal(h.node('#seller-error').hidden,false);assert.match(h.node('#seller-error').textContent,/только в памяти этой страницы/);
  h.context.localStorage.setItem=set;assert.equal(h.run('window.FasSellerUI.back()'),true);assert.equal(JSON.parse(h.records['fas-seller-workspace-v1']).drafts.some(d=>d.data.name==='Не терять при переполненной памяти'),true);
 }
 {
  const h=boot();h.run('window.FasSellerUI.openEditor("draft-initial")');h.setRaw({...raw,name:'Мой ввод'});const other=JSON.parse(h.records['fas-seller-workspace-v1']);other.drafts[0].data.name='Изменено в другой вкладке';h.records['fas-seller-workspace-v1']=JSON.stringify(other);
  assert.equal(h.run('window.FasSellerUI.back()'),false);assert.match(h.node('#modal-content').innerHTML,/Новое объявление/);assert.equal(h.node('#seller-error').hidden,false);assert.equal(JSON.parse(h.records['fas-seller-workspace-v1']).drafts[0].data.name,'Изменено в другой вкладке','a failed back cannot overwrite a concurrent draft');
 }
 {
  const h=boot(),upload=deferred();h.run('window.FasSellerUI.openEditor("draft-initial")');h.context.window.FasSellerMedia.storeFiles=()=>upload.promise;
  const pending=h.node('#seller-files').events.change({target:{files:[{name:'pending.jpg'}],value:'pending'}});assert.equal(h.run('window.FasSellerUI.back()'),false);assert.match(h.node('#seller-error').textContent,/Фотографии ещё сохраняются/);upload.reject(Error('Не удалось сохранить выбранное фото'));await pending;assert.match(h.node('#modal-content').innerHTML,/Новое объявление/);assert.match(h.node('#seller-error').textContent,/Не удалось сохранить выбранное фото/);
 }
 {
  const h=boot(),read=deferred();h.run('window.FasSellerUI.openEditor("draft-initial")');await settle();h.context.window.FasSellerMedia.getMedia=()=>read.promise;
  const pending=h.publish();assert.equal(h.run('window.FasSellerUI.back()'),false);assert.match(h.node('#seller-error').textContent,/Объявление ещё сохраняется/);read.reject(Error('Не удалось прочитать материалы'));await pending;assert.match(h.node('#modal-content').innerHTML,/Новое объявление/);assert.match(h.node('#seller-error').textContent,/Не удалось прочитать материалы/);assert.equal(JSON.parse(h.records['fas-lots']||'[]').length,0);
 }
 {
  const h=boot();h.run('window.FasSellerUI.openDashboard("profile")');h.workspace.profile.displayName='Сохранённое новое имя';assert.equal(h.run('window.FasSellerUI.back()'),true);assert.equal(JSON.parse(h.records['fas-seller-workspace-v1']).profile.displayName,'Сохранённое новое имя');
 }
 {
  const h=boot();h.run('window.FasSellerUI.openDashboard("profile")');h.workspace.profile.phone='ошибка';assert.equal(h.run('window.FasSellerUI.back()'),false);assert.match(h.node('#modal-content').innerHTML,/Мой профиль/);assert.match(h.node('#seller-error').textContent,/номер телефона/);
 }
 console.log('PASS: seller header back in four directions, native content scrolling and controls, nested/stale/duplicate guards, durable dirty drafts, visible quota/conflict errors, pending media/publication failures and profile preservation.');
})().catch(error=>{console.error(error);process.exitCode=1});
