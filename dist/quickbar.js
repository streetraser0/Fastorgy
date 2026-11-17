/* Persistent navigation for browsing; form dialogs keep their own controls. */
(()=>{
 const dock=document.createElement('nav');dock.id='quick-access';dock.className='quick-access';dock.setAttribute('aria-label','Быстрый доступ');
 const actions=[['catalog','grid','Каталог','Каталог: открыть лоты'],['search','search','Поиск','Поиск: найти лоты'],['sell','listing','Продать','Продать — разместить лот'],['favorites','heart','Избранное','Избранное: открыть сохранённые лоты'],['bids','gavel','Мои ставки','Мои ставки: открыть лоты с вашими ставками'],['account','user','Кабинет','Кабинет: открыть личный кабинет']];
 dock.innerHTML=actions.map(([key,icon,label,description])=>`<button type="button" data-quick="${key}" class="quick-access-button ${key==='sell'?'quick-access-sell':''}" aria-label="${description}" title="${description}"><span class="quick-access-icon" aria-hidden="true">${uiIcon(icon)}${key==='favorites'?'<span class="quick-access-count" id="quick-favorite-count" hidden></span>':key==='bids'?'<span class="quick-access-count" id="quick-bid-count" hidden></span>':''}</span><span class="quick-access-label">${label}</span></button>`).join('');document.body.appendChild(dock);document.body.classList.add('has-quick-access');
 const modal=document.querySelector('#modal'),content=document.querySelector('#modal-content'),grid=document.querySelector('#grid'),top=document.querySelector('.top');
 const position=document.querySelector('#reels-position');if(position){position.classList.add('quick-reel-position');dock.appendChild(position)}
 const small=window.matchMedia('(max-width:700px)');let headerVisible=true,frame=0;
 const focusedInput=()=>{const node=document.activeElement;return !!node&&(node.matches?.('input,textarea,select,[contenteditable="true"]')||node.isContentEditable)};
 const enabled=node=>!!node&&!node.disabled&&!node.hidden&&!node.closest('[hidden],[inert],fieldset[disabled]');
 function lotAction(){
  if(!modal.open||!modal.classList.contains('lot-dialog'))return null;
  const form=content.querySelector('#bid-form'),input=content.querySelector('#bid');
  if(enabled(form)&&enabled(input))return {target:form,focus:input,label:'К ставке',description:'К ставке: перейти к форме ставки'};
  const purchase=[...content.querySelectorAll('[data-descending-buy],.seller-buy-now,[data-open-lot-payment]')].find(enabled);
  return purchase?{target:purchase,focus:purchase,label:'К покупке',description:'Перейти к покупке лота'}:null;
 }
 function syncLotAction(jump){const action=lotAction();jump.hidden=!action;jump.disabled=!action;if(action){jump.style.removeProperty('display');jump.setAttribute('aria-label',action.description);jump.setAttribute('title',action.description);if(jump.dataset.label!==action.label){jump.innerHTML=action.label+' '+uiIcon('arrow-down');jump.dataset.label=action.label}}else jump.style.setProperty('display','none');return action}
 function sync(){
  frame=0;const visible=!modal.open&&!document.querySelectorAll('dialog[open]').length&&!document.querySelector('#category-picker')?.open&&!focusedInput()&&(small.matches||reelsMode||!headerVisible);
  dock.hidden=!visible;document.body.classList.toggle('quick-access-visible',visible);document.body.classList.toggle('quick-access-modal',!!modal.open);
  const count=document.querySelector('#quick-favorite-count');count.textContent=saved.length>99?'99+':String(saved.length);count.hidden=!saved.length;
  dock.querySelectorAll('[data-quick]').forEach(button=>{const active=button.dataset.quick==='favorites'?tab==='fav':button.dataset.quick==='catalog'&&tab!=='fav';button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');if(button.dataset.quick==='favorites')button.setAttribute('aria-label','Избранное: открыть сохранённые лоты, сохранено: '+saved.length)});
  const bidButton=dock.querySelector('[data-quick="bids"]'),bidBadge=dock.querySelector('#quick-bid-count');let outbid=0;
  try{const value=window.FasAuctionNotifications?.bidSummary?.().outbidCount;if(Number.isSafeInteger(value)&&value>0)outbid=value}catch{/* Optional alerts cannot block navigation. */}
  const bidCount=outbid>99?'99+':String(outbid);if(bidBadge.textContent!==bidCount)bidBadge.textContent=bidCount;bidBadge.hidden=!outbid;bidButton.classList.toggle('has-bid-alert',!!outbid);
  const bidNoun=outbid%10===1&&outbid%100!==11?'лоте':'лотах',bidLabel=outbid?'Мои ставки: вашу ставку перебили в '+outbid+' '+bidNoun+'. Открыть и повысить ставку.':'Мои ставки: открыть лоты с вашими ставками';if(bidButton.getAttribute('aria-label')!==bidLabel)bidButton.setAttribute('aria-label',bidLabel);if(bidButton.getAttribute('title')!==bidLabel)bidButton.setAttribute('title',bidLabel);
  const bar=content.querySelector('.lot-quick-access');
  if(modal.open&&modal.classList.contains('lot-dialog')){
   if(!bar){const node=document.createElement('div');node.className='lot-quick-access';node.setAttribute('role','group');node.setAttribute('aria-label','Быстрые действия с лотом');node.setAttribute('title','Свайп по панели в любую сторону — назад');node.innerHTML=`<button type="button" data-quick="back" class="lot-quick-back" aria-label="Назад: закрыть карточку лота" title="Вернуться к просмотру лотов">${uiIcon('chevron-left')}<span>Назад</span></button><img src="assets/brand/fas-torgi-logo.png?v=20261116-gradient1" alt="ФАС торги — Федеральная аукционная сеть"><button type="button" data-quick="save" class="lot-quick-save" aria-label="Добавить лот в избранное" title="Добавить лот в избранное">${uiIcon('heart')}</button><button type="button" data-quick="bid" class="primary lot-quick-bid" aria-label="К ставке: перейти к форме ставки" title="Перейти к форме ставки">К ставке ${uiIcon('arrow-down')}</button>`;const scrollTop=modal.scrollTop;content.insertBefore(node,content.firstChild);modal.classList.add('has-lot-quick-access');modal.scrollTop=scrollTop;syncLotSwipeSurface()}
   const id=Number(content.querySelector('[data-open-lot-id]')?.dataset.openLotId||content.querySelector('#bid-form')?.dataset.lotId);
   const current=content.querySelector('.lot-quick-access');current.dataset.lotId=String(id);
   const liked=saved.includes(id),heart=current.querySelector('[data-quick="save"]');heart.classList.toggle('saved',liked);heart.setAttribute('aria-pressed',String(liked));heart.setAttribute('aria-label',liked?'Убрать лот из избранного':'Добавить лот в избранное');heart.setAttribute('title',liked?'Убрать лот из избранного':'Добавить лот в избранное');if(heart.dataset.liked!==String(liked)){heart.innerHTML=uiIcon('heart',liked);heart.dataset.liked=String(liked)}
   syncLotAction(current.querySelector('[data-quick="bid"]'));
  }else{if(modal.classList.contains('has-lot-quick-access'))modal.classList.remove('has-lot-quick-access');if(bar)bar.remove()}
 }
 function schedule(){if(!frame)frame=window.requestAnimationFrame(sync)}
 const originalRender=render;render=function(...args){const result=originalRender.apply(this,args);schedule();return result};
 const Observer=window.MutationObserver||globalThis.MutationObserver;
 if(Observer){new Observer(schedule).observe(modal,{attributes:true,attributeFilter:['open','class']});new Observer(schedule).observe(content,{childList:true});new Observer(schedule).observe(document.body,{attributes:true,attributeFilter:['class']});new Observer(schedule).observe(document.body,{attributes:true,attributeFilter:['open'],subtree:true});const count=document.querySelector('#fav-count');if(count)new Observer(schedule).observe(count,{childList:true,characterData:true,subtree:true})}
 if(window.IntersectionObserver&&top)new window.IntersectionObserver(entries=>{headerVisible=entries[0]?.isIntersecting!==false;schedule()},{threshold:0}).observe(top);
 else window.addEventListener('scroll',()=>{headerVisible=top?top.getBoundingClientRect().bottom>0:false;schedule()},{passive:true});
 modal.addEventListener('close',schedule);document.addEventListener('focusin',schedule);document.addEventListener('focusout',()=>window.setTimeout(schedule,0));window.addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);small.addEventListener?.('change',schedule);
 window.addEventListener('fas-bids-changed',schedule);
 window.setInterval?.(()=>{if(document.hidden)return;schedule();window.FasAuctionNotifications?.refreshMyBids?.()},1000);
 document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-quick]');if(!button)return;const action=button.dataset.quick;
  if(action==='back'){if(!window.FasSellerStorefront?.returnFromLot?.()&&!window.FasPropertyMap?.returnFromLot?.())modal.close();return}
  if(action==='save'){toggleLotFavorite(Number(button.closest('.lot-quick-access').dataset.lotId));sync();return}
  if(action==='bid'){const destination=syncLotAction(button);if(destination){destination.target.scrollIntoView({block:'center',behavior:window.matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});destination.focus.focus?.({preventScroll:true})}return}
  if(action==='previous'||action==='next'){modal.close();moveLot(action==='previous'?-1:1);return}
  if(action==='account'){document.querySelector('#account')?.click();return}
  if(modal.open)modal.close();
  if(action==='catalog'){if(reelsMode)setReels(false);if(tab!=='all')setTab('all');document.querySelector('#lot-results').scrollIntoView?.({block:'start'})}
  if(action==='search'){showSearch();document.querySelector('#search').focus?.({preventScroll:true})}
  if(action==='sell')window.FasSellerUI?.openEditor();
  if(action==='favorites'){setTab('fav');if(!reelsMode)document.querySelector('#lot-results').scrollIntoView?.({block:'start'})}
  if(action==='bids'){if(typeof window.FasAuctionNotifications?.openMyBids==='function')window.FasAuctionNotifications.openMyBids();else toast('Раздел ставок загружается. Попробуйте ещё раз.')}
  if(action==='more'){const inFeed=reelsMode;openFeedMenu();if(inFeed)content.querySelector('.feed-menu')?.insertAdjacentHTML('afterbegin',`<button type="button" data-quick="previous">${uiIcon('arrow-up')} Предыдущий лот</button><button type="button" data-quick="next">${uiIcon('arrow-down')} Следующий лот</button>`)}
  schedule();
 });
 sync();
})();
