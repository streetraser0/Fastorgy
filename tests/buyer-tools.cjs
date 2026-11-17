const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const source=fs.readFileSync(path.resolve(__dirname,'../dist/buyer-tools.js'),'utf8');
function boot(options={}){
 const h=setup({mobile:true}),records={...(options.records||{})},ctx=h.context;
 ctx.URL=URL;ctx.URLSearchParams=URLSearchParams;ctx.navigator=options.navigator||{};
 ctx.location={href:options.href||'https://fas.example/auction/?region=36&token=private#filters',search:options.search||''};
 ctx.localStorage={getItem:k=>records[k]??null,setItem(k,v){if(options.storageFail)throw Error('quota');records[k]=v},removeItem(k){if(options.storageFail)throw Error('denied');delete records[k]}};
 ctx.cars=Array.from({length:20},(_,i)=>({id:i+1,demo:true,name:'Имущество '+(i+1),category:'cars',city:'Воронеж',price:100000+i,ends:new Date(Date.now()+3600000).toISOString(),status:'live',image:'https://images.example/test.jpg'}));
 ctx.cars.push({id:100,name:'Частный диван',category:'other',city:'Воронеж',price:30000,status:'live',sellerOwnerId:'owner',ends:new Date(Date.now()+3600000).toISOString()});
 ctx.isLotLive=lot=>lot.status==='live'&&Date.parse(lot.ends)>Date.now();ctx.current=lot=>lot.price;ctx.money=value=>String(value)+' ₽';ctx.image=lot=>lot.image||'assets/other.svg';
 ctx.showModalContent=html=>{h.modal.classList.remove('lot-dialog');h.content.innerHTML=html;h.modal.open=true};
 ctx.openCar=id=>{h.calls.push(['open',id]);const lot=ctx.cars.find(x=>x.id===id);if(!lot||!ctx.isLotLive(lot)||options.rejectOpen)return;h.content.innerHTML='<div class="modal-body purchase-body"><h2>Лот</h2><div class="purchase-location"></div><div class="purchase-price"></div><form id="bid-form" data-lot-id="'+id+'"></form></div>';h.modal.classList.add('lot-dialog');h.modal.open=true};
 if(options.canonical){const canonical=h.add('canonical','link');canonical.setAttribute('rel','canonical');canonical.href=options.canonical}
 vm.runInContext(source,ctx);h.api=ctx.FasBuyerTools;h.records=records;return h;
}
(async()=>{
 const KEY='fas-recent-lots-v1';
 for(const raw of ['broken','null','{}','"text"']){const h=boot({records:{[KEY]:raw}});assert.deepEqual(Array.from(h.api.getRecentIds()),[])}
 {
  const h=boot({records:{[KEY]:'[1,1,"2",-1,3,null]'}});assert.deepEqual(Array.from(h.api.getRecentIds()),[1,3]);
  for(let id=1;id<=15;id++)h.context.openCar(id);
  assert.deepEqual(Array.from(h.api.getRecentIds()),[15,14,13,12,11,10,9,8,7,6,5,4]);assert.equal(JSON.parse(h.records[KEY]).length,12);assert(JSON.parse(h.records[KEY]).every(Number.isInteger));
  h.context.openCar(8);assert.equal(h.api.getRecentIds()[0],8);assert.equal(h.api.getRecentIds().length,12);
  h.context.openCar(999);assert.equal(h.api.getRecentIds()[0],8);h.context.cars.find(x=>x.id===8).status='ended';assert(!h.api.getRecentIds().includes(8));
  h.context.openCar(1);const tools=h.content.querySelector('.buyer-lot-tools');assert(tools);h.notify();assert.equal(h.content.querySelectorAll('.buyer-lot-tools').length,1);assert(tools.innerHTML.includes('доступом к сайту'));
  h.grid.scrollTop=4200;h.api.openRecent();assert.equal(h.grid.scrollTop,4200);assert(h.content.innerHTML.includes('Недавно смотрели'));assert(!h.content.innerHTML.includes('data-buyer-open="8"'));assert(h.modal.classList.contains('buyer-tools-dialog'));
  const photo=h.content.querySelector('[data-buyer-photo]');h.event('error',photo);assert.equal(photo.src,'assets/cars.svg');photo.src='second-failure';h.event('error',photo);assert.equal(photo.src,'second-failure');
  const queued=[];const nativeClose=h.modal.close;h.modal.close=function(){this.open=false;this.removeAttribute('open');queued.push(()=>this.dispatchEvent({type:'close'}))};
  h.api.openRecent();h.modal.close();h.api.openRecent();queued.shift()();assert(h.modal.classList.contains('buyer-tools-dialog'),'a queued old close preserves the newly opened history view');h.modal.close=nativeClose;
  h.context.openCar(1);assert(!h.modal.classList.contains('buyer-tools-dialog'));h.api.clearRecent();assert.deepEqual(Array.from(h.api.getRecentIds()),[]);assert(!h.content.innerHTML.includes('data-buyer-open='));assert(h.calls.some(call=>call[0]==='toast'&&call[1].includes('очищена')));
 }
 {
  const h=boot({rejectOpen:true});h.context.openCar(1);assert.deepEqual(Array.from(h.api.getRecentIds()),[],'failed open does not enter history');
  const blocked=boot({storageFail:true,records:{[KEY]:'[1]'}});blocked.api.clearRecent();assert.deepEqual(Array.from(blocked.api.getRecentIds()),[]);assert(blocked.calls.some(call=>call[0]==='toast'&&call[1].includes('не разрешил удалить')));
 }
 {
  const h=boot();assert.equal(h.api.buildShareURL(1),'https://fas.example/auction/?lot=1');assert.equal(h.api.buildShareURL(100),null);h.context.cars[0].demoEdited=true;assert.equal(h.api.buildShareURL(1),null);
  const native=boot({href:'https://localhost/index.html?private=secret',canonical:'https://fas.example/auction/'});assert.equal(native.api.buildShareURL(1),'https://fas.example/auction/?lot=1');assert.equal(boot({href:'capacitor://localhost/index.html'}).api.buildShareURL(1),null);
 }
 {
  const shared=[],copied=[];const h=boot({navigator:{share:async data=>shared.push(data),clipboard:{writeText:async text=>copied.push(text)}}});
  assert.equal((await h.api.shareLot(1)).method,'share');assert.equal(shared[0].url,'https://fas.example/auction/?lot=1');assert.equal(copied.length,0);
  const local=await h.api.shareLot(100);assert.equal(shared.length,1,'local announcement never enters Web Share');assert.equal(local.local,true);assert.equal(copied[0],'Лот № 100');assert(h.calls.some(call=>call[0]==='toast'&&call[1].includes('только на этом устройстве')));
  const cancel=boot({navigator:{share:async()=>{throw Object.assign(Error('cancel'),{name:'AbortError'})},clipboard:{writeText:async text=>copied.push(text)}}});assert.equal((await cancel.api.shareLot(1)).cancelled,true);assert.equal(copied.length,1,'cancel does not copy without a new action');
  const fallback=boot({navigator:{share:async()=>{throw Error('unsupported')},clipboard:{writeText:async text=>copied.push(text)}}});assert.equal((await fallback.api.shareLot(1)).method,'clipboard');assert.equal(copied.at(-1),'https://fas.example/auction/?lot=1');
  const manual=boot({navigator:{clipboard:{writeText:async()=>{throw Error('permission')}}}});const result=await manual.api.shareLot(1);assert.equal(result.ok,false);assert.equal(result.manual,true);const sheet=manual.document.querySelector('#buyer-copy-dialog');assert(sheet?.open);assert(sheet.innerHTML.includes('Ссылка на лот'));assert(sheet.innerHTML.includes('доступом к сайту'));assert(sheet.querySelector('#buyer-copy-value'));
  let rejectClipboard;const pending=boot({navigator:{clipboard:{writeText:()=>new Promise((resolve,reject)=>{rejectClipboard=reject})}}});pending.context.openCar(1);const waiting=pending.api.shareLot(1);pending.context.showModalContent('<form id="untouched-form">Новый черновик</form>');rejectClipboard(Error('denied'));assert.equal((await waiting).stale,true);assert(pending.content.innerHTML.includes('Новый черновик'),'late clipboard failure must not replace a different form');
  let rejectEntering;const entering=boot({navigator:{clipboard:{writeText:()=>new Promise((_,reject)=>{rejectEntering=reject})}}});entering.context.reelsMode=false;
  const enteringPending=entering.api.shareLot(1);entering.context.reelsMode=true;rejectEntering(Error('denied'));
  assert.equal((await enteringPending).stale,true,'a catalog share must not open a fallback over a subsequently opened feed');assert.equal(entering.modal.open,false);
  let rejectNative,lateCopies=0;const nativePending=boot({navigator:{share:()=>new Promise((_,reject)=>{rejectNative=reject}),clipboard:{writeText:async()=>lateCopies++}}});nativePending.context.reelsMode=false;
  const abandonedNative=nativePending.api.shareLot(1);nativePending.context.reelsMode=true;rejectNative(Error('unsupported'));
  assert.equal((await abandonedNative).stale,true);assert.equal(lateCopies,0,'a stale native failure must not copy old data into the new view');
  const requestCopies=[];const switched=boot({navigator:{clipboard:{writeText:value=>new Promise((resolve,reject)=>requestCopies.push({value,resolve,reject}))}}});
  switched.context.reelsMode=true;switched.context.visibleLots=switched.context.cars;switched.context.activeFeedIndex=()=>switched.context.feedPosition||0;
  const oldShare=switched.api.shareLot(1);switched.context.feedPosition=1;const newShare=switched.api.shareLot(2);
  assert.equal(requestCopies.length,2,'a new active lot can be shared without waiting for an abandoned permission prompt');
  requestCopies[0].reject(Error('old denied'));assert.equal((await oldShare).stale,true);assert.equal(switched.modal.open,false);
  assert.equal((await switched.api.shareLot(2)).busy,true,'old cleanup cannot unlock a newer pending share');requestCopies[1].resolve();assert.equal((await newShare).ok,true);
  // Returning to the first lot cannot revive a superseded request (A -> B -> A).
  for(const oldSucceeds of [false,true]){
   const requests=[],aba=boot({navigator:{clipboard:{writeText:value=>new Promise((resolve,reject)=>requests.push({value,resolve,reject}))}}});
   aba.context.reelsMode=true;aba.context.visibleLots=aba.context.cars;aba.context.activeFeedIndex=()=>aba.context.feedPosition||0;
   const old=aba.api.shareLot(1);aba.context.feedPosition=1;const latest=aba.api.shareLot(2);aba.context.feedPosition=0;
   if(oldSucceeds)requests[0].resolve();else requests[0].reject(Error('old denied'));
   const result=await old;assert.equal(oldSucceeds?result.ok:result.stale,true,'a completed OS copy may succeed, but an obsolete failure must stay stale');
   assert.equal(aba.modal.open,false,'a superseded copy cannot open manual fallback after returning to the original lot');
   assert(!aba.calls.some(call=>call[0]==='toast'&&call[1].includes('скопирована')),'a superseded successful copy stays quiet');
   aba.context.feedPosition=1;assert.equal((await aba.api.shareLot(2)).busy,true,'obsolete completion cannot unlock the latest share');requests[1].resolve();assert.equal((await latest).ok,true);
  }
  {
   const requests=[],copied=[],aba=boot({navigator:{share:value=>new Promise((resolve,reject)=>requests.push({value,resolve,reject})),clipboard:{writeText:async value=>copied.push(value)}}});
   aba.context.reelsMode=true;aba.context.visibleLots=aba.context.cars;aba.context.activeFeedIndex=()=>aba.context.feedPosition||0;
   const old=aba.api.shareLot(1);aba.context.feedPosition=1;const latest=aba.api.shareLot(2);aba.context.feedPosition=0;
   requests[0].reject(Error('old native unavailable'));assert.equal((await old).stale,true);assert.equal(copied.length,0,'a superseded native failure must not start an old clipboard fallback');assert.equal(aba.modal.open,false);
   aba.context.feedPosition=1;assert.equal((await aba.api.shareLot(2)).busy,true);requests[1].resolve();assert.equal((await latest).ok,true);
  }
  let rejectClosed;const closed=boot({navigator:{clipboard:{writeText:()=>new Promise((resolve,reject)=>{rejectClosed=reject})}}});closed.context.openCar(1);const closing=closed.api.shareLot(1);closed.modal.close();rejectClosed(Error('denied'));assert.equal((await closing).stale,true);assert.equal(closed.modal.open,false,'late failure must not reopen a closed lot');
  let resolveCopy;const silent=boot({navigator:{clipboard:{writeText:()=>new Promise(resolve=>{resolveCopy=resolve})}}});silent.context.openCar(1);const copying=silent.api.shareLot(1);silent.context.showModalContent('<form>Another form</form>');resolveCopy();assert.equal((await copying).ok,true);assert(!silent.calls.some(call=>call[0]==='toast'&&call[1].includes('скопирована')),'late copy completion leaves an unrelated form quiet');
 }
 {
  const h=boot({search:'?lot=2'});assert.equal(h.api.getRecentIds()[0],2);assert(h.modal.open);assert.equal(h.content.querySelector('#bid-form').dataset.lotId,'2');
  for(const search of ['?lot=100','?lot=0','?lot=bad','?lot=999']){const invalid=boot({search});assert.equal(invalid.modal.open,false);assert.deepEqual(Array.from(invalid.api.getRecentIds()),[])}
 }
 console.log('PASS: bounded device-local history, dedupe/clear/storage failures, available-only restore, single decoration, safe demo deep links, native canonical URL, local lot privacy, share cancellation/clipboard/manual copy and image fallback.');
})().catch(error=>{console.error(error);process.exitCode=1});
