const assert=require('node:assert/strict');
const {boot}=require('./helpers/category-seller-harness.cjs');
const h=boot({noMedia:true}),run=h.run,grid=h.node('#grid'),RealDate=Date,now=Date.now();
h.context.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}};
let markup=grid.innerHTML,writes=[];
Object.defineProperty(grid,'innerHTML',{get:()=>markup,set:value=>{markup=value;writes.push(value)},configurable:true});
run('window.cardCalls=0;window.originalCardHTML=cardHTML;cardHTML=function(...args){window.cardCalls++;return window.originalCardHTML(...args)};userGeo={point:[51.66,39.2],approximate:false};$("#sort").value="nearest";reelsMode=true');
function capture(source){writes=[];run('window.cardCalls=0');run(source);return {cards:h.context.window.cardCalls,writes:writes.length,html:markup}}
function expectedCards(expression){return run(expression+'.map(window.originalCardHTML).join("")')}
assert(run('cars.length')>=52785,'use the complete regional inventory');
const first=capture('render()');assert.equal(first.cards,25,'only the mounted feed window builds cards');assert.equal(first.writes,1,'feed rendering replaces the grid once');
assert.equal(first.html,expectedCards('visibleLots.slice(0,25)'));
const inventoryOrder=run('visibleLots.map(lot=>lot.id).join(",")');
assert.equal(run('activeFeedIndex()'),0);assert.equal(grid.scrollTop,0);

run('window.lastLotId=visibleLots.at(-1).id');
const preserved=capture('render(window.lastLotId)');assert.equal(preserved.cards,25);assert.equal(preserved.writes,1);assert.equal(preserved.html,expectedCards('visibleLots.slice(-25)'));
assert.equal(run('visibleLots[activeFeedIndex()].id'),h.context.window.lastLotId,'a refresh retains the active lot near the final window');
assert.equal(run('visibleLots.map(lot=>lot.id).join(",")'),inventoryOrder,'render branch keeps every inventory ID and nearest-first order');

const fallback=capture('recommendationSession={ids:new Set([-1]),personalized:true};render(window.lastLotId)');
assert.equal(fallback.cards,25);assert.equal(fallback.writes,1,'an empty recommendation set falls back before writing cards');assert.equal(fallback.html,preserved.html);
assert.equal(run('recommendationSession.reason'),'no-eligible');

const catalog=capture('reelsMode=false;catalogLimit=24;render()');assert.equal(catalog.cards,24);assert.equal(catalog.writes,1);assert.equal(catalog.html,expectedCards('visibleLots.slice(0,24)'));assert.equal(grid.scrollTop,0);
assert.equal(run('visibleLots.map(lot=>lot.id).join(",")'),inventoryOrder,'catalog mode retains the complete same ordered inventory');
for(const reels of [false,true]){
 const empty=capture('reelsMode='+reels+';$("#region-filter").value="missing-region";render()');
 assert.equal(empty.cards,0);assert.equal(empty.writes,1);assert.equal(empty.html,run('emptyResultsHTML()'));assert.equal(run('visibleLots.length'),0);assert.equal(grid.scrollTop,0);
}
run('$("#region-filter").value="";');
console.log('PASS: feed renders 25 cards with one grid write, preserving full inventory/order/active lot, recommendation fallback, 24-card catalog and empty states.');
