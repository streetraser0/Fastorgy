const assert=require('node:assert/strict');
const {boot}=require('./helpers/category-seller-harness.cjs');
const h=boot(),plain=value=>JSON.parse(JSON.stringify(value));
const run=source=>h.run(source),grid=h.node('#grid');
const ids=()=>[...grid.innerHTML.matchAll(/<article class="card" data-lot="(\d+)"/g)].map(match=>Number(match[1]));
const active=()=>run('activeFeedIndex()');
function bounded(){const mounted=ids();assert(mounted.length<=25,'at most 25 mounted cards');assert.equal(new Set(mounted).size,mounted.length,'no duplicate cards in a virtual window');for(let i=1;i<mounted.length;i++)assert.equal(mounted[i],mounted[i-1]+1,'mounted cards follow the canonical nearest-first order');return mounted}
for(const count of [0,1,2,24,25,26,100000])for(const index of [-1,0,1,12,count-1,count,count+100]){
 const window=plain(run('reelWindowIndices('+index+','+count+')'));assert.equal(window.length,Math.min(count,25));assert.equal(new Set(window).size,window.length);assert(window.every(value=>value>=0&&value<count));for(let i=1;i<window.length;i++)assert.equal(window[i],window[i-1]+1);
}
assert.equal(run('clampFeedIndex(-1,100)'),0);assert.equal(run('clampFeedIndex(100,100)'),99);
const now=Date.now(),count=67,base={category:'cars',subcategory:'cars',brand:'BMW',name:'Тестовый автомобиль',bank:'Тестовый продавец',city:'Воронеж',regionCode:'36',price:100000,start:100000,step:1000,deposit:0,status:'live',ends:new Date(now+86400000).toISOString(),bids:0};
const lots=Array.from({length:count},(_,i)=>({...base,id:991170000+i,latitude:51.66+i*.001,longitude:39.2,category:['cars','trucks','equipment'][i%3]})).reverse();
run('cars='+JSON.stringify(lots)+';ends.splice(0,ends.length,...cars.map(lot=>Date.parse(lot.ends)));userGeo={point:[51.66,39.2],approximate:false};openLocalFeed()');
assert.equal(run('visibleLots.length'),count,'the home feed uses every live lot beyond the 24-card catalogue page');
assert.deepEqual(plain(run('visibleLots.map(lot=>lot.id)')),Array.from({length:count},(_,i)=>991170000+i));assert.equal(active(),0);assert.equal(grid.scrollTop,0,'first lot starts at the physical top, without wrapped preceding cards');bounded();run('updateSwipePosition()');assert.equal(h.node('#reels-up').disabled,true);
const viewed=[active()];
for(let i=1;i<count;i++){
 run('moveLot(1);updateSwipePosition()');assert.equal(active(),i,'every next index remains reachable across virtual windows');viewed.push(active());bounded();
 if(i%7===0)run('settleFeedIfIdle($("#grid").scrollTop,feedScrollEpoch)');
}
assert.deepEqual(viewed,Array.from({length:count},(_,i)=>i),'nothing repeats or skips before the inventory ends');assert.equal(active(),count-1);const lastTop=grid.scrollTop;run('moveLot(1);updateSwipePosition()');assert.equal(active(),count-1);assert.equal(grid.scrollTop,lastTop,'last lot never jumps back to the nearest lot');assert.equal(h.node('#lot-next').disabled,true);assert.equal(h.node('#reels-down').disabled,true);assert(h.node('#reels-position').textContent.includes('Конец ленты'));assert(!h.node('#reels-position').textContent.includes('∞'));
for(let i=count-2;i>=0;i--){run('moveLot(-1);updateSwipePosition()');assert.equal(active(),i);bounded()}
const firstTop=grid.scrollTop;run('moveLot(-1);updateSwipePosition()');assert.equal(active(),0);assert.equal(grid.scrollTop,firstTop);assert.equal(h.node('#lot-prev').disabled,true);
// Native long swipes keep the same page throughout touch/momentum; recycling waits for idle.
run('mountReelWindow(10);feedTouchStart({touches:[{}]})');grid.scrollTop=24*700;assert.equal(active(),24);const oldMarkup=grid.innerHTML;run('settleFeedIfIdle($("#grid").scrollTop,feedScrollEpoch)');assert.equal(grid.innerHTML,oldMarkup,'touching finger prevents recycling');run('feedTouchEnd({touches:[]});settleFeedIfIdle($("#grid").scrollTop,feedScrollEpoch)');assert.equal(active(),24);assert.equal(grid.scrollTop,12*700);bounded();
run('mountReelWindow(40)');grid.scrollTop=0;assert.equal(active(),28);run('settleFeedIfIdle($("#grid").scrollTop,feedScrollEpoch)');assert.equal(active(),28);assert.equal(grid.scrollTop,12*700,'long reverse swipe is also recycled around the correct global lot');bounded();
// A newer mount invalidates any previously queued idle callback.
const staleEpoch=run('feedScrollEpoch');run('mountReelWindow(50)');const before=grid.innerHTML;run('settleFeedIfIdle(0,'+staleEpoch+')');assert.equal(grid.innerHTML,before);assert.equal(active(),50);
run('mountReelWindow(15)');grid.clientHeight=600;run('settleFeedIfIdle($("#grid").scrollTop,feedScrollEpoch)');assert.equal(active(),15);assert.equal(run('feedPageHeight'),600,'viewport resizing preserves the current global lot');
// A 100k inventory still mounts a fixed-size window and clamps its physical endpoints.
run('visibleLots=Array.from({length:100000},(_,i)=>({...cars[0],id:1000000+i}));mountReelWindow(99999)');assert.equal(ids().length,25);assert.equal(active(),99999);run('moveLot(1)');assert.equal(active(),99999);run('mountReelWindow(0);moveLot(-1)');assert.equal(active(),0);assert.equal(grid.scrollTop,0);
for(const n of [1,2]){run('visibleLots=Array.from({length:'+n+'},(_,i)=>({...cars[0],id:2000000+i}));mountReelWindow(0)');assert.equal(ids().length,n);assert.equal(new Set(ids()).size,n);run('moveLot(-1)');assert.equal(active(),0);run('mountReelWindow('+(n-1)+');moveLot(1)');assert.equal(active(),n-1)}
run('visibleLots=[];$("#grid").innerHTML="";updateSwipePosition();moveLot(1)');assert.equal(h.node('#lot-next').disabled,true);assert.equal(h.node('#reels-up').disabled,true);
console.log('PASS: full nearest-first inventory traversal beyond24, contiguous bounded25 windows, no endpoint wrapping/duplicates, bidirectional long-swipe idle recycling, stale callbacks, resize and100k boundaries.');
