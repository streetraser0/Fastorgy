const assert=require('assert/strict');
const {boot}=require('./helpers/category-seller-harness.cjs');

function makeGallery(){
 let writes=0;
 const watched=(initial={})=>new Proxy(initial,{set(target,key,value){writes++;target[key]=value;return true}});
 const dots=Array.from({length:3},()=>({classList:{toggle(){writes++}},setAttribute(){writes++}}));
 const count=watched({textContent:''}),prev=watched({disabled:false}),next=watched({disabled:false});
 const box={querySelectorAll:()=>dots,querySelector:selector=>({'.gallery-count':count,'.gallery-prev':prev,'.gallery-next':next}[selector]||null)};
 const track={scrollLeft:0,clientWidth:300,isConnected:true,parentElement:box,children:[],querySelectorAll:selector=>selector==='video'?videos:[]};
 const slides=Array.from({length:3},()=>({parentElement:track}));track.children=slides;
 const videos=slides.map(parentElement=>({parentElement,paused:false,dataset:{},pauseCalls:0,playCalls:0,pause(){this.pauseCalls++;this.paused=true},play(){this.playCalls++;this.paused=false;return Promise.resolve()}}));
 return {track,videos,count,prev,next,writes:()=>writes};
}

const h=boot(),gallery=makeGallery();h.context.testTrack=gallery.track;
h.run('syncGallery(testTrack)');const initial=gallery.writes();
for(let n=0;n<20;n++)h.run('syncGallery(testTrack)');
assert.equal(gallery.writes(),initial,'subpixel scrolling within one slide must not rewrite all pagination controls');
assert.equal(gallery.videos[1].pauseCalls,1,'already-paused offscreen videos are not paused repeatedly');
gallery.videos[1].paused=false;h.run('syncGallery(testTrack)');
assert.equal(gallery.videos[1].pauseCalls,2,'same-index shortcut still stops an offscreen video that starts playing');
gallery.track.scrollLeft=300;h.run('syncGallery(testTrack)');
assert(gallery.writes()>initial);assert.equal(gallery.count.textContent,'2 / 3');assert.equal(gallery.prev.disabled,false);
assert.equal(gallery.videos[0].paused,true,'moving to another slide stops the previous video');
const replacement=makeGallery();h.context.testTrack=replacement.track;h.run('syncGallery(testTrack)');
assert(replacement.writes()>0,'new gallery tracks receive their own initial state');
console.log('PASS: unchanged slide avoids repeated pagination writes; offscreen video safety and replacement galleries remain correct.');

const frames=[],queued=makeGallery(),second=makeGallery(),detached=makeGallery();
h.context.window.requestAnimationFrame=callback=>{frames.push(callback);return frames.length};
h.context.testTrack=queued.track;h.context.secondTrack=second.track;h.context.detachedTrack=detached.track;
for(let n=0;n<25;n++)h.run('queueGallerySync(testTrack)');
h.run('queueGallerySync(secondTrack);queueGallerySync(detachedTrack)');detached.track.isConnected=false;
assert.equal(frames.length,1,'a scroll burst schedules one frame');assert.equal(queued.writes(),0,'scroll event handler defers DOM work');
frames.shift()();
assert(queued.writes()>0);assert(second.writes()>0);assert.equal(detached.writes(),0,'removed galleries are ignored');
const before=queued.writes();queued.track.scrollLeft=600;h.run('queueGallerySync(testTrack)');assert.equal(frames.length,1);frames.shift()();
assert(queued.writes()>before);assert.equal(queued.count.textContent,'3 / 3');assert.equal(queued.next.disabled,true);
const requested=[];queued.track.scrollLeft=0;queued.track.scrollTo=options=>requested.push(options);
h.run('moveMedia(testTrack,1)');assert.equal(requested[0].left,300,'gallery buttons start scrolling immediately');assert.equal(frames.length,0);
queued.track.scrollLeft=-500;h.run('queueGallerySync(testTrack)');frames.shift()();assert.equal(queued.count.textContent,'1 / 3');assert.equal(queued.prev.disabled,true,'rubber-band scroll stays within gallery bounds');
console.log('PASS: gallery scroll bursts coalesce once per frame, all connected tracks update and detached work is discarded.');

const playback=makeGallery(),active=playback.videos[0];active.paused=true;
h.node('#grid').querySelectorAll=selector=>selector==='.card'?[{querySelectorAll:()=>playback.videos}]:[];
h.context.document.hidden=false;h.node('#modal').open=false;
let reduced=false;h.context.window.matchMedia=()=>({matches:reduced});
h.run('reelsMode=true;visibleLots=[cars[0]];feedIndex=0;syncReels(0);syncReels(0)');
assert.equal(active.playCalls,1,'already-playing active video does not create a new play promise on every scroll');
h.node('#modal').open=true;h.run('syncReels(0);syncReels(0)');assert.equal(active.pauseCalls,1,'modal pauses active video once');
assert.equal(active.playCalls,1);h.node('#modal').open=false;h.run('syncReels(0)');assert.equal(active.playCalls,2,'closing overlay resumes active video');
h.context.document.hidden=true;h.run('syncReels(0);syncReels(0)');assert.equal(active.pauseCalls,2);
h.context.document.hidden=false;reduced=true;h.run('syncReels(0)');assert.equal(active.playCalls,2,'reduced motion prevents automatic playback');
reduced=false;h.run('syncReels(0)');assert.equal(active.playCalls,3);
console.log('PASS: repeated Reels sync avoids duplicate playback work while modal, background and reduced-motion guards remain effective.');
