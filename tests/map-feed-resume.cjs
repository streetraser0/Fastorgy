const assert=require('node:assert/strict');
const {integration}=require('./helpers/category-multi-harness.cjs');
const base={bank:'Контрольный продавец',sellerType:'bank',status:'live',city:'Воронеж',regionCode:'36',price:1000000,start:1000000,step:1000,deposit:0,ends:'2099-01-01T00:00:00Z',demo:false,category:'cars',subcategory:'cars',latitude:51.66,longitude:39.2};
const fixtures=[{...base,id:999792001,name:'Toyota Camry',brand:'Toyota',model:'Camry',media:[{url:'https://example.org/camry.mp4',type:'video'}]},{...base,id:999792002,name:'BMW 320',brand:'BMW',model:'320',latitude:51.67,media:[{url:'https://example.org/bmw.mp4',type:'video'}]}];
const h=integration({fixtures}),run=h.run,field=h.field,map=h.context.window.FasPropertyMap;
const proto=Object.getPrototypeOf(field('grid'));
Object.defineProperty(proto,'paused',{configurable:true,get(){return this._paused!==false},set(value){this._paused=value}});
proto.pause=function(){this.paused=true;this.pauseCalls=(this.pauseCalls||0)+1};proto.play=function(){this.paused=false;this.playCalls=(this.playCalls||0)+1;return Promise.resolve()};
map.configure({getLots:()=>fixtures,getAllLots:()=>fixtures,getOrigin:()=>({point:[51.66,39.2],approximate:true})});
function begin(){run('openLocalFeed()');for(const track of field('grid').querySelectorAll('.gallery-track'))track.scrollLeft=0;run('syncReels(swipeIndex())');return field('grid').querySelectorAll('video')}
let [first,second]=begin();assert.equal(first.paused,false);assert.equal(second.paused,true);
map.open();assert.equal(first.paused,true);const played=first.playCalls;map.close();assert.equal(first.paused,false,'closing the map resumes the current visible reel through the common gate');assert.equal(first.playCalls,played+1);assert.equal(second.playCalls||0,0,'offscreen video never starts');
// The gate uses the actual current reel, rather than a video captured on opening.
map.open();run('moveLot(1);updateSwipePosition()');assert.equal(second.paused,true);map.close();assert.equal(first.paused,true);assert.equal(second.paused,false,'a changed current reel is resumed correctly');
// Any remaining dialog blocks autoplay, including dialogs other than #modal.
const other=h.document.createElement('dialog');h.document.body.appendChild(other);other.showModal();map.open();const beforeOther=second.playCalls;map.close();assert.equal(second.paused,true);assert.equal(second.playCalls,beforeOther);other.close();run('syncReels(swipeIndex())');assert.equal(second.paused,false);
map.open();h.document.hidden=true;const beforeHidden=second.playCalls;map.close();assert.equal(second.paused,true);assert.equal(second.playCalls,beforeHidden);h.document.hidden=false;run('syncReels(swipeIndex())');assert.equal(second.paused,false);
// A queued close event from an older map view cannot tear down its reopened view.
map.open();map.close();map.open();const dialog=field('property-map-dialog'),beforeStale=second.playCalls;dialog.dispatchEvent({type:'close',target:dialog});assert.equal(map.state().open,true);assert(h.document.body.classList.contains('property-map-open'));assert.equal(second.paused,true);assert.equal(second.playCalls,beforeStale);map.close();assert.equal(second.paused,false);
run('setReels(false)');const catalogueVideos=field('grid').querySelectorAll('video');map.open();map.close();assert.equal(run('reelsMode'),false);for(const video of catalogueVideos){assert.equal(video.paused,true);assert.equal(video.playCalls||0,0,'closing a map in the catalogue does not autoplay videos')}
console.log('PASS: actual map close resumes only the current visible reel through media gating; other dialogs, hidden page, stale reopened close events and catalogue exit prevent autoplay.');
