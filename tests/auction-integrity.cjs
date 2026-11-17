const assert=require('assert/strict');
const {boot}=require('./helpers/category-seller-harness.cjs');

(async()=>{
 const h=boot(),future=new Date(Date.now()+86400000).toISOString();
 const bank={price:100000,start:100000,step:1000,deposit:0,ends:future};
 for(const status of ['draft','paused','sold','cancelled','withdrawn','ended','unknown']){
  assert.equal(h.run('isLotLive('+JSON.stringify({...bank,status})+')'),false,status);
 }
 for(const status of [undefined,'live'])assert.equal(h.run('isLotLive('+JSON.stringify({...bank,status})+')'),true,'legacy/live bank auction');
 for(const status of [undefined,'live','scheduled']){
  assert.equal(h.run('isLotLive('+JSON.stringify({...bank,status,startsAt:future})+')'),false,'future start '+status);
  assert.equal(h.run('isLotLive('+JSON.stringify({...bank,status,startsAt:new Date(Date.now()-3600000).toISOString()})+')'),true,'start reached '+status);
 }
 assert.equal(h.run('isLotLive('+JSON.stringify({...bank,status:'scheduled'})+')'),false,'scheduled requires a real start');
 assert.equal(h.run('isLotLive('+JSON.stringify({...bank,startsAt:'broken'})+')'),false,'invalid start');
 assert.equal(h.run('isLotLive('+JSON.stringify({...bank,ends:'broken'})+')'),false,'invalid end');
 console.log('PASS: strict bank states, legacy compatibility and scheduled start boundaries.');

 // A quota error must leave both a new bid and its extension uncommitted.
 const id=h.run('cars.find(c=>isLotLive(c)&&!c.sellerOwnerId).id');
 h.run('cars.find(c=>c.id==='+id+').ends=new Date(Date.now()+60000).toISOString();ends[cars.findIndex(c=>c.id==='+id+')]=Date.parse(cars.find(c=>c.id==='+id+').ends)');
 const oldEnd=h.run('cars.find(c=>c.id==='+id+').ends'),write=h.context.localStorage.setItem;
 h.context.localStorage.setItem=(key,value)=>{if(key==='fas-bids')throw Error('quota');write(key,value)};
 for(const existing of [false,true]){
  h.run(existing?'bids['+id+']={price:cars.find(c=>c.id==='+id+').price+cars.find(c=>c.id==='+id+').step,count:1,history:[]}':'bids={}');
  const previous=h.run('JSON.stringify(bids)');
  h.run('openCar('+id+')');h.node('#bid').value=h.run('nextLotBid(cars.find(c=>c.id==='+id+'))');
  h.node('#bid-form').onsubmit({preventDefault(){}});
  assert.equal(h.run('JSON.stringify(bids)'),previous,'failed write preserves previous bids');
  assert.equal(h.run('cars.find(c=>c.id==='+id+').ends'),oldEnd);
  assert.equal(h.run('ends[cars.findIndex(c=>c.id==='+id+')]'),Date.parse(oldEnd));
  assert.equal(h.node('#modal').open,true,'form stays open');assert.equal(h.node('#bid-error').hidden,false);
  assert(h.node('#bid-error').textContent.includes('не сохранена'));
  assert(!h.node('#toast').textContent.includes('принята'));
 }
 // Smaller durable bid records remain authoritative if an unrelated record fails.
 h.context.localStorage.setItem=(key,value)=>{if(['fas-favs','fas-lots'].includes(key))throw Error('quota');write(key,value)};
 h.run('openCar('+id+')');h.node('#bid').value=h.run('nextLotBid(cars.find(c=>c.id==='+id+'))');
 h.node('#bid-form').onsubmit({preventDefault(){}});
 const saved=JSON.parse(h.records['fas-bids'])[id];assert(saved);assert(Date.parse(saved.ends)>Date.parse(oldEnd));
 assert.equal(h.node('#modal').open,false);assert(h.node('#toast').textContent.includes('принята'));
 const reload=boot({records:h.records});assert.equal(reload.run('current(cars.find(c=>c.id==='+id+'))'),saved.price);
 assert.equal(reload.run('cars.find(c=>c.id==='+id+').ends'),saved.ends,'extension survives failed lot snapshot');
 const privateLot={id:999999991,sellerOwnerId:'seller-owner',category:'cars',name:'Частный тестовый автомобиль',city:'Воронеж',price:100000,start:100000,step:1000,deposit:0,status:'live',startsAt:new Date(Date.now()-60000).toISOString(),ends:new Date(Date.now()+3600000).toISOString()};
 const badEnd=new Date(Date.parse(privateLot.startsAt)+30*86400000+1).toISOString();
 const bounded=boot({records:{'fas-lots':JSON.stringify([privateLot]),'fas-bids':JSON.stringify({[privateLot.id]:{price:101000,count:1,ends:badEnd}})}});
 assert.equal(bounded.run('cars.find(c=>c.id==='+privateLot.id+').ends'),privateLot.ends,'stored private extension cannot exceed30d');
 console.log('PASS: truthful bid failure, unchanged deadlines, independent storage and durable extension reload with private30d bound.');

 const csv=boot();csv.run('openAdmin()');const upload=async rows=>csv.node('#csv').onchange({target:{files:[{text:async()=>rows}]}});
 const header='category;bank;name;city;price;step;deposit;ends\n';
 for(const [price,step,deposit] of [['100000','Infinity','0'],['100000','0','0'],['100000','-1','0'],['100000','1.5','0'],['100000','1000','-1'],['100000','1000','100001'],['1.5','1000','0'],['9007199254740991','1','0']]){
  const before=csv.run('cars.length');await upload(header+['cars','Банк','Некорректный лот','Воронеж',price,step,deposit,future].join(';'));
  assert.equal(csv.run('cars.length'),before,'reject money '+[price,step,deposit]);
 }
 await upload(header+['cars','Банк','Лот с обычными условиями','Воронеж','100000','','',future].join(';'));
 assert.equal(csv.run('cars.at(-1).step'),10000);assert.equal(csv.run('cars.at(-1).deposit'),0);
 const before=csv.run('cars.length');await upload(header+['cars','Банк','Корректная первая строка','Воронеж','100000','1000','0',future].join(';')+'\n'+['cars','Банк','Ошибочная вторая строка','Воронеж','100000','Infinity','0',future].join(';'));
 assert.equal(csv.run('cars.length'),before,'invalid money cannot partially import CSV');

 // Stored old drafts must pass the same checks when a manager publishes directly.
 const publish=boot(),button={dataset:{publish:'999999992'}};
 publish.node('#modal-content').querySelectorAll=selector=>selector==='[data-publish]'?[button]:[];
 publish.run('cars.push({...cars[0],id:999999992,status:"draft",price:100000,start:100000,step:Infinity,deposit:0,ends:'+JSON.stringify(future)+'});ends.push(Date.parse('+JSON.stringify(future)+'));openAdmin()');
 publish.node('#role').value='manager';button.onclick();assert.equal(publish.run('cars.at(-1).status'),'draft');assert(publish.node('#toast').textContent.includes('Шаг'));
 publish.run('cars.at(-1).step=1000;cars.at(-1).deposit=100001');button.onclick();assert.equal(publish.run('cars.at(-1).status'),'draft');
 publish.run('cars.at(-1).deposit=0');button.onclick();assert.equal(publish.run('cars.at(-1).status'),'live');
 console.log('PASS: finite safe auction money, deposit bounds, compatible blank defaults, atomic CSV and manager publication defense.');
})().catch(error=>{console.error(error);process.exitCode=1});
