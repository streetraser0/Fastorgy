const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {setup}=require('./helpers/quickbar-dom.cjs'),{boot,raw}=require('./helpers/category-seller-harness.cjs');
const read=name=>fs.readFileSync(path.join(__dirname,'../dist',name),'utf8');
const production=boot({fixtureInventory:[]});production.run('window.FasSellerUI.openDashboard()');
const dashboardMarkup=production.node('#modal-content').innerHTML;
assert.match(dashboardMarkup,/seller-dashboard-heading/);
const modalMarkup=read('index.html').match(/<dialog id="modal">([\s\S]*?)<\/dialog>/)[1];
function fixture(app=null,observeOpen=false){
 const h=setup({mobile:true});let backs=0;const observers=[];
 h.modal.innerHTML=modalMarkup;h.content=h.modal.querySelector('#modal-content');
 h.content.innerHTML=app?app.node('#modal-content').innerHTML:dashboardMarkup;
 for(const node of h.modal.querySelectorAll('[hidden]'))node.hidden=true;
 h.modal.classList.add('seller-dialog');h.modal.showModal();
 if(observeOpen)h.context.MutationObserver=class {constructor(callback){this.callback=callback;this.records=[];observers.push(this)}observe(target){this.target=target}disconnect(){this.target=null;this.records=[]}takeRecords(){return this.records.splice(0)}};
 if(app)app.context.window.FasDialogLifecycle={top:()=>app.node('#modal')};
 h.context.FasSellerUI.back=()=>{backs++;if(!app){h.modal.close();return true}const result=app.run('window.FasSellerUI.back()');if(!app.node('#modal').open)h.modal.close();else h.content.innerHTML=app.node('#modal-content').innerHTML;return result};
 for(const name of ['dialog-lifecycle.js','back-swipe.js','seller-back-gesture.js'])vm.runInContext(read(name),h.context,{filename:name});
 const event=(type,target,x,y,time,extra={})=>({type,target,timeStamp:time,cancelable:true,touches:type==='touchend'?[]:[{identifier:31,clientX:x,clientY:y}],changedTouches:type==='touchend'?[{identifier:31,clientX:x,clientY:y}]:[],prevented:0,preventDefault(){this.prevented++;this.defaultPrevented=true},stopPropagation(){},stopImmediatePropagation(){this.stopped=true},...extra});
 function emit(e){for(const fn of [...h.docEvents[e.type]||[]]){fn(e);if(e.stopped)break}return e}
 function swipe(target,dx,dy,duration=220,extra={}){const start=emit(event('touchstart',target,180,260,0));const move=emit(event('touchmove',target,180+dx,260+dy,duration/2));const end=emit(event('touchend',target,180+dx,260+dy,duration,extra));return {start,move,end}}
 return {...h,event,emit,swipe,get backs(){return backs},queueOpenTransition(){for(const observer of observers)if(observer.target===h.modal)observer.records.push({type:'attributes',target:h.modal,attributeName:'open'})}};
}

