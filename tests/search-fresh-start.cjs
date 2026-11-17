const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {boot}=require('./helpers/category-seller-harness.cjs');
function install(h){
 h.node('#modal-content').querySelector=()=>null;
 for(const selector of ['#modal','#grid'])h.node(selector).removeAttribute=function(name){delete this[name]};
 vm.runInContext(fs.readFileSync('dist/app-ui.js','utf8'),h.context);
 return h;
}
const first=install(boot({noMedia:true}));
first.run('saved=[cars[0].id];persist(["fas-favs"]);applyKeywordSearch("Митсубиси");render()');
assert.equal(first.node('#search').value,'Митсубиси','active-session search stays visible');
const stored=JSON.parse(first.records['fas-search-preferences-v1']);
assert.equal(stored.basic.search,'','search preferences never persist keyword text');
const reopened=install(boot({noMedia:true,records:{...first.records}}));
assert.equal(reopened.node('#search').value,'');
assert.equal(reopened.node('#category').value,'','automatic category is cleared with its old query');
assert.equal(reopened.node('#keyword-search-feedback').hidden,true);
assert(reopened.run('visibleLots.length')>0,'absent old inventory does not strand a new visit at zero results');
assert.deepEqual(Array.from(reopened.run('saved')),Array.from(first.run('saved')),'starting a fresh search preserves saved favorites');
assert.equal(reopened.records['fas-favs'],first.records['fas-favs']);

const legacy={version:1,categoryAutomatic:true,basic:{search:'Митсубиси',category:'transport','region-filter':'36',sort:'low'},advanced:{'price-min':'1000'},tab:'all'};
const old=install(boot({noMedia:true,records:{'fas-search-preferences-v1':JSON.stringify(legacy)}}));
assert.equal(old.node('#search').value,'','old version-1 query text is ignored too');
assert.equal(old.node('#category').value,'');
assert.equal(old.node('#region-filter').value,'36');assert.equal(old.node('#sort').value,'low');assert.equal(old.node('#adv-price-min').value,'1000');
const manual={...legacy,categoryAutomatic:false,categoryExplicit:true,basic:{...legacy.basic,category:'cars,property'}};
const chosen=install(boot({noMedia:true,records:{'fas-search-preferences-v1':JSON.stringify(manual)}}));
assert.equal(chosen.node('#search').value,'');assert.equal(chosen.node('#category').value,'cars,property','explicit multiple categories remain selected');
assert.equal(chosen.node('#region-filter').value,'36');
console.log('PASS: fresh/reloaded visits clear old keywords and automatic category, current text stays visible, manual category and price/region/sort preferences remain.');
