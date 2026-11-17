const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('dist/feed-motion.js','utf8');
function setup(options={}){
 const animations=[],timers=new Map(),events={},observers=[];let clock=0,nextTimer=0;
 class Node{
  constructor(className='',tag='div'){this.tagName=tag.toUpperCase();this.classes=new Set(className.split(' ').filter(Boolean));this.classList={contains:name=>this.classes.has(name),add:name=>this.classes.add(name),remove:name=>this.classes.delete(name)};this.children=[];this.events={};this.dataset={};this.hidden=false;this.isConnected=true;this.scrollTop=0;this.scrollLeft=0;this.clientHeight=600;this.clientWidth=320;this.style={};this.left=0;if(!options.noAnimate)this.animate=(frames,settings)=>{const item={effect:{target:this},frames,settings,cancels:0,finished:{then(done,failed){item.done=done;item.failed=failed}},cancel(){this.cancels++;this.failed?.()},finish(){this.finishedFlag=true;this.done?.()}};animations.push(item);return item}}
  add(node){this.children.push(node);node.parentElement=this;return node}
  matches(selector){return selector==='img'?this.tagName==='IMG':selector.startsWith('.')&&this.classes.has(selector.slice(1))}
  querySelectorAll(selector){const found=[];const visit=node=>{for(const child of node.children){if(child.matches(selector))found.push(child);visit(child)}};visit(this);return found}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null}
  closest(selector){let node=this;while(node){if(selector==='[hidden]'&&node.hidden)return node;node=node.parentElement}return null}
  getBoundingClientRect(){return{left:typeof this.left==='function'?this.left():this.left}}
  addEventListener(type,fn){(this.events[type]??=[]).push(fn)}
  fire(type,event={}){for(const fn of this.events[type]||[])fn({type,target:this,...event})}
 }
 const body=new Node();if(options.reels!==false)body.classList.add('reels');const grid=body.add(new Node()),track=body.add(new Node());track.left=24;
 function card(id,type='reels',offset=0){const node=new Node(type==='reels'?'card':'featured-card');node.dataset[type==='reels'?'lot':'featuredLot']=String(id);if(type==='reels'){const gallery=node.add(new Node('gallery-track')),slide=gallery.add(new Node('gallery-slide'));slide.add(new Node('','img'));node.add(new Node('card-body'))}else{node.left=()=>24+offset-track.scrollLeft;node.add(new Node('featured-photo')).add(new Node('','img'));node.add(new Node('featured-name'))}return node}
 for(let i=0;i<3;i++){grid.add(card(10+i*10));track.add(card(100+i,'featured',i*180))}
 const preference={matches:!!options.reduced,addEventListener(type,fn){(events['pref-'+type]??=[]).push(fn)}};
 const document={body,hidden:!!options.hidden,querySelector(selector){return selector==='#grid'?grid:selector==='#featured-track'?track:selector==='dialog[open]'&&document.modalOpen?{}:null},addEventListener(type,fn){(events[type]??=[]).push(fn)}};
 const context={document,window:null,MutationObserver:class{constructor(fn){observers.push(fn)}observe(){}},setTimeout(fn,delay){const id=++nextTimer;timers.set(id,{fn,at:clock+delay});return id},clearTimeout(id){timers.delete(id)},matchMedia:()=>preference};context.window=context;vm.createContext(context);vm.runInContext(source,context);
 const advance=ms=>{const end=clock+ms;for(let i=0;i<1000;i++){const next=[...timers].filter(([,value])=>value.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;clock=next[1].at;timers.delete(next[0]);next[1].fn()}clock=end};
 const notify=()=>observers.forEach(fn=>fn());const fire=(type,event={})=>(events[type]||[]).forEach(fn=>fn({type,...event}));
 return{api:context.FasFeedMotion,body,grid,track,document,animations,timers,advance,notify,fire,card,Node,sync(id,index=0){context.FasFeedMotion.sync({grid,lotId:id,index,slot:Math.round(grid.scrollTop/600)})},reduced(value){preference.matches=value;fire('pref-change')},active:()=>animations.filter(a=>!a.cancels&&!a.finishedFlag),remount(){function detach(node){node.isConnected=false;node.children.forEach(detach)}grid.children.forEach(detach);grid.children=[];for(let i=0;i<3;i++)grid.add(card(10+i*10))}};
}
{
 const h=setup();h.sync(10);h.advance(119);assert.equal(h.animations.length,0);h.advance(1);assert.equal(h.animations.length,2);assert(h.animations.every(a=>a.settings.duration===180&&a.settings.fill==='none'));
 assert(h.animations.every(a=>a.effect.target!==h.grid&&!a.effect.target.classes.has('card')),'no page/card transform changes scroll geometry');assert.equal(h.grid.scrollTop,0);assert.deepEqual(h.grid.style,{});
 h.sync(10);h.advance(500);assert.equal(h.animations.length,2,'same active lot is not animated twice');h.remount();h.sync(10);h.notify();h.advance(500);assert.equal(h.animations.length,2,'virtual recycling of the same ID never replays its arrival');assert(h.animations.every(a=>a.cancels===1),'detached inner effects are cancelled');
}
{
 const h=setup();h.sync(10);h.advance(120);h.grid.scrollTop=600;h.sync(20,1);h.grid.fire('scroll');assert(h.animations.every(a=>a.cancels===1));h.advance(120);assert.equal(h.animations.at(-1).frames[0].transform,'translateY(6px)');
 h.grid.scrollTop=0;h.sync(10,0);h.grid.fire('scroll');h.advance(120);assert.equal(h.animations.at(-1).frames[0].transform,'translateY(-6px)');assert.equal(h.active().length,2);
}
{
 const h=setup();h.sync(10);const stale=[...h.timers.values()][0].fn;h.grid.fire('touchstart',{touches:[{}]});h.grid.scrollTop=600;h.sync(20,1);h.grid.fire('scroll');h.grid.scrollTop=1200;h.sync(30,2);h.grid.fire('scroll');h.advance(1000);assert.equal(h.animations.length,0,'finger movement is never covered by a delayed effect');stale();assert.equal(h.animations.length,0,'an invalidated timer cannot animate an old lot');
 h.fire('touchend',{touches:[]});h.advance(120);assert.equal(h.animations.length,2);assert(h.animations.every(a=>h.grid.children[2].querySelectorAll('img').includes(a.effect.target)||a.effect.target===h.grid.children[2].querySelector('.card-body')),'only the final fast-swiped lot animates');
 h.grid.fire('pointerdown');assert.equal(h.active().length,0);h.grid.scrollTop=600;h.sync(20,1);h.advance(300);assert.equal(h.animations.length,2);h.fire('pointerup');h.advance(120);assert.equal(h.animations.length,4);
}
for(const cancel of [h=>h.reduced(true),h=>{h.document.hidden=true;h.fire('visibilitychange')},h=>{h.document.modalOpen=true;h.notify()},h=>{h.body.classList.remove('reels');h.notify()},h=>h.api.stop({reset:true})]){
 const h=setup();h.sync(10);cancel(h);h.advance(1000);assert.equal(h.animations.length,0,'pending effects cancel when motion/feed visibility is unavailable');
 const playing=setup();playing.sync(10);playing.advance(120);cancel(playing);assert.equal(playing.active().length,0,'playing effects cancel immediately');
}
{
 const h=setup({reduced:true});h.sync(10);h.advance(500);assert.equal(h.animations.length,0);h.reduced(false);h.sync(10);h.advance(120);assert.equal(h.animations.length,2,'preference changes apply without reload');
 const missing=setup({noAnimate:true});assert.doesNotThrow(()=>{missing.sync(10);missing.advance(500)});assert.equal(missing.animations.length,0);
 const invalid=setup();for(const id of [null,0,-1,1.5,NaN])invalid.sync(id);invalid.advance(500);assert.equal(invalid.animations.length,0);
}
{
 const h=setup({reels:false});h.track.scrollLeft=180;h.track.fire('scroll');h.advance(119);assert.equal(h.animations.length,0);h.advance(1);assert.equal(h.animations.length,2,'horizontal top feed also animates the new leading lot');assert.equal(h.animations.at(-1).frames[0].transform,'translateX(6px)');assert.equal(h.track.scrollLeft,180,'motion never sets horizontal scroll');
 h.track.fire('scroll');h.advance(120);assert.equal(h.animations.length,2,'small scrolls within the same leading card do not replay');h.track.scrollLeft=0;h.track.fire('scroll');h.advance(120);assert.equal(h.animations.at(-1).frames[0].transform,'translateX(-6px)');
 h.body.classList.add('reels');h.notify();assert.equal(h.active().length,0,'hidden horizontal feed effects cancel before fullscreen opens');h.sync(10);h.advance(120);assert.equal(h.active().length,2,'both contexts never accumulate hidden effects');
}
{
 const h=setup();for(let i=0;i<100;i++){h.grid.children[0].dataset.lot=String(200+i);h.sync(200+i,i);assert(h.timers.size<=1);h.advance(120);assert(h.active().length<=2,'long browsing retains only current inner effects')}
 const count=h.animations.length;h.grid.children[0].querySelector('.gallery-track').fire('scroll');h.sync(299,99);h.advance(500);assert.equal(h.animations.length,count,'a horizontal photo swipe is not a new lot');
}
console.log('PASS: native vertical/horizontal arrival effects, idle-only/latest-lot motion, same-ID recycling, direction, cancellation, reduced-motion and bounded animation state without scroll geometry changes.');
