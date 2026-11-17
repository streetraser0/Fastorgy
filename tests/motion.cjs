const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../dist/motion.js'),'utf8');
function setup(options={}){
 const animations=[],timers=new Map(),docEvents={},preferenceEvents={};let timerId=0;
 class Element{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.parentElement=null;this.frames=[];this.classes=new Set();this.properties=new Map();this.style={transform:'',opacity:'',setProperty:(name,value)=>this.properties.set(name,String(value)),removeProperty:name=>this.properties.delete(name)};this.classList={contains:name=>this.classes.has(name),add:name=>this.classes.add(name),remove:name=>this.classes.delete(name)};this.events={};this.rect={top:30,left:25,width:500,height:600,bottom:630};if(options.noAnimate!==true)this.animate=(frames,settings)=>{const animation={element:this,frames,settings,cancels:0,finished:{then(done,failed){animation.done=done;animation.failed=failed}},cancel(){this.cancels++;this.failed?.()}};animations.push(animation);return animation}}
  add(node){this.children.push(node);node.parentElement=this;return node}
  contains(node){return node===this||this.children.some(child=>child.contains(node))}
  querySelector(selector){if(selector==='#modal-content')return this.children.find(child=>child.id==='modal-content')||null;if(selector==='.category-browser')return this.children.find(child=>child.classList.contains('category-browser'))||null;return null}
  querySelectorAll(selector){if(selector==='.card')return this.children.filter(child=>child.classList.contains('card'));return[]}
  getBoundingClientRect(){return this.rect}
  addEventListener(type,fn){(this.events[type]??=[]).push(fn)}
  fire(type,event={}){for(const fn of this.events[type]||[])fn(event)}
  closest(selector){if(selector==='dialog'){let node=this;while(node){if(node.tagName==='DIALOG')return node;node=node.parentElement}}return null}
 }
 class Dialog extends Element{
  constructor(){super('dialog');this.open=true;this.calls=[];this.returnValue='';this.close=function(...args){this.calls.push(args);if(this.throwClose)throw Error('native close failed');this.open=false;if(args.length)this.returnValue=String(args[0]);return 'native-result'}}
 }
 const modal=new Dialog(),content=modal.add(new Element());content.id='modal-content';const picker=new Dialog(),browser=picker.add(new Element());browser.classList.add('category-browser');const list=browser.add(new Element());
 const body=new Element('body'),grid=body.add(new Element());for(let i=0;i<8;i++){const card=grid.add(new Element());card.classList.add('card');card.rect={top:i*100,bottom:i*100+90,width:100,height:90,left:0}}
 const preference={matches:!!options.reduced,addEventListener:(type,fn)=>preferenceEvents[type]=fn};
 const document={hidden:!!options.hidden,body,addEventListener(type,fn,settings){(docEvents[type]??=[]).push({fn,settings})},querySelector(selector){if(selector==='#modal')return modal;if(selector==='dialog[open]')return modal.open?modal:picker.open?picker:null;return null}};
 const window={matchMedia:()=>preference,CSS:options.discrete===false?undefined:{supports:()=>true},innerHeight:500,getComputedStyle:()=>({backgroundColor:'white',color:'black',borderRadius:'20px',boxShadow:'none',border:'1px solid blue'}),setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id},clearTimeout(id){timers.delete(id)}};
 const context={window,document};vm.createContext(context);vm.runInContext(source,context);
 return{api:window.FasMotion,window,document,modal,content,picker,browser,list,grid,animations,timers,preference,Element,Dialog,fire(type,event){for(const {fn} of docEvents[type]||[])fn(event)},preferenceChange(value){preference.matches=value;preferenceEvents.change?.({matches:value})},runTimers(){for(const [id,{fn}] of [...timers]){timers.delete(id);fn()}},rawTimer:()=>[...timers.values()][0]?.fn};
}
{
 const h=setup({reduced:true});h.api.dialogEnter(h.modal);h.api.categoryEnter(h.list);h.modal.open=false;h.picker.open=false;h.api.catalogEnter(h.grid);assert.equal(h.animations.length,0);h.modal.open=true;const result=h.modal.close('reduced');assert.equal(result,'native-result');assert.equal(h.modal.open,false);assert.equal(h.modal.returnValue,'reduced');assert.equal(h.modal.calls.length,1);assert.equal(h.timers.size,0);
}
{
 const h=setup();h.api.dialogEnter(h.modal);h.api.categoryEnter(h.list);assert.equal(h.animations.length,2);h.preferenceChange(true);assert(h.animations.every(animation=>animation.cancels===1));h.api.dialogEnter(h.modal);assert.equal(h.animations.length,2);h.preferenceChange(false);h.api.dialogEnter(h.modal);assert.equal(h.animations.length,3);
 h.modal.close('accepted');assert.equal(h.modal.open,false,'close remains synchronous');assert.equal(h.modal.returnValue,'accepted');assert.equal(h.modal.calls.length,1);assert(h.modal.classList.contains('fas-motion-exit'));assert.equal(h.modal.properties.get('--fas-exit-top'),'30px');assert.equal(h.modal.properties.get('--fas-exit-width'),'500px');assert.equal(h.timers.size,1);h.preferenceChange(true);assert.equal(h.timers.size,0);assert(!h.modal.classList.contains('fas-motion-exit'));assert.equal(h.modal.properties.size,0);
}
for(const config of [{discrete:false},{reduced:true}]){
 const h=setup(config);h.api.dialogEnter(h.modal);h.modal.close('instant');assert.equal(h.modal.open,false);assert.equal(h.modal.calls.length,1);assert.equal(h.modal.properties.size,0);assert.equal(h.timers.size,0);
}
{
 const h=setup();h.modal.classList.add('lot-dialog');h.modal.style.transform='translateX(75px)';h.modal.style.opacity='.8';h.api.dialogEnter(h.modal);h.modal.close('swipe');assert.equal(h.modal.open,false);assert.equal(h.modal.calls.length,1);assert.equal(h.timers.size,0);assert.equal(h.modal.style.transform,'translateX(75px)');assert.equal(h.modal.style.opacity,'.8');assert.equal(h.modal.properties.size,0);
}
{
 const h=setup();h.api.dialogEnter(h.picker);h.picker.close('category');const stale=h.rawTimer();assert.equal(h.picker.calls.length,1);assert.equal(h.timers.size,1);h.picker.open=true;h.api.dialogEnter(h.picker);assert.equal(h.timers.size,0);assert.equal(h.picker.properties.size,0);stale();assert.equal(h.picker.open,true);assert(!h.picker.classList.contains('fas-motion-exit'));h.picker.close();h.runTimers();assert.equal(h.picker.properties.size,0);assert.equal(h.timers.size,0);
}
{
 const h=setup();h.api.dialogEnter(h.modal);h.fire('touchstart',{target:h.content});assert.equal(h.animations[0].cancels,1);h.api.dialogEnter(h.modal);h.fire('pointerdown',{target:h.content});assert.equal(h.animations[1].cancels,1);assert.equal(h.modal.style.transform,'');assert.equal(h.modal.style.opacity,'');
 h.api.dialogEnter(h.modal);h.document.hidden=true;h.fire('visibilitychange');assert.equal(h.animations[2].cancels,1);h.api.dialogEnter(h.modal);assert.equal(h.animations.length,3);
}
{
 const h=setup();h.document.body.classList.add('reels');h.api.catalogEnter(h.grid);assert.equal(h.animations.length,0);h.document.body.classList.remove('reels');h.api.catalogEnter(h.grid);assert.equal(h.animations.length,0,'open dialog suppresses catalog effects');h.modal.open=false;h.picker.open=false;h.document.activeElement={matches:selector=>selector==='input,textarea'};h.api.catalogEnter(h.grid);assert.equal(h.animations.length,0,'typing suppresses catalog effects');h.document.activeElement=null;h.api.catalogEnter(h.grid);assert.equal(h.animations.length,6,'only first six visible cards animate');assert(h.animations.every(animation=>animation.element!==h.grid));
}
{
 const h=setup();h.api.categoryEnter(h.list,'forward');assert.equal(h.animations[0].frames[0].transform,'translateX(12px)');h.api.categoryEnter(h.list,'back');assert.equal(h.animations[0].cancels,1);assert.equal(h.animations[1].frames[0].transform,'translateX(-12px)');h.api.categoryEnter(h.list,'search');assert.equal(h.animations.length,2,'search must not restart an in-flight transition');h.animations[1].done();h.api.categoryEnter(h.list,'search');assert.equal(h.animations[2].settings.duration,110);assert(h.animations[2].frames.every(frame=>!('transform' in frame)));h.api.categoryEnter(h.list,'search');assert.equal(h.animations.length,3,'rapid typing does not restart a fade');assert.equal(h.animations[2].cancels,0);h.api.categoryEnter(h.list,'none');assert.equal(h.animations.length,3);
}
{
 const h=setup({noAnimate:true});assert.doesNotThrow(()=>h.api.dialogEnter(h.modal));assert.doesNotThrow(()=>h.api.categoryEnter(h.list));h.modal.throwClose=true;assert.throws(()=>h.modal.close('fail'),/native close failed/);assert.equal(h.modal.calls.length,1);assert.equal(h.modal.properties.size,0);assert.equal(h.timers.size,0);
}
{
 const h=setup();assert.equal((h.modal.events.cancel||[]).length,0,'motion must leave native Escape cancellation to the application');h.modal.addEventListener('cancel',event=>event.preventDefault());const event={defaultPrevented:false,cancelable:true,preventDefault(){this.defaultPrevented=true}};h.modal.fire('cancel',event);assert(event.defaultPrevented);assert.equal(h.modal.open,true);assert.equal(h.modal.calls.length,0);
}
{
 const h=setup();h.api.dialogEnter(h.picker);h.picker.close();const old=h.rawTimer();h.picker.open=true;h.api.dialogEnter(h.picker);h.picker.close('new-exit');old();assert(h.picker.classList.contains('fas-motion-exit'),'old cleanup must not clear a newer exit');assert(h.picker.properties.size>0);assert.equal(h.timers.size,1);h.runTimers();assert.equal(h.picker.properties.size,0);
}
console.log('PASS: reduced-motion cancellation, synchronous/native close semantics, unsupported/lot instant close, geometry cleanup and reopen safety, interaction cancellation, Reels/dialog exclusion, category transitions and missing animation support.');
