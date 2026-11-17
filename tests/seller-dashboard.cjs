const assert=require('assert/strict');
const {boot}=require('./helpers/category-seller-harness.cjs');

(async()=>{
 const h=boot(),now=Date.now();
 const base={sellerOwnerId:'seller-owner',category:'cars',city:'Воронеж',price:100000,start:100000,step:1000,deposit:0,startsAt:new Date(now-3600000).toISOString(),ends:new Date(now+86400000).toISOString()};
 const lots=[
  {...base,id:999990101,name:'Собственные активные торги',status:'live'},
  {...base,id:999990102,name:'Собственные запланированные торги',status:'scheduled',startsAt:new Date(now+3600000).toISOString()},
  {...base,id:999990103,name:'Собственные торги на паузе',status:'paused'},
  {...base,id:999990104,name:'Собственные завершённые торги',status:'live',startsAt:new Date(now-7200000).toISOString(),ends:new Date(now-3600000).toISOString()},
  {...base,id:999990105,name:'Собственное проданное имущество',status:'sold'},
  {...base,id:999990106,name:'Чужое объявление',sellerOwnerId:'another-owner',status:'live'}
 ];
 h.run('cars.push(...'+JSON.stringify(lots)+')');
 const html=()=>h.node('#modal-content').innerHTML;
 const count=(key)=>Number(html().match(new RegExp('data-seller-count="'+key+'">(\\d+)'))?.[1]);
 h.run('window.FasSellerUI.openDashboard("all")');
 assert.equal((html().match(/<button\b[^>]*data-seller-new\b/g)||[]).length,1,'one standalone creation action leads the cabinet');
 assert(html().includes('Разместить объявление'));
 assert.equal(count('all'),6);assert.equal(count('draft'),1);assert.equal(count('live'),1);assert.equal(count('scheduled'),1);assert.equal(count('archive'),3);
 assert(!html().includes('Чужое объявление'),'status counts and listing rows stay owner-scoped');
 assert(!html().includes('class="seller-stats"'),'count cards no longer duplicate status navigation');
 assert(html().includes('data-open-support'),'support remains available in the cabinet');
 assert(html().includes('class="seller-account-tabs"'),'the cabinet has dedicated lots and profile sections');
 assert(html().includes('data-seller-tab="all" aria-pressed="true"'),'the lots section is selected for the announcements list');
 assert(html().includes('<span>Мои лоты</span>'),'seller lots retain their own named tab inside the cabinet');
 for(const [tab,names]of [
  ['draft',['Частная Toyota Camry']],
  ['live',['Собственные активные торги']],
  ['scheduled',['Собственные запланированные торги']],
  ['archive',['Собственные торги на паузе','Собственные завершённые торги','Собственное проданное имущество']]
 ]){
  await h.click({sellerTab:tab});
  assert.equal((html().match(/<article class="seller-row">/g)||[]).length,names.length,tab+' displays only its own status rows');
  for(const name of names)assert(html().includes(name),name);
  assert(html().includes('data-seller-tab="'+tab+'" class="on" aria-pressed="true"'));
 }
 await h.click({sellerTab:'profile'});
 assert(html().includes('id="seller-profile-form"'),'profile remains reachable from the compact shortcuts');
 assert(html().includes('data-seller-tab="profile" aria-pressed="true"'),'profile becomes the selected cabinet section');
 assert(html().includes('data-seller-tab="all" aria-pressed="false"'),'the lots section remains reachable from profile');
 assert(html().includes('data-seller-bids'),'personal bids are also reachable inside the cabinet');
 let myBidOpens=0,backToCabinet;
 h.context.window.FasAuctionNotifications={openMyBids(options){myBidOpens++;backToCabinet=options.onBack}};
 await h.click({sellerBids:''});assert.equal(myBidOpens,1,'cabinet bids use the same bid view as the quick navigation');assert.equal(typeof backToCabinet,'function');
 backToCabinet();assert(html().includes('id="seller-profile-form"'),'returning from bids restores the profile tab that opened them');
 assert(html().includes('data-seller-tab="all"'),'profile provides a route back to announcements');
 await h.click({sellerTab:'all'});assert.equal((html().match(/<article class="seller-row">/g)||[]).length,6);
 await h.click({sellerFavorites:''});assert.equal(h.run('tab'),'fav','favorites shortcut keeps its existing action');
 h.run('window.FasSellerUI.openDashboard("all");window.dashboardNotificationOpens=0;openSubscriptions=()=>window.dashboardNotificationOpens++');
 await h.click({sellerSubscriptions:''});assert.equal(h.context.window.dashboardNotificationOpens,1,'notification shortcut keeps its existing action');

 const empty=boot({records:{'fas-seller-workspace-v1':JSON.stringify({version:1,profile:{id:'empty-owner',displayName:'Продавец',phone:'+79991234567'},drafts:[]})}});
 empty.run('window.FasSellerUI.openDashboard("all")');
 assert.equal((empty.node('#modal-content').innerHTML.match(/<button\b[^>]*data-seller-new\b/g)||[]).length,1,'empty lists do not add a second competing creation button');
 await empty.click({sellerNew:''});
 assert(empty.node('#modal-content').innerHTML.includes('id="seller-listing-form"'),'standalone creation button opens the placement form');
 console.log('PASS: standalone placement, owner-scoped status counts/filters, profile return, compact utility actions and a single creation entry in empty states.');
})().catch(error=>{console.error(error);process.exitCode=1});
