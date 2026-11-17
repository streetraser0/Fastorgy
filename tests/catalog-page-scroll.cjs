const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const code=fs.readFileSync(require('path').join(__dirname,'../dist/catalog-scroll.js'),'utf8');
const isolated={};vm.createContext(isolated);vm.runInContext(code,isolated);
const create=isolated.createFasCatalogPageScroll;

function harness(){
 let y=0,mobile=true,reels=false,reduced=false,inset=12,frames=0,updates=0,queries=0,rectReads=0,oldIndexCalls=0;
 const pending=new Map(),viewEvents=new Map(),docEvents=new Map(),moves=[],oldMoves=[],observers=[];
 let list=[];
 const view={addEventListener(name,fn){viewEvents.set(name,fn)},removeEventListener(name){viewEvents.delete(name)},requestAnimationFrame(fn){const id=++frames;pending.set(id,fn);return id},cancelAnimationFrame(id){pending.delete(id)}};
 const doc={hidden:false,body:{},addEventListener(name,fn){docEvents.set(name,fn)},removeEventListener(name){docEvents.delete(name)}};
 const grid={get firstElementChild(){return list[0]||null},get children(){return list},querySelectorAll(){queries++;return list}};
 function replace(rows){list=rows.map(([top,height],i)=>({dataset:{lot:String(i+1)},getBoundingClientRect(){rectReads++;return {top:top-y,bottom:top+height-y,height}},scrollIntoView(options){moves.push({index:i,options});y=top-inset}}))}
 replace([[500,560],[1076,760],[1852,430],[2298,1000]]);
 class Observer{constructor(fn){this.callback=fn;observers.push(this)}observe(target,options){this.target=target;this.options=options}disconnect(){this.disconnected=true}}
 const options={window:view,document:doc,grid,MutationObserver:Observer,isPageMode:()=>mobile&&!reels,reducedMotion:()=>reduced,getTopInset:()=>inset,swipeIndex(){oldIndexCalls++;return 42},moveLot(...args){oldMoves.push(args);return 'original'},updatePosition(){updates++;controller.swipeIndex()}};
 const controller=create(options);
 return {controller,view,doc,grid,moves,oldMoves,observers,pending,viewEvents,docEvents,options,replace,setY(value){y=value},setMobile(value){mobile=value},setReels(value){reels=value},setReduced(value){reduced=value},setInset(value){inset=value},getY:()=>y,counts:()=>({frames,updates,queries,rectReads,oldIndexCalls}),flush(){const callbacks=[...pending.values()];pending.clear();callbacks.forEach(fn=>fn())}};
}
{
 const h=harness();h.flush();assert.equal(h.controller.swipeIndex(),0,'a page above the catalogue starts at its first lot');
 h.setY(900);assert.equal(h.controller.swipeIndex(),0,'the tall first lot remains active while its bottom is visible');
 h.setY(1064);assert.equal(h.controller.swipeIndex(),1,'a card beginning at the safe edge becomes active');
 h.setY(1838);assert.equal(h.controller.swipeIndex(),2,'the next lot follows actual variable height rather than one viewport step');
 h.setY(5000);assert.equal(h.controller.swipeIndex(),3,'scrolling past the list stays bounded to the last lot');
 h.setY(1500);h.controller.moveLot(1);assert.equal(h.moves.at(-1).index,2);assert.equal(h.moves.at(-1).options.block,'start');assert.equal(h.moves.at(-1).options.behavior,'smooth');
 h.controller.moveLot(-1);assert.equal(h.moves.at(-1).index,1);h.setReduced(true);h.controller.moveLot(-1);assert.equal(h.moves.at(-1).index,0);assert.equal(h.moves.at(-1).options.behavior,'auto');
 h.controller.moveLot(-1);assert.equal(h.moves.at(-1).index,0,'previous clamps at the beginning');
 h.setY(5000);h.controller.moveLot(1);assert.equal(h.moves.at(-1).index,3,'next clamps at the end');
 h.replace([]);assert.equal(h.controller.swipeIndex(),0);const count=h.moves.length;h.controller.moveLot(1);assert.equal(h.moves.length,count,'empty lists do not scroll the page');
}
{
 const h=harness();h.flush();const before=h.counts();
 h.setY(1100);
 for(let i=0;i<40;i++)h.viewEvents.get('scroll')();
 assert.equal(h.pending.size,1,'native scroll events share one animation frame');h.flush();assert.equal(h.counts().updates,before.updates+1);assert.equal(h.counts().queries,before.queries,'scrolling reuses card nodes');
 h.replace(Array.from({length:128},(_,i)=>[500+i*716,700]));h.setY(500+99*716);const reads=h.counts().rectReads;assert.equal(h.controller.swipeIndex(),99);assert(h.counts().rectReads-reads<=8,'active lot lookup reads logarithmically many variable-height card rectangles');
 assert.equal(h.counts().queries,before.queries+1,'new card roots are discovered even before the observer callback');
 h.setInset(40);h.setY(500+99*716+665);h.viewEvents.get('resize')();h.flush();assert.equal(h.controller.swipeIndex(),100,'safe-area changes are taken from the new layout');
 const prior=h.counts();h.doc.hidden=true;h.viewEvents.get('scroll')();h.viewEvents.get('resize')();h.flush();assert.equal(h.counts().updates,prior.updates);assert.equal(h.counts().rectReads,prior.rectReads,'hidden tabs do not read card layout');
 h.doc.hidden=false;h.docEvents.get('visibilitychange')();h.flush();assert.equal(h.counts().updates,prior.updates+1);
}
{
 const h=harness();h.flush();assert.equal(h.counts().updates,1,'initial catalogue position is reported');
 for(const y of [600,700,800,900]){h.setY(y);h.viewEvents.get('scroll')();h.flush()}
 assert.equal(h.counts().updates,1,'multiple frames within the same tall lot do not rewrite the counter');
 h.setY(1100);h.viewEvents.get('scroll')();h.flush();assert.equal(h.counts().updates,2,'crossing into the next lot updates the counter');
 h.replace([[500,560],[1076,760],[1852,430],[2298,1000],[3314,700]]);h.viewEvents.get('scroll')();h.flush();assert.equal(h.counts().updates,3,'a changed lot count updates even with the same active index');
 h.observers[0].callback();h.flush();assert.equal(h.counts().updates,4,'an explicit list refresh invalidates the reported position');
}
{
 const h=harness();h.flush();h.setReels(true);assert.equal(h.controller.swipeIndex(),42);assert.equal(h.controller.moveLot(-1),'original');assert.deepEqual(h.oldMoves,[[-1]]);
 const previous=h.counts().updates;h.viewEvents.get('scroll')();h.viewEvents.get('resize')();h.flush();assert.equal(h.counts().updates,previous,'reels keep their own scroll/update lifecycle');
 h.setReels(false);h.setMobile(false);assert.equal(h.controller.swipeIndex(),42);h.controller.moveLot(1);assert.deepEqual(h.oldMoves.at(-1),[1],'desktop behavior delegates too');
 h.setMobile(true);h.controller.refresh();const stale=[...h.pending.values()][0];h.controller.destroy();stale();assert.equal(h.counts().updates,previous,'stale callbacks do not run after destroy');assert.equal(h.viewEvents.size,0);assert.equal(h.docEvents.size,0);assert(h.observers.every(o=>o.disconnected));
}
{
 // The installed wrappers are the globals used by existing arrow/key handlers.
 const h=harness(),context={window:h.view,document:{...h.doc,querySelector:()=>h.grid},reelsMode:false};
 h.view.matchMedia=query=>({matches:query.includes('max-width')});h.view.getComputedStyle=()=>({scrollMarginTop:'12px'});
 vm.createContext(context);vm.runInContext('function swipeIndex(){return 7}function moveLot(direction){window.delegated=direction}function updateSwipePosition(){window.updated=true}\n'+code,context);
 assert.equal(vm.runInContext('swipeIndex()',context),0);vm.runInContext('moveLot(1)',context);assert.equal(h.moves.at(-1).index,1);
 context.reelsMode=true;assert.equal(vm.runInContext('swipeIndex()',context),7);vm.runInContext('moveLot(-1)',context);assert.equal(h.view.delegated,-1);
 assert(h.view.FasCatalogScroll);
}
console.log('PASS: native page catalogue uses actual card geometry, bounded arrows and motion preferences; scroll updates coalesce, hidden tabs stay idle and reels/desktop keep original behavior.');
