/* Full-size photos share the existing trusted media pipeline; underlying lots never re-render. */
(()=>{
 'use strict';
 if(window.FasLotPhotos)return;
 const dialog=document.createElement('dialog');dialog.id='lot-photo-viewer';dialog.className='lot-photo-viewer';dialog.setAttribute('aria-labelledby','lot-photo-viewer-title');
 dialog.innerHTML='<header class="photo-viewer-header"><div><div class="photo-viewer-heading"><span class="photo-viewer-logo-wrap"><img class="photo-viewer-brand brand-logo" src="assets/brand/fas-torgi-logo.png?v=20261116-gradient1" alt="ФАС торги — Федеральная аукционная сеть" width="96" height="60"></span><h2 id="lot-photo-viewer-title">Фотографии лота</h2></div><p id="lot-photo-viewer-name"></p></div><button type="button" data-photo-close aria-label="Закрыть фотографии">Закрыть ×</button></header><div class="photo-viewer-stage" tabindex="0" role="region" aria-label="Фотография. Влево и вправо — другие фото, плюс и минус — масштаб"><div class="photo-viewer-canvas"></div></div><footer class="photo-viewer-footer"><div class="photo-viewer-navigation"><button type="button" data-photo-prev aria-label="Предыдущее фото">←</button><span data-photo-count aria-live="polite"></span><button type="button" data-photo-next aria-label="Следующее фото">→</button></div><div class="photo-viewer-zoom"><button type="button" data-photo-zoom-out aria-label="Уменьшить фото">−</button><button type="button" data-photo-reset aria-label="Сбросить масштаб">100%</button><button type="button" data-photo-zoom-in aria-label="Увеличить фото">+</button></div><p data-photo-status role="status">Для деталей увеличьте фото</p></footer>';
 document.body.appendChild(dialog);
 const stage=dialog.querySelector('.photo-viewer-stage'),canvas=dialog.querySelector('.photo-viewer-canvas'),field=selector=>dialog.querySelector(selector);
 let lotId=null,photos=[],index=0,scale=1,activeImage=null,origin=null,snapshot=null,swipe=null,blankPress=null,viewClickGate=0,press=null,pending=null,pendingTimer=null,blockedUntil=0,warm=null;
 const clock=()=>Date.now();
 const topDialog=()=>typeof window.FasDialogLifecycle?.top==='function'?window.FasDialogLifecycle.top():Array.from(document.querySelectorAll('dialog[open]')).filter(node=>node.open).at(-1)||null;
 const thumbnail=target=>{const image=target?.closest?.('img');return image&&!dialog.contains(image)&&image.closest('.lot-gallery')&&image.closest('[data-gallery-lot]')?image:null};
 const originalURL=url=>window.FasResponsiveMedia?.original?.(url)||url;
 function clearWarm(){const previous=warm;warm=null;previous?.image.removeAttribute('src')}
 function cancelPending(keepWarm=false){if(pendingTimer!==null)clearTimeout(pendingTimer);pendingTimer=null;pending=null;if(!keepWarm)clearWarm()}
 function cancelPress(block=false){cancelPending();press=null;if(block)blockedUntil=clock()+450}
 function trustedPhotos(lot){
  if(typeof lotMedia!=='function'||typeof lotMediaItem!=='function')return [];
  try{return lotMedia(lot).map(item=>lotMediaItem(lot,item)).filter(item=>item?.type==='image'&&typeof item.url==='string')}catch{return []}
 }
 function warmTapped(id,photoIndex,thumbnail){
  clearWarm();const lot=typeof cars!=='undefined'&&Array.isArray(cars)?cars.find(value=>value.id===Number(id)):null,item=lot&&trustedPhotos(lot)[photoIndex];if(!item)return;
  const url=originalURL(item.url);
  // The thumbnail already requests external/original images. Only a smaller
  // delivered preview needs its tapped full-resolution source warmed up.
  if(url===thumbnail.getAttribute('src')||url===thumbnail.currentSrc)return;
  const image=typeof window.Image==='function'?new window.Image():document.createElement('img');
  image.setAttribute('decoding','async');image.setAttribute('referrerpolicy','no-referrer');image.setAttribute('fetchpriority','high');image.setAttribute('loading','eager');
  const state={image,url,failed:false};warm=state;image.addEventListener('error',()=>{state.failed=true});image.setAttribute('src',url);
 }
 function setZoom(value){
  const next=Math.max(1,Math.min(4,Number(value)||1)),previous=scale,left=stage.scrollLeft||0,top=stage.scrollTop||0;scale=next;
  canvas.style.width=scale*100+'%';canvas.style.height=scale*100+'%';stage.classList.toggle('is-zoomed',scale>1);
  stage.scrollLeft=scale===1?0:Math.max(0,(left+stage.clientWidth/2)*scale/previous-stage.clientWidth/2);
  stage.scrollTop=scale===1?0:Math.max(0,(top+stage.clientHeight/2)*scale/previous-stage.clientHeight/2);
  field('[data-photo-reset]').textContent=Math.round(scale*100)+'%';field('[data-photo-zoom-out]').disabled=scale<=1;field('[data-photo-zoom-in]').disabled=scale>=4;
 }
 function showPhoto(next){
  index=Math.max(0,Math.min(photos.length-1,next));const item=photos[index];if(!item)return;
  const url=originalURL(item.url),prepared=warm?.url===url?warm:null;if(prepared)warm=null;else clearWarm();
  const image=prepared?.image||document.createElement('img');activeImage=image;image.alt=item.label||'Фото '+(index+1)+' лота';image.draggable=false;image.setAttribute('decoding','async');image.setAttribute('referrerpolicy','no-referrer');image.setAttribute('loading','eager');image.setAttribute('fetchpriority','high');image.setAttribute('data-media-source',item.url);if(image.getAttribute('src')!==url)image.setAttribute('src',url);
  image.addEventListener('error',()=>{if(dialog.open&&activeImage===image)field('[data-photo-status]').textContent='Фото сейчас недоступно. Попробуйте другое изображение.'});
  canvas.innerHTML='';canvas.appendChild(image);setZoom(1);
  field('[data-photo-count]').textContent=(index+1)+' / '+photos.length;field('[data-photo-prev]').disabled=index<=0;field('[data-photo-next]').disabled=index>=photos.length-1;field('[data-photo-status]').textContent=prepared?.failed?'Фото сейчас недоступно. Попробуйте другое изображение.':'Для деталей увеличьте фото';
 }
 function open(id,photoIndex=0,trigger=null){
  cancelPending(true);const lot=typeof cars!=='undefined'&&Array.isArray(cars)?cars.find(value=>value.id===Number(id)):null;if(!lot){clearWarm();return false}
  const media=trustedPhotos(lot);if(!media.length){clearWarm();if(typeof toast==='function')toast('Фотографии лота пока недоступны');return false}
  if(dialog.open){clearWarm();return false}
  lotId=lot.id;photos=media;origin=trigger||document.activeElement;
  const grid=document.querySelector('#grid'),modal=document.querySelector('#modal'),track=trigger?.closest?.('.gallery-track');
  snapshot={grid,gridTop:grid?.scrollTop,gridLeft:grid?.scrollLeft,modal,modalTop:modal?.scrollTop,track,trackLeft:track?.scrollLeft,windowX:window.scrollX,windowY:window.scrollY};
  field('#lot-photo-viewer-name').textContent=String(lot.name||'Лот № '+lot.id);showPhoto(Math.trunc(Number(photoIndex)||0));
  document.querySelectorAll('video').forEach(video=>video.pause());document.body.classList.add('photo-viewer-open');dialog.showModal();field('[data-photo-close]').focus?.({preventScroll:true});return true;
 }
 function close(){cancelPress();if(dialog.open)dialog.close()}
 function currentView(state){return dialog.open&&topDialog()===dialog&&state.image===activeImage&&state.lot===lotId&&state.index===index&&state.scale===scale}
 function clearViewGesture(){swipe=null;blankPress=null}
 function selectedView(){try{const selection=window.getSelection?.();return selection?.isCollapsed===false&&(dialog.contains(selection.anchorNode?.parentElement||selection.anchorNode)||dialog.contains(selection.focusNode?.parentElement||selection.focusNode))}catch{return false}}
 // The IMG element covers the stage, but object-fit:contain paints a smaller
 // rectangle. Only its real letterbox margins count as photo background.
 function photoBackground(point,target){
  if(!dialog.open||topDialog()!==dialog||!stage.contains(target)||target.closest?.('button,a,input,textarea,select,video,[contenteditable]')||selectedView())return false;
  if(!Number.isFinite(point.clientX)||!Number.isFinite(point.clientY)||!activeImage?.naturalWidth||!activeImage.naturalHeight)return false;
  const frame=stage.getBoundingClientRect(),box=activeImage.getBoundingClientRect(),ratio=Math.min(box.width/activeImage.naturalWidth,box.height/activeImage.naturalHeight);
  if(!(ratio>0)||point.clientX<frame.left||point.clientX>=frame.left+stage.clientWidth||point.clientY<frame.top||point.clientY>=frame.top+stage.clientHeight)return false;
  const width=activeImage.naturalWidth*ratio,height=activeImage.naturalHeight*ratio,left=box.left+(box.width-width)/2,top=box.top+(box.height-height)/2;
  return point.clientX<left||point.clientX>left+width||point.clientY<top||point.clientY>top+height;
 }
 function viewStart(event){
  if(viewClickGate)blockedUntil=0;viewClickGate=0;blankPress=null;
  if(event.isPrimary===false||event.button>0||!photoBackground(event,event.target))return;
  blankPress={id:event.pointerId,x:event.clientX,y:event.clientY,at:clock(),image:activeImage,lot:lotId,index,scale,left:stage.scrollLeft,top:stage.scrollTop,ready:false};
 }
 function viewMove(event){const state=blankPress;if(!state)return;if(event.pointerId!==state.id||Math.hypot(event.clientX-state.x,event.clientY-state.y)>10)blankPress=null}
 function viewEnd(event){
  const state=blankPress;if(!state)return;
  if(event.pointerId!==state.id||event.button>0||!currentView(state)||clock()-state.at>600||Math.hypot(event.clientX-state.x,event.clientY-state.y)>10||stage.scrollLeft!==state.left||stage.scrollTop!==state.top||!photoBackground(event,event.target)){blankPress=null;return}
  state.ready=true;
 }
 function returnFromPhoto(event){if(!dialog.open||topDialog()!==dialog)return;event.preventDefault?.();clearViewGesture();close();blockedUntil=clock()+450;viewClickGate=clock()+450}
 dialog.addEventListener('close',()=>{
  if(dialog.open)return;clearViewGesture();press=null;cancelPending();document.body.classList.remove('photo-viewer-open');
  const saved=snapshot;snapshot=null;if(saved){if(saved.grid&&saved.grid.isConnected!==false){saved.grid.scrollTop=saved.gridTop;saved.grid.scrollLeft=saved.gridLeft}if(saved.modal&&saved.modal.isConnected!==false)saved.modal.scrollTop=saved.modalTop;if(saved.track&&saved.track.isConnected!==false)saved.track.scrollLeft=saved.trackLeft;if(Number.isFinite(saved.windowY)&&window.scrollY!==saved.windowY)window.scrollTo?.({left:saved.windowX||0,top:saved.windowY,behavior:'instant'})}
  if(origin?.isConnected!==false)origin?.focus?.({preventScroll:true});activeImage=null;photos=[];lotId=null;index=0;scale=1;canvas.innerHTML='';
 });
 dialog.addEventListener('click',event=>{
  if(event.target.closest('[data-photo-close]'))close();
  else if(event.target.closest('[data-photo-prev]')&&!field('[data-photo-prev]').disabled)showPhoto(index-1);
  else if(event.target.closest('[data-photo-next]')&&!field('[data-photo-next]').disabled)showPhoto(index+1);
  else if(event.target.closest('[data-photo-zoom-in]'))setZoom(scale+.5);
  else if(event.target.closest('[data-photo-zoom-out]'))setZoom(scale-.5);
  else if(event.target.closest('[data-photo-reset]'))setZoom(1);
 });
 dialog.addEventListener('keydown',event=>{if(['Escape','ArrowLeft','ArrowRight','+','=','-'].includes(event.key))event.stopPropagation?.();if(event.key==='Escape'){event.preventDefault();close()}else if(event.key==='ArrowLeft'){event.preventDefault();showPhoto(index-1)}else if(event.key==='ArrowRight'){event.preventDefault();showPhoto(index+1)}else if(event.key==='+'||event.key==='='){event.preventDefault();setZoom(scale+.5)}else if(event.key==='-'){event.preventDefault();setZoom(scale-.5)}});
 stage.addEventListener('dblclick',event=>{event.preventDefault();setZoom(scale===1?2:1)});
 stage.addEventListener('touchstart',event=>{window.FasBackSwipe?.cancel?.();swipe=null;if(scale!==1||event.touches.length!==1||topDialog()!==dialog||selectedView()||(window.visualViewport?.scale||1)>1.05)return;const touch=event.touches[0];swipe={id:touch.identifier,x:touch.clientX,y:touch.clientY,time:event.timeStamp,image:activeImage,lot:lotId,index,scale,axis:null};},{passive:true});
 stage.addEventListener('touchmove',event=>{
  const state=swipe;if(!state||!currentView(state)||event.touches.length!==1){swipe=null;return}
  const touch=event.touches[0];if(touch.identifier!==state.id){swipe=null;return}
  const dx=touch.clientX-state.x,dy=touch.clientY-state.y,x=Math.abs(dx),y=Math.abs(dy),direction=x>y*1.3?'horizontal':y>x*1.3?(dy>0?'back':'native'):null;
  if(!state.axis&&Math.max(x,y)>=10)state.axis=direction;
  if((state.axis||direction)&&((state.axis||direction)==='horizontal'||(state.axis||direction)==='back')&&event.cancelable!==false)event.preventDefault?.();
 },{passive:false});
 stage.addEventListener('touchend',event=>{
  const state=swipe;swipe=null;if(!state||!currentView(state)||scale!==1||event.touches.length||selectedView())return;
  const touch=Array.from(event.changedTouches||[]).find(value=>value.identifier===state.id);if(!touch)return;
  const dx=touch.clientX-state.x,dy=touch.clientY-state.y,elapsed=event.timeStamp-state.time,x=Math.abs(dx),y=Math.abs(dy);
  if(elapsed<0)return;
  if((!state.axis||state.axis==='back')&&dy>0&&y>x*1.3&&(y>=90||y>=55&&y/Math.max(1,elapsed)>=.55)){returnFromPhoto(event);return}
  if((!state.axis||state.axis==='horizontal')&&elapsed<1000&&x>=55&&x>y*1.3){
   if(dx>0&&index===0){returnFromPhoto(event);return}
   event.preventDefault?.();blankPress=null;showPhoto(index+(dx<0?1:-1));viewClickGate=clock()+450;
  }
 },{passive:false});
 stage.addEventListener('touchcancel',()=>{swipe=null},{passive:true});
 function pressStart(event){const image=thumbnail(event.target);if(!image){cancelPress();return}if(event.isPrimary===false||event.button>0){cancelPress(true);return}if(pending?.image===image&&clock()-pending.at<=320&&pendingTimer!==null){clearTimeout(pendingTimer);pendingTimer=null}press={image,id:event.pointerId,x:event.clientX,y:event.clientY,at:clock()}}
 function pressMove(event){if(!press||event.pointerId!==undefined&&press.id!==undefined&&event.pointerId!==press.id)return;if(Math.hypot(event.clientX-press.x,event.clientY-press.y)>12){cancelPress(true)}}
 function pressEnd(event){if(!press)return;if(clock()-press.at>450||Math.hypot(event.clientX-press.x,event.clientY-press.y)>12)cancelPress(true);else press=null}
 if(window.PointerEvent){document.addEventListener('pointerdown',pressStart,{passive:true,capture:true});document.addEventListener('pointermove',pressMove,{passive:true,capture:true});document.addEventListener('pointerup',pressEnd,{passive:true,capture:true});document.addEventListener('pointercancel',()=>cancelPress(true),{passive:true,capture:true})}
 else{const pointer=(event,touch)=>({target:event.target,pointerId:touch.identifier,clientX:touch.clientX,clientY:touch.clientY,button:0});document.addEventListener('touchstart',event=>{if(event.touches.length!==1){cancelPress(true);return}pressStart(pointer(event,event.touches[0]))},{passive:true,capture:true});document.addEventListener('touchmove',event=>{if(event.touches.length!==1){cancelPress(true);return}pressMove(pointer(event,event.touches[0]))},{passive:true,capture:true});document.addEventListener('touchend',event=>{if(event.touches.length||!event.changedTouches.length){cancelPress(true);return}pressEnd(pointer(event,event.changedTouches[0]))},{passive:true,capture:true});document.addEventListener('touchcancel',()=>cancelPress(true),{passive:true,capture:true})}
 if(window.PointerEvent){document.addEventListener('pointerdown',viewStart,{capture:true,passive:true});document.addEventListener('pointermove',viewMove,{capture:true,passive:true});document.addEventListener('pointerup',viewEnd,{capture:true,passive:true});document.addEventListener('pointercancel',()=>{blankPress=null},{capture:true,passive:true})}
 else{const point=(event,touch)=>({target:event.target,pointerId:touch.identifier,clientX:touch.clientX,clientY:touch.clientY,button:0});document.addEventListener('touchstart',event=>{if(event.touches.length!==1){clearViewGesture();return}viewStart(point(event,event.touches[0]))},{capture:true,passive:true});document.addEventListener('touchmove',event=>{if(event.touches.length!==1){clearViewGesture();return}viewMove(point(event,event.touches[0]))},{capture:true,passive:true});document.addEventListener('touchend',event=>{if(event.touches.length||!event.changedTouches.length){blankPress=null;return}viewEnd(point(event,event.changedTouches[0]))},{capture:true,passive:true})}
 document.addEventListener('click',event=>{
  if(viewClickGate&&clock()<=viewClickGate&&event.detail>0&&event.pointerType!=='mouse'){viewClickGate=0;event.preventDefault?.();event.stopImmediatePropagation?.();event.stopPropagation?.();return}
  const state=blankPress;blankPress=null;if(!state?.ready||event.detail===0||event.button>0||!currentView(state)||clock()-state.at>650||Math.hypot(event.clientX-state.x,event.clientY-state.y)>10||!photoBackground(event,event.target))return;
  event.preventDefault?.();event.stopImmediatePropagation?.();event.stopPropagation?.();close();
 },{capture:true});
 document.addEventListener('scroll',()=>{blankPress=null},{capture:true,passive:true});
 for(const type of ['touchcancel','contextmenu','dragstart','visibilitychange','close','cancel'])document.addEventListener(type,clearViewGesture,{capture:true,passive:true});
 document.addEventListener('selectionchange',()=>{if(selectedView())clearViewGesture()});window.addEventListener('blur',clearViewGesture);window.addEventListener('resize',clearViewGesture);window.addEventListener('pagehide',clearViewGesture);
 document.addEventListener('click',event=>{
  const image=thumbnail(event.target);if(!image){if(!dialog.contains(event.target))cancelPending();return}
  event.preventDefault?.();event.stopPropagation?.();if(clock()<blockedUntil)return;
  const gallery=image.closest('[data-gallery-lot]'),id=Number(gallery.dataset.galleryLot),images=Array.from(gallery.querySelectorAll('img')),photoIndex=images.indexOf(image);
  if(pending?.image===image&&clock()-pending.at<=320){cancelPending();if(typeof saved!=='undefined'&&saved.includes(id)){if(typeof toast==='function')toast('Лот уже в избранном')}else if(typeof toggleLotFavorite==='function'&&toggleLotFavorite(id)===true&&typeof toast==='function')toast('Лот добавлен в избранное');return}
  cancelPending();if(event.detail===0&&!event.pointerType){open(id,photoIndex,image);return}
  const state={image,at:clock(),top:topDialog()};pending=state;warmTapped(id,photoIndex,image);pendingTimer=setTimeout(()=>{if(pending!==state)return;pendingTimer=null;pending=null;if(image.isConnected!==false&&topDialog()===state.top)open(id,photoIndex,image);else clearWarm()},320);
 },{capture:true});
 document.addEventListener('keydown',event=>{const image=thumbnail(event.target);if(image&&(event.key==='Enter'||event.key===' ')){event.preventDefault();const gallery=image.closest('[data-gallery-lot]');open(Number(gallery.dataset.galleryLot),Array.from(gallery.querySelectorAll('img')).indexOf(image),image)}},{capture:true});
 document.addEventListener('scroll',event=>{if(!dialog.contains(event.target))cancelPress()},{passive:true,capture:true});
 // A transient dialog may open and close inside the 320ms favorite window.
 // Returning to the same top dialog must not revive that earlier photo tap.
 for(const type of ['close','cancel'])document.addEventListener(type,event=>{if(String(event.target?.tagName||'').toUpperCase()==='DIALOG')cancelPress()},{capture:true});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelPress()});window.addEventListener('blur',()=>cancelPress());window.addEventListener('pagehide',()=>cancelPress());
 window.FasLotPhotos=Object.freeze({open,close,state:()=>({open:dialog.open,lotId,index,count:photos.length,scale})});
})();