// Actual dashboard markup: logo, heading and close icon are distinct hit areas.
for(const selector of ['.dialog-brand img','.seller-dashboard-heading h2','.close svg'])for(const [dx,dy] of [[-120,0],[120,0],[0,120],[0,-120]]){
 const h=fixture(),target=h.modal.querySelector(selector);assert(target,selector);h.swipe(target,dx,dy,4000,{cancelable:false});assert.equal(h.backs,1,'slow '+selector+' '+[dx,dy]+' returns once through canonical Back');assert.equal(h.modal.open,false);
}
for(const selector of ['.seller-shell','.seller-list-title'])for(const [dx,dy] of [[-120,0],[120,0],[0,120]]){
 const h=fixture(),events=h.swipe(h.modal.querySelector(selector),dx,dy);assert.equal(h.backs,1,'dashboard free content supports '+[dx,dy]);assert.equal(events.move.prevented,1);
}
{
 const h=fixture(),target=h.modal.querySelector('.seller-list-title');h.emit(h.event('touchstart',target,180,260,0));const first=h.emit(h.event('touchmove',target,180,261,16));assert.equal(first.prevented,1,'reserve first downward pixel at dashboard top before Safari can claim overscroll');h.emit(h.event('touchend',target,180,380,4000,{cancelable:false}));assert.equal(h.backs,1);
}
for(const [scrollTop,dy] of [[0,-120],[240,-120],[240,120]]){
 const h=fixture();h.modal.scrollTop=scrollTop;const e=h.swipe(h.modal.querySelector('.seller-list-title'),0,dy);assert.equal(h.backs,0,'vertical reading stays native from '+scrollTop+' toward '+dy);assert.equal(e.move.prevented+e.end.prevented,0);
}
{
 const h=fixture(),shell=h.modal.querySelector('.seller-shell');shell.scrollTop=75;const e=h.swipe(h.modal.querySelector('.seller-list-title'),0,120);assert.equal(h.backs,0,'nested scrolled content cannot masquerade as the top');assert.equal(e.move.prevented,0);
}
for(const kind of ['dialog-scroll','nested-scroll','nested-horizontal','overlay','content','closed-reopened','hidden','contextmenu','selection','multitouch','cancel']){
 const h=fixture(),target=h.modal.querySelector('.seller-list-title');h.emit(h.event('touchstart',target,180,260,0));
 if(kind==='dialog-scroll')h.modal.scrollTop=60;
 if(kind==='nested-scroll')target.parentElement.scrollTop=60;
 if(kind==='nested-horizontal')target.parentElement.scrollLeft=60;
 if(kind==='overlay')h.add('second-dialog','dialog').showModal();
 if(kind==='content')h.content.innerHTML=dashboardMarkup;
 if(kind==='closed-reopened'){h.modal.close();h.emit({type:'close',target:h.modal});h.modal.showModal()}
 if(kind==='hidden')h.document.hidden=true;
 if(kind==='contextmenu')h.emit({type:'contextmenu',target});
 if(kind==='selection'){h.context.getSelection=()=>({isCollapsed:false,anchorNode:target});h.emit({type:'selectionchange',target})}
 if(kind==='cancel')h.emit({type:'touchcancel',target});
 h.emit(h.event('touchmove',target,180,380,100,kind==='multitouch'?{touches:[{},{}]}:{}));h.emit(h.event('touchend',target,180,380,220));assert.equal(h.backs,0,kind+' cancels in-flight dashboard return');
}
{
 const h=fixture(null,true),target=h.modal.querySelector('.seller-list-title');h.emit(h.event('touchstart',target,180,260,0));h.modal.close();h.queueOpenTransition();h.modal.showModal();h.queueOpenTransition();h.emit(h.event('touchend',target,300,260,200));assert.equal(h.backs,0,'pending native close/reopen with identical DOM cannot complete a previous gesture');
}
// Real tab/action markup and form/media affordances retain their native gestures.
for(const selector of ['[data-seller-new]','[data-seller-tab="profile"]','.seller-tabs button','[data-seller-favorites]'])for(const [dx,dy] of [[-120,0],[120,0],[0,120]]){
 const h=fixture(),target=h.modal.querySelector(selector);assert(target,selector);const e=h.swipe(target,dx,dy);assert.equal(h.backs,0,selector+' drag does not become navigation');assert.equal(e.move.prevented+e.end.prevented,0);
}
for(const tag of ['input','textarea','select','label','summary','video']){
 const h=fixture(),target=h.add('native-control',tag,h.modal.querySelector('.seller-shell'));const e=h.swipe(target,0,120);assert.equal(h.backs,0,tag+' is native');assert.equal(e.move.prevented,0);
}
for(const name of ['seller-media-grid','gallery-track','leaflet-container','seller-editor-nav']){
 const h=fixture(),target=h.add('native-area','div',h.modal.querySelector('.seller-shell'));target.className=name;h.swipe(target,120,0);assert.equal(h.backs,0,name+' owns its movement');
}
for(const [dx,dy] of [[0,0],[0,30],[100,95]]){
 const h=fixture(),e=h.swipe(h.modal.querySelector('.seller-list-title'),dx,dy,400);assert.equal(h.backs,0,'tap/short/diagonal gestures do not return');if(dx===0&&dy===0)assert.equal(e.move.prevented+e.end.prevented,0);
}
{
 const h=fixture();assert.equal(h.modal.querySelector('[data-seller-delete-confirmation]'),null,'one-click draft deletion has no obsolete confirmation layer');h.swipe(h.modal.querySelector('.seller-list-title'),120,0);assert.equal(h.backs,1,'dashboard Back is not intercepted by a removed confirmation');assert.equal(h.modal.open,false);
}
{
 const app=boot({fixtureInventory:[]});app.run('window.FasSellerUI.openEditor("draft-initial")');app.setRaw({...raw,name:'Сохранить при свайпе'});const h=fixture(app);h.swipe(h.modal.querySelector('.seller-heading'),-120,0);assert.equal(h.backs,1);assert.equal(h.modal.open,true,'editor Back returns to dashboard, not the page underneath');assert.match(h.content.innerHTML,/Личный кабинет/);assert.equal(JSON.parse(app.records['fas-seller-workspace-v1']).drafts[0].data.name,'Сохранить при свайпе');
}
{
 const app=boot({fixtureInventory:[]});app.run('window.FasSellerUI.openEditor("draft-initial")');app.setRaw({...raw,name:'Не потерять при ошибке памяти'});app.context.localStorage.setItem=()=>{throw Error('quota')};const h=fixture(app);h.swipe(h.modal.querySelector('.seller-heading'),120,0);assert.equal(h.backs,1);assert.equal(h.modal.open,true);assert.match(h.content.innerHTML,/Новое объявление/);assert.match(app.node('#seller-error').textContent,/только в памяти/,'refused canonical Back exposes error and preserves dirty editor');
}
{
 const app=boot({fixtureInventory:[]});app.run('window.FasSellerUI.openDashboard("profile")');app.workspace.profile.phone='ошибка';const h=fixture(app);h.swipe(h.modal.querySelector('.seller-heading'),0,120);assert.equal(h.backs,1);assert.equal(h.modal.open,true);assert.match(h.content.innerHTML,/Мой профиль/);assert.match(app.node('#seller-error').textContent,/номер телефона/,'invalid profile cannot be silently dismissed');
}
console.log('PASS: actual cabinet markup returns by left/right/top pull, native reading/tabs/media remain available, stale/nested gestures are cancelled, single canonical Back preserves dirty drafts and profiles without an obsolete delete confirmation.');
