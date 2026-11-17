const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const source=fs.readFileSync('dist/feed-tutorial.js','utf8'),KEY='fas-feed-tutorial-v1';
function boot(options={}){
 const h=setup(),records=options.records||{},timers=new Map();let time=0,nextId=0,writes=0;
 h.context.localStorage={getItem(key){if(options.storageError)throw Error('blocked');return records[key]??null},setItem(key,value){if(options.storageError)throw Error('quota');writes++;records[key]=value}};
 h.context.matchMedia=query=>({matches:query==='(prefers-reduced-motion: reduce)'&&!!options.reduced});
 h.context.setTimeout=(fn,delay)=>{const id=++nextId;timers.set(id,{fn,at:time+delay});return id};
 h.context.clearTimeout=id=>timers.delete(id);
 if(options.hidden)h.document.hidden=true;
 if(options.modal)h.modal.showModal();
 if(options.feed)h.context.setReels(true);
 vm.runInContext(source,h.context);
 const api=h.context.FasFeedTutorial,overlay=h.document.querySelector('#feed-tutorial');
 return {...h,records,timers,api,overlay,writes:()=>writes,
  open(){h.context.setReels(true);h.notify()},close(){h.context.setReels(false);h.notify()},
  advance(ms){const end=time+ms;while(true){const pending=[...timers].filter(([,task])=>task.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!pending)break;const [id,task]=pending;timers.delete(id);time=task.at;task.fn()}time=end},
  visibility(hidden){h.document.hidden=hidden;h.event('visibilitychange')},
  button:overlay.querySelector('button'),title:overlay.querySelector('#feed-tutorial-title'),description:overlay.querySelector('#feed-tutorial-description')};
}
{
 const h=boot(),launch=h.add('launch-feed','button');launch.focus();
 assert.equal(h.api.state().visible,false,'landing does not display swipe instructions');assert.equal(h.records[KEY],undefined);assert.equal(h.writes(),0);
 h.open();assert.equal(h.api.state().visible,true);assert.equal(h.api.state().stage,'browse');assert.equal(h.records[KEY],'1');assert.equal(h.writes(),1);assert.equal(h.overlay.hidden,false);assert.equal(h.document.activeElement,launch,'non-modal coaching does not steal focus');assert.match(h.title.textContent,/вверх и вниз/);
 h.advance(3599);assert.equal(h.api.state().stage,'browse');h.advance(1);assert.equal(h.api.state().stage,'close');assert.match(h.description.textContent,/верхней панели/);assert.match(h.description.textContent,/влево или вправо/);
 h.advance(4199);assert.equal(h.api.state().visible,true);h.advance(1);assert.equal(h.api.state().visible,false);assert.equal(h.overlay.hidden,true);assert.equal(h.timers.size,0);
 h.close();h.open();assert.equal(h.api.state().visible,false,'subsequent feed openings never repeat the animation');assert.equal(h.writes(),1);
 const reload=boot({records:h.records,feed:true});assert.equal(reload.api.state().visible,false,'persisted seen marker survives a page reload');assert.equal(reload.timers.size,0);
}
{
 const h=boot({feed:true}),stale=[...h.timers.values()].map(task=>task.fn);h.button.focus();h.button.onclick();
 assert.equal(h.api.state().visible,false);assert.equal(h.timers.size,0);stale.forEach(fn=>fn());assert.equal(h.api.state().visible,false,'dismissed coach cannot be reopened by a queued timer');h.close();h.open();assert.equal(h.api.state().visible,false);
}
{
 const h=boot({feed:true,modal:true});assert.equal(h.api.state().visible,false);assert.equal(h.writes(),0,'blocked openings are not recorded as shown');h.modal.close();h.notify();assert.equal(h.api.state().visible,true);
 const overlay=h.add('help-dialog','dialog');overlay.showModal();h.notify();assert.equal(h.api.state().visible,false,'opening any dialog hides the coach');assert.equal(h.timers.size,0);overlay.close();h.notify();assert.equal(h.api.state().visible,false,'a consumed introduction does not resume over another interaction');
}
{
 const h=boot({feed:true,hidden:true});assert.equal(h.api.state().visible,false);assert.equal(h.writes(),0);h.visibility(false);assert.equal(h.api.state().visible,true);h.visibility(true);assert.equal(h.api.state().visible,false);assert.equal(h.timers.size,0);h.visibility(false);assert.equal(h.api.state().visible,false);
}
{
 const h=boot({feed:true}),stale=[...h.timers.values()].map(task=>task.fn);h.close();assert.equal(h.api.state().visible,false);assert.equal(h.timers.size,0);stale.forEach(fn=>fn());h.open();assert.equal(h.api.state().visible,false,'closing and reopening the feed cannot replay stale coaching');
}
{
 const h=boot({feed:true,storageError:true});assert.equal(h.api.state().visible,true);assert.equal(h.api.state().seen,true);h.close();h.open();assert.equal(h.api.state().visible,false,'storage failures retain the once-only contract in this session');
}
{
 const h=boot({feed:true,reduced:true});assert.equal(h.api.state().stage,'static');assert.match(h.description.textContent,/Вверх и вниз/);assert.match(h.description.textContent,/Влево или вправо/);h.advance(3600);assert.equal(h.api.state().stage,'static');h.advance(4200);assert.equal(h.api.state().visible,false);
}
{
 const h=boot({feed:true});const pagehide=h.winEvents.pagehide;pagehide.forEach(fn=>fn());assert.equal(h.api.state().visible,false);assert.equal(h.timers.size,0);
 vm.runInContext(source,h.context);assert.equal(h.document.querySelectorAll('#feed-tutorial').length,1,'loading the module twice cannot duplicate overlays');
 for(const gesture of ['touchstart','touchmove','touchend','pointerdown','pointermove'])assert(!h.docEvents[gesture],'tutorial does not replace feed gesture handlers');
}
console.log('PASS: first-feed-only coaching, persistent and memory fallback, timed swipe stages, dismissal, focus, modal/visibility/feed lifecycle and reduced motion.');
