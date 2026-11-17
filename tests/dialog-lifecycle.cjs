const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('dist/dialog-lifecycle.js','utf8');
function install(context){const listeners=[];const original=context.document.addEventListener;context.document.addEventListener=function(type,callback,options){if(type==='close')listeners.push({callback,options});else original?.call(this,type,callback,options)};vm.runInContext(source,context);context.document.addEventListener=original;return listeners}
function dispatch(listeners,target,cleanup){let stopped=false;const event={target,defaultPrevented:false,stopImmediatePropagation(){stopped=true}};for(const {callback}of listeners){callback(event);if(stopped)break}if(!stopped)cleanup?.();return stopped}
const context=vm.createContext({window:{},document:{addEventListener(){}}}),listeners=install(context);
assert.equal(listeners.length,1);assert.equal(listeners[0].options.capture,true,'guard runs before target cleanup handlers');
let cleanup=0;const dialog={tagName:'DIALOG',open:false};
assert.equal(dispatch(listeners,dialog,()=>cleanup++),false);assert.equal(cleanup,1,'a genuinely closed dialog still runs its cleanup');
dialog.open=true;
assert.equal(dispatch(listeners,dialog,()=>cleanup++),true);assert.equal(cleanup,1,'queued close from the previous opening cannot clean up the new session');
assert.equal(dispatch(listeners,{tagName:'DIV',open:true},()=>cleanup++),false,'unrelated events are untouched');
assert.equal(install(context).length,0,'repeated installation adds no duplicate listener');
// Protect a real reopened editor from its existing close consumer.
(async()=>{
 const {boot,raw}=require('./helpers/category-seller-harness.cjs'),h=boot();
 const guarded=install(h.context),modal=h.node('#modal');modal.tagName='DIALOG';
 h.run('window.FasSellerUI.openEditor("draft-initial")');modal.close();
 h.run('window.FasSellerUI.openEditor("draft-initial")');
 h.setRaw({...raw,name:'Новое окно редактора сохранено'});
 const oldClose=modal.events.close;
 assert.equal(dispatch(guarded,modal,()=>oldClose()),true);
 await h.publish();
 assert(h.run('cars.some(lot=>lot.name==="Новое окно редактора сохранено")'),'a stale native close cannot erase the reopened editor before publication');
 console.log('PASS: native queued-close isolation, ordinary cleanup, unrelated events, idempotence and preservation of an actual reopened seller editor.');
})().catch(error=>{console.error(error);process.exitCode=1});
