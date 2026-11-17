const assert=require('node:assert/strict');
const {boot}=require('./helpers/category-seller-harness.cjs');
const h=boot(),storage=h.context.localStorage,originalSet=storage.setItem;
storage.removeItem=key=>{delete h.records[key]};
let rejectedKey=null;storage.setItem=(key,value)=>{if(key===rejectedKey)throw Error('quota');originalSet(key,value)};
const run=h.run;
function reject(key){rejectedKey=key}
function bind(buttons={}){h.node('#modal-content').querySelectorAll=selector=>buttons[selector]||[];run('openSubscriptions()')}
function baseline(){reject(null);run("subscriptions=[{id:'saved',category:'cars',regionCode:'36',maxPrice:null,search:null,active:true,knownIds:subscriptionInventory().live.map(c=>c.id)}];lotNotices=[{id:'notice',type:'new-lot',subscriptionId:'saved',lotId:1042,name:'Тестовый лот',createdAt:new Date().toISOString(),read:false}];saveSubscriptions()")}
// The actual create handler must keep its form/search and avoid a success toast on quota failure.
run("subscriptions=[];lotNotices=[];pendingSavedSearch={query:'Toyota',category:'cars',regionCode:'36',values:Object.fromEntries(ADV_IDS.map(id=>[id,'']))};openSubscriptions(true)");
h.node('#sub-category').value='cars';h.node('#sub-region').value='36';h.node('#sub-budget').value='';
reject('fas-subscriptions');h.node('#subscription-form').onsubmit({preventDefault(){}});
assert.equal(run('subscriptions.length'),0);assert.equal(h.records['fas-subscriptions'],undefined);assert.equal(run('pendingSavedSearch.query'),'Toyota');assert(h.node('#toast').textContent.includes('Не удалось сохранить'));
reject(null);h.node('#subscription-form').onsubmit({preventDefault(){}});
assert.equal(run('subscriptions.length'),1);assert.equal(JSON.parse(h.records['fas-subscriptions']).length,1);assert.equal(run('pendingSavedSearch'),null);assert(h.node('#toast').textContent.includes('Подписка создана'));
// Exercise the real toggle/delete bindings rather than duplicating their implementation.
baseline();const toggle={dataset:{toggleSub:'saved'}};bind({'[data-toggle-sub]':[toggle]});
reject('fas-subscriptions');toggle.onclick();assert.equal(run('subscriptions[0].active'),true);assert.equal(JSON.parse(h.records['fas-subscriptions'])[0].active,true);
reject(null);toggle.onclick();assert.equal(run('subscriptions[0].active'),false);assert.equal(JSON.parse(h.records['fas-subscriptions'])[0].active,false);
baseline();const remove={dataset:{deleteSub:'saved'}};bind({'[data-delete-sub]':[remove]});const before={subs:h.records['fas-subscriptions'],notices:h.records['fas-notices']};
reject('fas-subscriptions');remove.onclick();assert.equal(run('subscriptions.length'),1);assert.equal(run('lotNotices.length'),1);assert.equal(h.records['fas-subscriptions'],before.subs);assert.equal(h.records['fas-notices'],before.notices,'second-key failure rolls back the first key');
reject(null);remove.onclick();assert.equal(run('subscriptions.length'),0);assert.equal(run('lotNotices.length'),0);assert.deepEqual(JSON.parse(h.records['fas-subscriptions']),[]);assert.deepEqual(JSON.parse(h.records['fas-notices']),[]);
// Mark-read failures leave unread state intact in memory and in durable storage.
baseline();bind();const unread=h.records['fas-notices'];reject('fas-notices');h.node('#read-all-notices').onclick();assert.equal(run('lotNotices[0].read'),false);assert.equal(h.records['fas-notices'],unread);
reject(null);h.node('#read-all-notices').onclick();assert.equal(run('lotNotices[0].read'),true);assert.equal(JSON.parse(h.records['fas-notices'])[0].read,true);
// A failed discovery save is retryable and cannot consume the new lot silently.
baseline();run("lotNotices=[];saveSubscriptions();refreshSubscriptions();cars.push({id:999777100,name:'Новое имущество',category:'cars',subcategory:'cars',regionCode:'36',city:'Воронеж',price:100000,start:100000,step:1000,deposit:0,ends:new Date(Date.now()+86400000).toISOString()});invalidateSubscriptionInventory()");
reject('fas-notices');run('refreshSubscriptions()');assert.equal(run('lotNotices.length'),0);assert.equal(run('subscriptions[0].knownIds.includes(999777100)'),false);
reject(null);run('refreshSubscriptions()');assert.equal(run('lotNotices.length'),1);assert.equal(run('subscriptions[0].knownIds.includes(999777100)'),true);
run('refreshSubscriptions()');assert.equal(run('lotNotices.length'),1,'successful retry stays deduplicated');
console.log('PASS: subscription create/toggle/delete/read/discovery are durable, quota failures keep state and failed notice discovery retries once.');
