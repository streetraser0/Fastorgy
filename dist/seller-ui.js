/* Private seller prototype: all profile, listing and media data stay on this device. */
(()=>{
 'use strict';
 const KEY='fas-seller-workspace-v1',R=window.FasSellerRules,M=window.FasSellerMedia;
 if(!R||!M)return;
 const esc=escapeText,qs=selector=>document.querySelector(selector);
 const uid=()=>window.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);
 const clone=value=>JSON.parse(JSON.stringify(value));
 const stamp=()=>new Date().toISOString();
 const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
 let workspace,workspaceRaw=null;
 try{workspaceRaw=localStorage.getItem(KEY);workspace=JSON.parse(workspaceRaw||'null')}catch{}
 if(!record(workspace)||workspace.version!==1||!record(workspace.profile)||typeof workspace.profile.id!=='string'||!workspace.profile.id.trim()||workspace.profile.id.length>256)workspace={version:1,profile:{id:'seller-'+uid(),displayName:'',phone:'',email:'',regionCode:'',city:'',showPhone:false},drafts:[]};
 workspace.drafts=Array.isArray(workspace.drafts)?workspace.drafts.filter(d=>record(d)&&typeof d.id==='string'&&record(d.data)&&d.ownerId===workspace.profile.id).map(d=>({...d,mediaRefs:Array.isArray(d.mediaRefs)?d.mediaRefs.filter(ref=>record(ref)&&typeof ref.id==='string'&&ref.id.startsWith('idb:')):[]})):[];
 const recoveryDrafts=new Map();
 let editor=null,dashboardTab='all',autosaveTimer,mediaGeneration=0,stateSnapshot='',locationGeneration=0,viewGeneration=0;
 const statusNames={draft:'Черновик',live:'Идут торги',scheduled:'Запланирован',paused:'На паузе',ended:'Завершён',sold:'Продан',cancelled:'Снят с торгов',unavailable:'Недоступен'};
 const notice='<div class="seller-notice"><b>Демонстрационный кабинет.</b> Профиль, объявления и файлы сохраняются только на этом устройстве. Другие посетители их не увидят. Авторизация, серверная публикация, оплата и реальные сделки ещё не подключены.</div>';
 const brandLists={cars:['LADA','Toyota','Kia','Hyundai','Volkswagen','Škoda','Renault','Nissan','BMW','Mercedes-Benz','Audi','Lexus','Haval','Chery','Geely','EXEED','Москвич'],trucks:['КАМАЗ','ГАЗ','МАЗ','Урал','MAN','Scania','Volvo','DAF','Mercedes-Benz','Isuzu','FAW','SITRAK','Foton'],machinery:['Caterpillar','JCB','Komatsu','Hitachi','Liebherr','Volvo','XCMG','SDLG','Hyundai','Develon','Bobcat'],vessels:['Yamaha','Mercury','Suzuki','BRP','Bayliner','Quicksilver','Silver','Волжанка','Казанка'],electronics:['Apple','Samsung','Lenovo','HP','ASUS','Dell','Acer','MSI','Huawei','HONOR','Xiaomi','Sony','LG','Canon','Nikon','Epson','Brother'],home_garden:['Bosch','Samsung','LG','Beko','Haier','Gorenje','Electrolux','Indesit','Атлант','Midea','IKEA','Hoff','Askona','Орматек'],equipment:['Bosch','Makita','DeWalt','Metabo','Kärcher','Siemens','ABB','Schneider Electric','Haas','DMG MORI','Zubr']};
 const durationPresets={'60':'1 час','180':'3 часа','360':'6 часов','720':'12 часов','1440':'1 сутки','4320':'3 суток','10080':'7 суток','20160':'14 суток','43200':'30 суток',custom:'Свой срок'};
 const yearChoices=new Map([['','Не указан'],...Array.from({length:new Date().getFullYear()-1798},(_,i)=>{const year=new Date().getFullYear()+1-i;return [String(year),String(year)]})]);
 let cityChoices=new Map();
 function rebuildCityChoices(){cityChoices=new Map();for(const lot of cars){const region=getRegionCode(lot),city=String(lot.city||'').trim();if(!region||!city)continue;if(!cityChoices.has(region))cityChoices.set(region,new Set());cityChoices.get(region).add(city)}}
 function brandsFor(data){const T=window.FasCategories,group=T?.groupOf(data)?.id;return brandLists[data.category]||brandLists[group]||(group==='business'?brandLists.equipment:[])}
 function characteristicHTML(spec,data){
  const profile=R.listingProfile(data),group=window.FasCategories?.groupOf(profile.id)?.id;
  const itemTypes={furniture:['Диван','Кресло','Стол','Стул','Кровать','Шкаф','Комод','Комплект мебели'],home_appliances:['Холодильник','Стиральная машина','Плита','Духовой шкаф','Посудомоечная машина','Пылесос','Мелкая бытовая техника'],kitchenware:['Посуда для готовки','Столовая посуда','Столовые приборы','Кухонные принадлежности','Набор посуды'],home_textiles:['Постельное бельё','Одеяло','Подушки','Плед','Шторы','Полотенца'],building_materials:['Плитка','Напольное покрытие','Пиломатериалы','Сухие смеси','Краски','Утеплитель','Кровельные материалы'],garden:['Садовая мебель','Растения','Полив','Теплица','Садовый инвентарь'],tools:['Дрель','Шуруповёрт','Перфоратор','Пила','Шлифовальная машина','Ручной инструмент','Набор инструментов']};
  const labels={furniture:'Тип мебели',home_appliances:'Вид техники',kitchenware:'Вид посуды',home_textiles:'Вид текстиля',building_materials:'Вид материала',garden:'Вид товара',tools:'Вид инструмента'};
  const title=spec.name==='brand'?(group==='transport'?'Марка':'Бренд'):spec.name==='itemType'?(labels[profile.id]||spec.label):spec.label;
  const required=spec.name==='area'&&group==='real_estate',label=esc(title+(spec.unit?', '+spec.unit:''))+(required?' <span class="seller-required" title="Обязательное поле">*</span>':''),value=data[spec.name]??'';let html;
  if(['brand','manufacturer'].includes(spec.name))html=choiceField(spec.name,label,value,brandsFor(data),'maxlength="'+(spec.maxLength||150)+'"');
  else if(spec.name==='itemType'&&itemTypes[profile.id])html=choiceField(spec.name,label,value,itemTypes[profile.id],'maxlength="'+(spec.maxLength||150)+'"');
  else if(spec.type==='year')html=select(spec.name,label,value,yearChoices);
  else if(spec.type==='select'){const choices={'':'Не указано',...spec.options};if(value&&!Object.hasOwn(choices,String(value)))choices[String(value)]='Сохранённое значение: '+String(value);html=select(spec.name,label,value,choices)}
  else if(spec.type==='textarea')html=textarea(spec.name,label,value,3,esc(spec.hint||''));
  else{const attrs=['autocomplete="off"',...(required?['required']:[]),...(spec.type==='number'?['inputmode="decimal"']:[]),...['min','max','step'].filter(key=>spec[key]!==undefined).map(key=>key+'="'+esc(spec[key])+'"'),'maxlength="'+(spec.maxLength||300)+'"'].join(' ');html=field(spec.name,label,value,spec.type==='number'?'number':'text',attrs,esc(spec.hint||''))}
  const wide=spec.type==='textarea'||['brand','manufacturer','model','itemType','buildingType','usage','dimensions','utilities','businessAssets'].includes(spec.name);
  return '<div class="seller-characteristic'+(wide?' wide':'')+'" data-seller-characteristic="'+spec.name+'">'+html+'</div>';
 }
 function syncCategoryFields(form){
  const raw=rawFromForm();if(!raw||!R.listingProfile)return;
  const profile=R.listingProfile(raw);if(editor.profileId===profile.id)return;
  const previous=editor.profileId,tree=window.FasCategories,oldGroup=tree?.groupOf(previous)?.id,newGroup=tree?.groupOf(profile.id)?.id;
  if(previous&&oldGroup!==newGroup)for(const key of R.CHARACTERISTIC_FIELDS)delete raw[key];
  else if(previous)for(const key of ['brand','model','manufacturer','itemType','usage'])delete raw[key];
  const data=R.sanitizeCharacteristics(raw);
  const main=qs('#seller-characteristics-main'),additional=qs('#seller-characteristics-extra');
  if(main)main.innerHTML=profile.primary.map(spec=>characteristicHTML(spec,data)).join('');
  if(additional)additional.innerHTML=profile.additional.map(spec=>characteristicHTML(spec,data)).join('');
  const extras=qs('[data-extra-specs]');if(extras){extras.hidden=!profile.additional.length;extras.open=false}
  const condition=form.elements.namedItem('condition');if(condition){condition.innerHTML=Object.entries(profile.conditionOptions).map(([key,title])=>'<option value="'+esc(key)+'" '+(raw.condition===key?'selected':'')+'>'+esc(title)+'</option>').join('');const label=qs('[data-condition-label]');if(label)label.textContent=profile.conditionLabel}
  const title=form.elements.namedItem('name'),hint=title?.closest?.('label')?.querySelector?.('small');if(hint)hint.textContent='Например: '+profile.titleExample;
  editor.profileId=profile.id;window.FasCarCatalog?.refresh(form);window.FasSmartFill?.refresh?.(form);
 }
 function cityList(region){return [...(cityChoices.get(region)||[])].sort((a,b)=>a.localeCompare(b,'ru'))}
 function choiceOptions(value,values,name,label=''){const titles={brand:label==='Бренд'?['Не указан','Другой бренд']:['Не указана','Другая марка'],manufacturer:['Не указан','Другой производитель'],city:['Выберите город','Другой город / населённый пункт']}[name]||['Не указано','Другой вариант'];return '<option value="">'+titles[0]+'</option>'+values.map(item=>'<option value="'+esc(item)+'" '+(value===item?'selected':'')+'>'+esc(item)+'</option>').join('')+'<option value="__custom__" '+(value&&!values.includes(value)?'selected':'')+'>'+titles[1]+'</option>'}
 function choiceField(name,label,value,values,attrs=''){const current=String(value??''),custom=!!current&&!values.includes(current),prompt={city:'Укажите населённый пункт',brand:label==='Бренд'?'Укажите бренд':'Укажите марку',manufacturer:'Укажите производителя'}[name]||'Укажите свой вариант';return `<div class="seller-field" data-seller-choice-field="${name}"><label for="seller-${name}-choice">${label}</label><select id="seller-${name}-choice" name="${name}Choice" data-seller-choice="${name}">${choiceOptions(current,values,name,label)}</select><label for="seller-${name}-custom" data-seller-custom-label ${custom?'':'hidden'}>${esc(prompt)}</label><input id="seller-${name}-custom" name="${name}" type="text" value="${esc(current)}" ${attrs} ${custom?'':'hidden'}><span class="seller-field-error" data-error-for="${name}"></span></div>`}
 function refreshChoice(form,name,values,reset=false){const select=form.querySelector('[data-seller-choice="'+name+'"]'),input=form.elements.namedItem(name);if(!select||!input)return;if(reset)input.value='';select.innerHTML=choiceOptions(input.value,values,name);const custom=!!input.value&&!values.includes(input.value);select.value=custom?'__custom__':input.value;input.hidden=!custom;form.querySelector('[data-seller-choice-field="'+name+'"] [data-seller-custom-label]').hidden=!custom}
 function syncStepLabel(form){const label=qs('[data-step-label]'),mode=form.elements.namedItem('stepMode');if(label&&mode)label.textContent=mode.value==='percent'?'Размер шага, %':'Размер шага, ₽'}
 function syncAuctionFields(form){
  if(!form||!editor)return;window.FasAuctionModes?.syncForm(form);
  const down=form.elements.namedItem('auctionDirection')?.value==='descending',locked=!!editor.original;
  for(const name of ['stepMode','stepValue','reservePrice','buyNowPrice','antiSniping','antiSnipingWindowMinutes','antiSnipingExtensionMinutes']){const control=form.elements.namedItem(name);if(!control)continue;const label=control.closest?.('label');if(label)label.hidden=down;control.disabled=locked||down}
  for(const name of ['floorPrice','decreaseStep','decreaseIntervalMinutes']){const control=form.elements.namedItem(name);if(control)control.disabled=locked||!down}
 }
 function scheduleDraft(){clearTimeout(autosaveTimer);autosaveTimer=setTimeout(()=>saveDraft(false),600)}
 function changeEditor(event){const form=qs('#seller-listing-form'),target=event.target;if(!form||!editor)return;
  if(target.dataset?.sellerChoice){const name=target.dataset.sellerChoice,input=form.elements.namedItem(name),custom=target.value==='__custom__';input.hidden=!custom;form.querySelector('[data-seller-choice-field="'+name+'"] [data-seller-custom-label]').hidden=!custom;if(!custom)input.value=target.value;else{input.value='';input.focus?.()}}
  if(['latitude','longitude','regionCode','city','address'].includes(target.name)||target.dataset?.sellerChoice==='city'){cancelSellerLocation();syncLocationPreview(form)}
  if(target.name==='regionCode')refreshChoice(form,'city',cityList(target.value),true);
  if(target.name==='durationPreset'){const custom=target.value==='custom';form.querySelector('[data-duration-custom]').hidden=!custom;if(!custom){const minutes=Number(target.value),days=minutes%1440===0;form.elements.namedItem('durationUnit').value=days?'days':'hours';form.elements.namedItem('durationValue').value=String(minutes/(days?1440:60))}}
  if(target.name==='stepMode')syncStepLabel(form);
  if(target.name==='auctionDirection')syncAuctionFields(form);
  if(['durationPreset','durationValue','durationUnit','startMode','startsAt','startPrice','stepMode','stepValue','reservePrice','buyNowPrice','deposit','auctionDirection','floorPrice','decreaseStep','decreaseIntervalMinutes'].includes(target.name))syncEditor();
  scheduleDraft();
 }
 function workspaceError(message,draftId){const error=new Error(message);error.code='seller-workspace-conflict';if(draftId)error.draftId=draftId;return error}
 function diskWorkspace(raw){
  let value;try{value=JSON.parse(raw||'null')}catch{}
  if(!record(value)||value.version!==1||!record(value.profile)||value.profile.id!==workspace.profile.id)throw workspaceError('Кабинет изменён в другой вкладке. Обновите страницу. Текущий ввод сохранён в памяти этой страницы.');
  return {...value,drafts:Array.isArray(value.drafts)?value.drafts.filter(d=>record(d)&&typeof d.id==='string'&&record(d.data)&&d.ownerId===value.profile.id).map(d=>({...d,mediaRefs:Array.isArray(d.mediaRefs)?d.mediaRefs.filter(ref=>record(ref)&&typeof ref.id==='string'&&ref.id.startsWith('idb:')):[]})):[]};
 }
 const sameValue=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 function mergeValue(before,next,current,draftId){
  if(sameValue(next,before))return current;
  if(sameValue(current,before)||sameValue(next,current))return next;
  throw workspaceError(draftId?'Этот черновик изменён в другой вкладке. Ваш ввод оставлен в отдельной копии на этой странице.':'Профиль изменён в другой вкладке. Проверьте актуальные данные перед сохранением.',draftId);
 }
 function prepareWorkspace(next,{strictProfile=false}={}){
  const beforeRaw=localStorage.getItem(KEY);let value=next;
  if(beforeRaw!==workspaceRaw){
   const current=diskWorkspace(beforeRaw);
   if(strictProfile&&!sameValue(current.profile,workspace.profile))throw workspaceError('Профиль изменён в другой вкладке. Сохраните черновик и проверьте профиль перед публикацией.');
   const original=new Map(workspace.drafts.map(d=>[d.id,d])),incoming=new Map(next.drafts.map(d=>[d.id,d])),latest=new Map(current.drafts.map(d=>[d.id,d])),drafts=[];
   for(const id of new Set([...incoming.keys(),...latest.keys()])){const draft=mergeValue(original.get(id),incoming.get(id),latest.get(id),id);if(draft)drafts.push(draft)}
   value={...current,...next,profile:mergeValue(workspace.profile,next.profile,current.profile),drafts};
  }
  return {value,beforeRaw,raw:JSON.stringify(value)};
 }
 function saveWorkspace(next=workspace){const commit=prepareWorkspace(next);localStorage.setItem(KEY,commit.raw);workspace=commit.value;workspaceRaw=commit.raw}
 function allDrafts(){const drafts=new Map(workspace.drafts.map(d=>[d.id,d]));for(const draft of recoveryDrafts.values())if(draft.ownerId===workspace.profile.id)drafts.set(draft.id,draft);return [...drafts.values()]}
 function refreshWorkspace(){
  try{const raw=localStorage.getItem(KEY);if(raw!==workspaceRaw){workspace=diskWorkspace(raw);workspaceRaw=raw}}catch{/* Keep the current page and recoverable input when storage or identity changed. */}
 }

 function privateQuotaIssue(before,next){
  const Q=window.FasListingQuotas;
  if(!Q?.localChangeDecision)return 'Не удалось загрузить правила бесплатного размещения. Обновите страницу; черновик можно сохранить.';
  try{
   const result=Q.localChangeDecision({lots:cars,before,next,ownerId:workspace.profile.id,bids,now:Date.now()});
   if(result.allowed)return '';
   const labels={cars:'автомобилей',real_estate:'объектов недвижимости',ready_business:'готовых бизнесов',total:'объявлений'},label=labels[result.bucket]||'объявлений';
   return 'Лимит бесплатного размещения '+label+': '+result.used+' из '+result.limit+' активно или запланировано. Свободных мест: '+Math.max(0,result.limit-result.used)+'. Завершите или снимите объявление без ставок либо сохраните черновик.';
  }catch{return 'Не удалось проверить свободные места для размещения. Обновите кабинет и проверьте сроки своих торгов; черновик можно сохранить.'}
 }
 function privateQuotaHelp(withUsage=false){
  const Q=window.FasListingQuotas,limits=Q?.FREE_LIMITS;
  if(!limits)return '<p class="note" data-listing-quota-help>Правила бесплатного размещения не загрузились. Обновите страницу перед публикацией; черновики доступны.</p>';
  let counts=null,unavailable=false;if(withUsage)try{counts=Q.localUsage({lots:cars,ownerId:workspace.profile.id,bids,now:Date.now()})}catch{unavailable=true}
  const used=key=>counts?counts[key]+' из ':'';
  return '<details class="seller-editor-demo" data-listing-quota-help><summary>Бесплатное размещение'+(counts?': авто '+counts.cars+'/'+limits.cars+' · недвижимость '+counts.real_estate+'/'+limits.real_estate+' · бизнес '+counts.ready_business+'/'+limits.ready_business:'')+'</summary><p>Автомобили: '+used('cars')+limits.cars+'. Недвижимость: '+used('real_estate')+limits.real_estate+'. Готовый бизнес: '+used('ready_business')+limits.ready_business+'. Техника и оборудование — без лимита размещений.</p><p>Активные и запланированные торги занимают место. Черновики — без ограничения по тарифу. Расширенные лимиты подписок пока не подключены.'+(unavailable?' Сейчас не удалось проверить занятые места: обновите кабинет перед публикацией.':'')+'</p></details>';
 }

 function own(lot){return !!lot&&lot.sellerOwnerId===workspace.profile.id}
 function bidOptions(lot){return {ownBid:bids[lot?.id],current:lot?current(lot):null}}
 function hasAuctionBid(lot){return R.hasActualBids(lot,bidOptions(lot))}
 function identityLocked(lot){return R.identityLocked(lot,bidOptions(lot))}
 function protection(lot){return R.listingProtection(lot,bidOptions(lot))}
 function isArchived(lot){return typeof lot?.sellerArchivedAt==='string'&&Number.isFinite(Date.parse(lot.sellerArchivedAt))}
 function currentEditorLot(){return editor?.original?cars.find(lot=>lot.id===editor.original.id&&own(lot)):null}
 function syncIdentityControls(form){
  const lot=currentEditorLot(),locked=!!lot&&identityLocked(lot);
  for(const name of R.IDENTITY_FIELDS){const control=form.elements.namedItem(name);if(control){control.disabled=locked;if(locked)control.value=lot[name]??''}}
  const category=form.querySelector?.('[data-category-form="seller"]');if(category){category.disabled=locked;category.setAttribute('aria-disabled',String(locked))}
  for(const name of ['autoRelist','relistDurationMinutes','relistLimit']){const control=form.elements.namedItem(name);if(control)control.disabled=locked}
  const note=qs('#seller-identity-note');if(note){note.hidden=!locked;note.textContent=R.hasFinalResult(lot)?'По лоту уже сохранён результат. Предмет продажи, цена и условия торгов сохраняются. Можно уточнять описание, недостатки, фото и документы.':'Уже подана ставка. Предмет продажи, цена и условия торгов сохраняются. Можно уточнять описание, недостатки, фото и документы.'}
 }
 function ownLots(){return cars.filter(own)}
 function state(lot){return R.getAuctionState(lot)}
 function rawFromForm(){
  const form=qs('#seller-listing-form');if(!form||!editor)return null;if(editor.saving&&editor.submissionRaw)return clone(editor.submissionRaw);
  const raw=Object.fromEntries(new FormData(form));
  for(const key of ['pickup','delivery','antiSniping','autoRelist','ownershipConsent'])raw[key]=!!form.elements.namedItem(key)?.checked;
  raw.durationMinutes=Number(raw.durationValue)*({minutes:1,hours:60,days:1440}[raw.durationUnit]||1);
  raw.auctionDirection=editor.original?.auctionDirection||raw.auctionDirection||'ascending';
  const original=currentEditorLot();if(original&&identityLocked(original)){for(const key of R.IDENTITY_FIELDS)if(!Object.hasOwn(raw,key)&&Object.hasOwn(original,key))raw[key]=original[key];for(const key of ['autoRelist','relistDurationMinutes','relistLimit'])if(Object.hasOwn(original,key))raw[key]=original[key];else delete raw[key]}
  if(raw.auctionDirection==='descending'){raw.stepMode='fixed';raw.stepValue=raw.decreaseStep;raw.antiSniping=false;delete raw.reservePrice;delete raw.buyNowPrice}
  return R.sanitizeCharacteristics?R.sanitizeCharacteristics(raw):raw;
 }
 function setError(message){const box=qs('#seller-error');if(box){box.textContent=message;box.hidden=!message}if(message)toast(message)}
 function profileInput(){
  const form=qs('#seller-profile-form');if(!form)return null;const data=Object.fromEntries(new FormData(form)),phone=normalizePhone(data.phone);
  const agreementControl=form.elements.namedItem('agreementAccepted'),acceptance=window.FasUserAgreement?.normalize(workspace.profile.agreementAcceptance);
  return {form,phone,agreementControl,profile:{id:workspace.profile.id,displayName:String(data.displayName||'').trim().slice(0,100),phone:phone||String(data.phone||'').trim(),email:String(data.email||'').trim().slice(0,150),regionCode:data.regionCode||'',city:String(data.city||'').trim().slice(0,100),showPhone:!!form.elements.namedItem('showPhone')?.checked,...(acceptance?{agreementAcceptance:acceptance}:{})}};
 }
 function profileChanged(input){return !!input&&(['displayName','phone','email','regionCode','city'].some(key=>String(input.profile[key]??'')!==String(workspace.profile[key]??''))||input.profile.showPhone!==!!workspace.profile.showPhone||input.agreementControl?.checked===true&&!window.FasUserAgreement?.isCurrent(workspace.profile.agreementAcceptance))}
 function saveProfile({navigate=true,feedback=true,input=profileInput()}={}){
  if(!input||input.profile.displayName.length<2||!input.phone){setError('Укажите имя от двух символов и российский номер телефона.');return false}
  const agreement=window.FasUserAgreement;if(!agreement){setError('Не удалось загрузить пользовательское соглашение. Обновите страницу перед сохранением профиля.');return false}
  const acceptance=agreement.normalize(workspace.profile.agreementAcceptance)||agreement.capture(input.agreementControl);
  if(!acceptance){setError('Прочитайте и примите пользовательское соглашение отдельной отметкой перед сохранением профиля.');input.agreementControl?.focus?.({preventScroll:true});return false}
  const acceptanceHistory=agreement.acceptanceHistory?.(workspace.profile.agreementAcceptanceHistory,workspace.profile.agreementAcceptance,acceptance);
  try{saveWorkspace({...workspace,profile:{...input.profile,agreementAcceptance:acceptance,...(acceptanceHistory?{agreementAcceptanceHistory:acceptanceHistory}:{})}});if(feedback)toast('Профиль сохранён на этом устройстве');if(navigate)openDashboard('all');return true}catch(error){setError(error?.code==='seller-workspace-conflict'?error.message:'Не удалось сохранить профиль. Проверьте доступное место и настройки браузера.');return false}
 }
 function preparedDraft(){
  if(!editor?.navigationSnapshot)return false;
  try{return editor.navigationSnapshot===JSON.stringify({data:rawFromForm(),refs:editor.refs})&&localStorage.getItem(KEY)===workspaceRaw}catch{return false}
 }
 function prepareNavigation(){
  const modal=qs('#modal');if(!modal?.open||!modal.classList.contains('seller-dialog'))return true;
  if(editor){
   if(editor.uploading||editor.saving){setError(editor.uploading?'Фотографии ещё сохраняются. Дождитесь завершения, затем вернитесь назад.':'Объявление ещё сохраняется. Дождитесь завершения, затем вернитесь назад.');return false}
   clearTimeout(autosaveTimer);if(preparedDraft())return true;if(!saveDraft(false))return false;editor.navigationSnapshot=JSON.stringify({data:editor.data,refs:editor.refs});return true;
  }
  if(dashboardTab==='profile'){const input=profileInput();if(profileChanged(input))return saveProfile({navigate:false,feedback:false,input})}
  return true;
 }
 function navigate(action){if(!prepareNavigation())return false;action();return true}
  function subpage(action,returnTab=dashboardTab){return ()=>{action();const modal=qs('#modal');if(!modal)return;modal.classList?.add('cabinet-subpage');
   const historyBack=modal.querySelector?.('[data-auction-history-back]');if(historyBack)historyBack.textContent='В кабинет';
   const heading=modal.querySelector?.('.subscriptions-body > h2');
   if(heading&&!modal.querySelector('[data-cabinet-return]')&&typeof document.createElement==='function'){const back=document.createElement('button');back.type='button';back.className='seller-action-link seller-dashboard-return';back.dataset.cabinetReturn=returnTab;back.textContent='← В кабинет';heading.parentElement.insertBefore(back,heading.previousElementSibling||heading)}
  }}
 function requestClose(){const modal=qs('#modal');if(!modal?.open||!prepareNavigation())return false;modal.close();return true}
 function saveDraft(showFeedback=false){
  if(!editor)return false;const data=rawFromForm();if(!data)return false;
  const draft={id:editor.draftId,ownerId:workspace.profile.id,targetId:editor.original?.id||null,data,mediaRefs:clone(editor.refs),updatedAt:stamp()};
  const next={...workspace,drafts:[draft,...workspace.drafts.filter(d=>d.id!==draft.id)]};
  try{saveWorkspace(next);recoveryDrafts.delete(draft.id);editor.data=data;const info=qs('#seller-save-status');if(info)info.textContent='Черновик сохранён на устройстве · '+new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});if(showFeedback)toast('Черновик сохранён на этом устройстве');return true}catch(error){if(error?.draftId===draft.id){recoveryDrafts.delete(draft.id);draft.id='draft-'+uid();editor.draftId=draft.id}recoveryDrafts.set(draft.id,{...draft,memoryOnly:true});editor.data=data;setError(error?.code==='seller-workspace-conflict'?error.message:'Черновик пока сохранён только в памяти этой страницы. Не закрывайте вкладку: освободите место и сохраните его снова.');return false}
 }
 function leave(){viewGeneration++;cancelSellerLocation();clearTimeout(autosaveTimer);if(editor&&!preparedDraft())saveDraft(false);editor=null;mediaGeneration++}
 function back(){
  const modal=qs('#modal');if(!modal?.open||!modal.classList.contains('seller-dialog'))return false;
  const top=typeof window.FasDialogLifecycle?.top==='function'?window.FasDialogLifecycle.top():Array.from(document.querySelectorAll('dialog[open]')).filter(dialog=>dialog.open).at(-1);if(top&&top!==modal)return false;
  const purchaseBack=modal.querySelector?.('[data-seller-confirm-buy]')&&modal.querySelector?.('[data-seller-view]');if(purchaseBack&&typeof purchaseBack.click==='function'){purchaseBack.click();return true}
  if(editor){
   if(!prepareNavigation())return false;
   // The draft is durable before changing views. Do not save it a second time
   // through leave(), where another storage failure could otherwise be hidden.
   cancelSellerLocation();editor=null;openDashboard();return true;
  }
  if(dashboardTab==='profile'){
   if(!prepareNavigation())return false;
   openDashboard('all');return true;
  }
  if(modal.classList.contains('seller-editor-dialog')){openDashboard();return true}
  modal.close();return true;
 }
 const originalShow=showModalContent;
 showModalContent=function(...args){leave();qs('#modal').classList.remove('seller-dialog','cabinet-subpage');return originalShow.apply(this,args)};
 qs('#modal').addEventListener('close',()=>{leave();qs('#modal').classList.remove('seller-dialog','cabinet-subpage')});
 function show(html){showModalContent('<div class="seller-shell">'+html+'</div>');qs('#modal').classList.remove('seller-editor-dialog','cabinet-subpage');qs('#modal').classList.add('seller-dialog');qs('#modal').scrollTop=0}
 function profileReady(){return typeof workspace.profile.displayName==='string'&&workspace.profile.displayName.trim().length>=2&&!!normalizePhone(workspace.profile.phone)&&window.FasUserAgreement?.isCurrent(workspace.profile.agreementAcceptance)===true}
 function refreshCatalog(preserve=true){
  window.FasSubscriptionCache?.invalidate();window.FasKeywordSearch?.invalidate();
  const top=qs('#grid').scrollTop,activeIndex=reelsMode?activeFeedIndex():0;let active=reelsMode?visibleLots[activeIndex]?.id:null;if(active&&!isLotLive(visibleLots[activeIndex]))active=[...visibleLots.slice(activeIndex+1),...visibleLots.slice(0,activeIndex)].find(isLotLive)?.id;
  ends.splice(0,ends.length,...cars.map(c=>Date.parse(c.ends)));syncSearchFields();renderHomeCategories();render(active);if(preserve&&!reelsMode)qs('#grid').scrollTop=top;stateSnapshot=auctionFingerprint();
 }
 function auctionFingerprint(){return cars.filter(c=>c.sellerOwnerId).map(c=>c.id+':'+state(c)).join('|')}
 function writeLots(next,nextWorkspace){
  // Financial state must still match before either durable record is touched.
  window.FasAuctionStorage?.assertCurrent();
  const durable=next.filter(c=>!c.demo||c.demoEdited).map(M.serializeLot),commit=nextWorkspace?prepareWorkspace(nextWorkspace,{strictProfile:true}):null;
  if(commit)localStorage.setItem(KEY,commit.raw);
  try{const raw=JSON.stringify(durable);if(window.FasAuctionStorage)window.FasAuctionStorage.write('fas-lots',raw);else localStorage.setItem('fas-lots',raw)}catch(error){
   if(commit)try{if(localStorage.getItem(KEY)===commit.raw){if(commit.beforeRaw===null)localStorage.removeItem(KEY);else localStorage.setItem(KEY,commit.beforeRaw)}}catch{}
   throw error;
  }
  if(commit){workspace=commit.value;workspaceRaw=commit.raw}
  cars=next;refreshCatalog();try{window.FasSalesAnalytics?.captureSales(cars,bids)?.catch?.(()=>{})}catch{/* Analytics must not undo an already saved listing. */}
 }

 function profileHTML(){const p=workspace.profile;return `<section class="seller-help-footer" aria-labelledby="seller-voice-title"><div><strong id="seller-voice-title">Голосовой помощник</strong><p>Имя, голос, язык и уведомления</p></div><button class="outline" type="button" data-voice-settings-open aria-label="Настроить голосового помощника">Настроить</button></section><section class="seller-help-footer" aria-labelledby="seller-branding-entry-title"><div><strong id="seller-branding-entry-title">Оформление витрины</strong><p>Обложка, название и цвет магазина на этом устройстве</p></div><button class="outline" type="button" data-seller-branding-open>Настроить</button></section><form id="seller-profile-form" class="seller-profile-form"><div class="seller-grid">${field('displayName','Ваше имя / имя продавца',p.displayName,'text','required minlength="2" maxlength="100" autocomplete="name"')}${field('phone','Номер телефона',p.phone,'tel','required maxlength="22" autocomplete="tel"', 'Номер не подтверждён. SMS-вход пока не подключён.')}${field('email','Электронная почта',p.email,'email','maxlength="150" autocomplete="email"','Сохраняется в кабинете и не показывается покупателям.')}<label>Регион<select name="regionCode">${regionOptions(true,p.regionCode)}</select></label>${field('city','Город',p.city,'text','maxlength="100" autocomplete="address-level2"')}<label class="seller-check"><input type="checkbox" name="showPhone" ${p.showPhone?'checked':''}>Показывать мой телефон в новых объявлениях</label></div>${window.FasUserAgreement?.fieldHTML("seller-agreement",p.agreementAcceptance)||'<p class="seller-error" role="alert">Не удалось загрузить пользовательское соглашение. Обновите страницу перед сохранением профиля.</p>'}<div class="seller-actions"><button class="primary" type="submit">Сохранить профиль</button><button class="outline" type="button" data-seller-sms>Вход по SMS</button></div><button class="seller-action-link" type="button" data-seller-profile-cancel aria-label="Отменить изменения профиля и вернуться к объявлениям">Отменить изменения</button><div class="seller-error" role="alert" id="seller-error" hidden></div></form>`}
 function field(name,label,value='',type='text',attrs='',hint=''){return `<label class="seller-field">${name==='stepValue'?'<span data-step-label>'+label+'</span>':label}<input name="${name}" type="${type}" value="${esc(value??'')}" ${attrs}>${hint?`<small>${hint}</small>`:''}<span class="seller-field-error" data-error-for="${name}"></span></label>`}
 function textarea(name,label,value='',rows=3,hint=''){return `<label class="seller-field wide">${label}<textarea name="${name}" rows="${rows}" maxlength="12000" ${name==='description'?'required minlength="20"':''}>${esc(value)}</textarea>${hint?`<small>${hint}</small>`:''}<span class="seller-field-error" data-error-for="${name}"></span></label>`}
 function select(name,label,value,choices,extra=''){return `<label class="seller-field">${label}<select name="${name}" ${extra}>${(choices instanceof Map?[...choices]:Object.entries(choices)).map(([key,title])=>`<option value="${esc(key)}" ${String(value??'')===key?'selected':''}>${esc(title)}</option>`).join('')}</select><span class="seller-field-error" data-error-for="${name}"></span></label>`}
 function date(value){return Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('ru-RU'):'Не задано'}
 function emptyDashboardHTML(){const message={draft:['Черновиков пока нет','Сохраните объявление как черновик, чтобы вернуться к нему позже.'],live:['Активных торгов пока нет','Опубликованные торги появятся здесь.'],scheduled:['Запланированных торгов пока нет','Выберите дату начала при размещении объявления.'],archive:['Архив пока пуст','Здесь будут завершённые торги, объявления на паузе и снятые с продажи лоты.']}[dashboardTab]||['Здесь появятся ваши объявления','Нажмите «Разместить объявление», чтобы добавить имущество.'];return `<div class="seller-empty"><h3>${message[0]}</h3><p>${message[1]}</p></div>`}
 // Explicit draft deletion is one action. It still passes durable workspace,
 // owner and shared-media checks, and never removes a published lot.
 async function requestDraftDelete(id,button,sourceEditor=null){
  const modal=qs('#modal');
  if(button.disabled||button.isConnected===false||!modal?.open||!modal.classList.contains('seller-dialog')||modal.contains?.(button)===false)return;
  const top=window.FasDialogLifecycle?.top?.()||Array.from(document.querySelectorAll('dialog[open]')).filter(dialog=>dialog.open).at(-1);if(top&&top!==modal)return;
  if(!allDrafts().some(draft=>draft.id===id))return;
  button.disabled=true;try{await removeDraft(id,button,sourceEditor)}finally{button.disabled=false}
 }
 async function requestEditorDraftDelete(button){
  const form=qs('#seller-listing-form'),modal=qs('#modal');
  if(!editor||editor.uploading||editor.saving||!modal?.open||!modal.classList.contains('seller-editor-dialog')||!form?.contains?.(button))return;
  const top=window.FasDialogLifecycle?.top?.()||Array.from(document.querySelectorAll('dialog[open]')).filter(dialog=>dialog.open).at(-1);if(top&&top!==modal)return;
  clearTimeout(autosaveTimer);if(!saveDraft(false))return;
  return requestDraftDelete(editor.draftId,button,editor);
 }
 async function removeDraft(id,target,sourceEditor=null){
  if(sourceEditor&&(editor!==sourceEditor||editor.uploading||editor.saving||editor.draftId!==id))return;
  const draft=allDrafts().find(item=>item.id===id);if(!draft)return;
  const dialog=qs('#modal'),row=target.closest?.('.seller-row'),list=target.closest?.('.seller-list'),tabs=qs('.seller-tabs');
  const top=dialog.scrollTop,left=tabs?.scrollLeft||0,rows=list?[...list.querySelectorAll('.seller-row')]:[],position=rows.indexOf(row),neighbor=rows[position+1]||rows[position-1];
  try{if(recoveryDrafts.has(id)&&!workspace.drafts.some(item=>item.id===id)){const current=prepareWorkspace(workspace);if(current.value.drafts.some(item=>item.id===id))throw workspaceError('Черновик появился в другой вкладке. Откройте кабинет заново перед удалением.',id);workspace=current.value;workspaceRaw=current.beforeRaw}else saveWorkspace({...workspace,drafts:workspace.drafts.filter(item=>item.id!==id)});recoveryDrafts.delete(id)}catch(error){toast(error?.code==='seller-workspace-conflict'?error.message:'Не удалось удалить черновик');return}
  if(sourceEditor){clearTimeout(autosaveTimer);cancelSellerLocation();editor=null;openDashboard('draft');toast('Черновик удалён. Опубликованные объявления сохранены.');}
  if(row&&list&&qs('#modal-content').contains?.(list)){
   row.remove();for(const [key,value]of [['draft',allDrafts().length],['all',allDrafts().length+ownLots().filter(lot=>!isArchived(lot)).length]]){const counter=qs('[data-seller-count="'+key+'"]');if(counter)counter.textContent=String(value)}
   if(!list.querySelector('.seller-row'))list.innerHTML=emptyDashboardHTML();
   const focus=neighbor?.querySelector('button')||list.querySelector('[data-seller-new]')||tabs?.querySelector('[aria-pressed="true"]');focus?.focus?.({preventScroll:true});
   if(tabs)tabs.scrollLeft=left;
   const maximum=Math.max(0,dialog.scrollHeight-dialog.clientHeight);dialog.scrollTop=Number.isFinite(maximum)?Math.min(top,maximum):top;
  }
  try{await M.deleteMedia((draft.mediaRefs||[]).map(ref=>ref.id),workspace.profile.id,{keepRefs:[...allDrafts().flatMap(item=>item.mediaRefs||[]),...ownLots().flatMap(lot=>lot.mediaRefs||[])]})}catch{toast('Черновик удалён, но освободить память файлов не удалось.')}
 }
 function openDashboard(tabName=dashboardTab){
  leave();refreshWorkspace();dashboardTab=['all','draft','live','scheduled','archive','profile'].includes(tabName)?tabName:'all';const lots=ownLots(),drafts=allDrafts();
  const listed=lots.filter(lot=>!isArchived(lot));const totals={all:drafts.length+listed.length,draft:drafts.length,live:listed.filter(c=>state(c)==='live').length,scheduled:listed.filter(c=>state(c)==='scheduled').length,archive:lots.filter(c=>isArchived(c)||!['live','scheduled'].includes(state(c))).length};
  const rows=[...drafts.map(d=>({draft:d,status:'draft',id:d.id,data:d.data})),...lots.map(lot=>({lot,status:state(lot),id:String(lot.id),data:lot}))].filter(row=>row.lot&&isArchived(row.lot)?dashboardTab==='archive':dashboardTab==='all'||dashboardTab==='draft'&&row.draft||dashboardTab==='archive'&&!['live','scheduled','draft'].includes(row.status)||row.status===dashboardTab);
  const compactNotice='<details class="seller-dashboard-notice"><summary>Демоверсия · данные на этом устройстве</summary><p>Профиль, объявления и файлы сохраняются в этом браузере. Другие посетители их не увидят. Реальная публикация, подтверждённый вход, оплата и сделки ещё не подключены.</p></details>'+(dashboardTab==='profile'?'':privateQuotaHelp(true));
  const filters=Object.entries({all:'Все объявления',draft:'Черновики',live:'На торгах',scheduled:'Запланировано',archive:'Архив и пауза'}).map(([key,label])=>`<button type="button" data-seller-tab="${key}" class="${dashboardTab===key?'on':''}" aria-pressed="${dashboardTab===key}"><span>${label}</span><b data-seller-count="${key}">${totals[key]}</b></button>`).join('');
  show(`<div class="seller-desktop-toolbar"><div class="seller-heading seller-dashboard-heading"><div class="eyebrow">ЧАСТНЫЙ ПРОДАВЕЦ</div><h2>Личный кабинет</h2><p>${workspace.profile.displayName?esc(workspace.profile.displayName)+' · ':''}Ваши объявления и настройки торгов.</p></div><button class="primary seller-create-button" type="button" data-seller-new>${uiIcon('plus')}<span>Разместить объявление</span></button></div><div class="seller-desktop-layout"><div class="seller-desktop-sidebar"><nav class="seller-account-tabs" aria-label="Разделы личного кабинета"><button type="button" data-seller-tab="all" aria-pressed="${dashboardTab!=='profile'}">${uiIcon('list')}<span>Мои лоты</span></button><button type="button" data-seller-bids>${uiIcon('gavel')}<span>Мои ставки</span></button><button type="button" data-seller-purchases>${uiIcon('box')}<span>Мои покупки</span></button><button type="button" data-seller-tab="profile" aria-pressed="${dashboardTab==='profile'}">${uiIcon('user')}<span>Профиль</span></button></nav><nav class="seller-shortcuts" aria-label="Сервисы кабинета"><button class="outline" type="button" data-seller-favorites>${uiIcon('heart')}<span>Избранное</span></button><button class="outline" type="button" data-seller-subscriptions>${uiIcon('bell')}<span>Уведомления</span></button></nav><section class="seller-help-footer" aria-labelledby="seller-messages-title"><div><strong id="seller-messages-title">Сообщения</strong><p>Черновики вопросов продавцам</p></div><button class="outline" type="button" data-messages-open aria-haspopup="dialog">Открыть сообщения<span class="messages-unread" data-messages-unread hidden aria-label="Непрочитанные сообщения"></span></button></section></div><div class="seller-desktop-main">${compactNotice}${dashboardTab==='profile'?'<button class="seller-action-link seller-dashboard-return" type="button" data-seller-tab="all">← К моим объявлениям</button><h3 class="seller-list-title">Мой профиль</h3>':'<h3 class="seller-list-title">Мои объявления</h3>'}<div class="seller-tabs" role="group" aria-label="Статус объявлений" ${dashboardTab==='profile'?'hidden':''}>${filters}</div>${dashboardTab==='profile'?profileHTML():`<div class="seller-list">${rows.map(rowHTML).join('')||emptyDashboardHTML()}</div>`}</div><div class="seller-help-footer seller-desktop-support"><div><strong>Техподдержка</strong><p>Помощь с объявлениями и работой сайта</p></div><button class="outline" type="button" data-open-support>Открыть поддержку</button></div></div>`);
  const form=qs('#seller-profile-form');if(form)window.FasSmartFill?.enhanceProfile(form);if(form)form.onsubmit=event=>{event.preventDefault();return saveProfile()};
 }
 function rowHTML(row){const d=row.data,lot=row.lot;const count=lot?(bids[lot.id]?.count||0):0;return `<article class="seller-row"><img src="${esc(lot?image(lot):'assets/'+(R.CATEGORIES.includes(d.category)?d.category:'other')+'.svg')}" alt="${esc(d.name||'Черновик имущества')}"><div class="seller-row-main"><span class="seller-status" data-status="${row.status}">${statusNames[row.status]||'Недоступен'}${lot&&isArchived(lot)?' · В архиве':''}</span><h3>${esc(d.name||'Новое объявление')}</h3><p>${esc(window.FasCategories?window.FasCategories.label(d):categoryNames[d.category]||'Категория не выбрана')} · ${esc(d.city||'Город не указан')}${lot?' · № '+lot.id:''}</p><p>${lot?'<span data-current-lot-price="'+lot.id+'">'+money(current(lot))+'</span> · '+count+' ваших демоставок':'Черновик · '+date(row.draft.updatedAt)}</p>${lot?`<small>Начало: ${date(lot.startsAt)} · Окончание: ${date(lot.ends)}</small>`:''}${lot?.mediaMissingCount?'<small>Часть файлов недоступна на этом устройстве. Откройте редактирование и добавьте их повторно.</small>':''}</div>${row.draft?.memoryOnly?'<p class="seller-notice" role="status">Не записан в память браузера. Эта копия доступна, пока открыта страница. Откройте и сохраните её повторно.</p>':''}<div class="seller-row-actions"><button class="outline" type="button" data-seller-edit="${esc(row.id)}">${row.draft?'Продолжить':'Редактировать'}</button>${lot&&row.status==='live'?`<button class="outline" type="button" data-seller-view="${lot.id}">Открыть карточку</button>`:''}${lot&&!isArchived(lot)&&!protection(lot).locked&&!R.hasFinalResult(lot)&&['live','scheduled','paused'].includes(row.status)?`<button class="outline" type="button" data-seller-status="${lot.id}" data-next-status="${row.status==='paused'?'live':'paused'}">${row.status==='paused'?'Продолжить торги':'Приостановить'}</button><button class="outline" type="button" data-seller-status="${lot.id}" data-next-status="cancelled">Снять с торгов</button>`:''}${lot&&row.status==='paused'&&protection(lot).locked?`<button class="outline" type="button" data-seller-status="${lot.id}" data-next-status="live">Продолжить торги</button>`:''}${lot&&!isArchived(lot)&&protection(lot).expired?`<button class="outline" type="button" data-seller-archive="${lot.id}">В архив</button>`:''}${lot&&protection(lot).locked?`<small>Снять лот или поставить торги на паузу можно после ${date(protection(lot).until)}. Уточнения, фото и документы доступны сейчас.</small>`:''}${lot&&['ended','sold','cancelled'].includes(row.status)?`<button class="outline" type="button" data-seller-copy="${lot.id}">Повторить новым лотом</button>`:''}${row.draft?`<button class="seller-action-link" type="button" data-seller-delete="${esc(row.id)}" aria-label="Удалить черновик «${esc(d.name||'Новое объявление')}»">Удалить</button>`:''}</div></article>`}
 function defaultData(){const T=window.FasCategories,selected=T?.get(qs('#category').value),leaf=selected?.kind==='group'?selected.children.find(node=>node.auction):selected&&T.isAuction(selected.id)?selected:null;return {category:leaf?.legacyCategory||'cars',subcategory:leaf?.id||'cars',name:'',description:'',condition:'used',regionCode:workspace.profile.regionCode||userRegion.code||'',city:workspace.profile.city||'',startPrice:'',auctionDirection:'ascending',floorPrice:'',decreaseStep:'',decreaseIntervalMinutes:'60',durationValue:'7',durationUnit:'days',durationMinutes:10080,startMode:'now',startsAt:'',stepMode:'fixed',stepValue:'100',deposit:'0',antiSniping:true,antiSnipingWindowMinutes:'2',antiSnipingExtensionMinutes:'2',autoRelist:false,relistDurationMinutes:10080,relistLimit:3,pickup:true,delivery:false}}
 function fromLot(lot){return {...lot,startPrice:lot.startPrice??lot.start,description:lot.description||lot.docs||'',durationUnit:'minutes',durationValue:lot.durationMinutes,startsAt:lot.startsAt?new Date(Date.parse(lot.startsAt)-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):'',ownershipConsent:true}}
 function openEditor(id,copy=false){
  leave();refreshWorkspace();rebuildCityChoices();let draft=allDrafts().find(d=>d.id===String(id)),original=null,data,refs=[];
  if(draft){original=draft.targetId?cars.find(c=>c.id===draft.targetId&&own(c)):null;if(draft.targetId&&!original){toast('Исходное объявление недоступно');return}data={...defaultData(),...(original?fromLot(original):{}),...draft.data};if(!draft.data.subcategory&&!original)data.subcategory=window.FasCategories?.canonicalId(draft.data)||draft.data.category;refs=clone(draft.mediaRefs||[])}
  else if(id){original=cars.find(c=>c.id===Number(id)&&own(c));if(!original){toast('Это объявление недоступно в вашем кабинете');return}if(!copy){const pending=allDrafts().find(d=>d.targetId===original.id);if(pending){openEditor(pending.id);return}}data={...defaultData(),...fromLot(original)};refs=clone(original.mediaRefs||[]);if(copy){original=null;Object.assign(data,{startMode:'now',startsAt:'',ends:undefined,maxEnds:undefined,status:undefined,ownershipConsent:false})}}
  else data=defaultData();
  data=R.sanitizeCharacteristics(data);const profile=R.listingProfile(data);
  const locked=!!original,draftId=draft?.id||'draft-'+uid(),disabled=locked?'disabled':'';
  const form=`<div class="seller-heading"><div class="eyebrow">${locked?'РЕДАКТИРОВАНИЕ ЛОТА № '+original.id:'РАЗМЕЩЕНИЕ ИМУЩЕСТВА'}</div><h2>${locked?'Редактирование объявления':'Новое объявление'}</h2><p>Опишите имущество, добавьте фото и выберите условия торгов. Срок — от 1 часа до 30 суток.</p></div><div class="seller-editor-links"><button class="seller-action-link" type="button" data-seller-dashboard>← В кабинет</button><button class="seller-action-link" type="button" data-open-support>Помощь</button></div><details class="seller-editor-demo"><summary>Демоверсия · сохранение на этом устройстве</summary><p>Объявление и файлы доступны в этом браузере. Другие посетители их пока не увидят. Реальная публикация, подтверждённый вход и оплата ещё не подключены.</p></details><nav class="seller-editor-nav" aria-label="Разделы объявления">${[[1,'Объект'],[2,'Описание'],[3,'Фото'],[4,'Место'],[5,'Торги']].map(([number,label])=>`<button type="button" data-seller-section-target="seller-section-${number}"><span>${number}</span>${label}</button>`).join('')}</nav><form id="seller-listing-form" class="seller-form" novalidate><div class="seller-error" id="seller-error" role="alert" hidden></div><section class="seller-section" role="group" aria-labelledby="seller-section-1"><h3 class="seller-step-title" id="seller-section-1"><span aria-hidden="true">1</span>Объект продажи</h3><div class="seller-grid"><div class="wide seller-category-choice">${window.FasCategoryUI?window.FasCategoryUI.fieldHTML(data,'seller'):select('category','Категория',data.category,categoryNames)}</div><div class="seller-grid seller-characteristics-grid wide" id="seller-characteristics-main">${profile.primary.map(spec=>characteristicHTML(spec,data)).join('')}</div><div class="wide">${field('name','Название объявления',data.name,'text','maxlength="150" required placeholder="Коротко о главном"','Например: '+esc(profile.titleExample))}</div></div></section><section class="seller-section" role="group" aria-labelledby="seller-section-2"><h3 class="seller-step-title" id="seller-section-2"><span aria-hidden="true">2</span>Описание и состояние</h3><div class="seller-grid">${textarea('description','Описание',data.description,4,'Обязательно для размещения: от 20 символов. Опишите состояние и условия осмотра.')}${select('condition','<span data-condition-label>'+esc(profile.conditionLabel)+'</span>',data.condition,profile.conditionOptions)}<details class="seller-advanced wide" data-extra-specs ${profile.additional.length?'':'hidden'}><summary>Дополнительные характеристики</summary><div class="seller-grid seller-characteristics-grid" id="seller-characteristics-extra">${profile.additional.map(spec=>characteristicHTML(spec,data)).join('')}</div></details><details class="seller-advanced wide"><summary>Документы</summary><div class="seller-grid">${textarea('completeness','Что входит в продажу',data.completeness)}${textarea('defects','Недостатки и повреждения',data.defects,3,'Укажите известные недостатки. Если их нет — так и напишите.')}${textarea('documents','Документы на имущество',data.documents,3,'Укажите документы, подтверждающие право продажи. Паспортные данные и банковские реквизиты здесь не нужны.')}</div></details></div></section><section class="seller-section" role="group" aria-labelledby="seller-section-3"><h3 class="seller-step-title" id="seller-section-3"><span aria-hidden="true">3</span>Фотографии и видео</h3><p class="note">Для размещения нужно хотя бы 1 фото. До 20 фото и 5 видео. Фото — до 10 МБ, видео — до 30 МБ; всего до 100 МБ. Первое фото станет обложкой.</p><div class="seller-media-sources" id="seller-media-sources" role="group" aria-label="Добавление фото и видео"><button type="button" class="outline" data-seller-media-source="camera">${uiIcon('camera')}<span>Снять фото</span><small>Камера устройства</small></button><button type="button" class="outline" data-seller-media-source="gallery">${uiIcon('image')}<span>Из галереи</span><small>Несколько фото и видео</small></button></div><input id="seller-camera" type="file" accept="image/*" capture="environment" hidden><input id="seller-files" type="file" multiple accept="${esc(M.fileAccept||'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm')}" hidden><p class="seller-media-formats">JPG, PNG, WebP, GIF. AVIF, HEIC/HEIF, BMP и TIFF — при поддержке браузера. Файлы сохраняются на этом устройстве.</p><p id="seller-media-status" role="status"></p><div class="seller-media-grid" id="seller-media-grid"></div><span class="seller-field-error" data-error-for="media"></span></section><section class="seller-section" role="group" aria-labelledby="seller-section-4"><h3 class="seller-step-title" id="seller-section-4"><span aria-hidden="true">4</span>Местоположение</h3><div class="seller-grid"><label>Регион<select name="regionCode" required>${regionOptions(false,data.regionCode)}</select><span class="seller-field-error" data-error-for="regionCode"></span></label>${choiceField('city','Город / населённый пункт',data.city,cityList(data.regionCode),'required maxlength="100"')}${textarea('address','Адрес или ориентир для осмотра',data.address,2,'Необязательно. Адрес и координаты будут видны в карточке имущества.')}${field('latitude','Широта',data.latitude,'text','inputmode="decimal" maxlength="20" autocomplete="off" placeholder="55,7558"','От −90 до 90. Например: 55,7558')}${field('longitude','Долгота',data.longitude,'text','inputmode="decimal" maxlength="20" autocomplete="off" placeholder="37,6173"','От −180 до 180. Например: 37,6173')}<div class="seller-location-actions wide"><button class="outline" type="button" data-seller-location>Определить текущие координаты</button><p id="seller-location-status" role="status">Укажите точку имущества. Текущие координаты подходят, если вы находитесь рядом с ним.</p></div><div class="seller-location-preview wide" id="seller-location-preview" hidden></div></div></section><section class="seller-section" role="group" aria-labelledby="seller-section-5"><h3 class="seller-step-title" id="seller-section-5"><span aria-hidden="true">5</span>Цена и условия торгов</h3>${locked?'<div class="seller-notice">Цена и объявленный срок торгов сохраняются. В любом статусе доступны уточнения, фото и документы. После первой ставки сам предмет, основные характеристики и условия торгов фиксируются.</div><div class="seller-notice" id="seller-identity-note" hidden role="status"></div>':''}<div class="seller-grid">${field('startPrice','Стартовая цена, ₽',data.startPrice,'number',`min="1" step="1" required ${disabled}`)}${select('durationPreset','Срок проведения аукциона',Object.hasOwn(durationPresets,String(data.durationMinutes))?String(data.durationMinutes):'custom',durationPresets,disabled)}<div class="seller-grid wide" data-duration-custom ${Object.hasOwn(durationPresets,String(data.durationMinutes))?'hidden':''}>${field('durationValue','Продолжительность',data.durationValue,'number',`min="1" step="any" required ${disabled}`)}${select('durationUnit','Единица времени',data.durationUnit,{hours:'Часы (от 1 до 720)',days:'Сутки (от 1 до 30)',minutes:'Минуты (от 60 до 43 200)'},disabled)}</div><span class="seller-field-error wide" data-error-for="durationMinutes"></span></div>${window.FasAuctionModes?.fieldsHTML(data,{locked})||'<p class="note">Формат: торги на повышение.</p>'}<details class="seller-advanced"><summary>Шаг, задаток, выкуп и начало торгов</summary><div class="seller-grid">${select('stepMode','Шаг повышения цены',data.stepMode,{fixed:'Фиксированный, ₽',percent:'Процент от текущей цены'},disabled)}${field('stepValue','Величина шага (₽ или %)',data.stepValue,'number',`min="0.1" step="any" ${disabled}`)}${field('reservePrice','Минимальная цена продажи, ₽',data.reservePrice,'number',`min="1" step="1" ${disabled}`,'Необязательно. Условие будет указано в карточке. Если цена не достигнута, продажа не состоится.')}${field('buyNowPrice','«Купить сейчас», ₽',data.buyNowPrice,'number',`min="1" step="1" ${disabled}`,'Необязательно. Мгновенное завершение демоторгов по указанной цене; реальная оплата не проводится.')}${field('deposit','Задаток, ₽',data.deposit,'number',`min="0" step="1" ${disabled}`,'Сумма отражается в условиях. Приём и проверка задатков ещё не подключены.')}${select('startMode','Когда начать',data.startMode,{now:'Сразу после публикации',scheduled:'В выбранные дату и время'},disabled)}${field('startsAt','Дата и время начала — по вашему часовому поясу',data.startsAt,'datetime-local',disabled)}</div></details><details class="seller-advanced"><summary>Автопродление и передача имущества</summary><div class="seller-grid"><label class="seller-check"><input type="checkbox" name="antiSniping" ${data.antiSniping?'checked':''} ${disabled}>Автопродление при ставке в конце</label>${field('antiSnipingWindowMinutes','Ставка в последние, минут',data.antiSnipingWindowMinutes,'number',`min="1" max="30" step="1" ${disabled}`)}${field('antiSnipingExtensionMinutes','Оставлять минимум минут после ставки',data.antiSnipingExtensionMinutes,'number',`min="1" max="30" step="1" ${disabled}`)}<p class="note seller-field wide">Общая длительность с продлениями никогда не превышает 30 суток от начала аукциона.</p><label class="seller-check"><input type="checkbox" name="pickup" ${data.pickup?'checked':''}>Самовывоз / личная передача</label><label class="seller-check"><input type="checkbox" name="delivery" ${data.delivery?'checked':''}>Возможна доставка</label>${textarea('inspection','Как осмотреть имущество',data.inspection,3,'Время, запись на осмотр, возможность проверки специалистом.')}${field('deliveryRegions','Куда возможна доставка',data.deliveryRegions,'text','maxlength="500"')}${textarea('deliveryNotes','Условия передачи',data.deliveryNotes,3,'Когда и как передаёте имущество. Кто несёт дополнительные расходы.')}</div></details>${window.FasAuctionRenewal?.fieldsHTML(data)||''}</section><div class="seller-publish-summary" id="seller-publish-summary" aria-live="polite"></div><label class="seller-check"><input type="checkbox" name="ownershipConsent" ${data.ownershipConsent?'checked':''}>Подтверждаю право продажи имущества и достоверность описания. Понимаю, что сейчас это публикация только в демокаталоге моего устройства.</label><span class="seller-field-error" data-error-for="ownershipConsent"></span><p class="note" id="seller-save-status">Изменения автоматически сохраняются как черновик на этом устройстве.</p><div class="seller-actions seller-editor-actions"><span class="seller-action-note">Демопубликация · только на этом устройстве</span><button class="primary" type="submit" id="seller-publish">${locked?'Сохранить изменения':'Отправить'}</button><button class="outline" type="button" data-seller-save>Сохранить черновик</button><button class="seller-action-link seller-editor-delete" type="button" data-seller-editor-delete aria-label="Удалить текущий черновик">Удалить</button></div></form>`;
  show(form);qs('#modal').classList.add('seller-editor-dialog');editor={draftId,original,data,refs,uploading:false,profileId:profile.id};
  const formEl=qs('#seller-listing-form');formEl.addEventListener('input',event=>{if(['latitude','longitude','regionCode','city','address'].includes(event.target?.name)){cancelSellerLocation();syncLocationPreview(formEl)}scheduleDraft();if(['durationValue','durationUnit','startsAt'].includes(event.target?.name))syncEditor()});formEl.addEventListener('change',changeEditor);formEl.onsubmit=publish;
  qs('#seller-files').addEventListener('change',uploadFiles);qs('#seller-camera').addEventListener('change',uploadFiles);window.FasCarCatalog?.enhance(formEl);window.FasSmartFill?.enhance(formEl);syncStepLabel(formEl);syncLocationPreview(formEl);syncEditor();renderMedia();
 }
 function locationPoint(latitude,longitude){return window.FasLotLocation?window.FasLotLocation.parse(latitude,longitude):coordinates(latitude,longitude)}
 function locationValues(form){return Object.fromEntries(['latitude','longitude','regionCode','city','address'].map(name=>[name,String(form.elements.namedItem(name)?.value??'')]))}
 function setLocationStatus(message){const status=qs('#seller-location-status');if(status)status.textContent=message}
 function cancelSellerLocation(){locationGeneration++;if(editor?.locating){editor.locating=false;const button=qs('[data-seller-location]');if(button){button.disabled=false;button.textContent='Определить текущие координаты'}}}
 function syncLocationPreview(form=qs('#seller-listing-form')){if(!form||!editor)return;const preview=qs('#seller-location-preview');if(!preview)return;const values=locationValues(form),html=window.FasLotLocation?.html(values)||'';preview.hidden=!html;preview.innerHTML=html}
 function requestSellerLocation(){
  if(!editor||editor.saving||editor.uploading||editor.locating)return false;
  const geo=navigator.geolocation;if(!geo?.getCurrentPosition){setLocationStatus('Геолокация недоступна в этом браузере. Введите обе координаты вручную.');return false}
  const currentEditor=editor,form=qs('#seller-listing-form'),version=++locationGeneration,snapshot=JSON.stringify(locationValues(form));
  currentEditor.locating=true;const button=qs('[data-seller-location]');if(button){button.disabled=true;button.textContent='Определяем координаты…'}setLocationStatus('Разрешите доступ к геопозиции, чтобы подставить текущую точку.');
  const valid=()=>editor===currentEditor&&locationGeneration===version&&qs('#modal').open&&qs('#seller-listing-form')===form&&JSON.stringify(locationValues(form))===snapshot;
  const finish=()=>{if(locationGeneration===version)locationGeneration++;currentEditor.locating=false;if(button){button.disabled=false;button.textContent='Определить текущие координаты'}};
  try{geo.getCurrentPosition(position=>{
   if(!valid()){if(editor===currentEditor&&locationGeneration===version)finish();return}finish();const point=locationPoint(position?.coords?.latitude,position?.coords?.longitude);
   if(!point){setLocationStatus('Не удалось получить корректные координаты. Введите точку вручную.');return}
   form.elements.namedItem('latitude').value=String(Number(point[0].toFixed(6)));form.elements.namedItem('longitude').value=String(Number(point[1].toFixed(6)));
   for(const name of ['latitude','longitude']){const error=qs('[data-error-for="'+name+'"]');if(error)error.textContent=''}
   setLocationStatus('Текущие координаты подставлены. Проверьте, что точка соответствует месту имущества.');syncLocationPreview(form);scheduleDraft();
  },error=>{if(!valid()){if(editor===currentEditor&&locationGeneration===version)finish();return}finish();setLocationStatus(error?.code===1?'Доступ к геопозиции запрещён. Координаты можно ввести вручную.':error?.code===3?'Не удалось определить точку за отведённое время. Повторите запрос или введите координаты.':'Местоположение сейчас недоступно. Введите координаты вручную.')},{enableHighAccuracy:true,timeout:15000,maximumAge:60000});return true}catch{if(valid()){finish();setLocationStatus('Не удалось запросить геопозицию. Введите координаты вручную.')}return false}
 }
 function syncEditor(){
  const currentForm=qs('#seller-listing-form');if(!editor||!currentForm)return;syncCategoryFields(currentForm);syncAuctionFields(currentForm);syncIdentityControls(currentForm);
  const realEstate=['property','houses','land','garages','commercial'].includes(editor.profileId);
  for(const name of ['pickup','delivery','deliveryRegions']){const control=currentForm.elements.namedItem(name);if(!control)continue;control.closest?.('label')?.toggleAttribute?.('hidden',realEstate);control.disabled=realEstate;if(realEstate){if(name==='pickup')control.checked=true;else if(name==='delivery')control.checked=false;else control.value=''}}
  const raw=rawFromForm();if(!raw)return;
  const form=currentForm,start=form.elements.namedItem('startsAt');start.closest('label').hidden=raw.startMode!=='scheduled';
  const minutes=editor.original?.durationMinutes??raw.durationMinutes,starts=editor.original?.startsAt||(raw.startMode==='scheduled'?raw.startsAt:stamp()),end=editor.original?.ends||new Date(Date.parse(starts)+minutes*60000);
  const terms=editor.original||raw,price=Number(terms.startPrice??terms.start??terms.price),step=Number(terms.stepValue??terms.step),deposit=Number(terms.deposit||0),percent=terms.stepMode==='percent';
  const down=terms.auctionDirection==='descending',directionLabel=down?'Торги на понижение':'Торги на повышение';
  qs('#seller-publish-summary').innerHTML=`<h3>Ваш аукцион</h3><p><b>${directionLabel}</b></p>${down?window.FasAuctionModes?.htmlSummary(terms)||'':''}<p>Стартовая цена: <b>${Number.isFinite(price)&&price>0?money(price):'укажите цену'}</b><br>${down?'Шаг снижения':'Шаг повышения'}: <b>${Number.isFinite(down?Number(terms.decreaseStep):step)&&(down?Number(terms.decreaseStep):step)>0?(down?money(Number(terms.decreaseStep)):percent?step.toLocaleString('ru-RU')+'%':money(step)):'проверьте шаг'}</b> · Задаток: <b>${Number.isFinite(deposit)&&deposit>=0?(deposit?money(deposit):'не требуется'):'проверьте сумму'}</b></p><p>Срок: <b>${Number.isFinite(minutes)?Math.round(minutes/60*100)/100:'—'} ч</b> · от 1 часа до 30 суток.<br>Начало: <b>${date(starts)}</b><br>Окончание: <b>${date(end)}</b></p>${!profileReady()?'<p>Перед публикацией заполните имя и телефон и примите актуальное соглашение в профиле. Черновик можно сохранить уже сейчас.</p><button class="outline" type="button" data-seller-tab="profile">Заполнить профиль</button>':''}${privateQuotaHelp()}`;
 }
 async function renderMedia(){
  const currentEditor=editor,generation=++mediaGeneration;if(!currentEditor)return;
  try{const items=await M.getMedia(currentEditor.refs,{ownerId:workspace.profile.id});if(editor!==currentEditor||generation!==mediaGeneration)return;
   qs('#seller-media-grid').innerHTML=items.map((item,i)=>`<div class="seller-media-item">${item.type==='video'?`<video src="${esc(item.url)}" controls playsinline preload="metadata" aria-label="Видео имущества"></video>`:`<img src="${esc(item.url)}" alt="Фото имущества ${i+1}">`}<small>${i===0?'Первый материал · ':''}${esc(item.label)}</small><div><button type="button" class="outline" data-seller-media-up="${esc(item.ref)}" ${i===0?'disabled':''} aria-label="Переместить файл на позицию выше">←</button><button type="button" class="outline" data-seller-media-down="${esc(item.ref)}" ${i===items.length-1?'disabled':''} aria-label="Переместить файл на позицию ниже">→</button><button type="button" class="outline" data-seller-media-remove="${esc(item.ref)}" aria-label="Удалить файл из объявления">${uiIcon('close')}</button></div></div>`).join('');
   qs('#seller-media-status').textContent=currentEditor.refs.length+' материалов выбрано'+(items.length<currentEditor.refs.length?' · Часть файлов недоступна: удалите их и добавьте повторно.':'');
  }catch(error){if(editor===currentEditor&&generation===mediaGeneration)setError(error.message)}
 }
 function syncMediaControls(busy){
  const source=qs('#seller-media-sources');source?.setAttribute?.('aria-busy',String(busy));
  for(const id of ['#seller-camera','#seller-files']){const input=qs(id);if(input)input.disabled=busy}
  document.querySelectorAll('[data-seller-media-source]').forEach(button=>button.disabled=busy);
 }
 async function uploadFiles(event){
  const activeForm=qs('#seller-listing-form');if(!editor||!activeForm||activeForm.contains&&!activeForm.contains(event.target))return;
  const currentEditor=editor,ownerId=workspace.profile.id,files=[...(event.target.files||[])];if(!currentEditor||!files.length)return;if(currentEditor.uploading){toast('Дождитесь сохранения выбранных файлов');event.target.value='';return}
  currentEditor.uploading=true;syncMediaControls(true);qs('#seller-publish').disabled=true;qs('#seller-media-status').textContent='Подготавливаем и сохраняем файлы на устройстве…';
  try{const refs=await M.storeFiles(files,ownerId,{existingRefs:currentEditor.refs});if(editor!==currentEditor){await M.deleteMedia(refs.map(ref=>ref.id),ownerId);return}currentEditor.refs.push(...refs);if(!saveDraft(false)){const fresh=new Set(refs.map(ref=>ref.id));currentEditor.refs=currentEditor.refs.filter(ref=>!fresh.has(ref.id));await M.deleteMedia([...fresh],ownerId,{keepRefs:allDrafts().flatMap(d=>d.mediaRefs||[])}).catch(()=>{});throw Error('Файлы не добавлены: браузер не смог сохранить черновик. Проверьте свободное место.')}await renderMedia()}catch(error){if(editor===currentEditor)setError(error.message)}finally{currentEditor.uploading=false;if(editor===currentEditor){syncMediaControls(false);qs('#seller-publish').disabled=false;event.target.value=''}}
 }
 async function publish(event){
  event.preventDefault();if(!editor||editor.uploading||editor.saving)return;cancelSellerLocation();const currentEditor=editor,publicationViewGeneration=viewGeneration,raw=rawFromForm();currentEditor.submissionRaw=raw;currentEditor.saving=true;clearTimeout(autosaveTimer);const controls=[...qs('#seller-listing-form').querySelectorAll('input,select,textarea,button')].map(node=>[node,node.disabled]);controls.forEach(([node])=>node.disabled=true);qs('#seller-publish').disabled=true;setError('');document.querySelectorAll('[data-error-for]').forEach(node=>node.textContent='');
  try{
  const materials=await M.getMedia(currentEditor.refs,{ownerId:workspace.profile.id});
  if(editor!==currentEditor)return;
  const existing=currentEditor.original?cars.find(lot=>lot.id===currentEditor.original.id&&own(lot)):null;
  if(currentEditor.original&&!existing){saveDraft(false);setError('Объявление больше недоступно в вашем кабинете. Изменения сохранены в черновике.');return}
  const validation=R.validateListing(raw,{existing,...bidOptions(existing),regionCodes:RF_REGIONS.map(region=>region.code)}),renewal=window.FasAuctionRenewal?.validate(raw)||{valid:true,errors:{},value:{autoRelist:false,relistDurationMinutes:10080,relistLimit:3}},errors={...validation.errors,...renewal.errors};
  if(!raw.ownershipConsent)errors.ownershipConsent='Подтвердите право продажи и достоверность сведений.';
  if(!profileReady())errors.profile='Заполните имя и телефон и примите актуальное соглашение в разделе «Мой профиль». Черновик сохранён.';
  const point=locationPoint(raw.latitude,raw.longitude);if((raw.latitude||raw.longitude)&&!point)errors.latitude='Укажите обе координаты в допустимых пределах.';
  if(!materials.some(m=>m.type==='image'))errors.media='Добавьте хотя бы одну фотографию имущества.';
  if(Object.keys(errors).length){saveDraft(false);for(const [key,message] of Object.entries(errors)){const node=qs('[data-error-for="'+key+'"]');if(node){node.textContent=message;const details=node.closest?.('details');if(details)details.open=true}}setError(Object.values(errors)[0]);qs('#seller-error').scrollIntoView?.({block:'center'});return}
  const value=validation.value;let id=existing?.id||Date.now();while(!existing&&cars.some(lot=>lot.id===id))id++;
  const sellerName=workspace.profile.displayName.trim();let lot={...R.sanitizeCharacteristics({...existing,category:value.category,subcategory:value.subcategory}),...value,...renewal.value,id,price:existing?existing.price:value.price,sellerType:'private',sellerOwnerId:workspace.profile.id,sellerName,publicContact:existing?String(existing.publicContact||''):(workspace.profile.showPhone?workspace.profile.phone:''),bank:sellerName+' · частный продавец',tag:'Частный продавец · демо',demo:false,privateSellerDemo:true,status:existing?.status||'live',createdAt:existing?.createdAt||stamp(),updatedAt:stamp(),mediaRefs:clone(currentEditor.refs),media:[],image:'assets/'+value.category+'.svg',photoExample:false,km:value.mileage??'',engine:value.model||'Характеристики — в описании',bids:existing?.bids||0,docs:value.documents||'',latitude:point?.[0]??null,longitude:point?.[1]??null,vin:String(raw.vin||'').trim().slice(0,30),cadastralNumber:String(raw.cadastralNumber||'').trim().slice(0,60),serialNumber:String(raw.serialNumber||'').trim().slice(0,80)};
  if(existing&&identityLocked(existing)){lot=R.preserveAuctionIdentity(lot,existing);for(const key of ['autoRelist','relistDurationMinutes','relistLimit'])if(Object.hasOwn(existing,key))lot[key]=existing[key];else delete lot[key]}
  const quotaIssue=privateQuotaIssue(existing,lot);if(quotaIssue){const saved=saveDraft(false);setError(quotaIssue+(saved?' Черновик сохранён на этом устройстве.':' Черновик не записан: не закрывайте страницу, освободите место и повторите сохранение.'));return}
  const next=existing?cars.map(c=>c.id===id?lot:c):[...cars,lot];
  const nextWorkspace={...workspace,drafts:workspace.drafts.filter(d=>d.id!==currentEditor.draftId)};
  try{writeLots(next,nextWorkspace)}catch(error){saveDraft(false);setError(error?.code==='seller-workspace-conflict'||error?.code==='stale-auction-storage'||error?.code==='auction-storage-unavailable'?error.message:'Не удалось сохранить объявление. Оно не опубликовано: проверьте свободное место и настройки браузера.');return}
  const oldRefs=existing?.mediaRefs||[];recoveryDrafts.delete(currentEditor.draftId);editor=null;clearTimeout(autosaveTimer);
  await M.hydrateLots(cars).catch(()=>{});refreshCatalog();await M.deleteMedia(oldRefs.map(ref=>ref.id),workspace.profile.id,{keepRefs:[...currentEditor.refs,...allDrafts().flatMap(d=>d.mediaRefs||[])]}).catch(()=>{});
  if(viewGeneration!==publicationViewGeneration||!qs('#modal').open)return;
  openDashboard();toast(existing?'Изменения сохранены на устройстве':'Лот добавлен в демокаталог этого устройства');
  }catch(error){if(editor===currentEditor)setError(error.message||'Не удалось прочитать локальные файлы. Сохраните черновик и попробуйте снова.')}
  finally{currentEditor.saving=false;delete currentEditor.submissionRaw;if(editor===currentEditor){controls.forEach(([node,disabled])=>node.disabled=disabled);if(qs('#seller-publish'))qs('#seller-publish').disabled=currentEditor.uploading}}
 }
 function ownerActionError(error,fallback){return ['stale-auction-storage','auction-storage-unavailable','seller-workspace-conflict'].includes(error?.code)?error.message:fallback}
 function ownedActionLot(id){
  try{window.FasAuctionStorage?.assertCurrent();prepareWorkspace(workspace)}catch(error){toast(ownerActionError(error,'Изменение не сохранено. Проверьте доступ к памяти браузера и обновите страницу.'));return null}
  return cars.find(lot=>lot.id===Number(id)&&own(lot));
 }
 function archiveLot(id){
  const lot=ownedActionLot(id);if(!lot)return false;const limits=protection(lot);
  if(!limits.expired){toast(limits.until===null?'Срок торгов не подтверждён. Обновите страницу перед архивированием.':'В архив можно перенести после '+date(limits.until)+'. Уточнения, фото и документы доступны сейчас.');return false}
  if(isArchived(lot)){openDashboard('archive');return true}
  try{writeLots(cars.map(item=>item.id===lot.id?{...item,sellerArchivedAt:stamp()}:item));openDashboard('archive');toast('Лот перенесён в архив кабинета. Результат торгов, ставки и обязательства сохранены.');return true}catch(error){toast(ownerActionError(error,'Не удалось сохранить архив. Лот и история торгов оставлены без изменений.'));return false}
 }
 function changeStatus(id,nextStatus){
  const lot=ownedActionLot(id);if(!lot)return;const current=state(lot),limits=protection(lot);
  if(nextStatus==='archived'||nextStatus==='cancelled'&&limits.expired){archiveLot(id);return}
  if(R.hasFinalResult(lot)){toast('По лоту уже сохранён результат. Его нельзя отменить; уточнения, фото и документы доступны.');return}
  if(!['live','scheduled','paused'].includes(current)||!['live','paused','cancelled'].includes(nextStatus)||isArchived(lot)||limits.expired)return;
  if(limits.locked&&nextStatus!=='live'){toast(limits.until===null?'Уже подана ставка. Снять лот или поставить торги на паузу нельзя до подтверждённого окончания.':'Уже подана ставка. Снятие и пауза недоступны до '+date(limits.until)+'. Уточнения, фото и документы доступны сейчас.');return}
  if(limits.hasBids&&nextStatus==='live'&&current!=='paused')return;
  const updated={...lot,status:nextStatus,updatedAt:stamp()};if(nextStatus==='live'){const quotaIssue=privateQuotaIssue(lot,updated);if(quotaIssue){toast(quotaIssue);return}}
  try{writeLots(cars.map(c=>c.id===lot.id?updated:c));openDashboard();toast(nextStatus==='paused'?'Торги на паузе. Время окончания не меняется.':nextStatus==='cancelled'?'Лот снят с демонстрационных торгов':'Торги возобновлены')}catch(error){toast(ownerActionError(error,'Изменение не сохранено: проверьте свободное место.'))}
 }
 function buyNowAvailable(lot){if(lot?.auctionDirection==='descending')return false;return Number.isSafeInteger(lot?.buyNowPrice)&&lot.buyNowPrice>0&&lot.buyNowPrice>=current(lot)}
 function characteristicRows(lot){return [...R.listingProfile(lot).primary,...R.listingProfile(lot).additional].filter(spec=>lot[spec.name]!==null&&lot[spec.name]!==undefined&&lot[spec.name]!=='').map(spec=>[spec.label+(spec.unit?', '+spec.unit:''),spec.type==='select'?(spec.options[lot[spec.name]]||lot[spec.name]):typeof lot[spec.name]==='number'?lot[spec.name].toLocaleString('ru-RU'):lot[spec.name]])}
 function details(lot){if(!lot.sellerOwnerId)return '';return `<section class="private-sale-details"><h3>Имущество частного продавца</h3><p>${esc(lot.description||'')}</p><dl class="object-attributes">${[['Продавец',lot.sellerName],['Состояние',R.listingProfile(lot).conditionOptions[lot.condition]],...characteristicRows(lot),['Начало торгов',date(lot.startsAt)],['Окончание',date(lot.ends)],[lot.auctionDirection==='descending'?'Нижний предел цены':'Минимальная цена продажи',lot.auctionDirection==='descending'?(Number.isSafeInteger(lot.floorPrice)&&lot.floorPrice>0?money(lot.floorPrice):'Не указана'):lot.reservePrice?money(lot.reservePrice):'Не установлена'],['Осмотр',lot.inspection],['Адрес осмотра',lot.address],['Передача',[lot.pickup?'Самовывоз':'',lot.delivery?'Доставка':''].filter(Boolean).join(' / ')],['Регионы доставки',lot.deliveryRegions],['Условия доставки',lot.deliveryNotes],['Комплектность',lot.completeness],['Дефекты',lot.defects],['Телефон продавца',lot.publicContact]].filter(([,value])=>value!==null&&value!==undefined&&value!=='').map(([label,value])=>`<dt>${label}</dt><dd>${esc(value)}</dd>`).join('')}</dl>${!own(lot)&&buyNowAvailable(lot)?`<button class="outline" type="button" data-seller-buy-now="${lot.id}">Купить лот за ${money(lot.buyNowPrice)} · деморежим</button>`:''}<p class="note">Частное объявление и контакты не проверены. Демоставки и «Купить сейчас» доступны для проверки интерфейса; покупка и списание денег не выполняются.</p></section>`}
 function purchaseActions(lot){if(own(lot)||!lot.sellerOwnerId||!buyNowAvailable(lot))return '';return `<button class="primary seller-buy-now" type="button" data-seller-buy-now="${lot.id}">Купить лот за ${money(lot.buyNowPrice)} · деморежим</button>${R.nextBid(lot,current(lot))>=lot.buyNowPrice?'<p class="note">Следующая ставка достигает цены выкупа. Проверьте условия покупки лота.</p>':''}`}
 function buyNow(id){const lot=cars.find(c=>c.id===Number(id));if(own(lot)){toast('Это ваше объявление. Купить собственный лот нельзя.');return}if(!lot?.sellerOwnerId||state(lot)!=='live'||!buyNowAvailable(lot)){toast('Мгновенная покупка недоступна для этого лота');return}if(window.FasPayments&&window.FasOpenLotPayment){window.FasOpenLotPayment(lot.id);return}show(`<div class="seller-heading"><div class="eyebrow">ДЕМОНСТРАЦИОННАЯ ПОКУПКА</div><h2>Завершить демоторги?</h2><p>${esc(lot.name)} · ${money(lot.buyNowPrice)}</p></div><p>Лот получит статус «Продан» только в каталоге этого устройства. Реальная покупка не состоится, деньги не списываются.</p><div class="seller-actions"><button class="outline" type="button" data-seller-view="${lot.id}">Вернуться к лоту</button><button class="primary" type="button" data-seller-confirm-buy="${lot.id}">Подтвердить демопокупку</button></div>`)}
 document.addEventListener('click',async event=>{
  const target=event.target.closest?.('button,a');if(!target)return;
  if(target.matches('[data-seller-section-target]')){event.preventDefault();const heading=qs('#'+target.dataset.sellerSectionTarget);heading?.scrollIntoView?.({block:'start',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});return}
  if(target.matches('[data-seller-media-source]')){event.preventDefault();if(!editor||editor.uploading||editor.saving)return;const source=target.dataset.sellerMediaSource;if(!['camera','gallery'].includes(source))return;const input=qs(source==='camera'?'#seller-camera':'#seller-files');if(input){input.value='';input.click?.()}return}
  if(target.matches('[data-seller-location]')){event.preventDefault();requestSellerLocation();return}
  if(target.matches('[data-messages-open]')){
   event.preventDefault();const modal=qs('#modal');if(editor||!modal?.open||!modal.classList.contains('seller-dialog')||!modal.contains?.(target))return;
   const top=window.FasDialogLifecycle?.top?.()||Array.from(document.querySelectorAll('dialog[open]')).filter(dialog=>dialog.open).at(-1);if(top&&top!==modal)return;
   const messages=window.FasMessages;if(typeof messages?.openInbox!=='function'){toast('Раздел сообщений пока не загрузился. Попробуйте ещё раз.');return}
   target.focus?.({preventScroll:true});messages.openInbox({trigger:target});return;
  }
  if(target.matches('[data-seller-branding-open]')){
   event.preventDefault();const modal=qs('#modal');
   if(editor||dashboardTab!=='profile'||!modal?.open||!modal.classList.contains('seller-dialog')||modal.contains?.(target)===false||!qs('#seller-profile-form'))return;
   const top=window.FasDialogLifecycle?.top?.()||Array.from(document.querySelectorAll('dialog[open]')).filter(dialog=>dialog.open).at(-1);if(top&&top!==modal)return;
   const branding=window.FasSellerBranding;if(typeof branding?.openEditor!=='function'){toast('Оформление витрины пока не загрузилось. Попробуйте ещё раз.');return}
   target.focus?.({preventScroll:true});branding.openEditor({trigger:target});return;
  }
  if(target.matches('[data-voice-settings-open]')){
   event.preventDefault();const modal=qs('#modal');
   if(editor||dashboardTab!=='profile'||!modal?.open||!modal.classList.contains('seller-dialog')||modal.contains?.(target)===false||!qs('#seller-profile-form'))return;
   const top=window.FasDialogLifecycle?.top?.()||Array.from(document.querySelectorAll('dialog[open]')).filter(dialog=>dialog.open).at(-1);if(top&&top!==modal)return;
   const assistant=window.FasVoiceAssistant;if(typeof assistant?.open!=='function'){toast('Голосовой помощник пока не загрузился. Попробуйте ещё раз.');return}
   // Open an independent dialog: never save or rebuild the underlying profile.
   target.focus?.({preventScroll:true});assistant.open({settings:true});return;
  }
  if(target.matches('[data-seller-profile-cancel]')){event.preventDefault();if(editor||dashboardTab!=='profile'||!qs('#modal').classList.contains('seller-dialog'))return;openDashboard('all');qs('.seller-account-tabs [data-seller-tab="all"]')?.focus?.({preventScroll:true});toast('Несохранённые изменения профиля отменены');return}
  if(target.matches('[data-seller-open],[data-seller-dashboard]')){event.preventDefault();if(target.matches('[data-seller-dashboard]'))back();else navigate(()=>openDashboard());return}
  if(target.matches('[data-seller-new]')){navigate(()=>openEditor());return}
  if(target.matches('[data-category-form="seller"]')&&editor&&window.FasCategoryUI){if(identityLocked(currentEditorLot())){toast('После ставки или сохранённого результата предмет продажи сохраняется. Уточните описание, фото или документы.');return}const currentEditor=editor,form=qs('#seller-listing-form');window.FasCategoryUI.open({purpose:'sell',value:form.elements.namedItem('subcategory')?.value||form.elements.namedItem('category').value,onSelect:(id,node)=>{if(editor!==currentEditor)return;if(identityLocked(currentEditorLot())){syncIdentityControls(form);toast('Уже подана ставка: предмет продажи сохраняется. Уточнения, фото и документы доступны.');return}form.elements.namedItem('category').value=node.legacyCategory;form.elements.namedItem('subcategory').value=id;target.querySelector('span').textContent=node.label;target.parentElement.querySelector('.category-path').textContent=window.FasCategories.groupOf(id).label;syncCategoryFields(form);syncEditor();saveDraft(false)}});return}
  if(target.matches('[data-seller-purchases]')){event.preventDefault();const module=window.FasAuctionHistory;if(typeof module?.openPurchases!=='function'){toast('Раздел покупок загружается. Попробуйте ещё раз.');return}const returnTab=dashboardTab;navigate(subpage(()=>module.openPurchases({onBack:()=>openDashboard(returnTab)})));return}
  if(target.matches('[data-cabinet-return]')){event.preventDefault();const tab=target.dataset.cabinetReturn;navigate(()=>openDashboard(tab));return}
  if(target.matches('[data-seller-bids]')){event.preventDefault();const module=window.FasAuctionNotifications;if(typeof module?.openMyBids==='function'){const returnTab=dashboardTab;navigate(subpage(()=>module.openMyBids({onBack:()=>openDashboard(returnTab)})))}else toast('Раздел ставок загружается. Попробуйте ещё раз.');return}
  if(target.matches('[data-seller-tab]')){if(dashboardTab==='profile'&&target.dataset.sellerTab==='all')back();else navigate(()=>openDashboard(target.dataset.sellerTab));return}
  if(target.matches('[data-seller-edit]')){navigate(()=>openEditor(target.dataset.sellerEdit));return}
  if(target.matches('[data-seller-copy]')){navigate(()=>openEditor(target.dataset.sellerCopy,true));return}
  if(target.matches('[data-seller-save]')){saveDraft(true);return}
  if(target.matches('[data-seller-editor-delete]')){event.preventDefault();await requestEditorDraftDelete(target);return}
  if(target.matches('[data-seller-delete]')){event.preventDefault();await requestDraftDelete(target.dataset.sellerDelete,target);return}
  if(target.matches('[data-seller-view]')){navigate(()=>openCar(Number(target.dataset.sellerView)));return}
  if(target.matches('[data-seller-status]')){changeStatus(target.dataset.sellerStatus,target.dataset.nextStatus);return}
  if(target.matches('[data-seller-archive]')){event.preventDefault();archiveLot(target.dataset.sellerArchive);return}
  if(target.matches('[data-seller-favorites]')){navigate(()=>{qs('#modal').close();setTab('fav');qs('#lot-results').scrollIntoView?.({block:'start'})});return}
  if(target.matches('[data-seller-subscriptions]')){navigate(subpage(()=>openSubscriptions()));return}
  if(target.matches('[data-seller-sms]')){navigate(()=>openPhoneAuth());return}
  if(target.matches('[data-seller-buy-now]')){buyNow(target.dataset.sellerBuyNow);return}
  if(target.matches('[data-seller-confirm-buy]')){const lot=cars.find(c=>c.id===Number(target.dataset.sellerConfirmBuy));if(own(lot)){toast('Это ваше объявление. Купить собственный лот нельзя.');return}if(lot?.sellerOwnerId&&state(lot)==='live'&&buyNowAvailable(lot)){try{writeLots(cars.map(c=>c.id===lot.id?{...c,status:'sold',soldPrice:lot.buyNowPrice,soldAt:stamp()}:c));try{window.FasAuctionHistory?.recordDemoPurchase(cars.find(item=>item.id===lot.id))}catch{}qs('#modal').close();toast('Демопокупка завершена на этом устройстве. Деньги не списаны.')}catch(error){setError(['stale-auction-storage','seller-workspace-conflict','auction-storage-unavailable'].includes(error?.code)?error.message:'Не удалось сохранить демопокупку')}}return}
  for(const [attribute,delta] of [['sellerMediaUp',-1],['sellerMediaDown',1],['sellerMediaRemove',0]])if(target.dataset[attribute]&&editor){const currentEditor=editor,index=editor.refs.findIndex(ref=>ref.id===target.dataset[attribute]);if(index<0)return;const previous=[...editor.refs],removed=editor.refs[index];if(delta){const next=index+delta;if(next<0||next>=editor.refs.length)return;[editor.refs[index],editor.refs[next]]=[editor.refs[next],editor.refs[index]]}else editor.refs.splice(index,1);if(!saveDraft(false))editor.refs=previous;else if(!delta)await M.deleteMedia([removed.id],workspace.profile.id,{keepRefs:allDrafts().flatMap(d=>d.mediaRefs||[])}).catch(()=>{if(editor===currentEditor)setError('Материал убран из черновика, но освободить память не удалось.')});if(editor===currentEditor)renderMedia();return}
 });
 qs('#account').onclick=()=>navigate(()=>openDashboard());qs('#account').setAttribute('aria-label','Личный кабинет');const accountText=qs('#account span');if(accountText)accountText.textContent='Кабинет';qs('#reels-login').onclick=()=>navigate(()=>openDashboard());qs('#reels-login').textContent='Кабинет';qs('#reels-login').setAttribute('aria-label','Личный кабинет');
 window.FasSellerUI=Object.freeze({openDashboard,openEditor,leave,back,prepareNavigation,requestClose,details,purchaseActions,getProfile:()=>clone(workspace.profile)});
 if(cars.some(c=>c.sellerOwnerId&&c.mediaRefs?.length))M.hydrateLots(cars).then(()=>refreshCatalog()).catch(()=>toast('Часть локальных файлов недоступна. Добавьте их снова в кабинете.'));
 window.addEventListener('fas-seller-media-restored',()=>{refreshCatalog();if(editor)renderMedia()});
 window.addEventListener('pagehide',()=>{cancelSellerLocation();if(editor)saveDraft(false)});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelSellerLocation();if(editor)saveDraft(false)}});
 stateSnapshot=auctionFingerprint();setInterval(()=>{if(!document.hidden&&auctionFingerprint()!==stateSnapshot)refreshCatalog()},15000);
})();
