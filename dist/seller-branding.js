/* Owner-scoped local storefront decoration. No uploads, account creation or bank permissions. */
(()=>{
 'use strict';if(window.FasSellerBranding)return;
 const DB='fas-seller-branding-v1',STORE='headers',MAX_BYTES=2*1024*1024,MAX_PIXELS=20000000,MAX_RECOVERY=4;
 const PALETTES=Object.freeze({blue:'#0D4CD3',teal:'#12685A',slate:'#33465C',berry:'#8B3859'}),WORKSPACE='fas-seller-workspace-v1';
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const text=(value,max)=>typeof value==='string'?value.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';
 const ownerId=value=>typeof value==='string'&&value.trim()&&value.length<=256&&!/[\u0000-\u001f\u007f]/.test(value)?value:null;
 let workspaceRaw,workspaceOwner=null,dbPromise,config={},active=null,epoch=0,mountEpoch=0,suspendedMounts=[];
 const cache=new Map(),recovery=new Map(),mounts=new Set(),urls=new Set();
 function owner(){
  const profile=window.FasSellerUI?.getProfile?.(),id=ownerId(profile?.id);if(!id)return null;
  try{const raw=localStorage.getItem(WORKSPACE);if(raw!==workspaceRaw){workspaceRaw=raw;workspaceOwner=null;if(raw){const value=JSON.parse(raw);workspaceOwner=value?.version===1?ownerId(value.profile?.id):null}}if(workspaceRaw&&workspaceOwner!==id)return null}catch{return null}
  return id;
 }
 function clean(value,id){
  if(!value)return {version:1,owner:id,revision:0,title:'',subtitle:'',accent:'blue',cover:null};
  if(value.version!==1||value.owner!==id||!Number.isSafeInteger(value.revision)||value.revision<0)throw Error('Повреждены настройки витрины. Обратитесь в поддержку.');
  const cover=value.cover;if(cover!==null&&(!(cover instanceof Blob)||!['image/jpeg','image/png','image/webp'].includes(cover.type)||cover.size<=0||cover.size>MAX_BYTES))throw Error('Не удалось прочитать обложку витрины.');
  return {version:1,owner:id,revision:value.revision,title:text(value.title,60),subtitle:text(value.subtitle,180),accent:Object.hasOwn(PALETTES,value.accent)?value.accent:'blue',cover};
 }
 function database(){
  if(!window.indexedDB)return Promise.reject(Error('Локальное хранилище недоступно. Откройте сайт в обычном режиме браузера.'));
  if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{let request,rejected=false;try{request=window.indexedDB.open(DB,1)}catch{reject(Error('Не удалось открыть хранилище оформления.'));return}
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE,{keyPath:'owner'})};
   request.onerror=()=>{rejected=true;reject(Error('Не удалось открыть хранилище оформления.'))};request.onblocked=()=>{rejected=true;reject(Error('Закройте другие вкладки сайта и повторите открытие оформления.'))};
   request.onsuccess=()=>{const db=request.result;if(rejected){db.close();return}db.onversionchange=()=>{db.close();dbPromise=null};resolve(db)};
  }).catch(error=>{dbPromise=null;throw error});return dbPromise;
 }
 const localRepository={
  async read(id){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),request=tx.objectStore(STORE).get(id);let result=null;request.onsuccess=()=>{result=request.result||null};tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(Error('Не удалось прочитать оформление витрины.'))})},
  async commit(id,expected,value){const db=await database();return new Promise((resolve,reject)=>{let conflict=false,context=false;const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),request=store.get(id);request.onsuccess=()=>{try{const current=clean(request.result,id);if(current.revision!==expected){conflict=true;tx.abort();return}if(owner()!==id){context=true;tx.abort();return}store.put(value)}catch{tx.abort()}};tx.oncomplete=()=>resolve(value);tx.onerror=tx.onabort=()=>reject(Error(conflict?'Оформление изменилось в другой вкладке. Откройте его заново.':context?'Профиль изменился. Откройте оформление из своего кабинета.':'Не удалось сохранить оформление. Проверьте свободное место и настройки браузера.'))})}
 };
 const repository=()=>config.repository||localRepository;
 async function read(id){if(!cache.has(id)){const pending=Promise.resolve().then(()=>repository().read(id)).then(value=>clean(value,id));cache.set(id,pending);while(cache.size>4)cache.delete(cache.keys().next().value);pending.catch(()=>{if(cache.get(id)===pending)cache.delete(id)})}return await cache.get(id)}
 function objectURL(blob){const url=window.URL.createObjectURL(blob);urls.add(url);return url}
 function revoke(url){if(url&&urls.delete(url))window.URL.revokeObjectURL(url)}
 const top=()=>window.FasDialogLifecycle?.top?.()||Array.from(document.querySelectorAll('dialog[open]')).filter(node=>node.open).at(-1)||null;
 const dialog=document.createElement('dialog');dialog.id='seller-branding-dialog';dialog.className='seller-branding-dialog';dialog.setAttribute('aria-labelledby','seller-branding-title');document.body.appendChild(dialog);
 const nativeClose=dialog.close.bind(dialog);
 function field(name){return dialog.querySelector('[name="'+name+'"]')}
 function showError(message){const node=dialog.querySelector('[data-branding-error]');if(node){node.textContent=message;node.hidden=!message}}
 function draft(){return {title:text(field('title')?.value,60),subtitle:text(field('subtitle')?.value,180),accent:Object.hasOwn(PALETTES,field('accent')?.value)?field('accent').value:'blue',cover:active?.draft.cover||null}}
 function changed(){if(!active)return false;const value=draft(),base=active.base;return value.title!==base.title||value.subtitle!==base.subtitle||value.accent!==base.accent||value.cover!==base.cover}
 function remember(){if(active&&changed()){active.draft=draft();recovery.set(active.owner,{draft:active.draft,base:active.base})}}
 function close({discard=false}={}){
  if(!dialog.open||top()!==dialog)return false;if(active?.busy){showError('Дождитесь завершения обработки или сохранения.');return false}
  if(changed()&&!discard){showError('Изменения не сохранены. Сохраните оформление или нажмите «Отменить изменения».');return false}
  if(discard&&active)recovery.delete(active.owner);nativeClose();cleanup();return true;
 }
 // All routes, including the shared swipe/blank Back, pass through the dirty guard.
 dialog.close=()=>close();
 function cleanup(){if(dialog.open)return;const previous=active;active=null;epoch++;if(previous){revoke(previous.preview);previous.origin?.isConnected!==false&&previous.origin?.focus?.({preventScroll:true})}dialog.innerHTML=''}
 function drawPreview(){if(!active)return;const value=draft(),title=dialog.querySelector('[data-branding-preview-title]'),subtitle=dialog.querySelector('[data-branding-preview-subtitle]'),preview=dialog.querySelector('[data-branding-preview]');if(title)title.textContent=value.title||'Ваша витрина';if(subtitle)subtitle.textContent=value.subtitle||'Короткое описание магазина';if(preview)preview.dataset.accent=value.accent;const picture=dialog.querySelector('[data-branding-preview-cover]');if(picture){if(value.cover){if(!active.preview||active.previewBlob!==value.cover){revoke(active.preview);active.preview=objectURL(value.cover);active.previewBlob=value.cover}if(picture.getAttribute('src')!==active.preview)picture.src=active.preview;picture.hidden=false}else{picture.removeAttribute('src');picture.hidden=true;revoke(active.preview);active.preview=null;active.previewBlob=null}}}
 function render(){
  const value=active.draft;dialog.innerHTML='<header class="branding-heading" data-dialog-swipe-header><div><h2 id="seller-branding-title">Оформление витрины</h2><p>Обложка, название и цвет вашего магазина</p></div><button type="button" data-branding-close aria-label="Вернуться из оформления">×</button></header><div class="branding-body"><p class="branding-local-note">Демоверсия: оформление сохраняется только на этом устройстве. Банковские витрины требуют отдельного подтверждения прав организации.</p><div class="branding-preview" data-branding-preview data-accent="'+value.accent+'"><img data-branding-preview-cover hidden alt="Обложка витрины"><div><strong data-branding-preview-title></strong><p data-branding-preview-subtitle></p><small>Продавец остаётся указанным в объявлении</small></div></div><form id="seller-branding-form"><label>Название витрины<input name="title" value="'+esc(value.title)+'" maxlength="60" autocomplete="off" placeholder="Название магазина"></label><label>Короткое описание<textarea name="subtitle" maxlength="180" rows="3">'+esc(value.subtitle)+'</textarea></label><label>Цвет<select name="accent">'+Object.keys(PALETTES).map(key=>'<option value="'+key+'" '+(key===value.accent?'selected':'')+'>'+({blue:'Синий',teal:'Зелёный',slate:'Графит',berry:'Ягодный'}[key])+'</option>').join('')+'</select></label><label>Обложка<input type="file" name="cover" accept="image/jpeg,image/png,image/webp"><small>JPG, PNG или WebP до 2 МБ. Изображение обрабатывается на устройстве.</small></label><button type="button" class="outline" data-branding-remove>Убрать обложку</button><p class="branding-error" role="alert" data-branding-error hidden></p><div class="branding-actions"><button type="submit" class="primary" data-branding-save>Сохранить оформление</button><button type="button" class="outline" data-branding-discard>Отменить изменения</button></div></form></div>';
  drawPreview();dialog.querySelector('#seller-branding-form').onsubmit=event=>{event.preventDefault();save()};
 }
 async function openEditor({trigger=null}={}){
  if(dialog.open)return false;const id=owner();if(!id){if(typeof toast==='function')toast('Сначала откройте свой профиль.');return false}
  if(!recovery.has(id)&&recovery.size>=MAX_RECOVERY){if(typeof toast==='function')toast('Сначала сохраните или отмените несохранённые оформления других профилей в этой вкладке.');return false}
  const request=++epoch,origin=trigger||document.activeElement,underlying=top();try{const base=await read(id);if(request!==epoch||owner()!==id||top()!==underlying||origin?.isConnected===false)return false;const previous=recovery.get(id);active={owner:id,base:previous?.base||base,draft:previous?.draft||{title:base.title,subtitle:base.subtitle,accent:base.accent,cover:base.cover},origin,busy:false,preview:null,previewBlob:null};render();dialog.showModal();window.FasBackSwipe?.refreshHeaders?.();field('title')?.focus?.({preventScroll:true});return true}catch(error){if(request===epoch&&typeof toast==='function')toast(error.message);return false}
 }
 function dimensions(bytes,type){
  const u32=(at,little=false)=>little?bytes[at]+bytes[at+1]*256+bytes[at+2]*65536+bytes[at+3]*16777216:bytes[at]*16777216+bytes[at+1]*65536+bytes[at+2]*256+bytes[at+3];
  const ascii=(at,count)=>String.fromCharCode(...bytes.slice(at,at+count));let width=0,height=0;
  if(type==='image/png'&&bytes.length>=24){width=u32(16);height=u32(20)}
  if(type==='image/jpeg')for(let at=2;at+3<bytes.length;){if(bytes[at++]!==255)break;while(bytes[at]===255)at++;const marker=bytes[at++];if([0xd8,0xd9,0xda].includes(marker))break;if(marker===0x01||marker>=0xd0&&marker<=0xd7)continue;const length=bytes[at]*256+bytes[at+1];if(length<2||at+length>bytes.length)break;if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&length>=8){height=bytes[at+3]*256+bytes[at+4];width=bytes[at+5]*256+bytes[at+6];break}at+=length}
  if(type==='image/webp')for(let at=12;at+8<=bytes.length;){const chunk=ascii(at,4),length=u32(at+4,true),start=at+8;if(length<0||start+length>bytes.length)break;if(chunk==='VP8X'&&length>=10){width=1+bytes[start+4]+bytes[start+5]*256+bytes[start+6]*65536;height=1+bytes[start+7]+bytes[start+8]*256+bytes[start+9]*65536;break}if(chunk==='VP8L'&&length>=5&&bytes[start]===0x2f){width=1+bytes[start+1]+((bytes[start+2]&63)<<8);height=1+(bytes[start+2]>>6)+(bytes[start+3]<<2)+((bytes[start+4]&15)<<10);break}if(chunk==='VP8 '&&length>=10&&ascii(start+3,3)==='\x9d\x01\x2a'){width=(bytes[start+6]+bytes[start+7]*256)&0x3fff;height=(bytes[start+8]+bytes[start+9]*256)&0x3fff;break}at=start+length+(length%2)}
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1)throw Error('Файл повреждён или его размеры не распознаны. Выберите исходное изображение.');
  if(width>MAX_PIXELS/height)throw Error('Разрешение обложки должно быть не больше 20 мегапикселей.');return {width,height};
 }
 function bounded(promise,onLate){return new Promise((resolve,reject)=>{let finished=false;const timer=setTimeout(()=>{finished=true;reject(Error('Обработка заняла больше 15 секунд. Выберите изображение меньшего размера.'))},15000);Promise.resolve(promise).then(value=>{if(finished){onLate?.(value);return}finished=true;clearTimeout(timer);resolve(value)},error=>{if(finished)return;finished=true;clearTimeout(timer);reject(error)})})}
 async function prepareCover(file){
  if(!file||!Number.isFinite(file.size)||file.size<=0||file.size>MAX_BYTES||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Выберите JPG, PNG или WebP размером до 2 МБ.');
  const bytes=new Uint8Array(await file.slice(0,file.size).arrayBuffer()),format=bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10'?'image/png':String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP'?'image/webp':null;
  if(format!==file.type)throw Error('Содержимое файла не соответствует формату изображения.');dimensions(bytes,format);
  let image,url,canvas,fallbackImage;try{
   if(typeof window.createImageBitmap==='function')image=await bounded(window.createImageBitmap(file,{imageOrientation:'from-image'}),value=>value?.close?.());
   else{url=objectURL(file);image=await bounded(new Promise((resolve,reject)=>{const node=new window.Image();fallbackImage=node;node.onload=()=>resolve(node);node.onerror=()=>reject(Error('Браузер не смог прочитать обложку.'));node.src=url}))}
   const width=Number(image.width||image.naturalWidth),height=Number(image.height||image.naturalHeight);if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>MAX_PIXELS/height)throw Error('Разрешение обложки должно быть не больше 20 мегапикселей.');
   canvas=document.createElement('canvas');const ratio=Math.min(1,1400/width,700/height);canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));const context=canvas.getContext?.('2d',{alpha:false});if(!context||typeof canvas.toBlob!=='function')throw Error('Браузер не поддерживает обработку обложки.');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);const blob=await bounded(new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.85)));canvas.width=canvas.height=1;if(!blob||blob.type!=='image/jpeg'||blob.size<=0||blob.size>MAX_BYTES)throw Error('Не удалось подготовить обложку. Выберите изображение меньшего размера.');return blob;
  }finally{image?.close?.();fallbackImage?.removeAttribute?.('src');if(canvas)canvas.width=canvas.height=1;revoke(url)}
 }
 async function selectCover(file){const view=active,request=epoch;if(!view||view.busy||!dialog.open||top()!==dialog)return false;view.busy=true;showError('');try{const blob=await prepareCover(file);if(active!==view||epoch!==request||owner()!==view.owner)return false;view.draft={...draft(),cover:blob};drawPreview();return true}catch(error){if(active===view&&request===epoch)showError(error.message);return false}finally{if(active===view)view.busy=false}}
 async function save(){
  const view=active,request=epoch;if(!view||top()!==dialog||owner()!==view.owner){showError('Профиль изменился. Откройте оформление заново.');return false}if(view.busy){showError('Дождитесь завершения обработки или сохранения.');return false}
  const value={version:1,owner:view.owner,revision:view.base.revision+1,...draft()};view.busy=true;showError('');try{await repository().commit(view.owner,view.base.revision,value);if(active!==view||epoch!==request||owner()!==view.owner)return false;cache.set(view.owner,value);view.base=value;view.draft={title:value.title,subtitle:value.subtitle,accent:value.accent,cover:value.cover};recovery.delete(view.owner);view.busy=false;nativeClose();cleanup();refreshMounts();try{localStorage.setItem('fas-seller-branding-refresh',String(Date.now())+':'+String(value.revision))}catch{}if(typeof toast==='function')toast('Оформление сохранено на этом устройстве');return true}catch(error){cache.delete(view.owner);if(active===view&&request===epoch)showError(error.message||'Не удалось сохранить оформление.');return false}finally{if(active===view)view.busy=false}
 }
 function clearMount(mount){revoke(mount.url);mount.node?.remove?.();mounts.delete(mount)}
 async function decorate(container,identity){
  const id=owner();if(!container||!id||identity?.kind!=='private'||identity.key!=='private:'+id)return false;
  for(const previous of [...mounts])if(previous.container===container||previous.container.isConnected===false||previous.container.closest?.('dialog')?.open===false)clearMount(previous);
  const request=++mountEpoch;let value;try{value=await read(id)}catch{return false}if(owner()!==id||container.isConnected===false||container.closest?.('dialog')?.open===false||request!==mountEpoch)return false;
  const node=document.createElement('section');node.className='seller-branding-header';node.dataset.accent=value.accent;node.setAttribute('data-seller-branding-owner',id);const mount={container,node,owner:id,identity, url:null};
  node.innerHTML='<div class="seller-branding-cover">'+(value.cover?'<img alt="Обложка витрины продавца" decoding="async">':'')+'</div><div class="seller-branding-copy"><span>Витрина · на этом устройстве</span><h2>'+esc(value.title||identity.name||'Витрина продавца')+'</h2><p>'+esc(value.subtitle)+'</p></div>';
  if(value.cover){mount.url=objectURL(value.cover);node.querySelector('img').src=mount.url}container.insertBefore(node,container.firstChild);mounts.add(mount);return true;
 }
 function refreshMounts(){for(const mount of [...mounts]){const container=mount.container,identity=mount.identity;clearMount(mount);if(container.isConnected)decorate(container,identity)}}
 function contextChanged(){cache.clear();mountEpoch++;for(const mount of [...mounts])clearMount(mount);if(active){remember();const previous=active;active=null;epoch++;revoke(previous.preview);if(dialog.open)nativeClose();dialog.innerHTML=''}}
 dialog.addEventListener('input',event=>{if(active&&event.target?.matches?.('[name="title"],[name="subtitle"],[name="accent"]'))drawPreview()});
 dialog.addEventListener('change',event=>{if(!active)return;if(event.target?.matches?.('[name="cover"]')){const file=event.target.files?.[0];if(file)selectCover(file)}else drawPreview()});
 dialog.addEventListener('click',event=>{const target=event.target.closest?.('button');if(!target||top()!==dialog)return;if(target.hasAttribute('data-branding-close')){event.preventDefault();close()}else if(target.hasAttribute('data-branding-discard')){event.preventDefault();close({discard:true})}else if(target.hasAttribute('data-branding-remove')&&active&&!active.busy){event.preventDefault();active.draft={...draft(),cover:null};drawPreview()}});
 dialog.addEventListener('cancel',event=>{event.preventDefault();close()});dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation?.();close()}});dialog.addEventListener('close',()=>{if(!dialog.open)cleanup()});
 document.addEventListener('close',event=>{if(String(event.target?.tagName||'').toUpperCase()==='DIALOG'&&!event.target.open)for(const mount of [...mounts])if(event.target.contains(mount.node))clearMount(mount)},{capture:true});
 window.addEventListener('storage',event=>{if(event.key===WORKSPACE){contextChanged();return}if(event.key==='fas-seller-branding-refresh'){cache.clear();if(active)showError('Оформление изменилось в другой вкладке. Ваши правки сохранены в этой форме; отмените их, чтобы открыть новую версию.');refreshMounts()}});
 window.addEventListener('fas-assistant-personalization-change',event=>{if(event.detail?.profileChanged)contextChanged()});
 window.addEventListener('beforeunload',event=>{if(changed()||recovery.size){event.preventDefault();event.returnValue=''}});window.addEventListener('pagehide',()=>{remember();suspendedMounts=[...mounts].map(mount=>({container:mount.container,identity:mount.identity}));for(const mount of [...mounts])clearMount(mount);if(active){revoke(active.preview);active.preview=null;active.previewBlob=null}});window.addEventListener('pageshow',event=>{if(!event.persisted)return;if(active&&owner()===active.owner)drawPreview();else if(active)contextChanged();const previous=suspendedMounts;suspendedMounts=[];for(const mount of previous)if(mount.container.isConnected!==false)decorate(mount.container,mount.identity)});
 function state(){return {open:dialog.open,owner:active?.owner||null,busy:active?.busy||false,dirty:changed(),recoveryCount:recovery.size,localOnly:true}}
 function configure(options={}){if(dialog.open)throw Error('Сначала закройте оформление.');if(options.repository&&(typeof options.repository.read!=='function'||typeof options.repository.commit!=='function'))throw Error('Некорректный адаптер оформления.');config=options.repository?{repository:options.repository}:{};cache.clear();return state()}
 window.FasSellerBranding=Object.freeze({openEditor,close,decorate,configure,state});
})();
