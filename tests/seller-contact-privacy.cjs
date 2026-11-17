const assert=require('node:assert/strict');
const {boot,raw}=require('./helpers/category-seller-harness.cjs');

(async()=>{
 const h=boot(),phone='+79991234567';let fileSequence=0;
 const disk=()=>JSON.parse(h.records['fas-lots']||'[]');
 const lot=id=>disk().find(item=>item.id===id);
 const existingIds=()=>new Set(disk().map(item=>item.id));
 const changedDescription='Уточнённое описание: имущество обслужено, доступно для осмотра по договорённости.';
 h.context.window.FasSellerMedia.storeFiles=async()=>[{id:'idb:contact-photo-'+(++fileSequence),kind:'image',size:1024}];
 async function setProfileContact(showPhone){
  await h.click({sellerTab:'profile'});
  assert.match(h.node('#modal-content').innerHTML,/Показывать мой телефон в новых объявлениях/);
  h.workspace.profile.showPhone=showPhone;
  h.setRaw({...raw,showPhone});
  assert.equal(h.node('#seller-profile-form').onsubmit({preventDefault(){}}),true);
  h.setRaw({...raw});
 }
 async function publishNew(name){
  const before=existingIds();
  await h.click({sellerNew:''});h.setRaw({...raw,name});
  const files=h.node('#seller-files');files.files=[{name:'photo.jpg'}];
  await files.events.change({target:files});
  await h.publish();
  const created=disk().find(item=>!before.has(item.id));assert(created,'the actual form publishes a new listing');return created;
 }
 async function describe(id){
  await h.click({sellerEdit:String(id)});h.setRaw({...raw,description:changedDescription});await h.publish();
  assert.equal(lot(id).description,changedDescription,'the descriptive edit actually commits');
 }
 // Start through the cabinet and its existing draft, without bypassing the click/submit handlers.
 h.node('#account').onclick();await h.click({sellerEdit:'draft-initial'});await h.publish();
 const privateLot=disk().find(item=>item.sellerOwnerId);assert(privateLot);assert.equal(privateLot.publicContact,'');
 await setProfileContact(true);await describe(privateLot.id);
 assert.equal(lot(privateLot.id).publicContact,'','enabling contact for NEW listings cannot reveal the phone on an old private listing');
 const publicLot=await publishNew('Новое объявление с телефоном');
 assert.equal(publicLot.publicContact,phone,'a newly created listing follows the enabled profile setting');
 await setProfileContact(false);await describe(publicLot.id);
 assert.equal(lot(publicLot.id).publicContact,phone,'disabling contact for NEW listings cannot silently remove contact from an old public listing');
 const nextPrivate=await publishNew('Новое объявление без телефона');
 assert.equal(nextPrivate.publicContact,'','another new listing follows the current disabled profile setting');
 // A repeated listing has a new identity and follows the current choice, even if its source was public.
 await h.click({sellerStatus:String(publicLot.id),nextStatus:'cancelled'});
 assert.match(h.node('#modal-content').innerHTML,new RegExp('data-seller-copy="'+publicLot.id+'"'));
 const before=existingIds();await h.click({sellerCopy:String(publicLot.id)});
 h.setRaw({...raw,name:'Повторный лот без телефона'});await h.publish();
 const copy=disk().find(item=>!before.has(item.id));assert(copy);assert.equal(copy.publicContact,'');
 assert.equal(lot(publicLot.id).publicContact,phone,'copying does not alter the source contact');
 console.log('PASS: cabinet profile changes apply contact visibility only to new/repeated listings; descriptive edits preserve both private and public existing contacts.');
})().catch(error=>{console.error(error);process.exitCode=1});
