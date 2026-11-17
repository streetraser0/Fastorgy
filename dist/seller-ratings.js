/* Personal seller assessments stay on this device; they are not public or verified reviews. */
(()=>{
 'use strict';
 const KEY='fas-seller-ratings-v1',MAX=500;
 const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const star='<svg class="ui-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg>';
 const grid=document.querySelector('#grid'),content=document.querySelector('#modal-content');
 let ratings=new Map(),index=new Map(),indexedCars=null,indexedLength=-1,origin=null,frame=0;
 function lotById(id){
  const list=typeof cars!=='undefined'?cars:[];
  if(list!==indexedCars||list.length!==indexedLength){index=new Map(list.map((lot,i)=>[lot.id,i]));indexedCars=list;indexedLength=list.length}
  const position=index.get(Number(id)),lot=list[position];
  if(lot?.id===Number(id))return lot;
  return null;
 }
 function sellerKey(lot){
  if(!lot)return null;
  if(typeof lot.sellerOwnerId==='string'&&lot.sellerOwnerId.trim())return 'private:'+lot.sellerOwnerId.trim().slice(0,256);
  const name=String(lot.bank||lot.sellerName||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru');
  return name?'seller:'+String(lot.sellerType||'bank').slice(0,30)+':'+name.slice(0,200):null;
 }
 function own(lot){
  if(!lot?.sellerOwnerId)return false;
  try{const profile=window.FasSellerUI?.getProfile?.();if(profile?.id)return profile.id===lot.sellerOwnerId}catch{}
  try{return JSON.parse(localStorage.getItem('fas-seller-workspace-v1')||'null')?.profile?.id===lot.sellerOwnerId}catch{return false}
 }
 try{
  const stored=JSON.parse(localStorage.getItem(KEY)||'null');
  if(stored?.version===1&&Array.isArray(stored.ratings))for(const entry of stored.ratings.slice(-MAX)){
   if(!entry||typeof entry.seller!=='string'||!entry.seller||entry.seller.length>300||!Number.isInteger(entry.score)||entry.score<1||entry.score>5||typeof entry.note!=='string'||entry.note.length>1000)continue;
   ratings.set(entry.seller,{score:entry.score,note:entry.note,updatedAt:typeof entry.updatedAt==='string'?entry.updatedAt:''});
  }
 }catch{}
 function get(id){const lot=typeof id==='object'?id:lotById(id),key=sellerKey(lot);const value=key&&!own(lot)?ratings.get(key):null;return value?{...value}:null}
 function persist(next){localStorage.setItem(KEY,JSON.stringify({version:1,ratings:[...next].map(([seller,value])=>({seller,...value}))}));ratings=next}
 function save(id,score,note=''){
  const lot=lotById(id),key=sellerKey(lot);
  if(!key)return {ok:false,error:'Продавец этого лота пока не указан.'};
  if(own(lot))return {ok:false,error:'Свои объявления оценивать нельзя.'};
  score=Number(score);note=String(note??'').trim();
  if(!Number.isInteger(score)||score<1||score>5)return {ok:false,error:'Выберите оценку от 1 до 5.'};
  if(note.length>1000)return {ok:false,error:'Сократите заметку до 1 000 символов.'};
  const next=new Map(ratings);next.delete(key);next.set(key,{score,note,updatedAt:new Date().toISOString()});while(next.size>MAX)next.delete(next.keys().next().value);
  try{persist(next)}catch{return {ok:false,error:'Оценка не сохранена: проверьте свободное место и настройки браузера.'}}
  refresh();return {ok:true,rating:get(lot)};
 }
 function remove(id){
  const key=sellerKey(lotById(id));if(!key)return {ok:false,error:'Продавец не найден.'};
  const next=new Map(ratings);next.delete(key);
  try{persist(next)}catch{return {ok:false,error:'Не удалось удалить сохранённую оценку. Попробуйте ещё раз.'}}
  refresh();return {ok:true};
 }
 const dialog=document.createElement('dialog');dialog.id='seller-rating-dialog';dialog.className='seller-rating-dialog';dialog.setAttribute('aria-labelledby','seller-rating-title');document.body.appendChild(dialog);
 dialog.addEventListener('close',()=>{document.body.classList.remove('seller-rating-open');if(origin?.isConnected!==false)origin?.focus?.({preventScroll:true});if(typeof reelsMode!=='undefined'&&reelsMode&&typeof syncReels==='function'&&typeof swipeIndex==='function')syncReels(swipeIndex())});
 function showError(message){const box=dialog.querySelector('[data-rating-error]');if(box){box.textContent=message;box.hidden=!message}}
 function starChoices(name,score,inline=false){
  return [1,2,3,4,5].map(value=>`<label class="${value<=score?'is-filled':''}"><input type="radio" name="${name}" value="${value}" ${score===value?'checked':''} aria-label="${value} из 5" ${inline?'':'required'}>${star}</label>`).join('');
 }
 function fillStars(group,score){
  group?.querySelectorAll('label').forEach(label=>label.classList.toggle('is-filled',Number(label.querySelector('input')?.value)<=score));
 }
 function open(id){
  const lot=lotById(id);if(!lot||!sellerKey(lot)){if(typeof toast==='function')toast('Продавец этого лота пока не указан.');return false}
  const value=get(lot),name=String(lot.sellerName||lot.bank||'Продавец'),isOwn=own(lot);origin=document.activeElement;
  dialog.innerHTML=`<div class="rating-head"><img src="assets/brand/fas-torgi-logo.png?v=20261116-gradient1" alt="ФАС торги — Федеральная аукционная сеть"><button type="button" data-rating-close aria-label="Закрыть оценку продавца">×</button></div><div class="rating-body"><div class="eyebrow">Продавец</div><h2 id="seller-rating-title">${esc(name)}</h2><p class="rating-public-status">Нет подтверждённых отзывов</p><p class="rating-explainer">Публичный рейтинг появится после подключения отзывов по подтверждённым сделкам. Сейчас можно сохранить личную оценку и заметку на этом устройстве. Другие пользователи их не видят.</p>${isOwn?'<p class="rating-own">Это ваше объявление. Оценивать себя нельзя.</p>':`<form id="seller-rating-form"><fieldset class="rating-stars"><legend>Ваша оценка</legend><div class="rating-options">${starChoices('sellerRatingScore',value?.score||0)}</div></fieldset><label class="rating-note-label" for="seller-rating-note">Личная заметка <small>Необязательно, до 1 000 символов</small></label><textarea id="seller-rating-note" rows="4" maxlength="1000" placeholder="Что важно помнить о продавце">${esc(value?.note||'')}</textarea><p class="rating-error" data-rating-error role="alert" hidden></p><div class="rating-actions"><button type="submit" class="primary">Сохранить личную оценку</button>${value?'<button type="button" class="outline" data-rating-delete>Удалить оценку</button>':''}</div></form>`}</div>`;
  if(!isOwn){
   const options=dialog.querySelector('.rating-options');options.onchange=event=>{fillStars(options,Number(event.target.value));showError('')};
   dialog.querySelector('#seller-rating-form').onsubmit=event=>{event.preventDefault();const selected=[...dialog.querySelectorAll('input[name="sellerRatingScore"]')].find(input=>input.checked);const result=save(id,selected?.value,dialog.querySelector('#seller-rating-note').value);if(!result.ok){showError(result.error);return}dialog.close();if(typeof toast==='function')toast('Личная оценка сохранена на этом устройстве.')};
   const removeButton=dialog.querySelector('[data-rating-delete]');if(removeButton)removeButton.onclick=()=>{const result=remove(id);if(!result.ok){showError(result.error);return}dialog.close();if(typeof toast==='function')toast('Личная оценка удалена.')};
  }
  dialog.querySelector('[data-rating-close]').onclick=()=>dialog.close();
  document.querySelectorAll('video').forEach(video=>{if(!video.paused)video.pause()});
  document.body.classList.add('seller-rating-open');if(!dialog.open)dialog.showModal();dialog.scrollTop=0;
  dialog.querySelector('[data-rating-close]').focus?.({preventScroll:true});return true;
 }
 function decorate(container,id,detail=false){
  const lot=lotById(id),key=sellerKey(lot);let row=container.querySelector('.seller-rating-line');
  if(!key){row?.remove();return}
  const value=get(lot),isOwn=own(lot),signature=key+'|'+Number(id)+'|'+(value?.score||'')+'|'+String(isOwn);
  if(row?.dataset.ratingSignature===signature)return;
  if(!row){row=document.createElement('div');row.className='seller-rating-line'+(detail?' seller-rating-detail':'');const target=detail?container.querySelector('.lot-detail-secondary')||container.querySelector('.lot-detail-facts')||container:container,before=target.querySelector(detail?(target===container?'.purchase-price':'.object-attributes'):'.location');(before?.parentElement||target).insertBefore(row,before)}
  row.dataset.ratingSignature=signature;
  row.innerHTML=`${!isOwn?`<fieldset class="rating-inline-stars" data-rating-lot="${Number(id)}"><legend>Личная оценка продавца</legend><div class="rating-inline-options">${starChoices('sellerRating-'+(detail?'detail-':'card-')+Number(id),value?.score||0,true)}</div></fieldset>`:''}<button type="button" data-open-seller-rating="${Number(id)}" title="${isOwn?'Сведения о продавце':'Личная оценка продавца'}" aria-label="${isOwn?'Сведения о своём объявлении':value?'Изменить личную оценку продавца':'Оценить продавца на этом устройстве'}">${star}<span>${isOwn?'Ваше объявление':value?'Ваша оценка: '+value.score+'/5':'Оценить продавца'}<small>${isOwn?'Оценка своего объявления недоступна':value?'На этом устройстве':'Нет подтверждённых отзывов'}</small></span></button>`;
 }
 function refresh(){
  frame=0;
  grid?.querySelectorAll('.card[data-lot]').forEach(card=>{const body=card.querySelector('.card-body');if(body)decorate(body,Number(card.dataset.lot))});
  const body=content?.querySelector('.purchase-body'),lotForm=content?.querySelector('#bid-form'),id=body?.dataset.openLotId||lotForm?.dataset.lotId;if(body&&id)decorate(body,Number(id),true);
 }
 function schedule(){if(frame)return;if(typeof requestAnimationFrame==='function')frame=requestAnimationFrame(refresh);else refresh()}
 document.addEventListener('click',event=>{const button=event.target.closest?.('[data-open-seller-rating]');if(!button)return;event.preventDefault();open(Number(button.dataset.openSellerRating))});
 document.addEventListener('change',event=>{
  const input=event.target,group=input.closest?.('[data-rating-lot]');if(!group||input.type!=='radio')return;
  const id=Number(group.dataset.ratingLot),score=Number(input.value),previous=get(id),detail=group.closest('.seller-rating-detail')!==null;
  const result=save(id,score,previous?.note||'');
  if(!result.ok){group.querySelectorAll('input').forEach(item=>{item.checked=Number(item.value)===previous?.score});fillStars(group.querySelector('.rating-inline-options'),previous?.score||0);if(typeof toast==='function')toast(result.error);return}
  // Refresh replaces the assessment controls in every visible lot of this seller.
  const surface=detail?content:grid;
  surface?.querySelector('[data-rating-lot="'+id+'"] input[value="'+score+'"]')?.focus?.({preventScroll:true});
  if(typeof toast==='function')toast('Ваша оценка: '+score+' из 5. Сохранено на этом устройстве.');
 });
 function observeChanges(records){if(!records.length||records.some(change=>change.target===grid||change.target===content||change.target?.matches?.('.card,.card-body,.purchase-body')))schedule()}
 const Observer=window.MutationObserver||globalThis.MutationObserver;if(Observer){if(grid)new Observer(observeChanges).observe(grid,{childList:true,subtree:true});if(content)new Observer(observeChanges).observe(content,{childList:true,subtree:true})}
 window.FasSellerRatings=Object.freeze({open,get,save,remove,refresh});refresh();
})();
