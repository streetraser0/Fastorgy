const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const {boot}=require('./helpers/category-seller-harness.cjs');
(async()=>{
 const h=boot(),clicks=[],add=h.context.document.addEventListener;
 h.context.document.addEventListener=(type,handler,...rest)=>{if(type==='click')clicks.push(handler);return add(type,handler,...rest)};
 const content=h.node('#modal-content');content.querySelector=()=>null;content.firstChild=null;
 h.context.location.href='https://fas.example/?view=favorites#catalog';
 let shared;h.context.navigator.share=async data=>{shared=data};
 vm.runInContext(fs.readFileSync('dist/buyer-tools.js','utf8'),h.context);
 const id=h.run('cars.find(c=>c.demo&&!c.demoEdited&&isLotLive(c)).id');
 const card=h.run('cardHTML(cars.find(c=>c.id==='+id+'))');
 assert(card.includes('class="feed-share" data-buyer-share="'+id+'"'));
 h.run('reelsMode=true');
 const button={dataset:{buyerShare:String(id)}};
 const event={preventDefault(){},target:{closest:selector=>selector==='[data-buyer-share]'?button:null}};
 h.node('#grid').onclick(event);clicks.forEach(handler=>handler(event));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(shared.url,'https://fas.example/?lot='+id);
 assert(!h.node('#modal').open,'sharing from the feed does not open the lot card');
 // A failed clipboard request after leaving the feed must not open a new dialog.
 h.context.navigator.share=undefined;let reject;
 h.context.navigator.clipboard={writeText:()=>new Promise((_,fail)=>reject=fail)};
 const pending=h.context.window.FasBuyerTools.shareLot(id);
 h.run('reelsMode=false');reject(Error('permission'));
 const result=await pending;assert.equal(result.stale,true);assert(!h.node('#modal').open);
 console.log('PASS: share directly from feed without opening the lot; stale clipboard fallback cannot reopen a closed feed.');
})().catch(error=>{console.error(error);process.exitCode=1});
