const assert=require('node:assert/strict');
const {boot,raw}=require('./helpers/category-seller-harness.cjs');
const KEY='fas-seller-workspace-v1';
const disk=h=>JSON.parse(h.records[KEY]);

(async()=>{
 for(const concurrentChange of [false,true]){
  const h=boot();h.node('#account').onclick();await h.click({sellerEdit:'draft-initial'});
  const editorHTML=h.node('#modal-content').innerHTML;
  assert.match(editorHTML,/<textarea name="description"[^>]*required minlength="20"/,'the description exposes its requirement to assistive technology');
  assert.match(editorHTML,/Обязательно для размещения: от 20 символов/);
  assert.match(editorHTML,/Для размещения нужно хотя бы 1 фото/);
  h.setRaw({...raw,name:'Мой неполный черновик',description:'Коротко',startPrice:''});
  await h.click({sellerTab:'profile'});
  assert.equal(disk(h).drafts[0].data.description,'Коротко','an incomplete description still saves as a draft');
  assert.equal(disk(h).drafts[0].data.startPrice,'','a price is required for publication, not for saving the draft');
  assert.match(h.node('#modal-content').innerHTML,/data-seller-profile-cancel[^>]*>Отменить изменения/);
  const unchangedProfile={...disk(h).profile};
  h.context.FormData=function(form){return Object.entries(form.selector==='#seller-profile-form'?{...unchangedProfile,displayName:'Несохранённое имя',phone:'123'}:raw)};
  await h.click({sellerTab:'all'});assert.match(h.node('#seller-error').textContent,/российский номер/);
  h.node('.close').onclick();assert.equal(h.node('#modal').open,true,'ordinary close still cannot bypass profile validation');
  if(concurrentChange){const updated=disk(h);updated.profile.displayName='Имя, сохранённое в другой вкладке';updated.drafts.push({...updated.drafts[0],id:'draft-other'});h.records[KEY]=JSON.stringify(updated)}
  const before=h.records[KEY],lotsBefore=h.records['fas-lots'],writesBefore=h.writes.length;
  const setItem=h.context.localStorage.setItem;h.context.localStorage.setItem=()=>{throw Error('No write is allowed while discarding unsaved profile input')};
  await h.click({sellerProfileCancel:''});h.context.localStorage.setItem=setItem;
  assert.equal(h.records[KEY],before,'cancellation never writes over the workspace or another tab’s profile/drafts');
  assert.equal(h.records['fas-lots'],lotsBefore,'cancellation never changes current lots');assert.equal(h.writes.length,writesBefore);
  assert.equal(h.node('#modal').open,true);assert.match(h.node('#modal-content').innerHTML,/Мои объявления/);assert(!h.node('#modal-content').innerHTML.includes('id="seller-profile-form"'),'cancel returns to the seller’s listing dashboard');
  assert.equal(h.context.window.FasSellerUI.getProfile().displayName,concurrentChange?'Имя, сохранённое в другой вкладке':unchangedProfile.displayName);
  assert.equal(disk(h).drafts.find(d=>d.id==='draft-initial').data.name,'Мой неполный черновик');
  await h.click({sellerEdit:'draft-initial'});assert.match(h.node('#modal-content').innerHTML,/Мой неполный черновик/,'the saved listing remains recoverable after cancelling the profile');
 }
 console.log('PASS: explicit profile cancellation discards only unsaved form input without writes, preserves concurrent workspace/lots and incomplete drafts, and retains the ordinary close validation guard; required description/photo hints appear before submit.');
})().catch(error=>{console.error(error);process.exitCode=1});
