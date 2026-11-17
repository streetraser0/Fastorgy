process.chdir(require('path').resolve(__dirname,'..'));
const assert=require('assert/strict');
function boot(records={}){
const fs=require('fs'),vm=require('vm'),assert=require('assert');const nodes=new Map;const callbacks=[];function node(s){if(!nodes.has(s)){const classes=new Set;nodes.set(s,{value:'',textContent:'',innerHTML:'',style:{setProperty(k,v){this[k]=v}},clientHeight:700,scrollTop:0,classList:{add(v){classes.add(v)},remove(v){classes.delete(v)},contains(v){return classes.has(v)},toggle(v,on){if(on)classes.add(v);else classes.delete(v)}},addEventListener(){},setAttribute(key,value){this[key]=value},querySelectorAll(sel){if(sel==='.card')return [...this.innerHTML.matchAll(/<article class="card" data-lot="(\d+)"/g)].map(m=>({dataset:{lot:m[1]},querySelectorAll(){return[]}}));return[]},scrollTo(o){if(o.top!==undefined)this.scrollTop=o.top},scrollIntoView(){},showModal(){this.open=true},close(){this.open=false}})}return nodes.get(s)}const context={console,Date,JSON,Number,String,Math,Array,Set,Map,Blob,URL,Object,localStorage:{getItem(key){return records[key]??null},setItem(key,value){records[key]=value}},document:{body:node('body'),addEventListener(){},querySelector:node,querySelectorAll(){return[]}},window:{addEventListener(){},matchMedia(){return{matches:false}}},setInterval(){},setTimeout(fn){callbacks.push(fn);return callbacks.length},clearTimeout(){},FormData:function(){}};vm.createContext(context);vm.runInContext(fs.readFileSync('dist/ui-icons.js','utf8'),context);vm.runInContext(fs.readFileSync('dist/demo-profiles.js','utf8'),context);vm.runInContext(fs.readFileSync('dist/geo-data.js','utf8'),context);vm.runInContext(fs.readFileSync('dist/catalog-data.js','utf8'),context);vm.runInContext(fs.readFileSync('dist/search-data.js','utf8'),context);vm.runInContext(fs.readFileSync('dist/index.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1],context);const run=s=>vm.runInContext(s,context);return {context,node,run};
}

for(const record of [
 {'fas-favs':'null'}, {'fas-favs':'{}'}, {'fas-favs':'true'}, {'fas-favs':'"oops"'},
 {'fas-bids':'null'}, {'fas-bids':'[]'}, {'fas-bids':'true'}, {'fas-bids':'"oops"'},
 {'fas-subscriptions':'[null]'}, {'fas-notices':'[null]'}, {'fas-lots':'[null]'}
]){
 const key=Object.keys(record)[0];
 assert.doesNotThrow(()=>{const h=boot(record);assert(h.run('visibleLots.length')>0)},key+'='+record[key]);
}
console.log('PASS: malformed JSON storage values do not prevent catalog startup.');
const h=boot(),{node,run}=h;
const id=run('visibleLots[0].id');
node('#grid').scrollTop=320;
node('#grid').onclick({target:{closest(selector){return selector==='[data-fav]'?{dataset:{fav:String(id)}}:null}}});
assert.equal(node('#grid').scrollTop,320,'ordinary heart must preserve catalog scroll');
assert(run('saved.includes('+id+')'));
assert.equal(String(node('#fav-count').textContent),'1');
run('setReels(true)');
const activeId=run('visibleLots[feedIndex].id');
node('#grid').scrollTop=13*700;
const before=node('#grid').scrollTop;
node('#grid').onclick({target:{closest(selector){return selector==='[data-fav]'?{dataset:{fav:String(activeId)}}:null}}});
assert.equal(node('#grid').scrollTop,before,'ordinary heart must preserve feed scroll');
console.log('PASS: ordinary favorite control preserves catalog/feed scroll.');

// One full lot-data record must not prevent smaller favorites/bids records from saving.
const storage=boot(),written=[],write=storage.context.localStorage.setItem;storage.context.localStorage.setItem=(key,value)=>{written.push(key);if(key==='fas-lots')throw Error('quota');write(key,value)};storage.run('saved=[1042];persist()');assert.deepEqual(written,['fas-favs','fas-bids','fas-lots']);
const isolated=boot({'fas-favs':'broken JSON','fas-bids':'{"1042":{"price":3600000,"count":2}}'});assert.equal(isolated.run('current(cars.find(c=>c.id===1042))'),3600000);
console.log('PASS: independent storage records survive malformed neighboring records and lot-storage quota failure.');
// Removing an item while viewing Favorites updates membership and eventually the empty state.
const f=boot();f.run('saved=cars.slice(0,2).map(c=>c.id);localStorage.setItem("fas-favs",JSON.stringify(saved));setTab("fav")');
const removeFavorite=id=>f.node('#grid').onclick({target:{closest:selector=>selector==='[data-fav]'?{dataset:{fav:String(id)}}:null}});
const removeId=f.run('visibleLots[0].id');removeFavorite(removeId);assert.equal(f.run('visibleLots.length'),1);assert.equal(f.run('saved.length'),1);assert(f.run('visibleLots[0].id')!==removeId);removeFavorite(f.run('visibleLots[0].id'));assert.equal(f.run('visibleLots.length'),0);assert(f.node('#grid').innerHTML.includes('Ваше избранное пока пусто'));
assert.doesNotThrow(()=>f.run('openCar(-100)'));assert.doesNotThrow(()=>f.run('cars[0].status="draft";openCar(cars[0].id)'));assert.equal(f.node('#modal').open,undefined);
console.log('PASS: favorite removal updates membership/empty state; unavailable and draft lot opening stays closed.');
