const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
function boot({count=5,desktop=true,videoAt=-1,placeholder=false}={}){
 const h=setup(),c=h.context,timers=new Map(),syncs=[];let desktopOn=desktop,clock=0,id=0;
 c.FasDesktopWeb={active:()=>desktopOn};c.setTimeout=(fn,delay)=>{const key=++id;timers.set(key,{fn,at:clock+delay});return key};c.clearTimeout=key=>timers.delete(key);c.queueGallerySync=track=>syncs.push(track);
 h.modal.className='lot-dialog';h.modal.showModal();const media=h.add('media','div',h.content);media.className='lot-detail-media';const gallery=h.add('gallery','div',media);gallery.className='lot-gallery';const track=h.add('gallery-track','div',gallery);track.className='gallery-track';track.clientWidth=600;track.scrollLeft=0;
 for(let i=0;i<count;i++){const slide=h.add('slide'+i,'div',track);slide.className='gallery-slide';const img=h.add('image'+i,i===videoAt?'video':'img',slide);img.setAttribute('src',placeholder?'assets/cars.svg':'https://example.test/image'+i+'.jpg');img.setAttribute('data-media-source',img.getAttribute('src'))}
 vm.runInContext(fs.readFileSync('dist/lot-thumbnails.js','utf8'),c);
 const emit=(type,target,extra={})=>{const event={type,target,pointerType:'mouse',buttons:0,isPrimary:true,button:0,...extra};for(const handler of h.docEvents[type]||[])handler(event);return event};
 const advance=ms=>{clock+=ms;for(const [key,item]of [...timers])if(item.at<=clock){timers.delete(key);item.fn()}};
 return {...h,media,gallery,track,timers,syncs,emit,advance,api:c.FasLotThumbnails,buttons:()=>media.querySelectorAll('[data-lot-thumbnail-index]'),setDesktop(value){desktopOn=value}};
}
{
 const h=boot({count:26,videoAt:1}),buttons=h.buttons();assert.equal(buttons.length,25,'all photo slides appear, without a shortlist cap or video duplication');assert.equal(buttons[1].dataset.lotThumbnailIndex,'2','photo buttons retain actual gallery indices across video slides');assert.equal(buttons[0].getAttribute('aria-pressed'),'true');
 h.emit('pointerover',buttons[2]);h.advance(79);assert.equal(h.track.scrollLeft,0);h.advance(1);assert.equal(h.track.scrollLeft,1800);assert.equal(h.syncs.length,1,'preview delegates to existing gallery sync');assert.equal(buttons[2].getAttribute('aria-pressed'),'true');assert.equal(h.timers.size,0,'there is no autoplay timer');
 h.emit('pointerover',buttons[0]);h.emit('pointerout',buttons[0],{relatedTarget:h.body});h.advance(100);assert.equal(h.track.scrollLeft,1800,'leaving cancels the pending preview');
 h.emit('click',buttons[4]);assert.equal(h.track.scrollLeft,3000,'click selects the same underlying gallery');assert.equal(h.modal.open,true);
 h.track.scrollLeft=0;h.emit('scroll',h.track);assert.equal(buttons[0].getAttribute('aria-pressed'),'true','native gallery arrows and scrolling update active thumbnail');
 h.emit('focusin',buttons[2]);assert.equal(h.track.scrollLeft,1800);let prevented=false;h.emit('keydown',buttons[2],{key:'ArrowRight',preventDefault(){prevented=true}});assert(prevented);assert.equal(h.document.activeElement,buttons[3]);assert.equal(h.track.scrollLeft,2400);
 h.emit('keydown',buttons[3],{key:'End',preventDefault(){}});assert.equal(h.track.scrollLeft,25*600);h.emit('keydown',buttons.at(-1),{key:'Home',preventDefault(){}});assert.equal(h.track.scrollLeft,0);
 h.emit('click',h.track.children[0].querySelector('img'));assert.equal(h.track.scrollLeft,0,'the main image click is left to the full-resolution viewer');
 h.setDesktop(false);h.api.refresh();assert.equal(h.buttons().length,0,'mobile/native gate removes only added controls');assert.equal(h.track.children.length,26);h.setDesktop(true);h.api.refresh();assert.equal(h.buttons().length,25);
 h.modal.close();assert.equal(h.buttons().length,0,'closing releases the thumbnail strip');
}
for(const guard of ['touch','drag','secondary','nested','disabled','closed','destroyed']){
 const h=boot(),button=h.buttons()[3];
 if(guard==='touch')h.emit('pointerover',button,{pointerType:'touch'});
 else if(guard==='drag')h.emit('pointerover',button,{buttons:1});
 else if(guard==='secondary')h.emit('pointerover',button,{isPrimary:false});
 else{h.emit('pointerover',button);if(guard==='nested'){const dialog=h.add('nested','dialog');dialog.showModal()}if(guard==='disabled')h.setDesktop(false);if(guard==='closed')h.modal.close();if(guard==='destroyed')h.api.destroy()}
 h.advance(100);assert.equal(h.track.scrollLeft,0,guard+' cannot change the gallery');
}
assert.equal(boot({count:1}).buttons().length,1,'one real photo has one real thumbnail');assert.equal(boot({count:1,placeholder:true}).buttons().length,0,'missing-photo artwork does not create a false thumbnail');assert.equal(boot({count:0}).buttons().length,0);assert.equal(boot({desktop:false}).buttons().length,0);
console.log('PASS: every actual photo gets a desktop thumbnail; hover/click/focus reuse the original track, video indices stay correct, navigation synchronizes aria state, pending work cancels, and mobile/native/nested dialogs/placeholder/close guards preserve existing owners.');
