const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const root=path.resolve(__dirname,'..'),KEY='fas-seller-workspace-v1';
const defer=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};

function boot(){
 const h=setup({mobile:true}),records={},cleanup=[],workspace={version:1,profile:{id:'owner',displayName:'Продавец',phone:'+79991234567'},drafts:Array.from({length:3},(_,i)=>({id:'draft-'+i,ownerId:'owner',data:{category:i?'trucks':'cars',name:'Черновик '+i,city:'Воронеж'},mediaRefs:[{id:'idb:photo-'+i}],updatedAt:new Date().toISOString()}))};
 records[KEY]=JSON.stringify(workspace);
 let rejectSave=false,shows=0,deleteMedia=async()=>({deleted:[],kept:[]});
 h.add('account','button');h.add('account-label','span',h.document.querySelector('#account'));h.add('reels-login','button');
 const setAttribute=h.Element.prototype.setAttribute;h.Element.prototype.setAttribute=function(key,value){setAttribute.call(this,key,value);if(key==='hidden')this.hidden=true};
 const focus=h.Element.prototype.focus;h.Element.prototype.focus=function(settings){this.focusOptions=settings;focus.call(this)};
 Object.defineProperties(h.Element.prototype,{nextElementSibling:{get(){const list=this.parentElement?.children||[];return list[list.indexOf(this)+1]||null}},previousElementSibling:{get(){const list=this.parentElement?.children||[];return list[list.indexOf(this)-1]||null}}});
 const remove=h.Element.prototype.remove;h.Element.prototype.remove=function(){remove.call(this);const detach=n=>{n.isConnected=false;n.children.forEach(detach)};detach(this);this.parentElement=null};
 let scroll=0;Object.defineProperty(h.modal,'scrollHeight',{get(){return 900+h.content.querySelectorAll('.seller-row').length*300+(h.content.querySelector('.seller-empty')?40:0)},configurable:true});
 Object.defineProperty(h.modal,'scrollTop',{get(){return Math.min(scroll,Math.max(0,this.scrollHeight-this.clientHeight))},set(value){scroll=Math.max(0,Math.min(Number(value)||0,this.scrollHeight-this.clientHeight))},configurable:true});
 Object.assign(h.context,{
  localStorage:{getItem:key=>records[key]??null,setItem(key,value){if(rejectSave&&key===KEY)throw Error('quota');records[key]=value}},
  escapeText:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  cars:[],bids:{},categoryNames:{cars:'Легковые автомобили',trucks:'Грузовики'},
  showModalContent(html){shows++;h.content.innerHTML=html;h.modal.showModal()},
  money:value=>String(value),current:lot=>lot.price,image:()=>'',normalizePhone:value=>value,
  FasSellerMedia:{serializeLot:lot=>lot,deleteMedia(...args){cleanup.push(args);return deleteMedia(...args)},hydrateLots:async()=>{}},
 });
 vm.runInContext(fs.readFileSync(path.join(root,'dist/seller-rules.js'),'utf8'),h.context);
 vm.runInContext(fs.readFileSync(path.join(root,'dist/listing-quotas.js'),'utf8'),h.context);
 h.context.window.FasSellerMedia=h.context.FasSellerMedia;
 vm.runInContext(fs.readFileSync(path.join(root,'dist/seller-ui.js'),'utf8'),h.context);
 const open=tab=>h.context.FasSellerUI.openDashboard(tab);
 const action=button=>{assert(button,'the requested delete action exists');h.document.activeElement=button;return h.docEvents.click.at(-1)({target:button,preventDefault(){}})};
 const request=id=>action(h.content.querySelector('[data-seller-delete="'+id+'"]'));
 const click=id=>request(id);
 return {...h,records,cleanup,open,click,request,get shows(){return shows},setRejectSave(value){rejectSave=value},setDeleteMedia(fn){deleteMedia=fn}};
}

