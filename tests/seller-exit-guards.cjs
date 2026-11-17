const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {boot,raw}=require('./helpers/category-seller-harness.cjs'),{setup}=require('./helpers/quickbar-dom.cjs');
const KEY='fas-seller-workspace-v1',read=name=>fs.readFileSync(path.join(__dirname,'../dist',name),'utf8');
const disk=h=>JSON.parse(h.records[KEY]),deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
function button(dataset){return {dataset,matches(selectors){return selectors.split(',').some(selector=>{const match=selector.match(/^\[data-([^\]]+)\]$/);return match&&Object.hasOwn(dataset,match[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase()))})},closest(selector){return selector==='button,a'||this.matches(selector)?this:null}}}
const click=(h,dataset)=>h.dispatchClick({target:button(dataset),preventDefault(){}});
function nativeCloseEvents(h){const modal=h.node('#modal'),close=modal.close.bind(modal);modal.close=()=>{close();modal.events.close?.()};return modal}
function escape(h){let prevented=false;h.node('#modal').events.cancel({preventDefault(){prevented=true}});if(!prevented)h.node('#modal').close();return prevented}
function failStorage(h){const setter=h.context.localStorage.setItem;h.context.localStorage.setItem=()=>{throw Error('quota')};return()=>{h.context.localStorage.setItem=setter}}
function voice(h){const dom=setup({mobile:true}),doc=h.context.document;doc.createElement=tag=>new dom.Element(tag);doc.body.appendChild=node=>dom.body.appendChild(node);vm.runInContext(read('voice-assistant.js'),h.context);return h.context.window.FasVoiceAssistant}

