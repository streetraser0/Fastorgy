const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');const {setup}=require('./helpers/quickbar-dom.cjs');const source=fs.readFileSync(path.resolve(__dirname,'../dist/quickbar.js'),'utf8');
function run(options={}){const h=setup(options);h.context.FasAuctionNotifications={bidSummary:()=>({total:0,outbidCount:0,rows:[]}),openMyBids(){h.calls.push(['bids']);h.modal.open=true}};vm.runInContext(source,h.context);h.flush();h.dock=h.document.querySelector('#quick-access');assert.strictEqual(h.document.querySelector('#reels-position'),h.position);assert.strictEqual(h.position.parentElement,h.dock);assert.equal(h.oldReelsBottom.contains(h.position),false);assert.equal(h.position.textContent,'Лот 42 из 100 · ∞');h.action=key=>h.document.querySelector('[data-quick="'+key+'"]');return h}
{
 const h=run({mobile:true});assert.equal(h.dock.hidden,false);assert.equal(h.dock.querySelectorAll('[data-quick]').length,6);
 h.context.saved=[1,2];h.notify();const badge=h.document.querySelector('#quick-favorite-count');assert.equal(badge.textContent,'2');assert.equal(badge.hidden,false);h.context.saved=[];h.notify();assert.equal(badge.hidden,true);
 h.click(h.action('favorites'));assert.equal(h.context.tab,'fav');assert(h.calls.some(([kind,value])=>kind==='tab'&&value==='fav'));assert.equal(h.action('favorites').getAttribute('aria-current'),'page');
 h.context.reelsMode=true;h.body.classList.add('reels');h.click(h.action('catalog'));assert.equal(h.context.reelsMode,false);assert.equal(h.context.tab,'all');assert(h.calls.some(([kind,id])=>kind==='scroll'&&id==='lot-results'));
 h.click(h.action('search'));assert(h.calls.some(([kind])=>kind==='search'));assert.equal(h.document.activeElement.id,'search');assert.equal(h.dock.hidden,true,'focused input hides dock');h.document.activeElement=h.body;h.event('focusout');assert.equal(h.dock.hidden,false);
 h.click(h.action('sell'));assert(h.calls.some(([kind])=>kind==='sell'));h.notify();assert.equal(h.dock.hidden,true,'seller dialog hides dock');h.modal.close();h.flush();assert.equal(h.dock.hidden,false);
 h.click(h.action('bids'));assert(h.calls.some(([kind])=>kind==='bids'));h.notify();assert.equal(h.dock.hidden,true);h.modal.close();h.flush();
}
{
 const h=run({mobile:false});assert.equal(h.dock.hidden,true,'desktop visible header does not duplicate nav');h.top.getBoundingClientRect=()=>({bottom:-10});h.winEvents.scroll.forEach(fn=>fn());h.flush();assert.equal(h.dock.hidden,false,'desktop dock appears after header leaves viewport');
 h.modal.open=true;h.notify();assert.equal(h.dock.hidden,true);h.modal.close();h.flush();assert.equal(h.dock.hidden,false);
}
{
 const h=run({mobile:true});h.context.reelsMode=true;h.body.classList.add('reels');h.grid.scrollTop=8400;h.calls.length=0;
 const account=h.action('account');assert(account);assert.equal(h.action('more'),null,'the last dock item is Cabinet');h.click(account);h.notify();
 assert(h.calls.some(([kind])=>kind==='account'));assert(!h.calls.some(([kind])=>kind==='more'||kind==='reels'||kind==='render'));assert.equal(h.context.reelsMode,true);assert.equal(h.grid.scrollTop,8400);assert.equal(h.dock.hidden,true);
 h.modal.close();h.notify();assert.equal(h.dock.hidden,false,'closing Cabinet restores the feed dock');
 // Use the current header handler, including authentication or a refused exit.
 h.document.querySelector('#account').onclick=()=>h.context.openPhoneAuth();h.click(account);assert(h.calls.some(([kind])=>kind==='auth'));h.modal.close();
 const originalClose=h.modal.close;let refused=0,closed=0;h.modal.close=function(){closed++;originalClose.call(this)};h.modal.open=true;
 h.document.querySelector('#account').onclick=()=>{refused++};h.click(account);assert.equal(refused,1);assert.equal(closed,0,'a queued Cabinet click cannot close a guarded form');assert.equal(h.modal.open,true);
}
{
 const h=run({mobile:true});h.modal.classList.add('lot-dialog');h.modal.open=true;h.document.querySelector('#bid-form').dataset.lotId='42';h.modal.scrollTop=200;h.notify();assert.equal(h.modal.scrollTop,200);assert.equal(h.calls.filter(([kind])=>kind==='syncLotSwipeSurface').length,1);const bar=h.content.querySelector('.lot-quick-access');assert(bar);assert.equal(h.content.querySelectorAll('.lot-quick-access').length,1);assert.equal(h.dock.hidden,true);const oldHeartIcon=bar.querySelector('[data-quick="save"]').firstChild,oldBidIcon=bar.querySelector('[data-quick="bid"]').firstChild;h.notify();assert.equal(h.content.querySelectorAll('.lot-quick-access').length,1,'observer sync does not duplicate lot bar');assert.strictEqual(bar.querySelector('[data-quick="save"]').firstChild,oldHeartIcon,'no-op sync preserves heart DOM');assert.strictEqual(bar.querySelector('[data-quick="bid"]').firstChild,oldBidIcon,'no-op sync preserves jump DOM');
 h.click(bar.querySelector('[data-quick="save"]'));assert.deepEqual(h.context.saved,[42]);assert.equal(bar.querySelector('[data-quick="save"]').getAttribute('aria-pressed'),'true');
 h.click(bar.querySelector('[data-quick="bid"]'));assert.equal(h.document.activeElement.id,'bid');assert(h.calls.some(([kind,id])=>kind==='scroll'&&id==='bid-form'));
 const input=h.document.querySelector('#bid');input.disabled=true;const instant=h.add('instant-buy','button',h.content);instant.className='seller-buy-now';h.notify();h.click(bar.querySelector('[data-quick="bid"]'));assert.equal(h.document.activeElement.id,'instant-buy');
 h.click(bar.querySelector('[data-quick="back"]'));h.flush();assert.equal(h.modal.open,false);assert.equal(h.content.querySelector('.lot-quick-access'),null);
}
{const h=run({mobile:true}),overlay=h.add('support-dialog','dialog');overlay.showModal();h.notify();assert.equal(h.dock.hidden,true,'nested support/rating dialog hides quick access');overlay.close();h.notify();assert.equal(h.dock.hidden,false,'closing support restores navigation');}
{
 const h=run({mobile:true});h.document.querySelector('#bid-form').remove();h.document.querySelector('#bid').remove();const body=h.add('own-lot','div',h.content);body.setAttribute('data-open-lot-id','42');body.textContent='Это ваше объявление. Участие в торгах недоступно.';h.modal.classList.add('lot-dialog');h.modal.open=true;h.notify();
 const bar=h.content.querySelector('.lot-quick-access'),jump=bar.querySelector('[data-quick="bid"]');assert.equal(jump.hidden,true,'own/non-actionable lot does not advertise a bid form');assert.equal(jump.disabled,true);assert.equal(jump.style.display,'none','author button display styles cannot override hiding');assert.equal(bar.dataset.lotId,'42');h.calls.length=0;h.click(jump);assert(!h.calls.some(([kind])=>kind==='scroll'),'non-actionable jump is harmless even with a queued click');assert.equal(h.document.activeElement,h.body);
 assert.equal(bar.querySelector('[data-quick="save"]').hidden,false,'favorite action remains available');h.click(bar.querySelector('[data-quick="save"]'));assert.deepEqual(h.context.saved,[42]);
}
{
 const h=run({mobile:true});h.document.querySelector('#bid-form').remove();h.document.querySelector('#bid').remove();const purchase=h.add('descending-buy','button',h.content);purchase.setAttribute('data-descending-buy','42');h.modal.classList.add('lot-dialog');h.modal.open=true;h.notify();
 const jump=h.content.querySelector('[data-quick="bid"]');assert.equal(jump.hidden,false);assert.equal(jump.disabled,false);assert.equal(jump.dataset.label,'К покупке');assert.equal(jump.getAttribute('aria-label'),'Перейти к покупке лота');const icon=jump.firstChild;h.notify();assert.strictEqual(jump.firstChild,icon,'unchanged purchase jump preserves its DOM');h.click(jump);assert.equal(h.document.activeElement,purchase);assert(h.calls.some(([kind,id])=>kind==='scroll'&&id==='descending-buy'));
 purchase.disabled=true;h.calls.length=0;h.document.activeElement=h.body;h.click(jump);assert.equal(jump.hidden,true);assert.equal(jump.disabled,true);assert(!h.calls.some(([kind])=>kind==='scroll'),'purchase disabled after sync is checked again on click');assert.equal(h.document.activeElement,h.body);
 purchase.disabled=false;h.notify();assert.equal(jump.hidden,false);assert.equal(jump.style.display,undefined);purchase.remove();h.calls.length=0;h.click(jump);assert.equal(jump.hidden,true);assert(!h.calls.some(([kind])=>kind==='scroll'),'removed purchase target is never focused');
 const alternate=h.add('payment-buy','button',h.content);alternate.setAttribute('data-open-lot-payment','42');h.notify();h.click(jump);assert.equal(h.document.activeElement,alternate,'regular checkout target also works without a bid form');
 h.modal.close();h.calls.length=0;h.document.activeElement=h.body;h.click(jump);assert(!h.calls.some(([kind])=>kind==='scroll'),'stale jump from a closed lot does nothing');assert.equal(h.document.activeElement,h.body);
}
console.log('PASS: six quick routes, favorites badge, desktop scroll visibility, focus/modal hiding, feed preservation, single lot bar, save/bid/purchase/back actions, own/disabled/stale targets and stable action DOM.');
{
 const h=run({mobile:true}),badge=h.document.querySelector('#quick-bid-count'),button=h.action('bids');
 assert.equal(badge.hidden,true);assert.equal(button.classList.contains('has-bid-alert'),false);
 let count=2;h.context.FasAuctionNotifications.bidSummary=()=>({outbidCount:count});
 const update=()=>{h.winEvents['fas-bids-changed'].forEach(fn=>fn());h.flush()};update();
 assert.equal(badge.textContent,'2');assert.equal(badge.hidden,false);assert(button.classList.contains('has-bid-alert'));assert(button.getAttribute('aria-label').includes('перебили в 2 лотах'));
 count=123;update();assert.equal(badge.textContent,'99+');assert(button.getAttribute('aria-label').includes('123'),'spoken alert count is not capped');
 h.click(button);assert(h.calls.some(([kind])=>kind==='bids'),'the highlighted icon opens bids rather than the seller dashboard');
 h.modal.close();count=0;update();assert.equal(badge.hidden,true);assert.equal(button.classList.contains('has-bid-alert'),false,'restoring leadership/ending auctions removes the attention state');
 h.context.FasAuctionNotifications.bidSummary=()=>{throw Error('optional view unavailable')};assert.doesNotThrow(update);h.click(h.action('search'));assert(h.calls.some(([kind])=>kind==='search'),'optional badge failure leaves navigation usable');
}
{
 // Actual notification model -> event -> quick navigation, including expiry.
 const h=setup({mobile:true}),c=h.context,records=new Map();let clock=Date.now(),tick,notices=[];
 c.Date=class extends Date{static now(){return clock}};c.localStorage={getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,value)};
 c.cars=[{id:42,name:'Контрольный лот',price:10000,step:1000,status:'live',category:'cars',ends:new Date(clock+60000).toISOString()}];c.bids={42:{price:10000}};
 c.isLotLive=lot=>lot.status==='live'&&Date.parse(lot.ends)>clock;c.current=lot=>Math.max(lot.price,c.bids[lot.id]?.price||0);c.isOwnLot=()=>false;
 c.dispatchEvent=event=>(h.winEvents[event.type]||[]).forEach(fn=>fn(event));c.setInterval=fn=>{tick=fn};
 vm.runInContext(fs.readFileSync('dist/auction-notifications.js','utf8'),c);
 c.FasAuctionNotifications.configure({getLots:()=>c.cars,getOwnBids:()=>c.bids,getNotices:()=>notices,saveNotices(next){notices=next;return true},isLive:c.isLotLive,getCurrentPrice:c.current});
 vm.runInContext(source,c);h.flush();const badge=h.document.querySelector('#quick-bid-count');assert.equal(badge.hidden,true);
 c.cars=[{...c.cars[0],price:12000}];assert.equal(c.FasAuctionNotifications.reportAuctionUpdate({lotId:42,price:12000,actorOwn:false}).ok,true);h.flush();
 assert.equal(badge.hidden,false);assert.equal(badge.textContent,'1','a genuine competing quote activates the actual quick icon');
 notices=notices.map(notice=>({...notice,read:true}));tick();h.flush();assert.equal(badge.hidden,false,'reading a notice cannot hide an unresolved outbid');
 c.bids={42:{price:14000}};c.FasAuctionNotifications.recordOwnBid(42,14000);h.flush();assert.equal(badge.hidden,true,'a higher personal bid clears the icon via the actual model event');
 c.cars=[{...c.cars[0],price:16000}];c.FasAuctionNotifications.reportAuctionUpdate({lotId:42,price:16000,actorOwn:false});h.flush();assert.equal(badge.hidden,false);
 clock+=61000;tick();h.flush();assert.equal(badge.hidden,true,'expiry clears the icon without another auction event');
}