(async()=>{
 {
  const h=boot();h.open('draft');assert.equal(h.content.querySelector('[data-seller-delete-confirmation]'),null,'one deliberate delete is the whole action');await h.click('draft-1');assert.equal(JSON.parse(h.records[KEY]).drafts.length,2);assert.equal(h.cleanup.length,1);assert.equal(h.modal.open,true);
 }
 {
  const h=boot();h.open('draft');const stale=h.content.querySelector('[data-seller-delete="draft-1"]');h.open('all');const before=h.records[KEY];await h.docEvents.click.at(-1)({target:stale,preventDefault(){}});assert.equal(h.records[KEY],before,'a detached action from a replaced dashboard cannot delete');assert.equal(h.cleanup.length,0);
  const nested=h.add('nested-draft-test','dialog');nested.showModal();await h.click('draft-1');assert.equal(h.records[KEY],before,'a covered cabinet cannot delete through the top dialog');assert.equal(h.cleanup.length,0);nested.close();await h.click('draft-1');assert.equal(JSON.parse(h.records[KEY]).drafts.length,2);
 }
 for(const tab of ['all','draft'])for(const id of ['draft-0','draft-1','draft-2']){
  const h=boot();h.open(tab);const shell=h.content.firstChild,list=h.content.querySelector('.seller-list'),tabs=h.content.querySelector('.seller-tabs'),unchanged=h.content.querySelector('[data-seller-delete="'+(id==='draft-0'?'draft-1':'draft-0')+'"]').closest('.seller-row');
  tabs.scrollLeft=130;h.modal.scrollTop=760;const before=h.modal.scrollTop,shows=h.shows;
  await h.click(id);
  assert.equal(h.content.firstChild===shell,true,'delete preserves the dashboard shell');assert.equal(h.content.querySelector('.seller-list')===list,true,'delete preserves the current list');assert.equal(h.content.querySelector('.seller-tabs')===tabs,true);
  assert.equal(unchanged.parentElement===list,true,'neighbor row is retained, not rebuilt');assert.equal(h.shows,shows,'deletion must not reopen the dashboard');
  assert.equal(h.modal.scrollTop,before,'first/middle/last deletion preserves a valid viewport offset');assert.equal(tabs.scrollLeft,130,'tab strip offset is preserved');
  assert.equal(h.content.querySelector('[data-seller-delete="'+id+'"]'),null);assert.equal(h.content.querySelectorAll('.seller-row').length,2);
  assert.equal(h.content.querySelector('[data-seller-tab="'+tab+'"]').getAttribute('aria-pressed'),'true','current All/Drafts tab stays active');
  assert.equal(JSON.parse(h.records[KEY]).drafts.length,2);assert.equal(String(h.content.querySelector('[data-seller-count="draft"]').textContent),'2');assert.equal(String(h.content.querySelector('[data-seller-count="all"]').textContent),'2','combined All count updates in place as well');
  assert(h.document.activeElement.isConnected!==false,'focus moves to a surviving action');assert.equal(h.document.activeElement.focusOptions?.preventScroll,true,'focus restoration does not scroll');
 }
 {
  const h=boot();h.open('draft');h.modal.scrollTop=1000;const shell=h.content.firstChild;
  await h.click('draft-2');assert.equal(h.modal.scrollTop,800,'only the new scroll maximum clamps the bottom');
  await h.click('draft-1');assert.equal(h.modal.scrollTop,500);
  await h.click('draft-0');assert.equal(h.content.firstChild===shell,true);assert(h.content.querySelector('.seller-empty'));assert.equal(h.content.querySelectorAll('.seller-row').length,0);assert.equal(h.modal.scrollTop,240);assert.equal(String(h.content.querySelector('[data-seller-count="draft"]').textContent),'0');
 }
 {
  const h=boot();h.open('all');h.modal.scrollTop=700;const row=h.content.querySelector('[data-seller-delete="draft-1"]').closest('.seller-row'),before=h.records[KEY];h.setRejectSave(true);
  await h.click('draft-1');assert.equal(h.records[KEY],before);assert.equal(h.modal.scrollTop,700);assert(row.parentElement);assert.equal(h.cleanup.length,0,'no media cleanup after failed metadata write');assert.equal(h.content.querySelectorAll('.seller-row').length,3);
  assert.equal(row.querySelector('[data-seller-delete]').disabled,false,'a failed write restores the same action for retry');h.setRejectSave(false);await h.click('draft-1');assert.equal(JSON.parse(h.records[KEY]).drafts.length,2,'one-click removal can retry safely after storage recovers');assert.equal(h.cleanup.length,1);
 }
 {
  const h=boot();h.context.cars.push({id:99,sellerOwnerId:'owner',name:'Опубликованный лот',category:'cars',city:'Воронеж',price:100,status:'live',startsAt:new Date(Date.now()-60000).toISOString(),ends:new Date(Date.now()+86400000).toISOString(),mediaRefs:[{id:'idb:photo-0'},{id:'idb:published-photo'}]});h.open('all');
  await h.click('draft-0');
  const keep=h.cleanup[0][2].keepRefs.map(ref=>ref.id);
  assert(keep.includes('idb:photo-0'),'a file shared with a published lot remains protected');assert(keep.includes('idb:published-photo'));assert(keep.includes('idb:photo-1'),'surviving draft files remain protected');
 }
 for(const failedCleanup of [false,true]){
  const h=boot(),media=defer();h.open('draft');h.modal.scrollTop=700;h.setDeleteMedia(()=>media.promise);const confirmedButton=h.content.querySelector('[data-seller-delete="draft-1"]'),pending=h.click('draft-1');
  assert.equal(h.content.querySelector('[data-seller-delete="draft-1"]'),null,'row disappears before asynchronous media cleanup');assert.equal(JSON.parse(h.records[KEY]).drafts.length,2);assert.equal(h.modal.scrollTop,700);
  await h.docEvents.click.at(-1)({target:confirmedButton,preventDefault(){}});assert.equal(h.cleanup.length,1,'a repeated click on a detached action cannot start a second removal during cleanup');
  h.context.showModalContent('<div id="other-window">Другое окно</div>');h.modal.scrollTop=160;const other=h.content.firstChild,shows=h.shows;
  if(failedCleanup)media.reject(Error('IDB disabled'));else media.resolve({deleted:[],kept:[]});await pending;assert.equal(h.content.firstChild===other,true);assert.equal(h.modal.scrollTop,160);assert.equal(h.shows,shows,'late cleanup cannot reopen the draft list');
 }
 console.log('PASS: explicit one-click draft deletion keeps ownership/top-dialog/attached-action guards, tab/rows/scroll, retry after storage failure, shared media and late-cleanup isolation.');
})().catch(error=>{console.error(error);process.exitCode=1});
