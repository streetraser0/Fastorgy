const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {boot}=require('./helpers/category-seller-harness.cjs');
const {setup}=require('./helpers/quickbar-dom.cjs');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,'dist',name),'utf8');

// The catalog harness owns the actual lexical state and inline handlers. Give
// those handlers a connected DOM, and preserve capture/bubble event ordering.
function integration({bubbleCancellation=false}={}){
 const app=boot(),dom=setup({mobile:true}),document=dom.document;
 dom.Element.prototype.insertAdjacentElement=function(where,node){
  const parent=this.parentElement,index=parent?.children.indexOf(this);
  if(where==='afterend'&&parent){node.parentElement=parent;parent.children.splice(index+1,0,node)}else this.appendChild(node);
 };
 const markup=read('index.html').split('<script>')[0];
 for(const [,tag,attributes,id]of markup.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/gi)){
  const node=document.querySelector('#'+id)||dom.add(id,tag),previous=app.node('#'+id);
  node.value=previous.value;node.textContent=String(previous.textContent);node.innerHTML=previous.innerHTML;
  for(const name of ['onchange','onsubmit','onclick','oninput'])node[name]=previous[name];
  for(const [,name,value]of attributes.matchAll(/([\w-]+)="([^"]*)"/g))node.setAttribute(name,value);
 }
 // quickbar's small DOM keeps detached nodes in an inventory; browser lookup
 // only returns connected nodes, which matters after rebuilding the forms.
 document.getElementById=id=>document.querySelector('#'+id);
 const listeners={},timers=new Map();let timerId=0;
 app.context.setTimeout=(handler,delay=0)=>{const id=++timerId;timers.set(id,{handler,delay});return id};app.context.clearTimeout=id=>timers.delete(id);
 document.addEventListener=(type,handler,options)=>(listeners[type]??=[]).push({handler,capture:options===true||options?.capture===true});
 Object.assign(app.context,{document,MutationObserver:undefined});
 app.context.window.document=document;app.context.window.MutationObserver=undefined;
 app.run('render()');
 vm.runInContext(read('category-ui.js'),app.context);
 let enhancement=read('app-ui.js');
 if(bubbleCancellation){
  assert(enhancement.includes('},{capture:true});'),'counterfactual must remove the real cancellation capture flag');
  enhancement=enhancement.replace('},{capture:true});','});');
 }
 vm.runInContext(enhancement,app.context);
 vm.runInContext(read('property-map.js'),app.context);
 function click(target){
  assert(target,'expected a real category control');
  const event={type:'click',target,defaultPrevented:false,preventDefault(){this.defaultPrevented=true},stopPropagation(){this.stopped=true}};
  for(const entry of listeners.click||[])if(entry.capture)entry.handler(event);
  for(let node=target;node&&!event.stopped;node=node.parentElement){
   node.onclick?.(event);node.dispatchEvent(event);
  }
  if(!event.stopped)for(const entry of listeners.click||[])if(!entry.capture)entry.handler(event);
  return event;
 }
 function select(id){
  const group=app.run('window.FasCategories.groupOf('+JSON.stringify(id)+').id');
  click(document.querySelector('[data-home-category="'+group+'"]'));
  const picker=document.querySelector('#category-picker');assert(picker.open,'home tile opens the real picker');
  const node=app.run('window.FasCategories.get('+JSON.stringify(id)+')');
  click(picker.querySelector(node.kind==='group'?'[data-category-use="'+id+'"]':'[data-category-node="'+id+'"]'));
  assert.equal(picker.open,false,'selection closes the picker');
 }
 return{...app,document,click,select,flushTasks(){for(const [id,timer]of [...timers])if(timer.delay===0){timers.delete(id);timer.handler()}},field:id=>document.querySelector('#'+id)};
}
const settle=async h=>{for(let i=0;i<12;i++){h.flushTasks();await Promise.resolve()}};
(async()=>{
 // An automatic counterfactual proves that this test exercises the initiating
 // click all the way to document, rather than calling onchange in isolation.
 const broken=integration({bubbleCancellation:true});
 const fullCount=broken.run('visibleLots.length');assert.equal(fullCount,52870);
 broken.field('search').value='2х комнатнатная квартира';broken.field('search').oninput({});
 broken.select('houses');await settle(broken);
 assert.equal(broken.field('category').value,'houses');
 assert.equal(broken.run('visibleLots.length'),fullCount,'old bubbling cancellation keeps all stale results');
 assert(broken.run('visibleLots.some(lot=>!window.FasCategories.matches(lot,"houses"))'),'the broken UI actually contains unrelated inventory');
 assert.equal(broken.field('result-count').textContent,fullCount+' лотов');
 console.log('PASS: counterfactual reproduces 52870 stale results after the real property-category click bubbles to document.');

 const h=integration(),leaves=Array.from(h.run('window.FasCategories.leaves()'));
 assert.equal(leaves.length,31);
 const fixture=leaves.map((leaf,index)=>({id:998810000+index,category:leaf.legacyCategory,subcategory:leaf.id,name:leaf.id==='cars'?'Mercedes-Benz E 200':leaf.label,description:'Проверочное имущество Словопроверки',bank:'Тестовый продавец',sellerType:'bank',status:'live',city:'Воронеж',regionCode:'36',price:100000+index,start:100000+index,step:1000,deposit:0,ends:new Date(Date.now()+86400000).toISOString(),latitude:51.66+index*.001,longitude:39.2,rooms:leaf.id==='property'?2:4}));
 h.run('cars='+JSON.stringify(fixture)+';ends.length=0;cars.forEach(lot=>ends.push(Date.parse(lot.ends)));invalidateSubscriptionInventory();window.FasKeywordSearch.invalidate();renderHomeCategories();$("#advanced-reset").onclick();');
 const groups=Array.from(h.run('window.FasCategories.groups()'));
 assert.equal(groups.length,5);
 for(const node of [...groups,...leaves]){
  h.run('$("#advanced-reset").onclick();');
  h.select(node.id);await settle(h);
  const expected=fixture.filter(lot=>h.context.window.FasCategories.matches(lot,node.id)).map(lot=>lot.id);
  assert(expected.length>0,node.id+' has an eligible fixture');
  assert.deepEqual(Array.from(h.run('visibleLots.map(lot=>lot.id)')).sort(),expected.slice().sort(),node.id+' clear-query list');
  // Repeat the real click while a changed keyword search is pending. The
  // previous catalog is deliberately still unfiltered at the time of the tap.
  h.run('$("#advanced-reset").onclick();');h.field('search').value='Словопроверки';h.field('search').oninput({});
  h.select(node.id);await settle(h);
  assert.equal(h.field('category').value,node.id);
  assert.equal(h.run('keywordCategoryAutomatic'),false,'explicit selection is manual before preparation');
  assert.deepEqual(Array.from(h.run('visibleLots.map(lot=>lot.id)')).sort(),expected.slice().sort(),node.id+' keyword list');
  assert.equal(Number.parseInt(h.field('result-count').textContent,10),expected.length);
  // The feed and the map projection consume the exact same filtered IDs.
  h.run('setReels(true)');
  assert.deepEqual(Array.from(h.run('visibleLots.map(lot=>lot.id)')).sort(),expected.slice().sort(),node.id+' feed source');
  assert(h.run('Array.from($("#grid").querySelectorAll(".card")).every(card=>visibleLots.some(lot=>lot.id===Number(card.dataset.lot)))'),node.id+' mounted feed cards');
  const projected=Array.from(h.run('window.FasPropertyMap.project(visibleLots,[51.66,39.2],{locate:lotLocation,isLive:isLotLive}).rows.map(row=>row.lot.id)'));
  assert.deepEqual(projected.sort(),expected.slice().sort(),node.id+' map projection');
  h.run('setReels(false)');
 }
 h.run('$("#advanced-reset").onclick();');h.field('search').value='2х комнатнатная квартира';h.field('search').oninput({});
 h.select('houses');await settle(h);
 assert.equal(h.run('visibleLots.length'),0,'apartment keywords in an explicit house category give an honest empty result');
 assert.equal(h.field('result-count').textContent,'0 лотов');
 assert.equal(h.field('category').value,'houses');
 assert(!h.field('grid').innerHTML.includes('Mercedes-Benz'));
 console.log('PASS: actual home tiles, category picker and asynchronous filtering across all 5 groups/31 leaves, pending keywords, counts, mounted feed and map projection; conflicting apartment/house query is empty.');
})().catch(error=>{console.error(error);process.exitCode=1});
