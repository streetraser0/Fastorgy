const assert=require('assert/strict'),fs=require('fs'),vm=require('vm');
const {boot}=require('./helpers/category-seller-harness.cjs');
const h=boot(),run=h.run,RealDate=Date;let now=Date.parse('2026-11-13T10:00:00Z');
h.context.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}};
vm.runInContext(fs.readFileSync('dist/auction-modes.js','utf8'),h.context);
const base={id:999920001,name:'Станок — торги на понижение',bank:'Тестовый банк',city:'Воронеж',regionCode:'36',category:'equipment',status:'live',price:1000000,start:1000000,step:50000,deposit:50000,bids:0,auctionDirection:'descending',floorPrice:600000,decreaseStep:50000,decreaseIntervalMinutes:30,startsAt:new RealDate(now-7200000).toISOString(),ends:new RealDate(now+7200000).toISOString(),extension:false};
run('cars.push('+JSON.stringify(base)+');ends.push(Date.parse(cars.at(-1).ends));saveLots()');
assert.equal(run('current(cars.at(-1))'),800000);
assert.equal(run('isLotLive(cars.at(-1))'),true);
run('openCar('+base.id+')');
let html=h.node('#modal-content').innerHTML;
assert(html.includes('Торги на понижение'));
assert(!html.includes('id="bid-form"'),'descending auctions must not display an ascending bid form');
assert(html.includes('data-descending-buy="'+base.id+'"'));
assert(html.includes('600')&&html.includes('30 мин'),'floor and reduction interval remain visible');
h.writes.length=0;
assert.equal(run('commitDemoBid(cars.at(-1),900000,cars.at(-1).ends)'),false);
assert(!h.writes.includes('fas-bids'),'programmatic ascending bid cannot write to descending lot');
assert.equal(run('window.FasApplyAuctionUpdate({lotId:'+base.id+',price:1200000,actorOwn:false}).ok'),false);
assert.equal(run('cars.at(-1).price'),1000000,'descending calculations never mutate the start baseline');
run('window.paymentQuote=null;window.FasPayments={open(lot,options){window.paymentQuote={lot,options};return{ok:true}}};openLotPayment('+base.id+')');
assert.equal(h.context.window.paymentQuote.lot.buyNowPrice,800000);
assert.equal(h.context.window.paymentQuote.options.mode,'buy-now');
assert.equal(run('cars.at(-1).buyNowPrice'),undefined,'checkout snapshot cannot overwrite seller settings');
assert.equal(run('cars.at(-1).status'),'live');

// Only the changing price text is touched: no card-list rebuild or baseline mutation.
let priceWrites=0,text='';const priceNode={dataset:{liveDescendingPrice:String(base.id)},get textContent(){return text},set textContent(value){priceWrites++;text=value},getBoundingClientRect(){return{top:100,bottom:150}}};
const button={dataset:{descendingBuy:String(base.id)},disabled:false},queryAll=h.context.document.querySelectorAll;
h.context.document.querySelectorAll=selector=>selector==='[data-live-descending-price]'?[priceNode]:selector==='[data-descending-buy]'?[button]:[];
run('updateLiveAuctionPrices()');assert.equal(text,run('money(800000)'));assert.equal(priceWrites,1);
run('updateLiveAuctionPrices()');assert.equal(priceWrites,1);
now+=1800000;run('updateLiveAuctionPrices()');assert.equal(text,run('money(750000)'));assert.equal(priceWrites,2);
assert.equal(run('cars.at(-1).price'),1000000);
now=RealDate.parse(base.ends);run('updateLiveAuctionPrices()');assert.equal(button.disabled,true);
assert.equal(run('openLotPayment('+base.id+')'),false,'expired descending price is not purchasable');
h.context.document.querySelectorAll=queryAll;

// Defaults remain ascending; missing/invalid descending settings fail closed.
run('openCar(1042)');html=h.node('#modal-content').innerHTML;
assert(html.includes('Торги на повышение'));assert(html.includes('id="bid-form"'));
now=RealDate.parse('2026-11-13T10:00:00Z');
assert.equal(run('isLotLive({...cars.at(-1),floorPrice:1000000})'),false);
assert.equal(run('isLotLive({...cars.at(-1),auctionDirection:"unrecognised"})'),false);
const modes=h.context.window.FasAuctionModes;h.context.window.FasAuctionModes=undefined;
assert.equal(run('isLotLive(cars.at(-1))'),false);assert.equal(run('current(cars.at(-1))'),null);
h.context.window.FasAuctionModes=modes;

