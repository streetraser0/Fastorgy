/* Desktop lot thumbnails reuse the existing gallery track, pagination and viewer. */
function createFasLotThumbnails(options){
 'use strict';
 const root=options.document,view=options.window,active=options.active||(()=>view.FasDesktopWeb?.active?.()===true),removers=[];
 const schedule=options.setTimeout||view.setTimeout.bind(view),unschedule=options.clearTimeout||view.clearTimeout.bind(view);
 let state=null,timer=null,pending=null,queued=false,destroyed=false;
 const modal=()=>root.getElementById('modal'),content=()=>root.getElementById('modal-content');
 function cancel(){if(timer!==null)unschedule(timer);timer=null;pending=null}
 function teardown(){cancel();state?.strip.remove();state=null}
 function topDialog(){return view.FasDialogLifecycle?.top?.()||Array.from(root.querySelectorAll('dialog[open]')).filter(dialog=>dialog.open).at(-1)||null}
 function usable(value=state){return !!value&&!destroyed&&active()&&!root.hidden&&value.track.isConnected!==false&&modal()?.open&&modal().classList.contains('lot-dialog')&&topDialog()===modal()&&content()?.contains(value.track)}
 function sync(){
  if(!state)return;const index=Math.max(0,Math.round(state.track.scrollLeft/(state.track.clientWidth||1)));
  state.buttons.forEach(button=>{const pressed=String(Number(button.dataset.lotThumbnailIndex)===index);if(button.getAttribute('aria-pressed')!==pressed)button.setAttribute('aria-pressed',pressed)});
 }
 function select(button){
  if(!usable()||!state.strip.contains(button))return false;
  const index=Number(button.dataset.lotThumbnailIndex),width=state.track.clientWidth;if(!width||!state.track.children[index]?.querySelector('img'))return false;
  if(Math.abs(state.track.scrollLeft-index*width)>=1)state.track.scrollLeft=index*width;
  if(typeof queueGallerySync==='function')queueGallerySync(state.track);sync();return true;
 }
 function photoRows(track){
  return Array.from(track.children).flatMap((slide,index)=>{
   const image=slide.querySelector('img'),source=image?.getAttribute('data-media-source')||image?.getAttribute('src');
   // The generic category artwork represents missing photos, not an upload.
   return image&&source&&!/^assets\/[a-z-]+\.svg(?:[?#]|$)/i.test(source)?[{image,index,source}]:[];
  });
 }
 function refresh(){
  queued=false;if(destroyed)return;const dialog=modal(),host=content();
  if(!active()||!dialog?.open||!dialog.classList.contains('lot-dialog')){teardown();return}
  const media=host?.querySelector('.lot-detail-media'),track=media?.querySelector('.gallery-track');
  if(!track){teardown();return}if(state?.track===track){sync();return}
  teardown();const photos=photoRows(track);if(!photos.length)return;
  const strip=root.createElement('div');strip.className='lot-photo-thumbnails';strip.setAttribute('role','group');strip.setAttribute('aria-label','Фотографии лота. Наведите указатель или выберите фотографию.');
  const buttons=photos.map(({image,index,source},ordinal)=>{
   const button=root.createElement('button');button.type='button';button.setAttribute('type','button');button.setAttribute('data-lot-thumbnail-index',String(index));button.setAttribute('aria-label','Показать фото '+(ordinal+1)+' из '+photos.length);button.setAttribute('aria-pressed','false');button.title='Фото '+(ordinal+1)+' из '+photos.length;
   const thumb=root.createElement('img');thumb.alt='';thumb.draggable=false;thumb.setAttribute('loading','lazy');thumb.setAttribute('decoding','async');thumb.setAttribute('fetchpriority','low');
   thumb.setAttribute('src',image.getAttribute('src')||source);
   const srcset=image.getAttribute('srcset');if(srcset){thumb.setAttribute('srcset',srcset);thumb.setAttribute('sizes','100px')}
   thumb.addEventListener('error',()=>{if(thumb.getAttribute('src')!==source){thumb.removeAttribute('srcset');thumb.setAttribute('src',source)}else{button.hidden=true;strip.hidden=buttons.every(item=>item.hidden)}});
   button.appendChild(thumb);strip.appendChild(button);return button;
  });
  state={strip,track,buttons};media.appendChild(strip);sync();
 }
 function requestRefresh(){if(queued||destroyed)return;queued=true;Promise.resolve().then(refresh)}
 function buttonFrom(target){const button=target?.closest?.('[data-lot-thumbnail-index]');return state?.strip.contains(button)?button:null}
 function hover(event){
  const button=buttonFrom(event.target);
  if(!usable()||!button||event.pointerType!=='mouse'||event.buttons||event.isPrimary===false){cancel();return}
  if(button.getAttribute('aria-pressed')==='true'||pending===button)return;
  cancel();pending=button;timer=schedule(()=>{timer=null;const selected=pending;pending=null;if(selected)select(selected)},80);
 }
 function listen(target,type,handler,config){target?.addEventListener?.(type,handler,config);removers.push(()=>target?.removeEventListener?.(type,handler,config))}
 listen(root,'pointerover',hover,{capture:true,passive:true});
 listen(root,'pointerout',event=>{if(pending&&!pending.contains(event.relatedTarget))cancel()},{capture:true,passive:true});
 listen(root,'pointerdown',cancel,{capture:true,passive:true});listen(root,'pointercancel',cancel,{capture:true,passive:true});
 listen(root,'focusin',event=>{const button=buttonFrom(event.target);if(button){cancel();select(button)}});
 listen(root,'click',event=>{const button=buttonFrom(event.target);if(button&&event.button!==2){cancel();select(button)}});
 listen(root,'keydown',event=>{
  const button=buttonFrom(event.target);if(!button||!usable()||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  const buttons=state.buttons.filter(item=>!item.hidden),current=buttons.indexOf(button),index=event.key==='Home'?0:event.key==='End'?buttons.length-1:Math.max(0,Math.min(buttons.length-1,current+(event.key==='ArrowRight'?1:-1)));
  event.preventDefault();cancel();buttons[index]?.focus({preventScroll:true});if(buttons[index])select(buttons[index]);
 });
 listen(root,'scroll',event=>{if(state&&event.target===state.track){cancel();sync()}},{capture:true,passive:true});
 listen(view,'resize',()=>{cancel();refresh()});listen(view,'blur',cancel);listen(root,'visibilitychange',cancel);listen(modal(),'close',teardown);
 const observer=typeof view.MutationObserver==='function'?new view.MutationObserver(requestRefresh):null;
 if(observer){if(content())observer.observe(content(),{childList:true,subtree:true});if(modal())observer.observe(modal(),{attributes:true,attributeFilter:['open','class']});observer.observe(root.documentElement,{attributes:true,attributeFilter:['class']})}
 refresh();return {refresh,destroy(){destroyed=true;teardown();observer?.disconnect();removers.forEach(remove=>remove())}};
}
if(typeof window!=='undefined'&&typeof document!=='undefined')window.FasLotThumbnails=createFasLotThumbnails({window,document});
