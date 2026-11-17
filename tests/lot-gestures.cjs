const fs=require('fs'),vm=require('vm'),assert=require('assert');
const code=fs.readFileSync(require('path').join(__dirname,'../dist/lot-gestures.js'),'utf8');
function harness(pointer=true){
 let time=1000,sequence=0;const timers=new Map(),single=[],immediate=[],favorites=new Set(),feedback=[],observers=[];
 const listeners=new Map();const grid={addEventListener(t,fn,config){listeners.set(t,{fn,config})},removeEventListener(t){listeners.delete(t)},contains(node){return !!node&&(node===this||node.connected!==false&&!!(node.card||node.isCard))}};
 const docListeners=new Map(),document={body:{},addEventListener(t,fn){docListeners.set(t,fn)},removeEventListener(t){docListeners.delete(t)}};
 const viewListeners=new Map(),view={...(pointer?{PointerEvent:function(){}}:{}),addEventListener(t,fn){viewListeners.set(t,fn)},removeEventListener(t){viewListeners.delete(t)}};
 const card=id=>({isCard:true,connected:true,dataset:{lot:String(id)}});const a=card(101),b=card(102);
 const target=(c,interactive=false)=>({card:c,connected:true,closest(selector){return selector==='.card[data-lot]'?c:interactive?{}:null}});
 const photo=target(a),other=target(b),button=target(a,true);
 const modal={open:false};class Observer{constructor(fn){this.fn=fn;observers.push(this)}observe(){}disconnect(){this.disconnected=true}}
 const set=(fn,ms)=>{const id=++sequence;timers.set(id,{fn,at:time+ms});return id};const clear=id=>timers.delete(id);
 const context={};vm.createContext(context);vm.runInContext(code,context);
 const controller=context.createLotGestureController({grid,document,window:view,modal,MutationObserver:Observer,now:()=>time,setTimeout:set,clearTimeout:clear,onSingleTap(e,c,id){single.push(id)},onImmediate(e){immediate.push(e.target)},isModalOpen:()=>modal.open,addFavorite(id){const added=!favorites.has(id);favorites.add(id);return added},feedback(c,id,added){feedback.push({id,added})}});
 function advance(ms){const end=time+ms;for(;;){const due=[...timers.entries()].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;time=due[1].at;timers.delete(due[0]);due[1].fn()}time=end}
 function event(t=photo,x=100,y=100,extras={}){return {target:t,clientX:x,clientY:y,detail:1,button:0,pointerId:1,pointerType:'touch',isPrimary:true,cancelable:true,preventDefault(){this.prevented=true},...extras}}
 function tap(t=photo,x=100,y=100){controller.pointerDown(event(t,x,y));advance(20);controller.pointerUp(event(t,x,y));controller.click(event(t,x,y))}
 return {controller,advance,event,tap,photo,other,button,a,b,grid,modal,listeners,viewListeners,document,docListeners,observers,single,immediate,favorites,feedback,timers};
}
{
 const h=harness();h.tap();h.advance(319);assert.deepEqual(h.single,[]);h.advance(1);assert.deepEqual(h.single,[101]);
}
{
 const h=harness();h.tap();h.advance(90);h.tap();assert.deepEqual([...h.favorites],[101]);h.advance(500);assert.deepEqual(h.single,[]);assert.equal(h.feedback[0].added,true);h.tap();h.advance(60);h.tap();assert.equal(h.favorites.size,1);assert.equal(h.feedback.at(-1).added,false);
}
{
 const h=harness();h.tap();h.advance(60);h.tap(h.other);h.advance(400);assert.equal(h.favorites.size,0);assert.deepEqual(h.single,[102]);
}
{
 const h=harness();h.tap();h.advance(60);h.tap(h.photo,180,190);h.advance(400);assert.equal(h.favorites.size,0);assert.deepEqual(h.single,[101]);
}
{
 const h=harness();h.tap();h.advance(70);h.controller.pointerDown(h.event());h.controller.pointerMove(h.event(h.photo,100,190));h.controller.pointerUp(h.event(h.photo,100,190));h.controller.click(h.event(h.photo,100,190));h.advance(500);assert.equal(h.favorites.size,0);assert.deepEqual(h.single,[]);assert.equal(h.listeners.get('pointermove').config.passive,true);
}
{
 const h=harness();h.controller.pointerDown(h.event());h.advance(600);h.controller.pointerUp(h.event());h.controller.click(h.event());h.advance(500);assert.equal(h.favorites.size,0);assert.deepEqual(h.single,[]);
}
{
 const h=harness();h.tap();h.controller.pointerDown(h.event(h.photo,100,100,{pointerId:2,isPrimary:false}));h.controller.click(h.event());h.advance(500);assert.equal(h.favorites.size,0);assert.deepEqual(h.single,[]);
}
{
 const h=harness();h.tap();h.controller.click(h.event(h.photo,100,100,{button:2}));h.advance(400);assert.equal(h.favorites.size,0);assert.deepEqual(h.single,[101]);
}
{
 const h=harness();h.tap();h.controller.click(h.event(h.button));assert.equal(h.immediate.length,1);h.advance(400);assert.equal(h.favorites.size,0);assert.deepEqual(h.single,[]);
}
{
 const h=harness();h.controller.click(h.event(h.photo,0,0,{detail:0,pointerType:''}));assert.equal(h.immediate.length,1);h.advance(400);assert.equal(h.favorites.size,0);
}
for(const cancellation of ['scroll','page-scroll','mutation','dialog','detach','destroy']){
 const h=harness();h.tap();if(cancellation==='scroll')h.listeners.get('scroll').fn();if(cancellation==='page-scroll')h.viewListeners.get('scroll')();if(cancellation==='mutation')h.observers[0].fn();if(cancellation==='dialog')h.modal.open=true;if(cancellation==='detach')h.a.connected=false;if(cancellation==='destroy')h.controller.destroy();h.advance(400);assert.deepEqual(h.single,[],cancellation);assert.equal(h.favorites.size,0);
}
{
 const h=harness(false);const t=(extra={})=>({target:h.photo,touches:[{identifier:1,clientX:100,clientY:100}],changedTouches:[{identifier:1,clientX:100,clientY:100}],...extra});h.listeners.get('touchstart').fn(t());h.listeners.get('touchend').fn(t({touches:[]}));h.controller.click(h.event());h.advance(70);h.listeners.get('touchstart').fn(t());h.listeners.get('touchend').fn(t({touches:[]}));h.controller.click(h.event());assert.equal(h.favorites.size,1);assert.equal(h.listeners.get('touchmove').config.passive,true);
}
{
 const h=harness(false);h.tap();h.listeners.get('touchstart').fn({target:h.photo,touches:[{},{}]});h.controller.click(h.event());h.advance(500);assert.deepEqual(h.single,[]);assert.equal(h.favorites.size,0);
}
console.log('PASS: tap delay, touch/mouse double-add, idempotence, spatial/card bounds, swipe/long-press/pinch guards, control priority, keyboard, scroll/modal/detach/mode cancellation');
// Verify integration updates the real favorites contract in place without rendering.
{
 let time=1000,seq=0;const timers=new Map();const classes=new Set(),heart={attrs:{},innerHTML:'',classList:{add(s){classes.add(s)}},setAttribute(k,v){this.attrs[k]=v}};const pulses=[];const card={isCard:true,connected:true,dataset:{lot:'42'},querySelector(){return photo},querySelectorAll(){return[]}};const photo={querySelectorAll(){return[]},appendChild(p){pulses.push(p)}};const target={card,closest(s){return s==='.card[data-lot]'?card:null}};const grid={dataset:{},scrollTop:8200,onclick(){context.immediateCount++},contains(n){return n===card||n===target},addEventListener(){},removeEventListener(){},querySelectorAll(){return[heart]}};const count={textContent:''},modal={open:false};const document={body:{},querySelector(s){return s==='#grid'?grid:s==='#modal'?modal:count},createElement(){return{setAttribute(){},remove(){this.removed=true}}},addEventListener(){},removeEventListener(){}};const context={document,window:{PointerEvent:function(){}},Date:{now:()=>time},setTimeout(fn,ms){const id=++seq;timers.set(id,{fn,at:time+ms});return id},clearTimeout(id){timers.delete(id)},immediateCount:0,persistCount:0,toasts:[]};vm.createContext(context);vm.runInContext("let saved=[];function persist(){persistCount++}function uiIcon(){return '<svg></svg>'}function toast(s){toasts.push(s)}function render(){throw Error('Must not render')}\n"+code,context);const c=vm.runInContext('installFasLotGestures()',context);const event={target,clientX:100,clientY:120,detail:1,button:0,cancelable:true,preventDefault(){}};c.click(event);time+=100;c.click(event);assert.equal(vm.runInContext('saved.length',context),1);assert.equal(context.persistCount,1);assert.equal(heart.attrs['aria-pressed'],'true');assert.equal(heart.attrs['aria-label'],'Убрать из избранного');assert(classes.has('saved'));assert.equal(count.textContent,'1');assert.equal(grid.scrollTop,8200);assert.equal(pulses.length,1);assert(context.toasts[0].includes('добавлен'));time+=500;c.click(event);time+=100;c.click(event);assert.equal(vm.runInContext('saved.length',context),1);assert.equal(context.persistCount,1);console.log('PASS: integration persists once, updates heart/ARIA/count, preserves scroll and never calls render');
}