function bankForm(data){
 const fields={bank:'Тестовый банк',name:'Новый формат банка',brand:'',city:'Воронеж',regionCode:'36',year:'',km:'',price:'1000000',step:'10000',deposit:'50000',ends:new RealDate(now+14400000).toISOString(),latitude:'',longitude:'',address:'',image:'',media:'',comparables:'',marketDate:'',docs:'Условия',status:'live',condition:'',sellerType:'bank',model:'',manufacturer:'',fuel:'',transmission:'',drive:'',powerHp:'',area:'',rooms:'',floor:'',totalFloors:'',powerKw:'',auctionDirection:'descending',floorPrice:'600000',decreaseStep:'50000',decreaseIntervalMinutes:'30',...data};
 h.context.FormData=function(){const map=new Map(Object.entries(fields));return{get:key=>map.has(key)?map.get(key):null,has:key=>map.has(key)}};
 h.node('#role').value='manager';h.node('#lot-form').onsubmit({preventDefault(){}});
}
run('openAdmin()');assert(h.node('#modal-content').innerHTML.includes('data-auction-direction'));
bankForm();const created=run('cars.at(-1)');
assert.equal(created.auctionDirection,'descending');assert.equal(created.decreaseStep,50000);assert.equal(created.floorPrice,600000);assert.equal(created.step,50000);assert.equal(created.extension,false);assert.equal(created.startsAt,new RealDate(now).toISOString());
assert.equal(run('current(cars.at(-1))'),1000000);
const count=run('cars.length');run('openAdmin()');bankForm({floorPrice:'1000000'});assert.equal(run('cars.length'),count,'invalid floor cannot publish');
run('openAdmin(1042)');bankForm({price:String(run('cars.find(c=>c.id===1042).start??cars.find(c=>c.id===1042).price'))});assert.equal(run('cars.find(c=>c.id===1042).auctionDirection'),undefined,'auction format cannot change after existing bids');assert.match(h.node('#lot-error').textContent,/поданными ставками/);

(async()=>{
 const upload=async text=>{run('openAdmin()');await h.node('#csv').onchange({target:{files:[{text:async()=>text}]}})};
 const header='category;bank;name;city;price;ends;auctionDirection;floorPrice;decreaseStep;decreaseIntervalMinutes';
 const future=new RealDate(now+14400000).toISOString();
 await upload(header+'\nequipment;Банк;CSV Dutch;Воронеж;1000000;'+future+';descending;600000;50000;30');
 const imported=run('cars.at(-1)');assert.equal(imported.name,'CSV Dutch');assert.equal(imported.auctionDirection,'descending');assert.equal(imported.floorPrice,600000);assert.equal(imported.status,'draft');
 const before=run('cars.length');
 for(const row of ['descending;1000000;50000;30','descending;600000;0;30','descending;600000;50000;1440','unknown;600000;50000;30']){await upload(header+'\nequipment;Банк;Плохая строка;Воронеж;1000000;'+future+';'+row);assert.equal(run('cars.length'),before,'invalid descending CSV cannot create a draft: '+row)}
 // Publishing a reviewed draft resets the schedule to publication, rather than its import time.
 const publish={dataset:{publish:String(imported.id)}};const content=h.node('#modal-content'),oldQuery=content.querySelectorAll;
 content.querySelectorAll=selector=>selector==='[data-publish]'?[publish]:oldQuery.call(content,selector);
 now+=1800000;run('openAdmin()');h.node('#role').value='manager';publish.onclick();
 assert.equal(run('cars.find(c=>c.id==='+imported.id+').startsAt'),new RealDate(now).toISOString());
 assert.equal(run('cars.find(c=>c.id==='+imported.id+').status'),'live');
 assert.equal(run('current(cars.find(c=>c.id==='+imported.id+'))'),1000000);
 console.log('PASS: ascending defaults, guarded Dutch current-price checkout, live price-only updates, bank settings/publication and validated CSV directions.');
})().catch(error=>{console.error(error);process.exitCode=1});
