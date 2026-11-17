const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {boot}=require('./helpers/category-seller-harness.cjs');
(async()=>{
 const h=boot({noMedia:true}),now=Date.now(),id=999879001;
 vm.runInContext(fs.readFileSync('dist/partner-branding.js','utf8'),h.context);
 vm.runInContext(fs.readFileSync('dist/auction-modes.js','utf8'),h.context);
 const base={id,category:'cars',subcategory:'cars',name:'Автомобиль банка',brand:'Toyota',model:'RAV4',bank:'Тестовый банк',sellerType:'bank',city:'Воронеж',regionCode:'36',price:100000,start:100000,step:1000,deposit:0,status:'live',startsAt:new Date(now-3600000).toISOString(),ends:new Date(now+7200000).toISOString(),bids:0,extension:true,partnerLogo:'https://partner.example/logo.svg?size=64&theme=light'};
 const reset=(lot=base)=>h.run('cars=['+JSON.stringify(lot)+'];bids={};ends.splice(0,ends.length,...cars.map(lot=>Date.parse(lot.ends)));invalidateSubscriptionInventory();window.FasKeywordSearch.invalidate();render()');
 const current=()=>h.run('cars.find(lot=>lot.id==='+id+')');
 reset();
 const card=h.run('cardHTML(cars[0])');
 assert(card.includes('data-partner-branding'));assert(card.includes('src="https://partner.example/logo.svg?size=64&amp;theme=light"'),'feed uses the seller-supplied logo');
 h.run('openCar('+id+')');assert(h.node('#modal-content').innerHTML.includes('data-partner-logo'),'detail card shows the same seller logo');
 vm.runInContext(fs.readFileSync('dist/featured-lots.js','utf8'),h.context);
 assert(h.node('#featured-track').innerHTML.includes('data-partner-logo'),'horizontal mini cards include organisation branding');
 const privateLot={...base,sellerOwnerId:'private-owner',sellerType:'private',bank:'Частный продавец'};
 reset(privateLot);assert(!h.run('cardHTML(cars[0])').includes('data-partner-logo'),'private feed cards never acquire an inherited bank logo');
 h.run('openCar('+id+')');assert(!h.node('#modal-content').innerHTML.includes('data-partner-branding'),'private detail cards stay private');
 h.run('window.FasFeaturedLots.refresh({force:true})');assert(!h.node('#featured-track').innerHTML.includes('data-partner-logo'),'private mini cards stay private');

 let fields;
 const defaults=()=>({category:'cars',subcategory:'cars',name:'Имущество организации',brand:'Toyota',bank:'Тестовый банк',sellerType:'bank',city:'Воронеж',regionCode:'36',price:'100000',step:'1000',deposit:'0',status:'live',ends:base.ends,extension:'on',year:'',km:'',latitude:'',longitude:'',address:'',image:'',media:'',docs:'Уточнены документы',comparables:'',marketDate:'',auctionDirection:'ascending',partnerLogo:base.partnerLogo});
 h.context.FormData=function(){const map=new Map(Object.entries(fields));return{get:key=>map.has(key)?map.get(key):null,has:key=>map.has(key)}};
 const open=(edit=id,overrides={})=>{fields={...defaults(),...overrides};h.run(edit===null?'openAdmin()':'openAdmin('+edit+')');h.node('#role').value='manager';return h.node('#lot-form').onsubmit};
 const submit=callback=>(callback||h.node('#lot-form').onsubmit)({preventDefault(){},target:h.node('#lot-form')});
 reset();open();assert(h.node('#modal-content').innerHTML.includes('name="partnerLogo"'),'manager editor exposes the organisation logo field');
 fields.partnerLogo=' https://PARTNER.example/new-logo.png ';submit();assert.equal(current().partnerLogo,'https://partner.example/new-logo.png');assert.equal(JSON.parse(h.records['fas-lots'])[0].partnerLogo,current().partnerLogo,'logo is included in durable lot storage');
 open(id,{partnerLogo:''});submit();assert.equal(current().partnerLogo,'','an explicitly empty optional field clears the previous logo');assert(!h.run('cardHTML(cars[0])').includes('data-partner-logo'),'cleared logos fall back to a neutral organisation mark');
 reset();open();delete fields.partnerLogo;submit();assert.equal(current().partnerLogo,base.partnerLogo,'older forms without the optional field preserve the existing logo');
 for(const logo of ['javascript:alert(1)','http://partner.example/logo.png','https://user:secret@partner.example/logo.png']){
  reset();const activeSubmit=open(id,{partnerLogo:logo}),before=h.run('JSON.stringify(cars)');submit();
  assert.equal(h.run('JSON.stringify(cars)'),before,'invalid logo cannot mutate the catalogue');assert(h.node('#lot-error').textContent.includes('Логотип'));assert.equal(h.node('#modal').open,true);assert.equal(h.node('#lot-form').onsubmit,activeSubmit,'validation keeps the editor and its entered values');
 }
 reset();open(null,{status:'draft',name:'Новая организация',partnerLogo:'https://partner.example/created.png'});submit();assert.equal(h.run('cars.length'),2);assert.equal(h.run('cars.at(-1).partnerLogo'),'https://partner.example/created.png','new organisation listings persist their logo');

 const header='category;bank;name;city;price;ends;partnerLogo;sellerType';
 const csvRow=(name,logo)=>'cars;Банк CSV;'+name+';Воронеж;100000;'+base.ends+';'+logo+';bank';
 const upload=text=>h.node('#csv').onchange({target:{files:[{text:async()=>text}]}});
 reset();open(null);await upload(header+'\n'+csvRow('Лот CSV','https://partner.example/import.png'));
 assert.equal(h.run('cars.length'),2);assert.equal(h.run('cars.at(-1).partnerLogo'),'https://partner.example/import.png');assert(h.run('cardHTML(cars.at(-1))').includes('data-partner-logo'),'CSV branding reaches the actual feed');
 reset();open(null);await upload('category;bank;name;city;price;ends\ncars;Банк CSV;Без логотипа;Воронеж;100000;'+base.ends);
 assert.equal(h.run('cars.length'),2);assert.equal(h.run('cars.at(-1).partnerLogo'),'','legacy CSV remains usable without the optional column');
 reset();open(null);const beforeImport=h.run('JSON.stringify(cars)');await upload(header+'\n'+csvRow('Корректный','https://partner.example/valid.png')+'\n'+csvRow('Неверный','javascript:alert(1)'));
 assert.equal(h.run('JSON.stringify(cars)'),beforeImport,'a bad logo rejects the entire mixed CSV atomically');assert(h.node('#toast').textContent.includes('Логотип'));
 reset();open(null);let complete;const pending=h.node('#csv').onchange({target:{files:[{text:()=>new Promise(resolve=>complete=resolve)}]}});h.node('#modal').close();complete(header+'\n'+csvRow('Поздний','https://partner.example/late.png'));await pending;
 assert.equal(h.run('cars.length'),1,'a logo import completed after closing cannot change the catalogue');
 const html=fs.readFileSync('dist/index.html','utf8');assert(html.indexOf('partner-branding.js')<html.indexOf('<script>'),'branding loads before initial catalogue rendering');assert(html.indexOf('partner-branding.css')<html.indexOf('layout-safety.css'),'shared layout safeguards remain last');
 console.log('PASS: actual feed/detail/mini organisation logos, private exclusion, manager create/edit/clear/validation/persistence and optional atomic/stale CSV branding.');
})().catch(error=>{console.error(error);process.exitCode=1});
