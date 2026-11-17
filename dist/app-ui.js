/* Device-local convenience state; no claim of account synchronization. */
(()=>{
  const preferenceKey='fas-search-preferences-v1';let ready=false,lastPreference='',searchTimer=null,composing=false,searchEpoch=0,busySearch=null;
  const basic=['search','region-filter','category','brand','budget','city','sort'];
  const search=document.getElementById('search');
  // A fresh page starts a new text search; filters remain device-local preferences.
  search.value='';
  const calculateDistance=typeof distanceToLot==='function'?distanceToLot:null;let renderDistances=null;
  if(calculateDistance)distanceToLot=function(lot){if(!renderDistances)return calculateDistance.apply(this,arguments);if(!renderDistances.has(lot))renderDistances.set(lot,calculateDistance.apply(this,arguments));return renderDistances.get(lot)};
  // Sorting and card labels reuse the same distance only during one synchronous render.
  // Outside that render, and after any failure, location changes take effect immediately.
  function withRenderDistances(action){const previous=renderDistances;renderDistances=calculateDistance?new Map():null;try{return action()}finally{renderDistances=previous}}
  function savePreferences(){if(!ready||readAdvancedFilters().error)return;try{const value=JSON.stringify({version:1,categoryAutomatic:window.FasKeywordCategoryIsAutomatic?.(),categoryExplicit:!!window.FasCategoryUI?.isExplicit?.(),basic:Object.fromEntries(basic.map(id=>[id,id==='search'?'':document.getElementById(id).value])),advanced:Object.fromEntries(ADV_IDS.map(id=>[id,document.getElementById('adv-'+id).value])),tab:['all','fav','soon'].includes(tab)?tab:'all'});if(value===lastPreference)return;localStorage.setItem(preferenceKey,value);lastPreference=value}catch{/* Private mode or storage limits must not block browsing. */}}
  function clearSearchError(){document.body?.classList.remove('catalog-search-error');if(!busySearch){const panel=document.getElementById('search-progress');if(panel)panel.hidden=true}}
  function clearBusy(state=busySearch){if(!state||busySearch!==state)return;const count=document.getElementById('result-count'),grid=document.getElementById('grid'),panel=document.getElementById('search-progress');if(count)count.textContent=state.previousText;grid?.removeAttribute?.('aria-busy');if(panel)panel.hidden=true;document.body?.classList.remove('catalog-searching');busySearch=null}
  function cancelSearch(){searchEpoch++;if(searchTimer!==null)clearTimeout(searchTimer);searchTimer=null;clearBusy();clearSearchError()}
  function searchState(){return JSON.stringify({basic:basic.map(id=>document.getElementById(id).value),advanced:ADV_IDS.map(id=>document.getElementById('adv-'+id).value),tab,reelsMode,origin:typeof userOrigin==='function'?userOrigin():null})}
  function prepareCandidates(){
    const selectedCategory=document.getElementById('category').value,category=window.FasKeywordCategoryScope?.(search.value,selectedCategory)??selectedCategory,region=document.getElementById('region-filter').value,city=document.getElementById('city').value;
    const favorites=tab==='fav'&&typeof saved!=='undefined'?new Set(saved):null;
    return cars.filter(lot=>(!favorites||favorites.has(lot.id))&&(!city||lot.city===city)&&(typeof regionMatches==='function'?regionMatches(lot,region):!region||typeof getRegionCode!=='function'||getRegionCode(lot)===region)&&(!category||typeof categoryMatches!=='function'||categoryMatches(lot,category)));
  }
  function runPrepared(action){
    const api=window.FasKeywordSearch,query=search.value.trim();
    clearSearchError();
    if(!query||typeof api?.prepare!=='function'||typeof cars==='undefined'||!Array.isArray(cars)||readAdvancedFilters().error)return action();
    const epoch=searchEpoch,signature=searchState(),count=document.getElementById('result-count'),grid=document.getElementById('grid'),panel=document.getElementById('search-progress'),title=document.getElementById('search-progress-title'),text=document.getElementById('search-progress-text'),retry=document.getElementById('search-retry');
    const state={previousText:count?.textContent||'',progress:-1};busySearch=state;
    if(count){count.textContent='Ищем…';count.setAttribute?.('aria-live','polite')}
    grid?.setAttribute?.('aria-busy','true');if(panel)panel.hidden=false;if(title)title.textContent='Ищем подходящие лоты';if(text)text.textContent='Подготавливаем результаты…';if(retry)retry.hidden=true;document.body?.classList.add('catalog-searching');
    if(typeof syncCatalogResults==='function'&&typeof visibleLots!=='undefined')syncCatalogResults(visibleLots.length,query.toLocaleLowerCase('ru'),readAdvancedFilters());
    const stale=()=>epoch!==searchEpoch||composing||document.hidden===true||signature!==searchState();
    const failed=()=>{if(stale()||busySearch!==state){clearBusy(state);return}clearBusy(state);if(panel)panel.hidden=false;if(title)title.textContent='Не удалось завершить поиск';if(text)text.textContent='Повторите поиск. Указанные фильтры сохранены.';if(retry)retry.hidden=false;document.body?.classList.add('catalog-search-error')};
    let preparation;
    try{preparation=api.prepare(prepareCandidates(),query,{cancelled:stale,onProgress(progress){if(stale()||busySearch!==state)return;const total=Number(progress?.total),prepared=Math.min(total,Math.max(0,Number(progress?.prepared)));if(!Number.isFinite(total)||total<=0||!Number.isFinite(prepared)||prepared<=0)return;const percent=Math.min(100,Math.floor(prepared/total*100));if(percent!==state.progress){state.progress=percent;if(count)count.textContent='Ищем… '+percent+'%';if(text)text.textContent='Проверено '+prepared.toLocaleString('ru-RU')+' из '+total.toLocaleString('ru-RU')+' лотов'}}})}catch{failed();return}
    return Promise.resolve(preparation).then(result=>{
      if(result?.cancelled||stale()||busySearch!==state){clearBusy(state);return}
      clearBusy(state);return action();
    },failed);
  }
  const originalRender=render;
  render=function(...args){cancelSearch();return withRenderDistances(()=>{const result=originalRender.apply(this,args);savePreferences();return result})};
  try{
    const stored=JSON.parse(localStorage.getItem(preferenceKey)||'null');
    if(stored?.version===1){
      let restoreManualCategory=false;
      const oldQuery=typeof stored.basic?.search==='string'&&stored.basic.search.trim(),automaticCategory=stored.categoryExplicit!==true&&stored.categoryAutomatic!==false&&(stored.categoryAutomatic===true||!!oldQuery);
      ['category','region-filter'].forEach(id=>{if(typeof stored.basic?.[id]!=='string')return;const savedValue=stored.basic[id].slice(0,id==='category'?2048:1024),value=id==='category'&&automaticCategory&&(!window.FasCategories||window.FasCategories.selection(savedValue)!==null)&&!(window.FasCategories?.selection(savedValue)?.length>1)?'':savedValue,setter=window.FasCategoryUI?.setValue||window.FasSetCategoryValue;if(id==='category'&&typeof setter==='function'){const result=setter(value);restoreManualCategory=result===false||(window.FasCategories?.selection(value)?.length||0)>1}else if(id==='region-filter'&&typeof window.FasSetRegionValue==='function')window.FasSetRegionValue(value);else document.getElementById(id).value=value});syncSearchFields();
      ['brand','budget','city','sort'].forEach(id=>{if(typeof stored.basic?.[id]==='string')(id==='city'&&typeof window.FasSetSearchCity==='function'?window.FasSetSearchCity(stored.basic[id].slice(0,200)):document.getElementById(id).value=stored.basic[id].slice(0,200))});
      ADV_IDS.forEach(id=>{if(typeof stored.advanced?.[id]==='string')document.getElementById('adv-'+id).value=stored.advanced[id].slice(0,150)});
      if(!userOrigin())document.getElementById('adv-radius').value='';
      if(readAdvancedFilters().error)ADV_IDS.forEach(id=>document.getElementById('adv-'+id).value='');
      tab=['all','fav','soon'].includes(stored.tab)?stored.tab:'all';
      if(new URLSearchParams(location.search).get('view')==='favorites')tab='fav';
      document.querySelectorAll('.tab').forEach(button=>button.classList.toggle('on',button.dataset.tab===tab));if((restoreManualCategory||stored.categoryAutomatic===false||window.FasCategories?.selection(document.getElementById('category').value)?.length>1)&&typeof window.FasRestoreManualKeywordCategory==='function')window.FasRestoreManualKeywordCategory(document.getElementById('search').value);else window.FasSyncKeywordCategory?.(document.getElementById('search').value);window.FasCategoryUI?.setExplicit?.(stored.categoryExplicit===true);runPrepared(()=>render());
    }
  }catch{/* A malformed preference record is ignored without affecting lot data. */}
  ready=true;
  function scheduleSearch(event){cancelSearch();if(composing||event?.isComposing)return;searchTimer=setTimeout(()=>{searchTimer=null;window.FasSyncKeywordCategory?.(search.value);runPrepared(()=>render())},180)}
  search.oninput=scheduleSearch;
  search.addEventListener('compositionstart',()=>{composing=true;cancelSearch()});
  search.addEventListener('compositionend',()=>{composing=false;scheduleSearch()});
  // Some existing handlers captured render before this enhancement was installed.
  // Keep their filter-specific behavior and persist their final values as well.
  basic.filter(id=>id!=='search').forEach(id=>{const node=document.getElementById(id),previous=node.onchange;node.onchange=function(...args){cancelSearch();if(id==='category')window.FasRestoreManualKeywordCategory?.(search.value);return runPrepared(()=>withRenderDistances(()=>{const result=previous?previous.apply(this,args):render();savePreferences();return result}))}});
  ['filters','advanced-form'].forEach(id=>{const form=document.getElementById(id),previous=form?.onsubmit;if(!form)return;form.onsubmit=function(...args){args[0]?.preventDefault();document.activeElement?.blur?.();cancelSearch();if(id==='filters'){if(typeof searchReturnToFeed!=='undefined')searchReturnToFeed=false;tab='all';if(typeof catalogLimit!=='undefined')catalogLimit=24;document.querySelectorAll('.tab').forEach(button=>button.classList.toggle('on',button.dataset.tab==='all'));if(typeof window.FasKeywordSearch?.prepare==='function')window.FasSyncKeywordCategory?.(search.value)}return runPrepared(()=>withRenderDistances(()=>{const result=previous?previous.apply(this,args):render();savePreferences();return result}))}});
  function retrySearch(){const form=document.getElementById('filters');if(typeof form?.requestSubmit==='function')form.requestSubmit();else form?.onsubmit?.({preventDefault(){}})}
  const modal=document.getElementById('modal'),content=document.getElementById('modal-content');
  function nameModal(){if(!modal||!content)return;const title=content.querySelector('h2');if(title){if(!title.id)title.id='fas-modal-title';modal.setAttribute('aria-labelledby',title.id);modal.removeAttribute('aria-label')}else{modal.removeAttribute('aria-labelledby');modal.setAttribute('aria-label','ФАС торги')}}
  nameModal();
  const Observer=typeof MutationObserver==='function'?MutationObserver:null;
  if(Observer&&content)new Observer(nameModal).observe(content,{childList:true,subtree:true});
  // Cancel the previous request before a control starts its replacement search.
  // Bubbling would cancel the very request started by the category picker click.
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-retry-search]')){event.preventDefault?.();retrySearch();return}
    const control=event.target.closest('button,a,[role="button"],[data-open],input[type="submit"]'),form=control?.form||control?.closest?.('form'),submit=control&&['filters','advanced-form'].includes(form?.id)&&((String(control.tagName).toLowerCase()==='button'&&(!control.type||control.type==='submit'))||(String(control.tagName).toLowerCase()==='input'&&control.type==='submit'));
    if(busySearch&&control&&!submit&&!event.target.closest('[data-featured-mode]'))cancelSearch();
    if(event.target.closest('[data-browse-all]')){tab='all';document.querySelectorAll('.tab').forEach(button=>button.classList.toggle('on',button.dataset.tab==='all'));document.getElementById('advanced-reset').onclick();}
    else if(event.target.closest('[data-clear-search]'))document.getElementById('advanced-reset').onclick();
    else if(event.target.closest('[data-edit-search]'))showSearch();
  },{capture:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelSearch();document.querySelectorAll('video').forEach(video=>video.pause())}else if(reelsMode)syncReels(swipeIndex())});
  window.addEventListener?.('popstate',cancelSearch);window.addEventListener?.('hashchange',cancelSearch);
  if(typeof installFasLotGestures==='function')installFasLotGestures();
})();
