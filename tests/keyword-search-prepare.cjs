const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function boot(options={}){
 const tasks=[],context={window:{},performance:{now:options.now||(()=>0)},setTimeout(fn){tasks.push(fn)},current:lot=>lot.price};vm.createContext(context);vm.runInContext(fs.readFileSync('dist/search-intent.js','utf8'),context);vm.runInContext(fs.readFileSync('dist/keyword-search.js','utf8'),context);
 return{api:context.window.FasKeywordSearch,tasks,step(){assert(tasks.length);tasks.shift()()},finish(){while(tasks.length)tasks.shift()()}};
}
(async()=>{
 let h=boot(),reads=0,progress=[];const lots=Array.from({length:251},(_,index)=>({id:index+1,get name(){reads++;return 'Компрессор '+index},description:'Обслуживание по регламенту',powerHp:150,price:45000}));
 const pending=h.api.prepare(lots,'обслуживание',{onProgress:value=>progress.push({...value})});assert.equal(reads,0,'indexing starts after a task boundary');assert.equal(h.tasks.length,1);
 h.step();assert.equal(reads,100,'each task is bounded by 100 lots');assert.equal(h.tasks.length,1);h.finish();let result=await pending;assert(!result.cancelled);assert.equal(result.prepared,251);assert.equal(result.chunks,3);assert.equal(progress.at(-1).prepared,251);
 assert(h.api.matches(lots[200],'обслуживание'));
 const before=reads;result=await h.api.prepare(lots,'обслуживание');assert.equal(result.chunks,0,'fully cached queries need no deferred tasks');assert.equal(h.tasks.length,0);assert.equal(reads,before);
 const numberWork=h.api.prepare(lots,'150');h.finish();assert(!(await numberWork).cancelled);const unitWork=h.api.prepare(lots,'150 hp');h.finish();assert(!(await unitWork).cancelled);assert(h.api.matches(lots[200],'150 hp'),'unit indexes can be added after number-only preparation');
 h=boot();let cancelled=false;reads=0;const cancelledWork=h.api.prepare(lots,'обслуживание',{cancelled:()=>cancelled});h.step();assert.equal(reads,100);cancelled=true;h.finish();result=await cancelledWork;assert(result.cancelled);assert.equal(reads,100,'cancelled work never indexes remaining listings');
 h=boot();const invalidated=h.api.prepare(lots,'обслуживание');h.api.invalidate();h.finish();assert((await invalidated).cancelled,'cache invalidation cancels an in-flight inventory snapshot');
 h=boot();const noQuery=await h.api.prepare(lots,'');assert.equal(noQuery.chunks,0);assert.equal(h.tasks.length,0,'empty search does not warm unrelated content');
 let now=0;h=boot({now:()=>now++});const timed=h.api.prepare(lots,'обслуживание');h.step();assert.equal(h.tasks.length,1);h.finish();result=await timed;assert(result.chunks>3,'time budget yields before the per-task row limit');assert(result.maxChunkMs<=10,'one row and clock measurement may cross the 8ms budget');
 console.log('PASS: bounded yielding preparation, cached fast path, numeric/unit upgrade, cancellation, invalidation, progress and no unrequested warming.');
})().catch(error=>{console.error(error);process.exitCode=1});
