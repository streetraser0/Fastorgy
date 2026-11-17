const assert=require('assert/strict');
const {boot,raw}=require('./helpers/category-seller-harness.cjs');
const KEY='fas-seller-workspace-v1',tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(){
 const h=boot({fixtureInventory:[]}),cleanup=[];
 h.context.window.FasSellerMedia.deleteMedia=async(...args)=>{cleanup.push(args);return {deleted:[],kept:[]}};
 h.run('window.FasSellerUI.openEditor("draft-initial")');
 const form=h.node('#seller-listing-form'),modal=h.node('#modal');
 const remove={dataset:{sellerEditorDelete:''},disabled:false,isConnected:true,closest(selector){return selector.includes('button')?this:null},matches(selector){return selector==='[data-seller-editor-delete]'}};
 form.contains=target=>target===remove;
 async function click(){h.dispatchClick({target:remove,preventDefault(){}});await tick()}
 return {...h,cleanup,remove,modal,click,disk:()=>JSON.parse(h.records[KEY])};
}
(async()=>{
 {
  const h=setup();h.setRaw({...raw,name:'Изменения перед явным удалением'});
  assert(!h.node('#modal-content').innerHTML.includes('data-seller-delete-confirmation'));
  await h.click();assert.equal(h.disk().drafts.length,0);assert.equal(h.cleanup.length,1);assert.equal(h.modal.open,true);assert.match(h.node('#modal-content').innerHTML,/Черновиков пока нет/);
  h.run('window.FasSellerUI.openDashboard("draft")');assert.equal(h.disk().drafts.length,0,'leaving the editor cannot autosave the explicitly removed draft back');
  await h.click();assert.equal(h.cleanup.length,1,'the old editor action cannot delete again');
 }
 {
  const h=setup(),saved=h.context.localStorage.setItem;let writes=0;
  h.context.localStorage.setItem=(key,value)=>{if(key===KEY&&++writes===2)throw Error('quota');return saved(key,value)};
  await h.click();assert.equal(h.disk().drafts.length,1);assert.equal(h.cleanup.length,0,'failed deletion metadata commit retains media');assert.equal(h.remove.disabled,false);
  h.context.localStorage.setItem=saved;await h.click();assert.equal(h.disk().drafts.length,0,'the same explicit action can retry after storage recovery');
 }
 {
  const h=setup();h.run('window.FasSellerUI.openDashboard("draft")');const before=h.records[KEY];
  await h.click();assert.equal(h.records[KEY],before,'a stale editor action after leaving cannot delete');assert.equal(h.cleanup.length,0);
 }
 {
  const h=setup();h.context.localStorage.setItem=()=>{throw Error('quota')};await h.click();
  assert.equal(h.cleanup.length,0);assert.equal(h.disk().drafts.length,1,'a failed safe save keeps the latest draft and blocks deletion');assert(h.node('#seller-error').textContent);
 }
 {
  const h=setup(),ref=h.disk().drafts[0].mediaRefs[0],published={id:99,name:'Опубликованный лот',sellerOwnerId:h.workspace.profile.id,status:'live',category:'cars',price:1000,startsAt:new Date(Date.now()-60000).toISOString(),ends:new Date(Date.now()+3600000).toISOString(),mediaRefs:[ref]};
  h.run('cars=['+JSON.stringify(published)+']');h.records['fas-lots']=JSON.stringify([published]);const original=h.records['fas-lots'];await h.click();
  assert.equal(h.records['fas-lots'],original,'explicit editor draft deletion never changes a published lot');assert.equal(h.run('cars.length'),1);assert.equal(h.cleanup.length,1);assert(h.cleanup[0][2].keepRefs.some(item=>item.id===ref.id),'shared published media remains protected');
 }
 console.log('PASS: one-click editor draft deletion, metadata failure retry, safe-save failure retention, stale action isolation, no autosave resurrection and preserved published lots/shared media.');
})().catch(error=>{console.error(error);process.exitCode=1});
