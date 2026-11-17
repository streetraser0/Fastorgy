const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const source=fs.readFileSync('dist/lot-discovery.js','utf8'),KEY='fas-viewed-lots-v1';
function boot(options={}){
 const h=setup(),records={...(options.records||{})},timers=new Map(),ios=[];let time=0,next=0,writes=0;
 h.context.innerWidth=390;
 h.context.localStorage={getItem(key){if(options.storageError)throw Error('blocked');return records[key]??null},setItem(key,value){if(options.storageError)throw Error('quota');records[key]=value;writes++}};
 h.context.setTimeout=(fn,delay)=>{const id=++next;timers.set(id,{fn,at:time+delay});return id};h.context.clearTimeout=id=>timers.delete(id);
 if(!options.noObserver)h.context.IntersectionObserver=class{constructor(callback,config){this.callback=callback;this.config=config;this.targets=new Set();this.disconnected=false;ios.push(this)}observe(node){this.targets.add(node)}unobserve(node){this.targets.delete(node)}disconnect(){this.disconnected=true;this.targets.clear()}emit(entries){this.callback(entries)}};
 const card=(id,top=0,height=700)=>{const node=h.add('lot-'+id,'article',h.grid);node.className='card';node.setAttribute('data-lot',id);node.rect={top,left:0,bottom:top+height,right:390,width:390,height};node.getBoundingClientRect=()=>node.rect;return node};
 const first=card(1,0),second=card(2,750),third=card(3,1500);
 if(options.feed)h.context.setReels(true);
 if(options.hidden)h.document.hidden=true;
 if(options.modal)h.modal.showModal();
 vm.runInContext(source,h.context);
 const api=h.context.FasLotDiscovery,latest=()=>ios.at(-1);
 const emit=(node,visibleHeight=600,overrides={})=>{latest().emit([{target:node,isIntersecting:visibleHeight>0,intersectionRatio:visibleHeight/node.rect.height,boundingClientRect:node.rect,intersectionRect:{height:visibleHeight,width:390},rootBounds:{height:716},...overrides}])};
 return {...h,records,timers,ios,api,card,first,second,third,latest,emit,writes:()=>writes,
  advance(ms){const end=time+ms;while(true){const pending=[...timers].filter(([,task])=>task.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!pending)break;const [id,task]=pending;timers.delete(id);time=task.at;task.fn()}time=end},
  visibility(hidden){h.document.hidden=hidden;h.event('visibilitychange')},
  page(type){for(const fn of h.winEvents[type]||[])fn({type})}
 };
}
{
 const h=boot(),nearSeen={id:1,distance:1},nearNew={id:2,distance:4},farNew={id:3,distance:30},farSeen={id:4,distance:80},incoming=[nearSeen,nearNew,farNew,farSeen];
 h.api.markViewed(1);h.api.markViewed(4);
 const ordered=h.api.prioritize(incoming);
 assert.deepEqual(Array.from(ordered,x=>x.id),[2,3,1,4],'new lots keep their incoming distance order, followed by viewed lots in distance order');
 assert.deepEqual(incoming.map(x=>x.id),[1,2,3,4],'sorting must not mutate the displayed list');
 assert.strictEqual(ordered[0],nearNew,'lot objects are not copied or changed');
 h.api.markViewed(2);assert.deepEqual(Array.from(ordered,x=>x.id),[2,3,1,4],'view tracking cannot reorder the active feed snapshot');
 assert.deepEqual(Array.from(h.api.prioritize(incoming),x=>x.id),[3,1,2,4],'the next render reflects newly viewed lots');
 const byPrice=[{id:3,price:10},{id:2,price:20},{id:4,price:30},{id:1,price:40}];assert.deepEqual(Array.from(h.api.prioritize(byPrice),x=>x.id),[3,2,4,1],'explicit price ordering also stays stable inside each group');
 const frozen=new Map([[1,true],[2,false],[3,false],[4,true]]),classify=id=>frozen.get(id)===true;
 assert.deepEqual(Array.from(h.api.prioritize(incoming,classify),x=>x.id),[2,3,1,4],'a session classifier retains its original groups across renders');
 h.api.markViewed(3);assert.deepEqual(Array.from(h.api.prioritize(incoming,classify),x=>x.id),[2,3,1,4],'newly recorded views do not change a frozen session classifier');
 assert.equal(h.calls.filter(call=>call[0]==='render').length,0,'marking views never renders or jumps the page');
 assert.equal(h.api.markViewed(1),false);assert.equal(h.writes(),4,'repeated marks do not serialize again');
 for(const id of [0,-1,NaN,Infinity,'2',1.5,Number.MAX_SAFE_INTEGER+1,null])assert.equal(h.api.markViewed(id),false);
 const reload=boot({records:h.records});assert.equal(reload.api.hasViewed(1),true);assert.equal(reload.api.hasViewed(2),true);assert.equal(reload.api.hasViewed(4),true);
}
{
 const h=boot();assert.equal(h.api.state().viewedCount,0);assert.equal(h.api.state().mode,'page');assert.strictEqual(h.latest().config.root,null);
 assert.equal(h.timers.size,0,'preloaded cards are not marked merely because they exist');
 h.emit(h.first);h.advance(599);assert.equal(h.api.hasViewed(1),false);h.advance(1);assert.equal(h.api.hasViewed(1),true);
 assert.equal(h.api.hasViewed(2),false);assert.equal(h.api.hasViewed(3),false);
 h.emit(h.second,100);h.advance(1000);assert.equal(h.api.hasViewed(2),false,'a thin sliver does not count as a view');
 h.emit(h.second,600);h.advance(600);assert.equal(h.api.hasViewed(2),false,'final geometry is checked even if an old observer entry claimed visibility');
 h.second.rect={top:0,left:0,bottom:700,right:390,width:390,height:700};h.emit(h.second);h.advance(300);h.emit(h.second,0);h.advance(600);assert.equal(h.api.hasViewed(2),false,'fast scrolling cancels unfinished dwell');
 h.emit(h.second);h.advance(600);assert.equal(h.api.hasViewed(2),true);
}
{
 const h=boot();h.emit(h.first);const stale=[...h.timers.values()].map(task=>task.fn);h.visibility(true);assert.equal(h.timers.size,0);assert.equal(h.api.state().tracking,false);stale.forEach(fn=>fn());assert.equal(h.api.hasViewed(1),false);
 const old=h.latest();h.visibility(false);assert.notStrictEqual(h.latest(),old);old.emit([{target:h.first,isIntersecting:true,boundingClientRect:h.first.rect,intersectionRect:{height:700,width:390},rootBounds:{height:716}}]);assert.equal(h.timers.size,0,'disconnected observers cannot schedule new views');
 h.emit(h.first);h.modal.showModal();h.notify();h.advance(600);assert.equal(h.api.hasViewed(1),false,'a dialog never counts as watching the card below it');
 h.modal.close();h.notify();h.emit(h.first);h.advance(600);assert.equal(h.api.hasViewed(1),true,'closing a dialog starts a fresh visible dwell');
}
{
 const h=boot();h.emit(h.first);const old=h.latest(),stale=[...h.timers.values()].map(task=>task.fn);h.context.setReels(true);h.notify();assert.equal(old.disconnected,true);assert.strictEqual(h.latest().config.root,h.grid);assert.equal(h.api.state().mode,'reels');stale.forEach(fn=>fn());assert.equal(h.api.hasViewed(1),false,'page timers cannot mark a new feed mode');
 h.emit(h.first);h.first.remove();h.notify();h.advance(600);assert.equal(h.api.hasViewed(1),false,'recycled cards are not marked after removal');
 const replacement=h.card(7,0);h.notify();assert(h.latest().targets.has(replacement));h.emit(replacement);h.advance(600);assert.equal(h.api.hasViewed(7),true);
 h.page('pagehide');assert.equal(h.api.state().tracking,false);h.page('pageshow');assert.equal(h.api.state().tracking,true);
 const observerCount=h.ios.length;vm.runInContext(source,h.context);assert.equal(h.ios.length,observerCount,'loading twice cannot create another observer');
}
{
 const h=boot({records:{[KEY]:'{bad-json'}});assert.equal(h.api.state().viewedCount,0);h.api.markViewed(20);assert.equal(h.api.hasViewed(20),true);
 const quota=boot({storageError:true});assert.equal(quota.api.markViewed(5),true);assert.equal(quota.api.hasViewed(5),true);assert.equal(quota.api.state().storageAvailable,false);assert.deepEqual(Array.from(quota.api.prioritize([{id:5},{id:6}]),lot=>lot.id),[6,5],'blocked storage keeps the feature available for this session');
 const records={[KEY]:JSON.stringify({version:1,ids:Array.from({length:20000},(_,i)=>i+1)})},bounded=boot({records});bounded.api.markViewed(20001);assert.equal(bounded.api.state().viewedCount,20000);assert.equal(bounded.api.hasViewed(1),false);assert.equal(bounded.api.hasViewed(20001),true);assert.equal(JSON.parse(bounded.records[KEY]).ids.length,20000);
 const missing=boot({noObserver:true});assert.equal(missing.api.state().tracking,false);assert.equal(missing.api.hasViewed(1),false);missing.api.markViewed(1);assert.equal(missing.api.hasViewed(1),true,'detail-view hooks work without IntersectionObserver');
}
console.log('PASS: unseen-first stable distance/price ordering, no active-feed jumps, actual visible dwell, lazy/recycled cards, dialogs/background/mode guards, bounded persistence and storage/observer fallbacks.');
