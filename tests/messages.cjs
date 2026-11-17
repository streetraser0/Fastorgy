const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {integration}=require('./helpers/category-multi-harness.cjs');
const source=fs.readFileSync(path.join(__dirname,'../dist/messages.js'),'utf8');
function storageFixture(){const values=new Map();let blocked=false;return {values,getItem:key=>values.get(key)??null,setItem(key,value){if(blocked)throw Error('quota');values.set(key,String(value))},block:value=>blocked=value}}
{
 const storage=storageFixture(),context={Date,JSON,Number,Object,Set,Error,encodeURIComponent};vm.createContext(context);vm.runInContext(source.split('\n(()=>{')[0],context);
 const store=context.createFasMessageDraftStore({storage,now:()=>1700000000000}),empty=store.read('alice');assert.equal(empty.owner,'alice');assert.equal(empty.drafts.length,0);
 const row={lotId:10,sellerKey:'private:seller',body:'Осмотр в субботу?'},saved=store.save('alice',empty,row);
 assert.equal(store.read('alice').drafts[0].body,row.body);assert.equal(store.read('bob').drafts.length,0);assert.notEqual(store.key('alice'),store.key('alice|child'));
 assert.throws(()=>store.save('bob',saved,row),/актуальный список/,'an owner snapshot cannot be rebound to another profile');assert.equal(store.read('bob').drafts.length,0);
 assert.throws(()=>store.save('alice',empty,{...row,body:'overwrite'}),/другой вкладке/);assert.equal(store.read('alice').drafts[0].body,row.body);
 for(const changed of [{lotId:-1},{body:'a'.repeat(4001)},{body:'a\0b'},{sellerKey:''}])assert.throws(()=>store.save('alice',saved,{...row,...changed}));
 storage.block(true);assert.throws(()=>store.save('alice',saved,{...row,body:'quota'}),/не сохранён/);storage.block(false);assert.equal(store.read('alice').drafts[0].body,row.body);
 const second=store.save('alice',saved,{...row,lotId:11,body:'Другой вопрос'});assert.throws(()=>store.remove('bob',second,11,row.sellerKey),/другом профиле/);const removed=store.remove('alice',second,10,row.sellerKey);assert.deepEqual(Array.from(removed.drafts,row=>row.lotId),[11]);
 storage.values.set(store.key('broken'),'{');assert.throws(()=>store.read('broken'),/повреждены/);
 storage.values.set(store.key('foreign'),JSON.stringify({version:1,owner:'alice',drafts:[]}));assert.throws(()=>store.read('foreign'),/другому профилю/);
 let escaped=store.read('escaped'),hitLimit=false;for(let id=1;id<=40;id++){const before=storage.getItem(store.key('escaped'));try{escaped=store.save('escaped',escaped,{...row,lotId:id,body:'\n'.repeat(4000)})}catch(reason){assert.match(reason.message,/общего лимита/);assert.equal(storage.getItem(store.key('escaped')),before);assert.equal(store.read('escaped').drafts.length,escaped.drafts.length);hitLimit=true;break}}assert(hitLimit,'serialized escaping limit must be checked before writing an unreadable snapshot');
 let capped=store.read('capacity');for(let id=1;id<=40;id++)capped=store.save('capacity',capped,{...row,lotId:id});assert.throws(()=>store.save('capacity',capped,{...row,lotId:41}),/40 черновиков/);
}
const lot={id:999910051,name:'Toyota для осмотра',category:'cars',subcategory:'cars',brand:'Toyota',price:100000,start:100000,step:1000,deposit:0,status:'live',ends:'2099-01-01T00:00:00Z',city:'Воронеж',regionCode:'36',latitude:51.66,longitude:39.2,bank:'Банк Пример',sellerType:'bank',demo:true};
function boot(){
 const h=integration({fixtures:[lot]});h.field('modal').appendChild(h.field('modal-content'));h.context.location.href='https://auction.example/path?old=1';let network=0;h.context.fetch=()=>{network++;throw Error('Messages cannot send traffic')};h.context.window.fetch=h.context.fetch;
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/dialog-lifecycle.js'),'utf8'),h.context);
 vm.runInContext(source,h.context);const api=h.context.window.FasMessages;assert(api);
 const click=node=>{const event=h.click(node);h.dispatchClick(event);return event};
 const show=()=>{h.run('openCar('+lot.id+')');const entry=h.field('modal-content').querySelector('[data-message-lot]');assert(entry,'actual lot details include Write to seller');click(entry);return h.field('messages-dialog')};
 return {...h,api,click,show,network:()=>network,profile:()=>JSON.parse(h.records['fas-seller-workspace-v1']),workspace(value){h.records['fas-seller-workspace-v1']=JSON.stringify(value);h.dispatchWindow('storage',{key:'fas-seller-workspace-v1'})}};
}
{
 const h=boot();h.run('openCar('+lot.id+')');const modal=h.field('modal'),content=h.field('modal-content'),bid=h.field('bid'),gallery=content.querySelector('.gallery-track'),entry=content.querySelector('[data-message-lot]');
 bid.value='149000';modal.scrollTop=560;gallery.scrollLeft=320;h.field('grid').scrollTop=2800;entry.focus();const profileBefore=h.records['fas-seller-workspace-v1'],financeBefore=h.run('JSON.stringify(bids)');
 h.click(entry);const dialog=h.field('messages-dialog'),input=dialog.querySelector('[data-message-body]');assert(dialog.open&&modal.open);assert(dialog.innerHTML.includes('не отправляет'));assert.equal(h.api.state().deliveryConnected,false);assert.equal(h.api.state().unreadCount,null,'no fabricated unread badge');assert(dialog.innerHTML.includes(lot.name));assert.equal(dialog.querySelector('[data-message-open-lot]').getAttribute('href'),'https://auction.example/path?lot='+lot.id);
 input.value='Можно посмотреть автомобиль в субботу?';h.click(dialog.querySelector('[data-message-save]'));const owner=h.api.state().owner,key='fas-message-drafts-v1:'+encodeURIComponent(owner),saved=JSON.parse(h.records[key]);assert.equal(saved.drafts[0].body,input.value);assert(dialog.querySelector('[data-message-status]').textContent.includes('не отправлен'));
 const boundInput=dialog.querySelector('[data-message-body]');dialog.dispatchEvent({type:'close'});assert(dialog.open);assert.equal(dialog.querySelector('[data-message-body]'),boundInput,'late close cannot clear a reopened/live conversation');
 assert(h.api.close());assert(!dialog.open&&modal.open);assert.equal(h.field('bid'),bid);assert.equal(bid.value,'149000');assert.equal(modal.scrollTop,560);assert.equal(gallery.scrollLeft,320);assert.equal(h.field('grid').scrollTop,2800);assert.equal(h.document.activeElement,entry);assert.equal(h.run('JSON.stringify(bids)'),financeBefore);assert.equal(h.records['fas-seller-workspace-v1'],profileBefore);assert.equal(h.network(),0);
 // Saving before canonical Back must be refused on quota failure, without losing input.
 h.click(entry);const retry=dialog.querySelector('[data-message-body]');retry.value='Второй несохранённый вопрос';const originalSet=h.context.localStorage.setItem;h.context.localStorage.setItem=(name,value)=>{if(name.startsWith('fas-message-drafts-v1:'))throw Error('quota');return originalSet(name,value)};
 const backSource=fs.readFileSync(path.join(__dirname,'../dist/back-swipe.js'),'utf8').split('function fasDialogSwipeHeaders')[0];vm.runInContext(backSource,h.context);h.context.performFasDialogBack(dialog);assert(dialog.open);assert.equal(dialog.querySelector('[data-message-body]'),retry);assert.equal(retry.value,'Второй несохранённый вопрос');assert.match(dialog.querySelector('[data-messages-error]').textContent,/не сохранён/);assert.equal(JSON.parse(h.records[key]).drafts[0].body,saved.drafts[0].body);
 h.click(dialog.querySelector('[data-message-cancel-edit]'));assert.equal(dialog.querySelector('[data-message-body]').value,saved.drafts[0].body);assert(h.api.close(),'explicit cancellation can leave a form when durable storage is unavailable');h.context.localStorage.setItem=originalSet;
 h.click(entry);h.click(dialog.querySelector('[data-message-discard]'));assert(!dialog.querySelector('[data-message-delete-confirm]').hidden);assert.equal(h.api.close(),false,'Back first leaves the delete decision');assert(dialog.open);assert(dialog.querySelector('[data-message-delete-confirm]').hidden);assert.equal(JSON.parse(h.records[key]).drafts.length,1);
 h.click(dialog.querySelector('[data-message-discard]'));h.click(dialog.querySelector('[data-message-delete-confirmed]'));assert.equal(JSON.parse(h.records[key]).drafts.length,0);assert(dialog.innerHTML.includes('Здесь будут'));assert(h.api.close());
}
{
 const h=boot(),dialog=h.show(),profile=h.profile(),owner=h.api.state().owner,input=dialog.querySelector('[data-message-body]');input.value='Секретный несохранённый вопрос профиля А';const rawBefore=h.records['fas-message-drafts-v1:'+encodeURIComponent(owner)];
 h.workspace({...profile,profile:{...profile.profile,id:owner+'|child',displayName:'Другой профиль'}});assert.equal(h.api.state().owner,owner+'|child');assert(!dialog.innerHTML.includes('Секретный'));assert.equal(h.records['fas-message-drafts-v1:'+encodeURIComponent(owner+'|child')],undefined,'profile switch cannot write someone else’s draft');assert.equal(h.records['fas-message-drafts-v1:'+encodeURIComponent(owner)],rawBefore);
 h.workspace(profile);assert.equal(h.api.state().owner,owner);const recovered=dialog.querySelector('[data-message-thread]');assert(recovered);h.click(recovered);assert.equal(dialog.querySelector('[data-message-body]').value,'Секретный несохранённый вопрос профиля А');assert(dialog.innerHTML.includes('Текст ещё не записан'));
 h.click(dialog.querySelector('[data-message-save]'));assert.equal(JSON.parse(h.records['fas-message-drafts-v1:'+encodeURIComponent(owner)]).drafts[0].body,'Секретный несохранённый вопрос профиля А');
 const before=JSON.stringify(h.records);h.run('cars[0].sellerOwnerId="new-seller-owner"');dialog.querySelector('[data-message-body]').value='Нельзя переадресовать новому продавцу';h.click(dialog.querySelector('[data-message-save]'));assert.match(dialog.querySelector('[data-messages-error]').textContent,/изменились/);assert.equal(JSON.stringify(h.records),before,'same lot ID cannot transfer a question to a replacement seller');h.click(dialog.querySelector('[data-message-cancel-edit]'));h.api.close();
 assert.equal(h.api.openLot(lot.id),false,'own or unavailable context is not guessed');
}
{
 const h=boot();h.context.window.FasSellerUI.openDashboard('profile');const form=h.field('seller-profile-form'),name=form.querySelector('[name="displayName"]'),entry=h.field('modal').querySelector('[data-messages-open]');assert(entry,'Cabinet has a separate Messages section');name.value='Несохранённый профиль';h.field('modal').scrollTop=420;const workspace=h.records['fas-seller-workspace-v1'];let formReads=0;h.context.FormData=function(){formReads++;throw Error('Messages must not save dirty profile')};
 h.click(entry);const dialog=h.field('messages-dialog');assert(dialog.open);assert.equal(h.field('seller-profile-form'),form);assert.equal(name.value,'Несохранённый профиль');assert.equal(h.records['fas-seller-workspace-v1'],workspace);assert.equal(formReads,0);h.api.close();assert.equal(h.field('modal').scrollTop,420);assert.equal(h.document.activeElement,entry);assert.equal(formReads,0);
}
{
 const h=boot(),dialog=h.show();dialog.querySelector('[data-message-body]').value='</textarea><img src=x onerror=evil()> & "вопрос"';h.click(dialog.querySelector('[data-message-save]'));h.api.openInbox();assert(!dialog.querySelector('img[src="x"]'));assert(dialog.innerHTML.includes('&lt;'));const thread=dialog.querySelector('[data-message-thread]');h.click(thread);assert.equal(dialog.querySelector('[data-message-body]').value,'</textarea><img src=x onerror=evil()> & "вопрос"');
 const oldButton=dialog.querySelector('[data-message-save]'),input=dialog.querySelector('[data-message-body]');input.value='Внешняя вкладка сохранила другое';const owner=h.api.state().owner,key='fas-message-drafts-v1:'+encodeURIComponent(owner),stored=JSON.parse(h.records[key]);stored.drafts[0].body='Текст другой вкладки';h.records[key]=JSON.stringify(stored);h.click(oldButton);assert.match(dialog.querySelector('[data-messages-error]').textContent,/другой вкладке/);assert.equal(input.value,'Внешняя вкладка сохранила другое');assert.equal(JSON.parse(h.records[key]).drafts[0].body,'Текст другой вкладки');
 const other=h.document.createElement('dialog');h.document.body.appendChild(other);other.showModal();const snapshot=JSON.stringify(h.records);assert.equal(h.api.close(),false);h.click(oldButton);assert.equal(JSON.stringify(h.records),snapshot,'a covered form cannot save through a stale control');other.close();
}
{
 const h=boot(),dialog=h.show();dialog.querySelector('[data-message-body]').value='Сохранить перед возвратом';h.click(dialog.querySelector('[data-message-save]'));
 const dispatch=dialog.dispatchEvent.bind(dialog),queued=[];dialog.dispatchEvent=event=>{if(event.type==='close'){queued.push(event);return true}return dispatch(event)};
 assert(h.api.close());assert.equal(queued.length,1);h.run('openCar('+lot.id+')');h.field('modal').scrollTop=88;h.field('bid').value='188000';const currentBid=h.field('bid');
 dispatch(queued.shift());assert.equal(h.field('modal').scrollTop,88,'old queued close must not restore a new lot view to an obsolete position');assert.equal(h.field('bid'),currentBid);assert.equal(currentBid.value,'188000');
}
{
 const h=boot(),read=h.context.localStorage.getItem;h.context.localStorage.getItem=()=>{throw Error('blocked')};assert(h.api.openInbox());const dialog=h.field('messages-dialog');assert.equal(h.api.state().owner,'');assert(dialog.innerHTML.includes('Здесь будут'));assert(h.api.close(),'an empty inbox must remain dismissible when identity storage is blocked');assert(!dialog.open);h.context.localStorage.getItem=read;
 h.records['fas-seller-workspace-v1']='{';assert(h.api.openInbox());assert.equal(h.api.state().owner,'');assert.equal(h.api.openLot(lot.id),false);assert.equal(dialog.querySelector('[data-message-body]'),null);assert(h.api.close(),'a corrupted workspace cannot trap the user or fall back to stale private drafts');
}
{
 const h=boot(),dialog=h.show(),profile=h.profile();dialog.querySelector('[data-message-body]').value='Единственная копия профиля А';h.workspace({...profile,profile:{...profile.profile,id:'other-profile'}});assert(h.api.close());let warned=false;const event={preventDefault(){warned=true}};h.dispatchWindow('beforeunload',event);assert(warned,'a retained memory-only draft must warn even after its owner switched and the clean inbox closed');assert.equal(event.returnValue,'');
}
{
 const h=boot();h.run('openCar('+lot.id+')');const content=h.field('modal-content'),entry=content.querySelector('[data-message-lot]');assert(entry);
 h.run('window.messageFindCalls=0;window.messageFindOriginal=cars.find;cars.find=function(...args){window.messageFindCalls++;return window.messageFindOriginal.apply(this,args)}');
 for(let n=0;n<100;n++)h.api.decorate();
 assert.equal(h.context.window.messageFindCalls,0,'unchanged countdown/price observer updates never look up the catalogue after the Messages entry exists');
 assert.equal(content.querySelector('[data-message-lot]'),entry,'repeated decoration preserves the existing control');
 const nextId=lot.id+1;h.run('cars.push({...cars[0],id:'+nextId+',name:"Другой актуальный лот"});openCar('+nextId+')');
 const current=content.querySelector('[data-message-lot]');assert(current);assert.notEqual(current,entry);assert.equal(Number(current.dataset.messageLot),nextId,'a replacement lot view still gets its own Messages entry');
 h.click(entry);assert.equal(h.api.state().open,false,'the old detached entry cannot open a thread for a different current lot');
 h.click(current);assert.equal(h.api.state().lotId,nextId,'the current entry retains normal validated navigation');
}
console.log('PASS: truthful draft-only messages, owner/CAS/limits, actual lot and Cabinet entry, canonical Back/quota/explicit discard, bid/photo/profile/scroll preservation, replacement-seller and profile-change boundaries, escaping, bounded observer work and no delivery/network claims.');