(async()=>{
 {
  const h=boot();nativeCloseEvents(h);vm.runInContext(read('auction-notifications.js'),h.context);
  let entered={...h.workspace.profile};h.context.FormData=function(form){return Object.entries(form.selector==='#seller-profile-form'?entered:raw)};
  const routes=[{sellerBids:''},{sellerNew:''},{sellerFavorites:''},{sellerSubscriptions:''},{sellerSms:''}];
  for(let index=0;index<routes.length;index++){
   h.run('window.FasSellerUI.openDashboard("profile")');entered={...disk(h).profile,displayName:'Сохранить профиль перед переходом '+index};click(h,routes[index]);
   assert.equal(disk(h).profile.displayName,entered.displayName,'actual seller route saves profile: '+Object.keys(routes[index])[0]);
   if(index===0){assert.match(h.node('#modal-content').innerHTML,/Мои ставки/);click(h,{myBidsBack:''});assert(h.node('#modal-content').innerHTML.includes(entered.displayName),'real My Bids Back restores the saved profile')}
  }
  h.run('window.FasSellerUI.openDashboard("profile")');entered={...disk(h).profile,displayName:'Не терять при ошибке'};const before=h.node('#modal-content').innerHTML,restore=failStorage(h);
  for(const route of routes){click(h,route);assert.equal(h.node('#modal-content').innerHTML,before);assert.equal(h.node('#modal').open,true);assert.equal(h.node('#seller-error').hidden,false)}restore();
  const remote=disk(h);remote.profile.displayName='Имя другой вкладки';h.records[KEY]=JSON.stringify(remote);click(h,{sellerBids:''});assert.equal(h.node('#modal-content').innerHTML,before);assert.equal(disk(h).profile.displayName,'Имя другой вкладки');assert.match(h.node('#seller-error').textContent,/Профиль изменён/);
 }
 {
  const h=boot(),modal=nativeCloseEvents(h);h.run('window.FasSellerUI.openEditor("draft-initial")');h.setRaw({...raw,name:'Сохранить перед крестиком'});const writes=h.writes.length;
  h.node('.close').onclick();assert.equal(modal.open,false);assert.equal(disk(h).drafts[0].data.name,'Сохранить перед крестиком');assert.equal(h.writes.length-writes,1,'guard and native close cleanup do not write the same draft twice');
  h.run('window.FasSellerUI.openDashboard("profile")');const profile={...disk(h).profile,displayName:'Профиль перед Escape'};h.context.FormData=function(form){return Object.entries(form.selector==='#seller-profile-form'?profile:raw)};assert.equal(escape(h),false);assert.equal(modal.open,false);assert.equal(disk(h).profile.displayName,profile.displayName);
  h.run('window.FasSellerUI.openDashboard("profile")');profile.phone='неверный номер';assert.equal(escape(h),true);assert.equal(modal.open,true);assert.match(h.node('#seller-error').textContent,/номер телефона/);
 }
 {
  const h=boot(),modal=nativeCloseEvents(h),upload=deferred(),deleted=[];h.run('window.FasSellerUI.openEditor("draft-initial")');h.setRaw({...raw,name:'Фото должно остаться'});
  h.context.window.FasSellerMedia.storeFiles=()=>upload.promise;h.context.window.FasSellerMedia.deleteMedia=async ids=>{deleted.push(...ids);return {deleted:ids,kept:[]}};
  const files=h.node('#seller-files');files.files=[{name:'important.jpg'}];files.value='selected';const pending=files.events.change({target:files});
  h.node('.close').onclick();assert.equal(modal.open,true);assert.equal(escape(h),true);modal.onclick({target:modal});assert.equal(modal.open,true);assert.match(h.node('#seller-error').textContent,/Фотографии ещё сохраняются/);
  upload.resolve([{id:'idb:important_12345678',kind:'image',size:100}]);await pending;assert.deepEqual(deleted,[]);assert(disk(h).drafts[0].mediaRefs.some(ref=>ref.id==='idb:important_12345678'));h.node('.close').onclick();assert.equal(modal.open,false);assert(disk(h).drafts[0].mediaRefs.some(ref=>ref.id==='idb:important_12345678'));
  h.run('window.FasSellerUI.openEditor("draft-initial")');h.setRaw({...raw,name:'Квота не закрывает форму'});const before=h.node('#modal-content').innerHTML,restore=failStorage(h);h.node('.close').onclick();assert.equal(escape(h),true);modal.onclick({target:modal});assert.equal(modal.open,true);assert.equal(h.node('#modal-content').innerHTML,before);assert.equal(h.node('#seller-error').hidden,false);restore();h.node('.close').onclick();assert.equal(modal.open,false);assert(disk(h).drafts.some(draft=>draft.data.name==='Квота не закрывает форму'));
 }
 {
  const h=boot(),modal=nativeCloseEvents(h),read=deferred();h.run('window.FasSellerUI.openEditor("draft-initial")');h.context.window.FasSellerMedia.getMedia=()=>read.promise;const pending=h.publish();h.node('.close').onclick();assert.equal(escape(h),true);modal.onclick({target:modal});assert.equal(modal.open,true);read.reject(Error('Материалы временно недоступны'));await pending;assert.equal(modal.open,true);assert.match(h.node('#seller-error').textContent,/Материалы временно недоступны/);assert.equal(JSON.parse(h.records['fas-lots']||'[]').length,0);
 }
 {
  const h=boot(),modal=nativeCloseEvents(h),assistant=voice(h);let recent=0;h.context.window.FasBuyerTools={openRecent(){recent++}};h.context.window.FasBackSwipe={back:()=>h.context.window.FasSellerUI.back()};
  h.run('window.FasSellerUI.openEditor("draft-initial")');h.setRaw({...raw,name:'Голос не теряет черновик'});const restore=failStorage(h),before=h.node('#modal-content').innerHTML,query=h.node('#search').value;
  for(const command of ['каталог','избранное','найди Toyota','открой ленту','недавно смотрел','сбрось поиск','назад']){assistant.open();const result=assistant.execute(command);assert.equal(result.ok,false,'unsafe voice exit is refused: '+command);assert.equal(modal.open,true);assert.equal(h.node('#modal-content').innerHTML,before);assert.equal(h.node('#search').value,query)}assert.equal(recent,0);restore();
  assistant.open();assert.equal(assistant.execute('каталог').ok,true);assert.equal(modal.open,false);assert(disk(h).drafts.some(draft=>draft.data.name==='Голос не теряет черновик'));
  h.run('window.FasSellerUI.openDashboard("profile")');const profile={...disk(h).profile,displayName:'Имя перед голосовым поиском'};h.context.FormData=function(form){return Object.entries(form.selector==='#seller-profile-form'?profile:raw)};assistant.open();assert.equal(assistant.execute('найди Toyota').ok,true);assert.equal(disk(h).profile.displayName,profile.displayName,'voice search saves the actual dirty profile before the main search closes it');
 }
 console.log('PASS: actual seller navigation and My Bids return preserve profile input; X/Escape/backdrop respect validation/quota/concurrent edits/pending media and publication, keep photos durable, avoid duplicate writes, and voice cannot bypass refused seller exits.');
})().catch(error=>{console.error(error);process.exitCode=1});
