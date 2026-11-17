const assert=require('node:assert/strict');
const {boot,raw}=require('./helpers/category-seller-harness.cjs');
const KEY='fas-seller-workspace-v1',clone=value=>JSON.parse(JSON.stringify(value));
const disk=h=>JSON.parse(h.records[KEY]);
function external(h,change){const next=disk(h);change(next);h.records[KEY]=JSON.stringify(next);return next}
function open(h,id='draft-initial'){h.run('window.FasSellerUI.openEditor('+JSON.stringify(id)+')')}
const save=h=>h.click({sellerSave:''});
async function remove(h,id){
 const row={};const target={dataset:{sellerDelete:id},closest:selector=>selector==='button,a'?target:selector==='.seller-row'?row:null,matches:selector=>selector==='[data-seller-delete]'};
 h.dispatchClick({target,preventDefault(){}});await Promise.resolve();
}

function failWorkspace(h){const original=h.context.localStorage.setItem;h.context.localStorage.setItem=(key,value)=>{if(key===KEY)throw Error('quota');return original(key,value)};return()=>h.context.localStorage.setItem=original}
(async()=>{
 // A different tab creates a draft or changes the profile while this editor is open.
 {
  const h=boot({noMedia:true});open(h);h.setRaw({...raw,name:'Изменения первой вкладки'});
  external(h,ws=>{ws.profile.displayName='Новое имя во второй вкладке';ws.drafts.push({...clone(ws.drafts[0]),id:'draft-other',data:{...raw,name:'Другой черновик'}})});
  await save(h);const saved=disk(h);assert.equal(saved.drafts.length,2);assert.equal(saved.drafts.find(d=>d.id==='draft-other').data.name,'Другой черновик');assert.equal(saved.drafts.find(d=>d.id==='draft-initial').data.name,'Изменения первой вкладки');assert.equal(saved.profile.displayName,'Новое имя во второй вкладке');
 }
 // A deleted unrelated draft stays deleted when a stale tab saves a different one.
 {
  const h=boot({noMedia:true});external(h,ws=>ws.drafts.push({...clone(ws.drafts[0]),id:'draft-other'}));h.run('window.FasSellerUI.openDashboard()');open(h);external(h,ws=>ws.drafts=ws.drafts.filter(d=>d.id!=='draft-other'));h.setRaw({...raw,name:'Сохраняем текущий'});await save(h);assert.deepEqual(disk(h).drafts.map(d=>d.id),['draft-initial']);
 }
 // Same-draft concurrent edits preserve the other tab and create a separate recovery copy.
 for(const deleted of [false,true]){
  const h=boot({noMedia:true});open(h);h.setRaw({...raw,name:'Моя незаписанная версия'});
  external(h,ws=>{if(deleted)ws.drafts=[];else ws.drafts[0].data.name='Версия другой вкладки'});
  await save(h);assert.equal(disk(h).drafts.length,deleted?0:1);if(!deleted)assert.equal(disk(h).drafts[0].data.name,'Версия другой вкладки');
  assert(h.node('#seller-error').textContent.includes('отдельной копии'));
  await save(h);const drafts=disk(h).drafts,recovered=drafts.find(d=>d.data.name==='Моя незаписанная версия');assert(recovered);assert.notEqual(recovered.id,'draft-initial');assert.equal(recovered.memoryOnly,undefined,'a successful retry is a normal durable draft');if(deleted)assert(!drafts.some(d=>d.id==='draft-initial'),'the removed draft is not resurrected');else assert(drafts.some(d=>d.id==='draft-initial'&&d.data.name==='Версия другой вкладки'));
 }
 // Failed autosave during navigation retains the latest input in the current page.
 {
  const h=boot({noMedia:true});open(h);h.setRaw({...raw,name:'Важное несохранённое описание'});const restore=failWorkspace(h);
  h.run('window.FasSellerUI.leave();window.FasSellerUI.openDashboard()');assert(h.node('#modal-content').innerHTML.includes('Важное несохранённое описание'));assert(h.node('#modal-content').innerHTML.includes('Не записан в память браузера'));assert.equal(disk(h).drafts[0].data.name,raw.name);
  restore();open(h);assert(h.node('#modal-content').innerHTML.includes('Важное несохранённое описание'),'reopening restores in-memory input rather than stale stored fields');await save(h);assert.equal(disk(h).drafts[0].data.name,'Важное несохранённое описание');h.run('window.FasSellerUI.openDashboard()');assert(!h.node('#modal-content').innerHTML.includes('Не записан в память браузера'),'successful persistence clears the recovery-only label');
 }
 // A completely new draft remains reachable after quota failure too.
 {
  const h=boot({noMedia:true});open(h,null);h.setRaw({...raw,name:'Новый черновик без места'});const restore=failWorkspace(h);h.run('window.FasSellerUI.openDashboard()');const html=h.node('#modal-content').innerHTML;assert(html.includes('Новый черновик без места'));const ids=[...html.matchAll(/data-seller-edit="([^"]+)"/g)].map(match=>match[1]),id=ids.find(value=>value!=='draft-initial');assert(id);restore();open(h,id);assert(h.node('#modal-content').innerHTML.includes('Новый черновик без места'));await save(h);assert(disk(h).drafts.some(d=>d.id===id&&d.data.name==='Новый черновик без места'));
 }
 // A never-persisted recovery copy can be discarded without a quota-sensitive write.
 {
  const h=boot({noMedia:true});open(h,null);h.setRaw({...raw,name:'Ненужная копия в памяти'});const restore=failWorkspace(h);h.run('window.FasSellerUI.openDashboard()');const id=[...h.node('#modal-content').innerHTML.matchAll(/data-seller-edit="([^"]+)"/g)].map(match=>match[1]).find(value=>value!=='draft-initial');assert(id);
  await remove(h,id);restore();h.run('window.FasSellerUI.openDashboard()');assert(!h.node('#modal-content').innerHTML.includes('Ненужная копия в памяти'));assert.deepEqual(disk(h).drafts.map(d=>d.id),['draft-initial']);
 }
 // A changed owner/cleared workspace cannot silently be replaced by an old tab.
 for(const changedOwner of [true,false]){
  const h=boot({noMedia:true});open(h);h.setRaw({...raw,name:'Старый кабинет'});if(changedOwner)external(h,ws=>{ws.profile.id='another-owner';ws.drafts=[]});else delete h.records[KEY];const before=h.records[KEY];await save(h);assert.equal(h.records[KEY],before);assert(h.node('#seller-error').textContent.includes('другой вкладке'));
 }
 // Removing one draft protects media newly referenced by another tab's draft.
 {
  const h=boot();h.run('window.FasSellerUI.openDashboard()');const reference=disk(h).drafts[0].mediaRefs[0].id;external(h,ws=>ws.drafts.push({...clone(ws.drafts[0]),id:'draft-shared'}));let kept=[];h.context.window.FasSellerMedia.deleteMedia=async(ids,owner,options)=>{kept=options.keepRefs.map(value=>value.id||value);return{deleted:[],kept:ids}};await remove(h,'draft-initial');assert.deepEqual(disk(h).drafts.map(d=>d.id),['draft-shared']);assert(kept.includes(reference),'the merged workspace protects the other tab’s photo');
 }
 // Profile edits cannot discard newly created remote drafts, nor replace a concurrently edited profile.
 {
  const h=boot({noMedia:true});h.run('window.FasSellerUI.openDashboard("profile")');external(h,ws=>ws.drafts.push({...clone(ws.drafts[0]),id:'draft-added'}));h.context.FormData=function(){return Object.entries({...h.workspace.profile,displayName:'Моё имя'})};h.node('#seller-profile-form').onsubmit({preventDefault(){}});assert(disk(h).drafts.some(d=>d.id==='draft-added'));assert.equal(disk(h).profile.displayName,'Моё имя');
  h.run('window.FasSellerUI.openDashboard("profile")');external(h,ws=>ws.profile.displayName='Имя другой вкладки');h.context.FormData=function(){return Object.entries({...h.workspace.profile,displayName:'Конкурирующее имя'})};h.node('#seller-profile-form').onsubmit({preventDefault(){}});assert.equal(disk(h).profile.displayName,'Имя другой вкладки');assert(h.node('#seller-error').textContent.includes('Профиль изменён'));
 }
 console.log('PASS: three-way seller workspace merging, concurrent draft/profile conflict copies, deleted-draft preservation, quota navigation recovery/retry, new unsaved drafts, changed-owner/cleared storage guards and shared-media protection.');
})().catch(error=>{console.error(error);process.exitCode=1});
