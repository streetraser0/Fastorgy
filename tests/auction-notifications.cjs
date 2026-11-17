const assert=require('assert/strict'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('dist/auction-notifications.js','utf8');
const NOW=Date.now(),RealDate=Date;
function boot(options={}){
 const records={...(options.records||{})},sent=[],events={},dispatched=[],opened=[],raised=[],statuses=[],button={textContent:'',disabled:false},checkbox={checked:true},modal={open:false,scrollTop:0,close(){this.open=false}};
 let lots=options.lots||[{id:123,name:'Toyota RAV4',status:'live',ends:new Date(NOW+3600000).toISOString()}],ownBids=options.ownBids||{123:{price:10000,history:[{at:new Date(NOW-1000).toISOString()}]}};
 let notices=options.notices||[],failNotice=!!options.failNotice,permissionRequests=0,time=NOW,html='',contentWrites=0;
 const content={get innerHTML(){return html},set innerHTML(value){html=value;contentWrites++}};
 const context={console,Date:class extends RealDate{constructor(...args){super(...(args.length?args:[time]))}static now(){return time}},JSON,Number,String,Object,Array,Map,Set,Promise,Event:class{constructor(type){this.type=type}},dispatchEvent(event){dispatched.push(event.type);events[event.type]?.(event);return true},localStorage:{getItem:key=>records[key]||null,setItem(key,value){if(options.failStorage)throw Error('quota');records[key]=value}},document:{querySelector:selector=>selector==='#modal'?modal:selector==='#modal-content'?content:null,querySelectorAll(selector){return selector==='[data-auction-alert-status]'?statuses:selector==='[data-auction-browser-alerts]'?[button]:selector==='[data-auction-outbid]'?[checkbox]:[]},addEventListener(name,fn){events[name]=fn}},navigator:{},addEventListener(name,fn){events[name]=fn},focus(){}};
 context.window=context;
 if(options.notification!==false){class Notification{static permission=options.permission||'granted';static async requestPermission(){permissionRequests++;Notification.permission=options.permissionResult||'granted';return Notification.permission}constructor(title,details){sent.push({title,details})}close(){}}context.Notification=Notification}
 vm.createContext(context);vm.runInContext(source,context);
 const api=context.FasAuctionNotifications;api.configure({getLots:()=>lots,getOwnBids:()=>ownBids,getNotices:()=>notices,saveNotices(next){if(failNotice)return false;notices=next;records['fas-notices']=JSON.stringify(next);return true},isLive:lot=>lot.status==='live'&&Date.parse(lot.ends)>time,showContent(value){content.innerHTML=value;modal.open=true},openLot:id=>opened.push(id),openBidLot:id=>raised.push(id)});
 return {api,context,records,sent,events,dispatched,opened,raised,statuses,button,checkbox,modal,content,get lots(){return lots},get ownBids(){return ownBids},setLots(value){lots=value},setBids(value){ownBids=value},advance(ms){time+=ms},get notices(){return notices},setNotices(value){notices=value},failNotice(value){failNotice=value},permissionRequests:()=>permissionRequests,contentWrites:()=>contentWrites};
}
function click(h,key,value=''){
 const control={dataset:{[key]:value},closest(selector){const attribute=selector.match(/^\[data-([a-z-]+)\]$/)?.[1]?.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());return attribute===key?this:null}};
 const event={target:control,preventDefault(){this.prevented=true}};h.events.click(event);return event;
}
const external=(price,extra={})=>({lotId:123,price,actorOwn:false,occurredAt:new Date(NOW).toISOString(),...extra});
(async()=>{
 const h=boot();assert.equal(h.notices.length,0,'restoring own bids never invents an outbid');assert.equal(h.permissionRequests(),0,'permission is never requested on load');
 assert.equal(h.api.reportAuctionUpdate(external(12000,{actorOwn:true})).ok,false);assert.equal(h.api.reportAuctionUpdate({lotId:123,price:12000}).ok,false);
 assert.equal(h.api.reportAuctionUpdate(external(10000)).ok,false);assert.equal(h.api.reportAuctionUpdate(external(9000)).ok,false);
 assert.equal(h.api.reportAuctionUpdate(external(12000,{occurredAt:new Date(NOW-5000).toISOString()})).ok,false);
 assert.equal(h.api.reportAuctionUpdate(external(12000)).ok,true);assert.equal(h.notices.length,1);assert.equal(h.notices[0].type,'outbid');assert.equal(h.notices[0].ownPrice,10000);assert.equal(h.notices[0].currentPrice,12000);assert.match(h.api.noticeText(h.notices[0]),/перебили/);assert.equal(h.sent.length,0,'browser alerts remain opt-in');
 assert.equal(h.api.reportAuctionUpdate(external(12000)).ok,false);assert.equal(h.api.reportAuctionUpdate(external(11000)).ok,false);assert.equal(h.notices.length,1);
 assert.equal(h.api.reportAuctionUpdate(external(14000)).ok,true);assert.equal(h.notices.length,1,'higher competitor prices update one unread notice');assert.equal(h.notices[0].currentPrice,14000);
 h.ownBids[123]={price:15000,history:[{at:new Date(NOW).toISOString()}]};h.api.recordOwnBid(123,15000);assert.equal(h.notices[0].read,true,'rebidding above the competing price clears obsolete unread alert');
 assert.equal(h.api.reportAuctionUpdate(external(16000)).ok,true);assert.equal(h.notices.filter(n=>!n.read).length,1);
 const reload=boot({records:h.records,notices:h.notices,ownBids:h.ownBids});assert.equal(reload.api.reportAuctionUpdate(external(16000)).ok,false,'reload does not repeat the same outbid');
 reload.lots[0].status='sold';assert.equal(reload.api.reportAuctionUpdate(external(18000)).ok,false,'closed auctions do not produce actionable outbid alerts');
 for(const price of [0,-1,NaN,Infinity,'18000',Number.MAX_SAFE_INTEGER+1])assert.equal(h.api.reportAuctionUpdate(external(price)).ok,false);
 const fail=boot({failNotice:true});assert.equal(fail.api.reportAuctionUpdate(external(12000)).reason,'storage-failed');assert.equal(fail.notices.length,0);fail.failNotice(false);assert.equal(fail.api.reportAuctionUpdate(external(12000)).ok,true,'failed write may be retried and never pretends delivery');
 const corrupt=boot({records:{'fas-auction-alerts-v1':'{broken'},failStorage:true});assert.equal(corrupt.api.reportAuctionUpdate(external(12000)).ok,true);assert.equal(corrupt.api.reportAuctionUpdate(external(12000)).ok,false,'session dedupe survives preference storage failure');
 const disabled=boot();disabled.events.change({target:{checked:false,matches:selector=>selector==='[data-auction-outbid]'}});assert.equal(disabled.api.state().outbid,false);assert.equal(disabled.api.reportAuctionUpdate(external(12000)).ok,false);
 const browser=boot({permission:'default'});assert.equal(browser.permissionRequests(),0);assert.equal((await browser.api.toggleBrowserAlerts()).enabled,true);assert.equal(browser.permissionRequests(),1);assert.match(browser.button.textContent,/Выключить/);
 browser.api.reportAuctionUpdate(external(12000));await new Promise(resolve=>setImmediate(resolve));assert.equal(browser.sent.length,1);assert.match(browser.sent[0].title,/перебили/);
 const fresh={id:'search-999',lotId:999,name:'Новый станок',createdAt:new Date(NOW).toISOString(),read:false};browser.api.onNewLotNotice(fresh);browser.api.onNewLotNotice(fresh);await new Promise(resolve=>setImmediate(resolve));assert.equal(browser.sent.length,2,'one alert for each actual new saved-search notice');
 await browser.api.toggleBrowserAlerts();assert.match(browser.button.textContent,/Включить/);browser.api.onNewLotNotice({...fresh,id:'search-1000'});await new Promise(resolve=>setImmediate(resolve));assert.equal(browser.sent.length,2);
 const unsupported=boot({notification:false});assert.equal((await unsupported.api.toggleBrowserAlerts()).reason,'unsupported');assert.equal(unsupported.api.state().browser,false);
 const denied=boot({permission:'denied'});assert.equal((await denied.api.toggleBrowserAlerts()).reason,'denied');assert.equal(denied.permissionRequests(),0);
 assert.match(h.api.settingsHTML(),/при открытом сайте/);assert.match(h.api.settingsHTML(),/после закрытия/);

 // The badge follows the bid ledger and genuine current quote, regardless of notice reads.
 {
  const end=new Date(NOW+10000).toISOString(),base={status:'live',price:15000,ends:end};
  const lots=[{...base,id:1,name:'<img src=x onerror="bad()">'},{...base,id:2,price:10000},{...base,id:3,ends:new Date(NOW-1).toISOString()},{...base,id:4,status:'scheduled',startsAt:new Date(NOW+2000).toISOString()},{...base,id:5,ends:'invalid'},{...base,id:6,startsAt:'invalid'},{...base,id:7,auctionDirection:'descending'},{...base,id:8,own:true},{...base,id:9,status:'draft'},{...base,id:10,price:Number.MAX_SAFE_INTEGER+1},{...base,id:11},{...base,id:12}];
  const ownBids=Object.fromEntries(lots.map(lot=>[lot.id,{price:10000}]));ownBids[11].price='10000';ownBids[12].price=1.5;ownBids[99]={price:10000};ownBids['001']={price:10000};ownBids[13]={price:Infinity};
  const b=boot({lots,ownBids,notices:[{id:'old',type:'outbid',lotId:1,currentPrice:999999,ownPrice:1,read:true}]});b.api.configure({getIsOwn:lot=>lot.own===true});
  let summary=b.api.bidSummary();assert.equal(summary.total,7);assert.equal(summary.outbidCount,1);assert.equal(summary.rows[0].id,1);assert.equal(summary.rows[0].currentPrice,15000);assert.equal(summary.rows[0].ownPrice,10000);assert.equal(summary.rows[0].canRaise,true);assert.equal(summary.rows[1].status,'leading');
  assert.equal(summary.rows.find(row=>row.id===3).status,'ended');assert.equal(summary.rows.find(row=>row.id===4).status,'scheduled');for(const id of [5,6,10])assert.equal(summary.rows.find(row=>row.id===id).status,'unavailable');
  assert(Object.isFrozen(summary)&&Object.isFrozen(summary.rows)&&Object.isFrozen(summary.rows[0]));
  assert(b.api.openMyBids());assert(b.content.innerHTML.includes('&lt;img src=x onerror=&quot;bad()&quot;&gt;'));assert(!b.content.innerHTML.includes('<img src=x'));assert(b.content.innerHTML.includes('Торги завершены'));assert(!b.content.innerHTML.includes('999'));assert(b.content.innerHTML.includes('data-my-bids-raise="1"'));
  b.setNotices([]);assert.equal(b.api.bidSummary().outbidCount,1,'clearing notices cannot clear an actually outbid lot');
  const previousWrites=b.contentWrites();b.modal.scrollTop=240;assert.equal(b.api.refreshMyBids(),false);b.advance(901);assert.equal(b.api.refreshMyBids(),false);assert.equal(b.contentWrites(),previousWrites,'an unchanged summary never replaces the view');
  lots[0].price=16000;b.advance(901);assert.equal(b.api.refreshMyBids(),true);assert.equal(b.modal.scrollTop,240);assert(b.content.innerHTML.includes('16\u00a0000'));
  assert(click(b,'myBidsRaise','1').prevented);assert.deepEqual(b.raised,[1],'raise opens the bid form without submitting a new bid');assert.equal(ownBids[1].price,10000);
  b.api.openMyBids();ownBids[1].price=17000;assert(click(b,'myBidsRaise','1').prevented);assert.deepEqual(b.raised,[1],'a stale raise button is revalidated against the current personal bid');assert(!b.content.innerHTML.includes('data-my-bids-raise="1"'));
  b.api.recordOwnBid(1,17000);assert.equal(b.api.bidSummary().outbidCount,0);assert(b.dispatched.filter(type=>type==='fas-bids-changed').length>=3);
  b.api.reportAuctionUpdate({lotId:1,price:999999,actorOwn:false});assert.equal(b.api.bidSummary().rows.find(row=>row.id===1).currentPrice,16000,'an event or old notice alone never replaces the real current quote');
  b.context.document.querySelector('#modal-content').innerHTML='<h2>Другое окно</h2>';lots[0].price=18000;b.advance(901);assert.equal(b.api.refreshMyBids(),false);assert.equal(b.content.innerHTML,'<h2>Другое окно</h2>','background bid updates cannot replace another dialog');
 }
 {
  const b=boot({lots:[{id:123,status:'scheduled',startsAt:new Date(NOW+1000).toISOString(),ends:new Date(NOW+4000).toISOString(),price:15000}]});
  b.api.configure({isLive:lot=>['live','scheduled'].includes(lot.status)&&Date.parse(lot.startsAt)<=b.context.Date.now()&&Date.parse(lot.ends)>b.context.Date.now()});
  assert.equal(b.api.bidSummary().outbidCount,0);b.advance(1001);assert.equal(b.api.bidSummary().outbidCount,1,'a scheduled lot becomes actionable when the core considers its start reached');b.advance(3000);assert.equal(b.api.bidSummary().outbidCount,0);assert.equal(b.api.bidSummary().rows[0].status,'ended');
 }
 {
  let indexedReads=0,ledgerReads=0;const raw=Array.from({length:52870},(_,i)=>({id:i+1,status:'live',price:15000,ends:new Date(NOW+100000).toISOString()}));
  const lots=new Proxy(raw,{get(target,key,receiver){if(/^\d+$/.test(String(key)))indexedReads++;return Reflect.get(target,key,receiver)}}),book=new Proxy({123:{price:10000}},{ownKeys(target){ledgerReads++;return Reflect.ownKeys(target)}});
  const empty=boot({lots,ownBids:{}});for(let i=0;i<100;i++)empty.api.bidSummary();assert.equal(indexedReads,0,'a visitor without bids never walks the inventory');
  const b=boot({lots,ownBids:book}),summary=b.api.bidSummary(),scans=indexedReads,reads=ledgerReads;assert.equal(scans,52870);
  for(let i=0;i<100;i++)assert.strictEqual(b.api.bidSummary(),summary);assert.equal(indexedReads,scans);assert.equal(ledgerReads,reads,'RAF-style badge reads reuse the cached ledger summary');
  b.advance(901);assert.notStrictEqual(b.api.bidSummary(),summary);assert.equal(indexedReads,scans,'TTL expiry visits personal bids, not every lot');
  b.setBids({123:{price:16000}});assert.equal(b.api.bidSummary().outbidCount,0,'replacing the bid ledger invalidates immediately');assert.equal(indexedReads,scans);
  b.setLots([{...raw[122],price:17000}]);assert.equal(b.api.bidSummary().outbidCount,1,'replacing inventory invalidates its ID index immediately');
  b.lots.push({id:999999,status:'live',price:25000,ends:raw[0].ends});b.setBids({999999:{price:20000}});assert.equal(b.api.bidSummary().rows[0].id,999999,'same-array growth also rebuilds the ID index');
 }
 {
  const lots=Array.from({length:30},(_,i)=>({id:i+1,name:'Лот '+(i+1),status:'live',price:15000,ends:new Date(NOW+10000).toISOString()})),ownBids=Object.fromEntries(lots.map(lot=>[lot.id,{price:10000}])),b=boot({lots,ownBids});let back=0;
  b.api.openMyBids({onBack(){back++}});assert(b.content.innerHTML.includes('data-my-bids-back'));assert.equal((b.content.innerHTML.match(/class="my-bid-row /g)||[]).length,24);assert(b.content.innerHTML.includes('data-my-bids-more'));
  b.modal.scrollTop=600;click(b,'myBidsMore');assert.equal((b.content.innerHTML.match(/class="my-bid-row /g)||[]).length,30);assert.equal(b.modal.scrollTop,600);assert(!b.content.innerHTML.includes('data-my-bids-more'));assert(b.content.innerHTML.includes('data-my-bids-back'));
  click(b,'myBidsBack');assert.equal(back,1);b.api.openMyBids();assert(!b.content.innerHTML.includes('data-my-bids-back'));click(b,'myBidsBack');assert.equal(back,1,'opening from the dock clears a previous cabinet callback');
  b.api.configure({openBidLot:()=>false});b.api.openMyBids();click(b,'myBidsRaise','1');lots[0].price=18000;b.advance(901);assert.equal(b.api.refreshMyBids(),true,'a rejected adapter open leaves the current view refreshable');
  const empty=boot({ownBids:{}});empty.api.openMyBids();assert(empty.content.innerHTML.includes('У вас пока нет ставок'));click(empty,'myBidsCatalog');assert.equal(empty.modal.open,false);
 }

 // The existing matching engine remains authoritative for saved searches.
 const {boot:catalogBoot}=require('./helpers/category-seller-harness.cjs'),catalog=catalogBoot(),future=new Date(Date.now()+86400000).toISOString();
 catalog.run("subscriptions=[{id:'new-search',active:true,category:'cars',regionCode:'36',maxPrice:3000000,search:{query:'Тойота дизель',category:'cars',regionCode:'36',values:Object.fromEntries(ADV_IDS.map(id=>[id,'']))},knownIds:subscriptionInventory().live.map(c=>c.id)}];lotNotices=[]");
 const base={bank:'Тестовый банк',sellerType:'bank',status:'live',regionCode:'36',city:'Воронеж',category:'cars',subcategory:'cars',price:2000000,start:2000000,step:10000,deposit:0,brand:'Toyota',name:'Toyota Camry',fuel:'diesel',ends:future,demo:false};
 catalog.run('cars.push(...'+JSON.stringify([{...base,id:991110001},{...base,id:991110002,regionCode:'77',city:'Москва'},{...base,id:991110003,fuel:'petrol'},{...base,id:991110004,status:'draft'},{...base,id:991110005,price:4000000,start:4000000}])+');ends.push(...cars.slice(-5).map(c=>Date.parse(c.ends)));saveLots()');
 assert.equal(catalog.run('lotNotices.length'),1);assert.equal(catalog.run('lotNotices[0].lotId'),991110001,'only a newly published lot matching words, region and budget notifies');catalog.run('refreshSubscriptions();render()');assert.equal(catalog.run('lotNotices.length'),1,'search refresh does not replay notifications');
 console.log('PASS: ledger/current-quote My Bids, safe prices and lifecycle transitions, escaped paged view/back routes/stale CTA, zero cold inventory walks and cached badge reads; genuine alerts, durable notices, opt-in browser alerts and saved-search matching.');
})().catch(error=>{console.error(error);process.exitCode=1});
