const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
function boot({featured=false,desktop=true,video=false,single=false}={}){
 const h=setup(),c=h.context,timers=new Map(),previews=[],sync=[];let time=0,id=0,on=desktop,hit=null;
 c.FasDesktopWeb={active:()=>on};c.setTimeout=(fn,ms)=>{const key=++id;timers.set(key,{fn,at:time+ms});return key};c.clearTimeout=key=>timers.delete(key);c.queueGallerySync=rail=>sync.push(rail);
 const container=featured?h.add('featured-track'):h.grid,box=h.add('photo-box','div',container);box.className=featured?'featured-photo':'lot-gallery';if(featured)box.setAttribute('data-featured-gallery','42');
 const rail=h.add('photo-track','div',box);rail.className=featured?'featured-photo-track':'gallery-track';rail.clientWidth=300;rail.clientHeight=200;rail.scrollLeft=0;
 Object.defineProperties(rail,{firstElementChild:{get(){return this.children[0]}},lastElementChild:{get(){return this.children.at(-1)}}});
 rail.getBoundingClientRect=()=>({left:100,right:400,top:100,bottom:300,width:300,height:200});
 for(let i=0;i<(single?1:3);i++){const slide=h.add('slide'+i,featured?'button':'div',rail);if(featured)slide.className='featured-open';h.add('media'+i,video&&i===1?'video':'img',slide)}
 const image=rail.children[0].querySelector('img');hit=image;h.document.elementFromPoint=()=>hit;
 c.FasFeaturedLots={previewPhoto(b,index){previews.push([b,index]);rail.scrollLeft=index*300;return true}};
 vm.runInContext(fs.readFileSync('dist/desktop-photo-hover.js','utf8'),c);
 const emit=(type,target=image,extra={})=>{hit=target;const event={type,target,relatedTarget:null,pointerType:'mouse',buttons:0,isPrimary:true,clientX:360,clientY:180,...extra};for(const fn of h.docEvents[type]||[])fn(event);return event};
 const advance=ms=>{time+=ms;for(const [key,item]of [...timers])if(item.at<=time){timers.delete(key);item.fn()}};
 return {...h,box,rail,image,emit,advance,previews,sync,timers,api:c.FasDesktopPhotoHover,setActive(value){on=value},setHit(value){hit=value}};
}
for(const featured of [false,true]){
 const h=boot({featured});h.emit('pointerover');h.advance(79);assert.equal(h.rail.scrollLeft,0);h.advance(1);assert.equal(h.rail.scrollLeft,600,'right zone previews third photo without click');assert.equal(h.timers.size,0,'hover does not start an autoplay loop');
 for(let i=0;i<40;i++)h.emit('pointermove');h.advance(5000);assert.equal(h.rail.scrollLeft,600);assert.equal(h.previews.length+h.sync.length,1,'same-zone pointer traffic causes no repeated work');
 h.emit('pointermove',h.image,{clientX:220});h.advance(80);assert.equal(h.rail.scrollLeft,300);h.emit('pointermove',h.image,{clientX:120});h.advance(80);assert.equal(h.rail.scrollLeft,0);
 assert.equal(h.grid.scrollTop,0,'lot feed position does not change');
}
for(const reason of ['leave','down','wheel','blur','resize','hidden','dialog','touch','buttons','native','detached','overlay-hit','destroy']){
 const h=boot();h.emit('pointerover');
 if(reason==='leave')h.emit('pointerout',h.image,{relatedTarget:h.body});
 if(reason==='down')h.emit('pointerdown');if(reason==='wheel')h.emit('wheel');
 if(reason==='blur'||reason==='resize')for(const fn of h.winEvents[reason]||[])fn({});
 if(reason==='hidden')h.document.hidden=true;if(reason==='dialog')h.modal.showModal();
 if(reason==='touch')h.emit('pointermove',h.image,{pointerType:'touch'});if(reason==='buttons')h.emit('pointermove',h.image,{buttons:1});
 if(reason==='native')h.setActive(false);if(reason==='detached')h.rail.remove();if(reason==='overlay-hit')h.setHit(h.body);if(reason==='destroy')h.api.destroy();
 h.advance(500);assert.equal(h.rail.scrollLeft,0,reason+' cancels the pending preview');assert.equal(h.timers.size,0);
}
{
 const h=boot();h.emit('pointerover');h.emit('pointermove',h.image,{clientX:220});assert.equal(h.timers.size,1);h.advance(80);assert.equal(h.rail.scrollLeft,300,'only the latest zone is applied');
 h.emit('pointermove',h.image,{clientX:360});h.emit('pointerout',h.image,{relatedTarget:h.rail.children[1].querySelector('img')});h.advance(80);assert.equal(h.rail.scrollLeft,600,'moving among the same photo rail descendants retains intent');
}
for(const kind of ['mobile','single','video-control','button','outside']){
 const h=boot({desktop:kind!=='mobile',single:kind==='single'});let target=h.image;
 if(kind==='video-control')target=h.add('video','video',h.rail);if(kind==='button')target=h.add('fav','button',h.box);
 h.emit('pointerover',target,kind==='outside'?{clientX:450}:{});h.advance(100);assert.equal(h.rail.scrollLeft,0,kind+' does not preview');
}
{
 const h=boot({video:true});h.emit('pointerover',h.image,{clientX:330});h.advance(80);assert.equal(h.rail.scrollLeft,600,'hover selects photos and does not auto-start a video frame');
}
console.log('PASS: desktop mouse hover zones use one short intent timer, reuse photo rails, skip video/controls/single photos, cancel on leave/press/scroll/dialog/native/resize/stale nodes, retain touch and lot-feed position, and perform no autoplay or repeated same-zone work.');
