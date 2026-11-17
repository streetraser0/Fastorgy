const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {boot}=require('./helpers/category-seller-harness.cjs');
const h=boot({noMedia:true});vm.runInContext(fs.readFileSync('dist/recommendations.js','utf8'),h.context);h.run('cars=cars.slice(0,3);window.FasRecommendations.beginSession(cars,saved);setReels(true)');
const id=h.run('cars[0].id'),grid=h.node('#grid'),R=h.context.window.FasRecommendations;
const photo={querySelectorAll(){return[]},appendChild(){}},card={dataset:{lot:String(id)},querySelector(){return photo}},target={closest(selector){return selector==='.card[data-lot]'?card:null}};
grid.contains=node=>node===card||node===target;grid.scrollTop=700;
vm.runInContext(fs.readFileSync('dist/lot-gestures.js','utf8'),h.context);const controller=h.run('installFasLotGestures()');
const foreignLots=JSON.stringify([{id:999883010,status:'sold',name:'Внешний лот'}]),foreignBids=JSON.stringify({999883010:{price:900000,count:5}});
h.records['fas-lots']=foreignLots;h.records['fas-bids']=foreignBids;h.writes.length=0;
const event={target,clientX:100,clientY:120,detail:1,button:0,cancelable:true,preventDefault(){}};
controller.click(event);controller.click(event);
assert.equal(h.run('saved.includes('+id+')'),true);assert.equal(R.summary().favoriteCount,1,'the real mobile double-tap reaches the same interest hook as the heart');assert.equal(h.records['fas-lots'],foreignLots);assert.equal(h.records['fas-bids'],foreignBids,'a double-tap never writes financial snapshots');assert(h.writes.includes('fas-favs'));assert(!h.writes.includes('fas-bids'));assert(!h.writes.includes('fas-lots'));assert.equal(grid.scrollTop,700);
controller.click(event);controller.click(event);assert.equal(h.run('saved.length'),1,'repeated double-taps cannot toggle a saved lot off');assert.equal(R.summary().favoriteCount,1);assert.equal(grid.scrollTop,700);
console.log('PASS: actual mobile double-tap records one recommendation favorite, preserves scroll, remains idempotent and writes no auction/bid data across tabs.');
// Failed favorite persistence must not announce success, mutate interests, or remove an existing favorite.
const otherId=h.run('cars[1].id'),originalWrite=h.context.localStorage.setItem,previousSaved=h.run('JSON.stringify(saved)'),previousDurable=h.records['fas-favs'],beforeSignals=R.summary().signalCount,beforeFavorites=R.summary().favoriteCount,beforeMarkup=grid.innerHTML;
h.context.localStorage.setItem=(key,value)=>{if(key==='fas-favs')throw Error('quota');return originalWrite(key,value)};
assert.equal(h.run('toggleLotFavorite('+otherId+')'),false);assert.equal(h.run('JSON.stringify(saved)'),previousSaved);assert.equal(h.records['fas-favs'],previousDurable);assert.equal(R.summary().signalCount,beforeSignals);assert.equal(grid.innerHTML,beforeMarkup);assert.equal(grid.scrollTop,700);assert(h.node('#toast').textContent.includes('не сохранено'));
assert.equal(h.run('toggleLotFavorite('+id+')'),false,'failed removal keeps its saved membership');assert.equal(h.run('JSON.stringify(saved)'),previousSaved);assert.equal(R.summary().favoriteCount,beforeFavorites);
card.dataset.lot=String(otherId);let pulses=0;photo.appendChild=()=>pulses++;controller.click(event);controller.click(event);assert.equal(pulses,0,'a failed double-tap has no success pulse');assert.equal(h.run('JSON.stringify(saved)'),previousSaved);assert.equal(R.summary().favoriteCount,beforeFavorites);assert(h.node('#toast').textContent.includes('не сохранено'),'a gesture must not replace the failure with added/already-saved feedback');
h.context.localStorage.setItem=originalWrite;
// Apply the user's explicit add/remove action to the fresh favorites set, preserving another tab's other IDs.
const foreignFavorite=999883012;h.records['fas-favs']=JSON.stringify([id,foreignFavorite]);assert.equal(h.run('toggleLotFavorite('+otherId+')'),true);assert.deepEqual(JSON.parse(h.records['fas-favs']),[id,foreignFavorite,otherId]);assert.equal(h.run('saved.includes('+foreignFavorite+')'),true);
h.records['fas-favs']=JSON.stringify([id,foreignFavorite,otherId,999883013]);assert.equal(h.run('toggleLotFavorite('+id+')'),true);assert.deepEqual(JSON.parse(h.records['fas-favs']),[foreignFavorite,otherId,999883013]);assert.equal(R.summary().favoriteCount,beforeFavorites,'failed actions did not train interests; later durable add/remove are balanced');assert.equal(h.records['fas-lots'],foreignLots);assert.equal(h.records['fas-bids'],foreignBids);assert.equal(grid.scrollTop,700);
console.log('PASS: favorite add/remove quota rollback, unchanged interests/card/scroll, no false double-tap success and bounded-action cross-tab favorite merging.');

// A stale mounted card cannot announce a favorite action after its lot disappeared.
h.run('cars=cars.filter(lot=>lot.id!=='+otherId+')');card.dataset.lot=String(otherId);pulses=0;const noticeBefore=h.node('#toast').textContent;
assert.equal(h.run('toggleLotFavorite('+otherId+')'),false);controller.click(event);controller.click(event);assert.equal(pulses,0);assert.equal(h.node('#toast').textContent,noticeBefore,'deleted-card gesture never reports added/already-saved success');
console.log('PASS: deleted mounted lots cannot produce false favorite feedback.');
