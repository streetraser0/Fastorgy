/* Desktop pointer zones preview photos; clicks and mobile gestures keep their owners. */
function createFasDesktopPhotoHover(options) {
 'use strict';
 const root=options.document,view=options.window,delay=options.delay??80,removers=[];
 const active=options.active||(()=>view.FasDesktopWeb?.active?.()===true);
 const schedule=options.setTimeout||view.setTimeout.bind(view),unschedule=options.clearTimeout||view.clearTimeout.bind(view);
 let state=null,timer=null,destroyed=false;
 const available=()=>!destroyed&&active()&&!root.hidden&&!root.querySelector('dialog[open]');
 function cancel(){if(timer!==null)unschedule(timer);timer=null;state=null}
 function surface(target){
  if(!target?.closest||target.closest('dialog,video,input,textarea,select,a,[contenteditable],[data-featured-fav],[data-lot-share],[data-media-index],[data-media-dir]'))return null;
  const button=target.closest('button');if(button&&!button.matches('.featured-open'))return null;
  const featured=target.closest('[data-featured-gallery]');
  if(featured){const rail=featured.querySelector('.featured-photo-track');return rail?{rail,box:featured,kind:'featured'}:null}
  const rail=target.closest('.gallery-track');return rail&&rail.closest('#grid')?{rail,box:rail.parentElement,kind:'catalog'}:null;
 }
 function mediaIndices(value){
  if(state?.rail===value.rail&&state.first===value.rail.firstElementChild&&state.last===value.rail.lastElementChild&&state.count===value.rail.children.length)return state.indices;
  return Array.from(value.rail.children).flatMap((slide,index)=>value.kind==='featured'||slide.querySelector('img')?[index]:[]);
 }
 function zone(value,x,y,indices){
  const rect=value.rail.getBoundingClientRect();if(!rect.width||!rect.height||x<rect.left||x>=rect.right||y<rect.top||y>=rect.bottom)return null;
  return indices[Math.max(0,Math.min(indices.length-1,Math.floor((x-rect.left)/rect.width*indices.length)))];
 }
 function current(value){
  if(!available()||value.rail.isConnected===false||!root.documentElement.contains(value.rail)||value.rail.firstElementChild!==value.first||value.rail.lastElementChild!==value.last||value.rail.children.length!==value.count)return false;
  const hit=root.elementFromPoint?.(value.x,value.y);if(hit&&surface(hit)?.rail!==value.rail)return false;
  return zone(value,value.x,value.y,value.indices)===value.index;
 }
 function apply(value){
  timer=null;if(state!==value||!current(value)){cancel();return}
  if(value.kind==='featured'){view.FasFeaturedLots?.previewPhoto?.(value.box,value.index);return}
  const width=value.rail.clientWidth;if(!width)return;
  value.rail.scrollLeft=value.index*width;
  // Reuse pagination, image priority and inactive-video handling from the gallery.
  if(typeof queueGallerySync==='function')queueGallerySync(value.rail);
 }
 function move(event){
  if(!available()||event.pointerType!=='mouse'||event.buttons||event.isPrimary===false||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey){cancel();return}
  const value=surface(event.target);if(!value){cancel();return}
  const indices=mediaIndices(value),index=zone(value,event.clientX,event.clientY,indices);
  if(indices.length<2||index===null||index===undefined){cancel();return}
  if(state?.rail===value.rail&&state.index===index&&state.first===value.rail.firstElementChild&&state.last===value.rail.lastElementChild&&state.count===value.rail.children.length){state.x=event.clientX;state.y=event.clientY;return}
  if(timer!==null)unschedule(timer);timer=null;
  state={...value,indices,index,x:event.clientX,y:event.clientY,first:value.rail.firstElementChild,last:value.rail.lastElementChild,count:value.rail.children.length};
  if(Math.abs((value.rail.scrollLeft||0)-index*value.rail.clientWidth)<1)return;
  const selected=state;timer=schedule(()=>apply(selected),delay);
 }
 function leave(event){if(state&&!state.box.contains(event.relatedTarget))cancel()}
 function listen(target,type,handler,settings){target?.addEventListener?.(type,handler,settings);removers.push(()=>target?.removeEventListener?.(type,handler,settings))}
 listen(root,'pointerover',move,{passive:true,capture:true});listen(root,'pointermove',move,{passive:true,capture:true});listen(root,'pointerout',leave,{passive:true,capture:true});
 for(const type of ['pointerdown','pointercancel','wheel','touchstart','visibilitychange','close','cancel'])listen(root,type,cancel,{capture:true,passive:true});
 listen(root,'scroll',event=>{if(state&&event.target!==state.rail)cancel()},{capture:true,passive:true});
 listen(view,'blur',cancel);listen(view,'pagehide',cancel);listen(view,'resize',cancel);
 return {cancel,destroy(){destroyed=true;cancel();removers.forEach(remove=>remove())}};
}
if(typeof window!=='undefined'&&typeof document!=='undefined'&&!window.FasDesktopPhotoHover){window.FasDesktopPhotoHover=createFasDesktopPhotoHover({document,window})}
