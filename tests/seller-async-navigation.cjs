const assert=require('node:assert/strict');
const {boot}=require('./helpers/category-seller-harness.cjs');

const settle=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
function setup(){const h=boot();h.run('window.__sellerAsyncToasts=[];toast=message=>window.__sellerAsyncToasts.push(message)');h.run('window.FasSellerUI.openEditor("draft-initial")');return h}
const notices=h=>Array.from(h.context.window.__sellerAsyncToasts);
const savedLots=h=>JSON.parse(h.records['fas-lots']||'[]');
const savedWorkspace=h=>JSON.parse(h.records['fas-seller-workspace-v1']);

(async()=>{
 // The durable publication must survive navigation while its media hydration finishes.
 {
  const h=setup(),hydration=deferred();let cleanupCalls=0;
  h.context.window.FasSellerMedia.hydrateLots=()=>hydration.promise;
  h.context.window.FasSellerMedia.deleteMedia=async()=>{cleanupCalls++;return {deleted:[],kept:[]}};
  const publishing=h.publish();await settle();
  assert.equal(savedLots(h).length,1);assert.equal(savedWorkspace(h).drafts.length,0);
  h.run('showModalContent("<h2>Пользователь открыл поиск</h2>")');h.node('#modal').scrollTop=321;
  const currentView=h.node('#modal-content').innerHTML;
  hydration.resolve([]);await publishing;
  assert.equal(h.node('#modal-content').innerHTML,currentView,'late hydration must keep the new view');
  assert.equal(h.node('#modal').scrollTop,321);assert.equal(cleanupCalls,1,'cleanup must still finish');
  assert.equal(savedLots(h).length,1);assert.deepEqual(notices(h),[],'publication must not notify over another view');
 }
 // Closing the main dialog while cleanup is pending must not reopen the cabinet.
 {
  const h=setup(),cleanup=deferred();let cleanupCalls=0;
  h.context.window.FasSellerMedia.deleteMedia=()=>{cleanupCalls++;return cleanup.promise};
  const publishing=h.publish();await settle();
  assert.equal(savedLots(h).length,1);assert.equal(cleanupCalls,1);
  h.node('#modal').close();h.node('#modal').events.close();
  cleanup.resolve({deleted:[],kept:[]});await publishing;
  assert.equal(h.node('#modal').open,false,'late cleanup must not reopen a closed dialog');
  assert.equal(savedWorkspace(h).drafts.length,0);assert.deepEqual(notices(h),[]);
 }
 // A separate category picker is not a navigation away from the main seller view.
 {
  const h=setup(),hydration=deferred();h.context.window.FasSellerMedia.hydrateLots=()=>hydration.promise;
  const publishing=h.publish();await settle();
  h.node('#category-picker').showModal();h.node('#category-picker').close();
  hydration.resolve([]);await publishing;
  assert.match(h.node('#modal-content').innerHTML,/Личный кабинет/);
  assert.deepEqual(notices(h),['Лот добавлен в демокаталог этого устройства']);
 }
 // Navigation before validation finishes must keep the draft without publishing it.
 {
  const h=setup(),media=deferred();await settle();
  h.context.window.FasSellerMedia.getMedia=()=>media.promise;
  const publishing=h.publish();h.run('showModalContent("<h2>Другое окно</h2>")');
  media.resolve([{type:'image',ref:'idb:image-12345678'}]);await publishing;
  assert.equal(savedLots(h).length,0);assert.equal(savedWorkspace(h).drafts.length,1);
  assert.match(h.node('#modal-content').innerHTML,/Другое окно/);assert.deepEqual(notices(h),[]);
 }
 // An old delete failure must not put errors into a newly opened editor.
 {
  const h=setup(),deletion=deferred();await settle();
  h.context.window.FasSellerMedia.deleteMedia=()=>deletion.promise;
  const removing=h.click({sellerMediaRemove:'idb:image-12345678'});
  h.run('window.FasSellerUI.openEditor()');h.node('#seller-error').textContent='';
  deletion.reject(Error('IDB delete failed'));await removing;
  assert.equal(h.node('#seller-error').textContent,'');assert.deepEqual(notices(h),[]);
 }
 // A newer successful media render supersedes rejection from an older read.
 {
  const h=boot(),initial=deferred();let reads=0;
  h.run('window.__sellerAsyncToasts=[];toast=message=>window.__sellerAsyncToasts.push(message)');
  h.context.window.FasSellerMedia.getMedia=()=>++reads===1?initial.promise:Promise.resolve([]);
  h.run('window.FasSellerUI.openEditor("draft-initial")');
  await h.click({sellerMediaRemove:'idb:image-12345678'});await settle();
  initial.reject(Error('Obsolete initial read failed'));await settle();
  assert.equal(h.node('#seller-media-status').textContent,'0 материалов выбрано');
  assert.equal(h.node('#seller-error').textContent,'');assert.deepEqual(notices(h),[]);
 }
 // A failure in the current editor remains visible and does not undo durable removal.
 {
  const h=setup(),deletion=deferred();await settle();
  h.context.window.FasSellerMedia.deleteMedia=()=>deletion.promise;
  const removing=h.click({sellerMediaRemove:'idb:image-12345678'});
  deletion.reject(Error('IDB delete failed'));await removing;
  assert.match(h.node('#seller-error').textContent,/освободить память не удалось/);
  assert.equal(savedWorkspace(h).drafts[0].mediaRefs.length,0);assert.equal(notices(h).length,1);
 }
 console.log('PASS: durable publication cleanup preserves current/closed dialogs, separate category picker stays independent, and stale media errors cannot affect newer editors or renders.');
})().catch(error=>{console.error(error);process.exitCode=1});
