/* Catalogue region selection: one canonical value shared by filtering and restore. */
(()=>{
 'use strict';
 const regions=typeof RF_REGIONS==='undefined'?[]:RF_REGIONS.map(region=>({code:region.code,name:region.name}));
 if(!regions.length)return;
 const codes=regions.map(region=>region.code).sort(),valid=new Set(codes),names=new Map(regions.map(region=>[region.code,region.name])),cache=new Map();
 function selection(value=''){
  const raw=typeof value==='string'?value:Array.isArray(value)?value.join(','):null;
  if(raw===null||raw.length>1024)return null;
  if(cache.has(raw))return cache.get(raw);
  const parts=raw===''?[]:raw.split(',').map(code=>code.trim()),result=parts.some(code=>!valid.has(code))?null:Object.freeze([...new Set(parts)].sort());
  if(cache.size>=32)cache.clear();cache.set(raw,result);return result;
 }
 function normalize(value=''){const selected=selection(value);return selected===null?null:selected.length===codes.length?'':selected.join(',')}
 function matches(code,value=''){const selected=selection(value);return selected!==null&&(!selected.length||selected.includes(code))}
 function label(value=''){
  const selected=selection(value);if(selected===null)return 'Регион недоступен';
  if(!selected.length||selected.length===codes.length)return 'Вся Россия';
  if(selected.length===1)return names.get(selected[0]);
  return 'Регионов: '+selected.length;
 }
 window.FasRegions=Object.freeze({selection,normalize,matches,label,codes:()=>codes.slice()});
 let control=null,pending=null,openedValue='',mounted=false;
 const find=id=>document.getElementById(id),escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function refresh(){
  if(!mounted)return;
  const value=control.value,description=label(value),selected=selection(value);
  find('region-select-label').textContent=description;
  find('region-select-trigger').setAttribute('aria-label','Регион имущества: '+description);
  find('region-select-trigger').title=selected?.length?selected.map(code=>names.get(code)).join(', '):'Вся Россия';
  if(pending&&value!==openedValue)close(false);
 }
 function syncPending(){
  const all=find('region-select-all');all.checked=pending.size===codes.length;all.indeterminate=pending.size>0&&pending.size<codes.length;
  all.setAttribute('aria-checked',all.indeterminate?'mixed':String(all.checked));
  find('region-select-apply').disabled=pending.size===0;
  find('region-select-status').textContent=pending.size===0?'Выберите хотя бы один регион':pending.size===codes.length?'Выбрана вся Россия':'Выбрано регионов: '+pending.size;
  find('region-select-panel').querySelectorAll('[data-region-code]').forEach(input=>{input.checked=pending.has(input.dataset.regionCode)});
 }
 function filterRows(){
  const term=find('region-select-search').value.toLocaleLowerCase('ru').replace(/ё/g,'е').trim();let count=0;
  find('region-select-panel').querySelectorAll('[data-region-row]').forEach(row=>{row.hidden=!row.dataset.regionRow.includes(term);if(!row.hidden)count++});
  find('region-select-empty').hidden=count>0;
 }
 function positionPanel(){
  if(!pending)return;const panel=find('region-select-panel'),anchor=find('region-select-trigger').parentElement.getBoundingClientRect(),width=panel.getBoundingClientRect().width,viewport=document.documentElement.clientWidth||window.innerWidth;
  if(Number.isFinite(viewport)&&Number.isFinite(width))panel.style.left=Math.max(8-anchor.left,Math.min(0,viewport-8-anchor.left-width))+'px';
 }
 function open(){
  openedValue=control.value;const selected=selection(openedValue);pending=new Set(selected?.length?selected:codes);
  find('region-select-search').value='';filterRows();syncPending();find('region-select-panel').hidden=false;positionPanel();
  find('region-select-trigger').setAttribute('aria-expanded','true');find('region-select-search').focus({preventScroll:true});
 }
 function close(returnFocus=true){
  if(!mounted)return;pending=null;find('region-select-panel').hidden=true;find('region-select-trigger').setAttribute('aria-expanded','false');
  if(returnFocus)find('region-select-trigger').focus({preventScroll:true});
 }
 function mount(){
  if(mounted)return;control=find('region-filter');if(!control||typeof window.FasSetRegionValue!=='function')return;
  const wrapper=document.createElement('div');wrapper.className='region-select';
  wrapper.innerHTML='<button type="button" id="region-select-trigger" class="region-select-trigger" aria-expanded="false" aria-controls="region-select-panel"><span id="region-select-label"></span><span class="region-select-chevron" aria-hidden="true">⌄</span></button><div id="region-select-panel" class="region-select-panel" role="group" aria-label="Выбор регионов имущества" hidden><div class="region-select-head"><strong>Регион имущества</strong><button type="button" id="region-select-close" aria-label="Закрыть выбор регионов">×</button></div><input type="search" id="region-select-search" placeholder="Найти регион" aria-label="Найти регион" aria-controls="region-select-options" autocomplete="off"><label class="region-select-all"><input type="checkbox" id="region-select-all">Вся Россия</label><div id="region-select-options" class="region-select-options">'+regions.slice().sort((a,b)=>a.name.localeCompare(b.name,'ru')).map(region=>'<label class="region-select-option" data-region-row="'+escape(region.name.toLocaleLowerCase('ru').replace(/ё/g,'е'))+'"><input type="checkbox" data-region-code="'+escape(region.code)+'"><span>'+escape(region.name)+'</span></label>').join('')+'</div><p id="region-select-empty" hidden>Регион не найден</p><div class="region-select-footer"><span id="region-select-status" role="status"></span><button type="button" id="region-select-apply" class="primary">Применить</button></div></div>';
  control.parentElement.insertBefore(wrapper,control);wrapper.appendChild(control);control.hidden=true;mounted=true;
  find('region-select-trigger').onclick=()=>pending?close():open();
  find('region-select-close').onclick=()=>close();
  find('region-select-search').oninput=filterRows;
  find('region-select-all').onchange=event=>{if(!pending)return;pending=event.target.checked?new Set(codes):new Set();syncPending()};
  find('region-select-panel').querySelectorAll('[data-region-code]').forEach(input=>input.onchange=()=>{if(!pending)return;if(input.checked)pending.add(input.dataset.regionCode);else pending.delete(input.dataset.regionCode);syncPending()});
  find('region-select-apply').onclick=()=>{
   if(!pending?.size)return;const value=normalize([...pending]);close();
   if(value!==control.value){window.FasSetRegionValue(value);control.dispatchEvent(new Event('change',{bubbles:true}))}else refresh();
  };
  wrapper.addEventListener('keydown',event=>{
   if(event.key==='Escape'&&pending){event.preventDefault();event.stopPropagation();close()}
   else if(event.key==='Enter'&&pending&&event.target===find('region-select-search')){event.preventDefault();find('region-select-apply').click()}
   else if(event.key==='ArrowDown'&&event.target===find('region-select-trigger')){event.preventDefault();if(!pending)open()}
  });
  wrapper.addEventListener('focusout',event=>{if(pending&&event.relatedTarget&&!wrapper.contains(event.relatedTarget))close(false)});
  document.addEventListener('pointerdown',event=>{if(pending&&!wrapper.contains(event.target))close(false)});
  window.addEventListener('resize',positionPanel,{passive:true});
  control.addEventListener('change',refresh);refresh();
 }
 window.FasRegionSelect=Object.freeze({mount,refresh,close});
 if(document.readyState==='loading'||!document.readyState)document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
