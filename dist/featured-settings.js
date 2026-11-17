/* Inline feed controls reuse the catalogue's filters and preference flow. */
(()=>{
 'use strict';
 if(window.FasFeaturedSettings)return;
 const section=document.querySelector('#featured-lots'),header=section?.querySelector('.featured-heading');if(!section||!header)return;
 const field=id=>document.querySelector('#'+id),icon=name=>typeof uiIcon==='function'?uiIcon(name):'';
 const allowedRadii=new Set(['','5','10','30','50','100','300','500','1000','gt1000']);
 const wrapper=document.createElement('div');wrapper.className='featured-settings';
 wrapper.innerHTML=`<button type="button" class="featured-settings-toggle" id="featured-settings-toggle" aria-label="Настроить ленту" aria-expanded="false" aria-controls="featured-settings-panel"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></button><div class="featured-settings-panel" id="featured-settings-panel" role="region" aria-labelledby="featured-settings-title" hidden><div class="featured-settings-head"><h3 id="featured-settings-title">Настроить ленту</h3><button type="button" class="featured-settings-close" data-featured-settings-close aria-label="Закрыть настройки ленты">${icon('close')||'×'}</button></div><button type="button" class="featured-settings-route" data-featured-settings-categories><span><strong>Категории</strong><span id="featured-settings-category-value">Все категории</span><small id="featured-settings-category-count"></small></span>${icon('chevron-right')}</button><button type="button" class="featured-settings-route" data-featured-settings-location><span><strong>Местоположение</strong><span id="featured-settings-location-value">Выбрать свой регион</span></span>${icon('chevron-right')}</button><form id="featured-settings-form" novalidate><fieldset class="featured-settings-prices"><legend>Цена, ₽</legend><label for="featured-settings-min">От<input type="text" inputmode="decimal" id="featured-settings-min" autocomplete="off" placeholder="Не ограничена" maxlength="24"></label><label for="featured-settings-max">До<input type="text" inputmode="decimal" id="featured-settings-max" autocomplete="off" placeholder="Не ограничена" maxlength="24"></label></fieldset><label class="featured-settings-radius" for="featured-settings-radius">Расстояние от вас<select id="featured-settings-radius"><option value="">Любое расстояние</option><option value="5">До 5 км</option><option value="10">До 10 км</option><option value="30">До 30 км</option><option value="50">До 50 км</option><option value="100">До 100 км</option><option value="300">До 300 км</option><option value="500">До 500 км</option><option value="1000">До 1000 км</option><option value="gt1000">Свыше 1000 км</option></select></label><p class="featured-settings-error" id="featured-settings-error" role="alert" hidden></p><button type="submit" class="primary featured-settings-apply">Применить</button></form><div class="featured-settings-footer"><button type="button" data-featured-settings-interests>Мои интересы</button><button type="button" data-featured-settings-reset>Сбросить фильтры</button></div></div>`;
 header.appendChild(wrapper);header.classList.add('featured-settings-enabled');
 for(const button of section.querySelectorAll('[data-recommendation-settings]'))if(button.closest('.featured-modes')){if(typeof button.remove==='function')button.remove();else button.hidden=true}
 const toggle=field('featured-settings-toggle'),panel=field('featured-settings-panel'),form=field('featured-settings-form');
 panel.hidden=true;
 const pairs=[['featured-settings-min','adv-price-min'],['featured-settings-max','adv-price-max'],['featured-settings-radius','adv-radius']];
 function error(message=''){const box=field('featured-settings-error');box.textContent=message;box.hidden=!message}
 function sync(){
  for(const [local,main] of pairs){const source=field(main),target=field(local);if(local==='featured-settings-radius'&&source?.innerHTML?.includes('<option'))target.innerHTML=source.innerHTML;target.value=source?.value||''}
  const value=field('category')?.value||'',T=window.FasCategories,selection=typeof T?.selection==='function'?T.selection(value):value?[value]:[],label=typeof T?.label==='function'?T.label(value):value||'Все категории';
  field('featured-settings-category-value').textContent=label||'Все категории';field('featured-settings-category-count').textContent=selection?.length?'Выбрано: '+selection.length:'Все категории';
  let location=typeof userRegion!=='undefined'?userRegion?.name||'':'';if(!location&&typeof userOrigin==='function'){const point=userOrigin();location=point?.city||point?.regionName||''}field('featured-settings-location-value').textContent=location||'Выбрать свой регион';error();
 }
 function open(){sync();panel.hidden=false;toggle.setAttribute('aria-expanded','true');wrapper.querySelector('[data-featured-settings-categories]')?.focus?.({preventScroll:true});return true}
 function close(restoreFocus=true){if(panel.hidden)return false;panel.hidden=true;toggle.setAttribute('aria-expanded','false');if(restoreFocus)toggle.focus?.({preventScroll:true});return true}
 function validate(values){
  if(!allowedRadii.has(values[2]))return 'Выберите расстояние из списка.';
  const controls=pairs.map(([,id])=>field(id));if(controls.some(control=>!control)||typeof readAdvancedFilters!=='function')return 'Параметры поиска сейчас недоступны. Попробуйте ещё раз.';
  const previous=controls.map(control=>control.value);
  // readAdvancedFilters validates the complete current search. These temporary
  // values never emit events, render results or write preferences.
  try{controls.forEach((control,index)=>{control.value=values[index]});return readAdvancedFilters()?.error||''}
  catch{return 'Не удалось проверить параметры. Попробуйте ещё раз.'}
  finally{controls.forEach((control,index)=>{control.value=previous[index]})}
 }
 function apply(event){
  event?.preventDefault?.();const values=pairs.map(([id])=>field(id).value.trim()).map((value,index)=>index<2?value.replace(/[\s\u00a0\u202f]/g,'').replace(',','.'):value),message=validate(values);if(message){error(message);return false}
  const advanced=field('advanced-form');if(typeof advanced?.onsubmit!=='function'){error('Поиск сейчас недоступен. Попробуйте ещё раз.');return false}
  const controls=pairs.map(([,id])=>field(id)),previous=controls.map(control=>control.value);controls.forEach((control,index)=>{control.value=values[index]});
  try{advanced.onsubmit({preventDefault(){},target:advanced,currentTarget:advanced,keepPosition:true});close();return true}
  catch{controls.forEach((control,index)=>{control.value=previous[index]});error('Не удалось применить параметры. Попробуйте ещё раз.');return false}
 }
 function route(action,missing){if(typeof action!=='function'){error(missing);return}close();action()}
 toggle.onclick=()=>panel.hidden?open():close();wrapper.querySelector('[data-featured-settings-close]').onclick=()=>close();form.onsubmit=apply;
 wrapper.querySelector('[data-featured-settings-categories]').onclick=()=>route(typeof window.FasCategoryUI?.open==='function'?()=>window.FasCategoryUI.open({value:field('category')?.value||'',onSelect:value=>window.FasCategoryUI.selectBrowse(value,{scroll:false})}):null,'Категории сейчас недоступны. Попробуйте ещё раз.');
 wrapper.querySelector('[data-featured-settings-location]').onclick=()=>route(typeof openRegion==='function'?openRegion:null,'Выбор региона сейчас недоступен. Попробуйте ещё раз.');
 wrapper.querySelector('[data-featured-settings-interests]').onclick=()=>route(typeof openRecommendationSettings==='function'?openRecommendationSettings:null,'Настройки интересов сейчас недоступны. Попробуйте ещё раз.');
 wrapper.querySelector('[data-featured-settings-reset]').onclick=()=>route(typeof field('advanced-reset')?.onclick==='function'?()=>field('advanced-reset').onclick():null,'Сброс фильтров сейчас недоступен. Попробуйте ещё раз.');
 document.addEventListener('click',event=>{if(!panel.hidden&&!wrapper.contains(event.target))close()});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){event.preventDefault?.();event.stopPropagation?.();close()}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)close(false)});
 window.FasFeaturedSettings=Object.freeze({open,close,apply,sync});
})();
