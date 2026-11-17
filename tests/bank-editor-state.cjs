const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {boot}=require('./helpers/category-seller-harness.cjs');
(async()=>{
 const h=boot(),id=999875001,now=Date.now(),base={id,category:'cars',subcategory:'cars',name:'Банковский автомобиль',brand:'Toyota',bank:'Тестовый банк',city:'Воронеж',regionCode:'36',price:100000,start:100000,step:1000,deposit:0,status:'live',ends:new Date(now+7200000).toISOString(),bids:0,extension:true,buyNowPrice:200000};
 vm.runInContext(fs.readFileSync('dist/auction-modes.js','utf8'),h.context);
 let fields;
 const reset=(override={})=>{h.run('cars=['+JSON.stringify({...base,...override})+'];bids={};ends.splice(0,ends.length,...cars.map(lot=>Date.parse(lot.ends)))');h.setFailLots(false)};
 const defaults=()=>({category:'cars',subcategory:'cars',name:'Уточнённый автомобиль',brand:'Toyota',bank:'Тестовый банк',city:'Воронеж',regionCode:'36',price:'100000',step:'1000',deposit:'0',status:'live',ends:base.ends,extension:'on',year:'',km:'',latitude:'',longitude:'',address:'',image:'',media:'',docs:'Уточнены документы',comparables:'',marketDate:'',auctionDirection:'ascending'});
 h.context.FormData=function(){const map=new Map(Object.entries(fields));return {get:key=>map.has(key)?map.get(key):null,has:key=>map.has(key)}};
 const open=(edit=id,overrides={})=>{const row=edit===null?null:h.run('cars.find(lot=>lot.id==='+edit+')');const locked=row&&h.context.window.FasSellerRules.identityLocked(row,{ownBid:h.run('bids['+edit+']'),current:h.run('current(cars.find(lot=>lot.id==='+edit+'))')});fields={...defaults(),...(locked?{name:row.name}:{}),...overrides};h.run(edit===null?'openAdmin()':'openAdmin('+edit+')');h.node('#role').value='manager';return h.node('#lot-form').onsubmit};
 const submit=callback=>(callback||h.node('#lot-form').onsubmit)({preventDefault(){},target:h.node('#lot-form')});
 const current=()=>h.run('cars.find(lot=>lot.id==='+id+')');

 reset();open();submit();assert.equal(current().name,'Уточнённый автомобиль');assert.equal(current().buyNowPrice,200000,'editing descriptive fields preserves unrelated purchase settings');assert.equal(JSON.parse(h.records['fas-lots'])[0].name,'Уточнённый автомобиль');assert(h.node('#toast').textContent.includes('Лот сохранён'));
 // The quote module replaces canonical objects. An old captured object must never create cars[-1].
 reset();open();assert.equal(h.run('window.FasApplyAuctionUpdate({lotId:'+id+',price:150000,actorOwn:false}).ok'),true);const quoteRecord=JSON.stringify(current());submit();assert.equal(JSON.stringify(current()),quoteRecord);assert.equal(h.run('Object.hasOwn(cars,"-1")'),false);assert(h.node('#lot-error').textContent.includes('изменились'));assert.equal(fields.name,'Уточнённый автомобиль');assert.equal(h.node('#modal').open,true);
 // Any intervening owner/status/deadline/deletion or bid-ledger change rejects safely.
 for(const change of ['cars[0]={...cars[0],status:"sold"}','cars[0].ends=new Date(Date.parse(cars[0].ends)+60000).toISOString()','cars[0].sellerOwnerId="other"','cars=[]','bids['+id+']={price:101000,count:1,history:[]}']){
  reset();open();h.run(change);const before=h.run('JSON.stringify(cars)');submit();assert.equal(h.run('JSON.stringify(cars)'),before,change);assert(h.node('#lot-error').textContent.includes('изменились'));
 }
 // Identity replacement alone is safe when the canonical state is exactly unchanged.
 reset();open();h.run('cars=cars.map(lot=>({...lot}))');submit();assert.equal(current().name,'Уточнённый автомобиль');assert.equal(h.run('Object.hasOwn(cars,"-1")'),false);

 reset({price:150000,bids:2});open();submit();assert.equal(current().price,150000,'editing existing-bid metadata cannot reset the current quote to the start price');assert.equal(current().start,100000);assert.equal(current().docs,'Уточнены документы','a permitted clarification actually saves while asset identity remains fixed');
 for(const change of [{step:'2000'},{price:'90000'},{deposit:'1000'},{ends:new Date(now+10800000).toISOString()},{status:'draft'}]){reset({price:150000,bids:2});open(id,change);const before=JSON.stringify(current());submit();assert.equal(JSON.stringify(current()),before);assert.match(h.node('#lot-error').textContent,Object.hasOwn(change,'price')?/Цену опубликованного/:/поданными ставками/)}
 reset({price:150000,bids:2});const originalEnd=current().ends;open(id,{ends:new Date(Math.floor(Date.parse(originalEnd)/60000)*60000).toISOString()});submit();assert.equal(current().ends,originalEnd,'unchanged datetime-local minute precision never truncates a live deadline');

 // Quota failure never changes active state or announces a successful save; retry uses the retained form.
 reset();const editSubmit=open();const before=h.run('JSON.stringify(cars)'),oldEnd=h.run('JSON.stringify(ends)');h.setFailLots(true);submit();assert.equal(h.run('JSON.stringify(cars)'),before);assert.equal(h.run('JSON.stringify(ends)'),oldEnd);assert(h.node('#lot-error').textContent.includes('не сохранён'));assert(!h.node('#toast').textContent.includes('Лот сохранён'));assert.equal(h.node('#lot-form').onsubmit,editSubmit);h.setFailLots(false);submit();assert.equal(current().name,'Уточнённый автомобиль');const successSnapshot=h.run('JSON.stringify(cars)');submit(editSubmit);assert.equal(h.run('JSON.stringify(cars)'),successSnapshot,'successful form callback cannot be replayed');
 reset();const oldSubmit=open();h.node('#modal').close();submit(oldSubmit);assert.equal(current().name,base.name);open();submit(oldSubmit);assert.equal(current().name,base.name,'reopened form invalidates an old callback even when the harness reuses its node');
 reset();const createSubmit=open(null,{status:'draft',name:'Новый черновик'});h.setFailLots(true);submit();assert.equal(h.run('cars.length'),1);h.setFailLots(false);submit();assert.equal(h.run('cars.length'),2);assert.equal(h.run('cars.at(-1).status'),'draft');submit(createSubmit);assert.equal(h.run('cars.length'),2,'new-lot double submit cannot duplicate a successful listing');
 reset();open(null,{status:'live'});h.node('#role').value='bank';submit();assert.equal(h.run('cars.length'),1);assert(h.node('#lot-error').textContent.includes('менеджера'));

 // Manager publication uses the same durable-before-visible boundary.
 const publish={dataset:{publish:String(id)}};h.node('#modal-content').querySelectorAll=selector=>selector==='[data-publish]'?[publish]:[];
 reset({status:'draft'});open(null);h.setFailLots(true);publish.onclick();assert.equal(current().status,'draft');assert(h.node('#lot-error').textContent.includes('не опубликован'));h.setFailLots(false);publish.onclick();assert.equal(current().status,'live');assert.equal(JSON.parse(h.records['fas-lots'])[0].status,'live');
 // CSV failure likewise leaves no phantom imported draft; success can be retried.
 reset();open(null);const upload=()=>h.node('#csv').onchange({target:{files:[{text:async()=>'category;bank;name;city;price;ends\ncars;Банк;Импорт;Воронеж;100000;'+base.ends}]}});h.setFailLots(true);await upload();assert.equal(h.run('cars.length'),1);assert(h.node('#toast').textContent.includes('не загружены'));h.setFailLots(false);await upload();assert.equal(h.run('cars.length'),2);
 reset();open(null);let resolve;const pending=h.node('#csv').onchange({target:{files:[{text:()=>new Promise(done=>resolve=done)}]}});h.node('#modal').close();resolve('category;bank;name;city;price;ends\ncars;Банк;Устаревший импорт;Воронеж;100000;'+base.ends);await pending;assert.equal(h.run('cars.length'),1,'an upload completed after closing the editor cannot mutate the catalogue');
 console.log('PASS: canonical bank edit snapshots, stale quote/status/owner/deadline/ledger/deletion guards, immutable bid terms, minute precision, durable edit/create/publish/CSV retry and stale/duplicate callbacks.');
})().catch(error=>{console.error(error);process.exitCode=1});
