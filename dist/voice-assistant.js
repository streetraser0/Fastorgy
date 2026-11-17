/* Browser speech input and local site commands; bid submission always requires a button confirmation. */
(()=>{
 'use strict';
 if(window.FasVoiceAssistant)return;
 const icon=name=>typeof uiIcon==='function'?uiIcon(name):'';
 const dialog=document.createElement('dialog');dialog.id='voice-dialog';dialog.className='voice-dialog';dialog.setAttribute('aria-labelledby','voice-title');
 dialog.innerHTML=`<div class="voice-shell"><header class="voice-header"><img src="assets/brand/fas-torgi-logo.png?v=20261116-gradient1" alt="ФАС торги — Федеральная аукционная сеть" width="152" height="95"><button type="button" class="voice-settings" data-voice-settings hidden>Настройки</button><button type="button" class="voice-close" data-voice-close aria-label="Закрыть голосовой помощник">${icon('close')||'×'}</button></header><div class="voice-body"><h2 id="voice-title">Голосовой помощник</h2><p class="voice-intro">Поиск, разделы и настройки. Ставка — только после вашего подтверждения.</p><div class="voice-listening-animation" data-voice-animation aria-hidden="true" hidden><span></span><span></span><span></span><span></span><span></span></div><div class="voice-controls voice-listen-controls"><label for="voice-language">Язык речи<select id="voice-language"><option value="ru-RU">Русский</option><option value="en-US">English</option></select></label><button type="button" class="voice-start" data-voice-start>Говорить</button><button type="button" class="voice-stop" data-voice-stop disabled>Остановить</button></div><p id="voice-status" class="voice-status" role="status" aria-live="polite"></p><p id="voice-interim" class="voice-interim" aria-live="off"></p><p id="voice-error" class="voice-error" role="alert" hidden></p><div class="voice-quick-actions" data-voice-quick-actions hidden><button type="button" class="outline" data-voice-type>Написать запрос</button></div><form id="voice-form"><label for="voice-command">Запрос или команда</label><textarea id="voice-command" rows="3" maxlength="500" autocomplete="off" placeholder="Например: найди Toyota Camry"></textarea><button type="submit" class="primary voice-apply">Выполнить</button></form><div class="voice-controls voice-model-controls"><button type="button" class="outline" data-local-ai-open>ИИ на устройстве · бесплатно</button></div><p class="voice-note voice-model-note">Для свободных фраз: включается отдельно, первое скачивание — около 150 МБ.</p><section id="voice-bid-preview" class="voice-status" aria-labelledby="voice-bid-title" hidden><h3 id="voice-bid-title">Проверьте демоставку</h3><p id="voice-bid-lot"></p><p id="voice-bid-amount"></p><p id="voice-bid-quote"></p><p>Деньги не списываются. Отправка — только по кнопке ниже.</p><div class="voice-controls"><button type="button" class="primary" data-voice-confirm-bid>Подтвердить демоставку</button><button type="button" class="outline" data-voice-cancel-bid>Отмена</button></div></section><details id="voice-preferences"><summary>Настройки помощника и уведомлений</summary><div data-assistant-preferences-panel tabindex="-1"></div></details><label class="voice-speak"><input id="voice-auto-execute" type="checkbox"><span>Выполнять безопасные команды после распознавания</span></label><details id="voice-personalization"><summary>Имя и голос помощника</summary><div data-assistant-personalization-mount></div></details><p class="voice-examples">Например: «Найди Камри не старше 2020 года с пробегом до 150 тысяч км», затем «Только автомат» или «А теперь дешевле». Также: «Открой кабинет», «Мои ставки», «На главную», «Подготовь ставку 1,5 миллиона».</p><label class="voice-speak"><input id="voice-speak" type="checkbox"><span>Озвучивать ответы</span></label><small class="voice-note voice-platform-note">Распознавание выполняет браузер. Для микрофона потребуется ваше разрешение. Запрос можно ввести вручную.</small></div></div>`;
 document.body.appendChild(dialog);
 const field=id=>dialog.querySelector('#'+id),startButton=dialog.querySelector('[data-voice-start]'),stopButton=dialog.querySelector('[data-voice-stop]');
 let origin=null,recognition=null,epoch=0,listening=false,starting=false,lastCommand=null,lastSearch=null,lastFeedback='',pendingBid=null,replyGreeting='',quick=false,closedCleaned=true;
 const Recognition=()=>window.SpeechRecognition||window.webkitSpeechRecognition;
 function status(text){field('voice-status').textContent=text}
 function error(text=''){field('voice-error').textContent=text;field('voice-error').hidden=!text}
 function setQuick(value){
  quick=value===true;dialog.classList.toggle('voice-quick',quick);dialog.querySelector('[data-voice-settings]').hidden=!quick;dialog.querySelector('[data-voice-quick-actions]').hidden=!quick;
  if(quick){field('voice-preferences').open=false;field('voice-personalization').open=false}
  sync();
 }
 function isTop(){try{if(typeof window.FasDialogLifecycle?.top==='function')return window.FasDialogLifecycle.top()===dialog;return Array.from(document.querySelectorAll('dialog[open]')).filter(node=>node.open).at(-1)===dialog}catch{return false}}
 function sync(){const supported=typeof Recognition()==='function',active=starting||listening;startButton.disabled=!supported||active;stopButton.disabled=!active;dialog.querySelector('.voice-apply').disabled=active;startButton.setAttribute('aria-pressed',String(listening));dialog.classList.toggle('voice-listening',active);dialog.querySelector('[data-voice-animation]').hidden=!quick||!active;return supported}
 function stop(){
  epoch++;const previous=recognition;recognition=null;starting=false;listening=false;
  if(previous){try{if(typeof previous.abort==='function')previous.abort();else previous.stop?.()}catch{}}
  field('voice-interim').textContent='';sync();
 }
 function recognitionCurrent(version,instance){
  const current=()=>dialog.open&&document.hidden!==true&&epoch===version&&recognition===instance;if(!current())return false;
  // Refresh the real local-profile scope before accepting a late ASR result.
  // This may synchronously cancel the recognizer before a storage event arrives.
  try{window.FasAssistantPersonalization?.getGreeting?.()}catch{stop();return false}
  if(!current())return false;if(!isTop()){stop();return false}return true;
 }
 const errors={
  'not-allowed':'Доступ к микрофону запрещён. Разрешите его в настройках браузера или введите запрос.',
  'service-not-allowed':'Голосовой ввод недоступен в этом браузере. Введите запрос вручную.',
  'no-speech':'Речь не распознана. Попробуйте ещё раз или введите запрос.',
  'audio-capture':'Микрофон недоступен. Проверьте подключение или введите запрос.',
  network:'Сервис распознавания сейчас недоступен. Попробуйте позже или введите запрос.',
  'language-not-supported':'Этот язык не поддерживается распознаванием. Выберите другой или введите запрос.'
 };
 function start(){
  if(!dialog.open||document.hidden===true||starting||listening||!isTop())return false;
  setQuick(true);
  window.FasAssistantPreferences?.pauseSpeech?.();
  try{window.speechSynthesis?.cancel?.()}catch{}
  clearBid();
  const Constructor=Recognition();if(typeof Constructor!=='function'){status('Браузер не поддерживает голосовой ввод. Введите запрос ниже.');sync();field('voice-command').focus?.({preventScroll:true});return false}
  error();field('voice-interim').textContent='';const version=++epoch;let instance;
  try{instance=new Constructor()}catch{error('Не удалось запустить распознавание. Введите запрос вручную.');sync();field('voice-command').focus?.({preventScroll:true});return false}
  recognition=instance;starting=true;instance.lang=field('voice-language').value==='en-US'?'en-US':'ru-RU';instance.continuous=false;instance.interimResults=true;instance.maxAlternatives=1;
  instance.onstart=()=>{if(!recognitionCurrent(version,instance))return;starting=false;listening=true;status('Слушаю… Скажите запрос.');sync();stopButton.focus?.({preventScroll:true})};
  instance.onresult=event=>{
   if(!recognitionCurrent(version,instance))return;
   let final='',interim='';
   for(let i=0;i<(event.results?.length||0);i++){const result=event.results[i],text=String(result?.[0]?.transcript||'').trim();if(result?.isFinal)final+=(final?' ':'')+text;else interim+=(interim?' ':'')+text}
   if(interim)field('voice-interim').textContent=interim.slice(0,500);
   if(final){field('voice-command').value=final.slice(0,500);stop();if(field('voice-auto-execute').checked)execute(final);else{status('Запрос распознан. Проверьте его и нажмите «Выполнить».');dialog.querySelector('.voice-apply').focus?.({preventScroll:true})}}
  };
  instance.onerror=event=>{if(!recognitionCurrent(version,instance))return;const message=errors[event?.error]||'Не удалось распознать речь. Попробуйте ещё раз или введите запрос.';stop();if(event?.error!=='aborted')error(message);status('Можно повторить голосовой ввод или напечатать запрос.');field('voice-command').focus?.({preventScroll:true})};
  instance.onend=()=>{if(!recognitionCurrent(version,instance))return;recognition=null;starting=false;listening=false;field('voice-interim').textContent='';status(field('voice-command').value.trim()?'Проверьте запрос и нажмите «Выполнить».':'Нажмите «Говорить» или введите запрос.');sync();(field('voice-command').value.trim()?dialog.querySelector('.voice-apply'):startButton).focus?.({preventScroll:true})};
  status('Подключаем микрофон…');sync();stopButton.focus?.({preventScroll:true});
  try{instance.start();return true}catch(reason){if(recognitionCurrent(version,instance)){stop();error(errors[reason?.error]||errors[reason?.name==='NotAllowedError'?'not-allowed':'']||'Не удалось начать запись. Попробуйте ещё раз или введите запрос.');field('voice-command').focus?.({preventScroll:true})}return false}
 }
 function speak(text){
  const message=replyGreeting?replyGreeting+' '+text:text;replyGreeting='';
  if(!field('voice-speak').checked||typeof window.SpeechSynthesisUtterance!=='function'||!window.speechSynthesis?.speak)return;
  try{window.speechSynthesis.cancel?.();const utterance=new window.SpeechSynthesisUtterance(message);utterance.lang=field('voice-language').value==='en-US'?'en-US':'ru-RU';window.FasAssistantPersonalization?.decorateUtterance?.(utterance);window.speechSynthesis.speak(utterance)}catch{}
 }
 function mainModal(){return document.querySelector('#modal')}
 function currentLot(){const modal=mainModal();if(!modal?.open||!modal.classList.contains('lot-dialog'))return null;const id=Number(modal.querySelector?.('[data-open-lot-id]')?.dataset.openLotId||modal.querySelector?.('#bid-form')?.dataset.lotId);return typeof cars!=='undefined'&&Array.isArray(cars)?cars.find(lot=>lot.id===id)||null:null}
 function lotStatus(kind){
  const lot=currentLot();let message='';
  if(kind==='outbid'){
   const summary=window.FasAuctionNotifications?.bidSummary?.();if(!summary||!Array.isArray(summary.rows)){error('Сведения о ваших ставках сейчас недоступны. Откройте «Мои ставки» в кабинете.');return {ok:false,action:'lot_status',kind}}
   const row=lot?summary.rows.find(row=>row.id===lot.id):null;
   if(lot&&!row)message='В этом браузере нет вашей ставки по текущему лоту.';
   else if(row)message=row.status==='outbid'?'По полученным данным вашу ставку '+row.ownPrice.toLocaleString('ru-RU')+' ₽ перебили. Текущая цена — '+row.currentPrice.toLocaleString('ru-RU')+' ₽.':row.status==='leading'?'По полученным данным ваша ставка лидирует. Это не подтверждение победы.':row.status==='ended'?'Торги по лоту завершены. Победа и оплата этими данными не подтверждены.':'Сейчас лот недоступен для новой ставки.';
   else message=summary.outbidCount?'По полученным данным ваши ставки перебили в '+summary.outbidCount+' лотах. Подробности — в разделе «Мои ставки».':summary.total?'По полученным данным перебитых ставок сейчас нет.':'В этом браузере у вас пока нет ставок.';
  }else{
   if(!lot){error('Сначала откройте карточку лота, чтобы посмотреть его цену или срок торгов.');return {ok:false,action:'lot_status',kind}}
   if(kind==='price'){const price=typeof current==='function'?current(lot):null;if(!Number.isSafeInteger(price)||price<=0){error('Корректная текущая цена этого лота сейчас недоступна.');return {ok:false,action:'lot_status',kind}}message='Текущая цена лота № '+lot.id+' — '+price.toLocaleString('ru-RU')+' ₽. Это данные текущего каталога.'}
   else{const end=Date.parse(lot.ends);if(!Number.isFinite(end)){error('Срок окончания этого лота не указан.');return {ok:false,action:'lot_status',kind}}message=end<=Date.now()?'Срок торгов по этому лоту истёк. Это не подтверждение победы или оплаты.':'Торги по лоту № '+lot.id+' заканчиваются '+new Date(end).toLocaleString('ru-RU')+'.'}
  }
  status(message);speak(message);return {ok:true,action:'lot_status',kind,lotId:lot?.id||null,message};
 }
 function syncPreferences(){const panel=dialog.querySelector('[data-assistant-preferences-panel]');if(panel)panel.innerHTML=window.FasAssistantPreferences?.settingsHTML?.()||'<p>Настройки уведомлений сейчас недоступны. Откройте их в кабинете.</p>'}
 function syncPersonalization(){const panel=dialog.querySelector('[data-assistant-personalization-mount]');if(panel)panel.innerHTML=window.FasAssistantPersonalization?.settingsHTML?.()||'<p>Персональные настройки сейчас недоступны.</p>'}
 function clearBid(){pendingBid=null;field('voice-bid-preview').hidden=true}
 function bidProfile(){try{return typeof window.FasSellerUI?.getProfile==='function'?window.FasSellerUI.getProfile()?.id:undefined}catch{return undefined}}
 function bidContext(){
  const modal=mainModal(),form=modal?.querySelector?.('#bid-form'),input=modal?.querySelector?.('#bid');
  if(!modal?.open||!modal.classList.contains('lot-dialog')||!form?.fasBidToken||!input||input.disabled)return null;
  if(Array.from(document.querySelectorAll('dialog[open]')).some(layer=>layer!==modal&&layer!==dialog&&layer.open))return null;
  const id=Number(form.dataset.lotId),lot=typeof cars!=='undefined'&&Array.isArray(cars)?cars.find(item=>item.id===id):null,profile=bidProfile();
  if(!lot||profile===undefined||typeof current!=='function'||typeof demoBidError!=='function'||typeof nextLotBid!=='function')return null;
  const quote=current(lot),minimum=nextLotBid(lot);if(!Number.isSafeInteger(quote)||quote<=0||!Number.isSafeInteger(minimum)||minimum<=0)return null;
  return {modal,form,input,id,lot,profile,quote,minimum,token:form.fasBidToken,terms:JSON.stringify([lot.ends,lot.sellerOwnerId||'',lot.auctionDirection||'ascending',typeof bidIncrement==='function'?bidIncrement(lot):lot.step])};
 }
 function showBid(context,amount){
  pendingBid={...context,amount};field('voice-bid-lot').textContent='Лот № '+context.id+' · '+String(context.lot.name||'Имущество');
  field('voice-bid-amount').textContent='Ваша демоставка: '+amount.toLocaleString('ru-RU')+' ₽';field('voice-bid-quote').textContent='Текущая цена: '+context.quote.toLocaleString('ru-RU')+' ₽ · Следующая ставка от '+context.minimum.toLocaleString('ru-RU')+' ₽';field('voice-bid-preview').hidden=false;
 }
 function prepareBid(amount){
  clearBid();const context=bidContext();
  if(!context){error('Сначала откройте доступный лот с формой ставки. Покупка и ставки голосом автоматически не выполняются.');return {ok:false,action:'blocked'}}
  const message=demoBidError(context.lot,amount);if(!Number.isSafeInteger(amount)||amount<=0||message){error(message||'Укажите положительную целую сумму демоставки.');return {ok:false,action:'prepare_bid'}}
  showBid(context,amount);status('Демоставка подготовлена. Проверьте лот и сумму. Для отправки нажмите «Подтвердить демоставку».');speak('Подготовлена демоставка '+amount.toLocaleString('ru-RU')+' рублей. Проверьте лот и подтвердите сумму кнопкой.');return {ok:true,action:'prepare_bid',lotId:context.id,amount};
 }
 function confirmBid(){
  const pending=pendingBid;if(!pending||!dialog.open)return false;
  const context=bidContext();
  if(!context||context.form!==pending.form||context.token!==pending.token||context.lot!==pending.lot||context.profile!==pending.profile){clearBid();error('Окно, лот или профиль изменились. Подготовьте ставку заново.');return false}
  const problem=demoBidError(context.lot,pending.amount);if(problem){clearBid();error(problem);return false}
  if(context.quote!==pending.quote||context.minimum!==pending.minimum||context.terms!==pending.terms){showBid(context,pending.amount);error('Условия торгов обновились. Проверьте новую цену и подтвердите ставку ещё раз.');return false}
  const amount=pending.amount;close();
  // Closing the helper may run focus/dialog hooks. Check the real form again
  // before sending it through the same final handler as a manual bid.
  const latest=bidContext();if(!latest||latest.form!==context.form||latest.token!==context.token||latest.lot!==context.lot||latest.profile!==context.profile||latest.quote!==context.quote||latest.minimum!==context.minimum||latest.terms!==context.terms){open();error('Условия изменились при переходе. Подготовьте ставку заново.');return false}
  latest.input.value=String(amount);
  if(typeof latest.form.requestSubmit==='function')latest.form.requestSubmit();else if(typeof latest.form.onsubmit==='function')latest.form.onsubmit({preventDefault(){},target:latest.form,currentTarget:latest.form});else{open();error('Форма ставки сейчас недоступна.');return false}
  return true;
 }
 function closeLauncher(){const modal=mainModal();if(modal?.open&&modal.querySelector?.('.feed-menu'))modal.close()}
 function closeMain(){const modal=mainModal();if(!modal?.open)return true;if(modal.classList?.contains('seller-dialog'))return window.FasSellerUI?.requestClose?.()===true;modal.close();return true}
 function catalogue(){if(!closeMain())return false;if(typeof reelsMode!=='undefined'&&reelsMode&&typeof setReels==='function')setReels(false);if(typeof setTab==='function')setTab('all');document.querySelector('#lot-results')?.scrollIntoView?.({block:'start'});return true}
 const numberWords={ноль:0,один:1,одна:1,одного:1,одной:1,два:2,две:2,двух:2,три:3,трех:3,четыре:4,четырех:4,пять:5,пяти:5,шесть:6,шести:6,семь:7,семи:7,восемь:8,восьми:8,девять:9,девяти:9,десять:10,десяти:10,одиннадцать:11,одиннадцати:11,двенадцать:12,двенадцати:12,тринадцать:13,тринадцати:13,четырнадцать:14,четырнадцати:14,пятнадцать:15,пятнадцати:15,шестнадцать:16,шестнадцати:16,семнадцать:17,семнадцати:17,восемнадцать:18,восемнадцати:18,девятнадцать:19,девятнадцати:19,двадцать:20,двадцати:20,тридцать:30,тридцати:30,сорок:40,сорока:40,пятьдесят:50,пятидесяти:50,шестьдесят:60,шестидесяти:60,семьдесят:70,семидесяти:70,восемьдесят:80,восьмидесяти:80,девяносто:90,девяноста:90,сто:100,ста:100,двести:200,двухсот:200,триста:300,трехсот:300,четыреста:400,четырехсот:400,пятьсот:500,пятисот:500,шестьсот:600,шестисот:600,семьсот:700,семисот:700,восемьсот:800,восьмисот:800,девятьсот:900,девятисот:900,полтора:1.5,полторы:1.5,zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
 const clean=value=>String(value||'').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s+/g,' ').trim();
 function amountAt(value,measurement=false){
  if(window.FasQueryIntent)return window.FasQueryIntent.amountAt(value,measurement);
  let position=0,total=0,group=0,found=false,scale=0,currency=false,previousDigit=false;
  while(position<value.length){const gap=value.slice(position).match(position===0?/^[\s\u00a0]*/:/^[\s\u00a0-]*/)[0],start=position+gap.length,match=value.slice(start).match(/^(\d+(?:[.,]\d+)?|[a-zа-яё]+|₽)/i);if(!match)break;const token=clean(match[0]);let accepted=true;
   if(/^\d/.test(token)){if(previousDigit&&gap.includes('-'))break;const number=Number(token.replace(',','.'));group=previousDigit&&/^\d{3}$/.test(token)?group*1000+number:group+number;previousDigit=true;found=true}
   else if(Object.hasOwn(numberWords,token)){group+=numberWords[token];previousDigit=false;found=true}
   else if(token==='hundred'){if(!found)break;group=Math.max(1,group)*100;previousDigit=false}
   else if(/^(?:тысяч(?:а|и|у)?|тыс|thousand|k)$/.test(token)||/^(?:миллион(?:а|ов)?|млн|million|m)$/.test(token)||/^(?:миллиард(?:а|ов)?|млрд|billion)$/.test(token)){if(!found||measurement&&token==='m')break;scale=/^(?:ты|thousand|k$)/.test(token)?1000:/^(?:миллиард|млрд|billion)/.test(token)?1000000000:1000000;total+=Math.max(1,group)*scale;group=0;previousDigit=false;if(/^(?:тыс|млн|млрд)$/.test(token)&&value[start+match[0].length]==='.')match[0]+='.'}
   else if(/^(?:руб(?:ль|ля|лей)?|rub(?:les?)?|roubles?|₽)$/.test(token)){if(!found)break;currency=true;position=start+match[0].length;break}
   else accepted=false;
   if(!accepted)break;position=start+match[0].length;
  }
  return found?{value:total+group,end:position,scale,currency}:null;
 }
 function locationIntent(query){
  const shared=window.FasQueryIntent?.locationIntent(query,{cities:typeof CITY_CENTERS==='object'?CITY_CENTERS:{},capitals:typeof REGION_CAPITALS==='object'?REGION_CAPITALS:{},regions:typeof RF_REGIONS!=='undefined'?RF_REGIONS:[]});if(shared?.city||shared?.regionCode)return shared;
  // The inventory fallback below only accepts a location after these words.
  // Ordinary searches do not need to inspect every lot's city.
  if(!/(^|[\s,])(?:в|из|около|рядом с|in|near|around|from)\s+/i.test(query))return {query};
  const entries=[],cities=typeof CITY_CENTERS==='object'?CITY_CENTERS:{},capitals=typeof REGION_CAPITALS==='object'?REGION_CAPITALS:{},regions=typeof RF_REGIONS!=='undefined'&&Array.isArray(RF_REGIONS)?RF_REGIONS:[];
  const english={Москва:['moscow'],Воронеж:['voronezh'], 'Санкт-Петербург':['saint petersburg','st petersburg'],Казань:['kazan'],Краснодар:['krasnodar'], 'Ростов-на-Дону':['rostov-on-don','rostov on don'],Екатеринбург:['yekaterinburg','ekaterinburg'],Новосибирск:['novosibirsk'],Самара:['samara'],Уфа:['ufa'],Пермь:['perm'],Омск:['omsk'],Тюмень:['tyumen'],Хабаровск:['khabarovsk'],Владивосток:['vladivostok']};
  const cityRegions=new Map(),capitalCodes=new Map(Object.entries(capitals).map(([code,city])=>[city,code]));
  if(typeof cars!=='undefined')for(const lot of cars){if(typeof lot.city!=='string'||!lot.city.trim())continue;if(!cityRegions.has(lot.city))cityRegions.set(lot.city,new Set());const code=typeof getRegionCode==='function'?getRegionCode(lot):lot.regionCode;if(code)cityRegions.get(lot.city).add(code)}
  const knownCities=new Set([...Object.keys(cities),...Object.values(capitals),...cityRegions.keys()]);
  for(const city of knownCities){const codes=cityRegions.get(city),regionCode=capitalCodes.get(city)||(codes?.size===1?[...codes][0]:'');
   const base=clean(city),aliases=[base,...(english[city]||[])];if(base.endsWith('а'))aliases.push(base.slice(0,-1)+'е',base.slice(0,-1)+'у');else if(base.endsWith('ь'))aliases.push(base.slice(0,-1)+'и');else if(base.endsWith('ки'))aliases.push(base.slice(0,-1)+'ах');else if(!/[уыиоея]$/.test(base))aliases.push(base+'е');if(city==='Нижний Новгород')aliases.push('нижнем новгороде');for(const alias of aliases)entries.push({alias,city,regionCode});
  }
  for(const region of regions){const base=clean(region.name),inflected=base.replace(/ская/g,'ской').replace(/ский/g,'ском').replace(/область/g,'области').replace(/республика/g,'республике');entries.push({alias:base,regionCode:region.code},{alias:inflected,regionCode:region.code})}
  entries.sort((a,b)=>b.alias.length-a.alias.length);
  for(const entry of entries){const escaped=entry.alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),match=new RegExp('(^|[\\s,])(?:в|из|около|рядом с|in|near|around|from)\\s+'+escaped+'(?![a-zа-яё0-9])','i').exec(query);if(match)return {...entry,query:query.slice(0,match.index)+' '+query.slice(match.index+match[0].length)}}
  return {query};
 }
 const quantityFields=[
  {key:'year',label:'Год',prefix:'(?:год(?:а|у|ы)?(?: выпуска)?|model year|years?)',unit:'(?:год(?:а|у|ов|ы)?|г\\.?|years?)',integer:true,min:1886,max:()=>new Date().getFullYear()+1},
  {key:'mileage',label:'Пробег',prefix:'(?:(?:с )?пробег(?:ом|а)?|mileage)',unit:'(?:км|километр(?:а|ов)?|kilomet(?:er|re)s?|km)',suffixUnit:'(?:км|километр(?:а|ов)?|kilomet(?:er|re)s?|km) (?:пробега|mileage)',integer:true,min:0},
  {key:'area',label:'Площадь',prefix:'(?:(?:с )?площад(?:ь|ью|и)|(?:floor )?area)',unit:'(?:м[²2]|м\\^2|кв\\.?\\s*м(?:етр(?:а|ов)?)?\\.?|квадратн(?:ых|ые|ый|ого) метр(?:а|ов)?|m[²2]|m\\^2|sq\\.?\\s*m|square met(?:er|re)s?)',min:Number.MIN_VALUE},
  {key:'rooms',label:'Количество комнат',prefix:'(?:(?:количество|число) комнат|комнат(?:ы)?|rooms?)',unit:'(?:комнат(?:а|ы|у)?|rooms?)',integer:true,min:0}
 ];
 const tokenEnd='(?![a-zа-яё0-9])';
 function quantityAt(value,unit){
  if(window.FasQueryIntent)return window.FasQueryIntent.quantityAt(value,unit);
  const leading=value.match(/^\s*(?:(?:[:=]|of)\s*)?/)[0];let start=leading.length;
  const operator=value.slice(start).match(/^(?:(от|с|from|since|between|at least|не менее|не ниже|минимум)|(до|under|up to|at most|не более|не выше|максимум))\s+/i);if(operator)start+=operator[0].length;
  const sign=value[start]==='-'?-1:1;if(sign<0)start++;const first=amountAt(value.slice(start),true);if(!first||first.currency)return null;let end=start+first.end,low=first.value*sign,high=first.value*sign;
  const firstUnit=value.slice(end).match(new RegExp('^\\s*'+unit+tokenEnd,'i'));if(firstUnit)end+=firstUnit[0].length;
  const connector=value.slice(end).match(/^\s*(?:до|to|and|[-–—])\s*/i);
  if(connector&&!operator?.[2]){const second=amountAt(value.slice(end+connector[0].length),true);if(second&&!second.currency){if(!first.scale&&!firstUnit&&second.scale&&low<=second.value/second.scale)low*=second.scale;high=second.value;end+=connector[0].length+second.end;return {min:low,max:high,end,unit:!!firstUnit}}}
  return {...(operator?.[1]?{min:low}:operator?.[2]?{max:high}:{min:low,max:high}),end,unit:!!firstUnit};
 }
 function rangeError(criteria){
  for(const [key,label]of [['price','Цена'],...quantityFields.map(field=>[field.key,field.label])])if(criteria[key+'Min']!==undefined&&criteria[key+'Max']!==undefined&&criteria[key+'Min']>criteria[key+'Max'])return label+': значение «от» не может быть больше «до». Уточните диапазон.';
  return '';
 }
 function extractQuantities(input,criteria){
  if(window.FasQueryIntent)return window.FasQueryIntent.extractQuantities(input,criteria,{keys:['year','mileage','area','rooms']});
  let query=input,message='';
  const assign=(field,spec)=>{for(const suffix of ['Min','Max']){const value=spec[suffix.toLowerCase()];if(value===undefined)continue;if(!Number.isFinite(value)||value<field.min||value>Number.MAX_SAFE_INTEGER||field.integer&&!Number.isSafeInteger(value)||field.max&&value>field.max()){message=field.label+': укажите корректное '+(field.key==='year'?'значение от 1886 до '+field.max():'неотрицательное число')+'.';return}const key=field.key+suffix;criteria[key]=criteria[key]===undefined?value:suffix==='Min'?Math.max(criteria[key],value):Math.min(criteria[key],value)}};
  query=query.replace(/(^|[\s,])(?:не стар(?:ше|ее)|не раньше|not older than|no older than)\s+(\d{4})(?:\s*(?:год(?:а|у)?|г\.?|years?))?(?![a-zа-яё0-9])/ig,(whole,prefix,value)=>{assign(quantityFields[0],{min:Number(value)});return prefix});
  query=query.replace(/(^|[\s,])(?:не новее|не позже|not newer than|no newer than)\s+(\d{4})(?:\s*(?:год(?:а|у)?|г\.?|years?))?(?![a-zа-яё0-9])/ig,(whole,prefix,value)=>{assign(quantityFields[0],{max:Number(value)});return prefix});
  for(const field of quantityFields){
   const prefix=new RegExp('(^|[\\s,])'+field.prefix+tokenEnd,'ig');let match;
   while((match=prefix.exec(query))){if(field.suffixUnit&&new RegExp(field.unit+'\\s*$','i').test(query.slice(0,match.index)))continue;const start=match.index+match[0].length,spec=quantityAt(query.slice(start),field.unit);if(!spec)continue;const tail=query.slice(start+spec.end).match(new RegExp('^\\s*'+field.unit+tokenEnd,'i'));assign(field,spec);query=query.slice(0,match.index)+' '+query.slice(start+spec.end+(tail?.[0].length||0));prefix.lastIndex=0}
   const suffixUnit=field.suffixUnit||field.unit;
   const boundary=/(^|[\s,])/g;
   while((match=boundary.exec(query))){if(boundary.lastIndex<=match.index)boundary.lastIndex=match.index+1;const start=match.index+match[0].length,spec=quantityAt(query.slice(start),suffixUnit);if(!spec)continue;const tail=query.slice(start+spec.end).match(new RegExp('^\\s*'+suffixUnit+tokenEnd,'i'));if(!tail&&!spec.unit)continue;assign(field,spec);query=query.slice(0,match.index)+' '+query.slice(start+spec.end+(tail?.[0].length||0));boundary.lastIndex=0}
  }
  return {query,message:message||rangeError(criteria)};
 }
 const enumPhrases=[
  ['fuel','diesel','(?:(?:топливо|только) дизель(?:ное|ный)?|на дизеле|(?:fuel|only) diesel|diesel (?:fuel|engine))'],
  ['fuel','petrol','(?:(?:топливо|только) бензин(?:овое|овый)?|на бензине|(?:fuel|only) (?:petrol|gasoline)|(?:petrol|gasoline) (?:fuel|engine))'],
  ['fuel','electric','(?:(?:топливо|только) электрич(?:ество|еский|еское)|на электричестве|(?:fuel|only) electric|electric (?:fuel|engine))'],
  ['fuel','hybrid','(?:(?:топливо|только) гибрид(?:ное|ный)?|(?:fuel|only) hybrid|hybrid (?:fuel|engine))'],
  ['transmission','auto','(?:(?:(?:коробка(?: передач)?|трансмиссия|только) (?:автомат(?:ическая)?|акпп))|на автомате|с автоматической коробкой(?: передач)?|(?:transmission|gearbox|only) (?:automatic|auto)|(?:with )?automatic (?:transmission|gearbox))'],
  ['transmission','manual','(?:(?:(?:коробка(?: передач)?|трансмиссия|только) (?:механик(?:а|ческая)|мкпп))|на механике|с механической коробкой(?: передач)?|(?:transmission|gearbox|only) manual|(?:with )?manual (?:transmission|gearbox))'],
  ['condition','new','(?:состояние новое|только нов(?:ые|ое|ый|ая)|в новом состоянии|condition new|new condition|only new)'],
  ['condition','used','(?:состояние (?:б/у|бывшее в эксплуатации)|только (?:б/у|подержанные)|condition used|used condition|only used)'],
  ['condition','repair','(?:(?:состояние )?требует ремонта|под ремонт|condition (?:repair|needs repair)|needs repair)']
 ];
 function extractEnums(input,criteria){let query=input,message='';for(const [key,value,phrase]of enumPhrases)query=query.replace(new RegExp('(^|[\\s,])'+phrase+tokenEnd,'ig'),(whole,prefix,offset)=>{if(/(?:^|[\s,])(?:не|без|кроме|not|except|without)$/.test(clean(query.slice(0,offset))))return whole;if(criteria[key]&&criteria[key]!==value)message='Указаны несовместимые значения параметра. Уточните топливо, коробку передач или состояние.';criteria[key]=value;return prefix});return {query,message}}
 function describeCriteria(criteria){
  const parts=[{nearest:'Сначала ближайшие',low:'Сначала дешевле',high:'Сначала дороже',popular:'Сначала популярные'}[criteria.sort]].filter(Boolean);
  if(criteria.city)parts.push('Город: '+criteria.city);else if(criteria.regionCode&&typeof RF_REGIONS!=='undefined')parts.push('Регион: '+(RF_REGIONS.find(region=>region.code===criteria.regionCode)?.name||criteria.regionCode));if(criteria.radius)parts.push(criteria.radius==='gt1000'?'Расстояние: свыше 1000 км':'Радиус: '+criteria.radius+' км');
  for(const [key,label,unit]of [['price','Цена',' ₽'],['year','Год',''],['mileage','Пробег',' км'],['area','Площадь',' м²'],['rooms','Комнаты','']])for(const [suffix,word]of [['Min','от'],['Max','до']])if(criteria[key+suffix]!==undefined)parts.push(label+' '+word+' '+criteria[key+suffix].toLocaleString('ru-RU')+unit);
  const names={fuel:{diesel:'Дизель',petrol:'Бензин',electric:'Электричество',hybrid:'Гибрид'},transmission:{auto:'Автомат',manual:'Механика'},condition:{new:'Новое',used:'Бывшее в эксплуатации',repair:'Требует ремонта'}};for(const [key,label]of [['fuel','Топливо'],['transmission','Коробка'],['condition','Состояние']])if(criteria[key])parts.push(label+': '+names[key][criteria[key]]);return parts;
 }
 function refreshRadius(parsed){
  if(parsed.action!=='search'||!parsed.criteria?.radius)return parsed;let point=null;try{point=typeof userOrigin==='function'?userOrigin():null}catch{}
  if(!point){delete parsed.criteria.radius;parsed.applied=describeCriteria(parsed.criteria);const warning='Для радиуса выберите своё местоположение в разделе «Ваш регион». Разрешение геолокации не запрашивалось.';if(!parsed.warnings.includes(warning))parsed.warnings.push(warning)}return parsed;
 }
 function searchIntent(raw){
  let query=raw.replace(/^(?:пожалуйста[, ]+|please[, ]+)/i,'').replace(/^(?:хочу (?:найти|купить)|найди|найти|поищи|покажи|показать|ищи|ищу|мне нужен|мне нужна|мне нужно|search(?: for)?|find|show|i(?:'m| am) looking for)(?:\s+|[:：]\s*)/i,'').replace(/^(?:мне\s+|пожалуйста[, ]+|please[, ]+)/i,'').replace(/[, ]+(?:пожалуйста|please)[.!?]*$/i,'').replace(/\s+/g,' ').trim();if(window.FasQueryIntent)query=window.FasQueryIntent.normalizeInput(query);const criteria={sort:'nearest'},warnings=[];let sharedApplied=[],sharedSortSpecified=false;
  const refinement=/^(?:(?:а\s+)?теперь|а еще|and now|now|also)\s+/i.test(query);query=query.replace(/^(?:(?:а\s+)?теперь|а еще|and now|now|also)\s+/i,'');
  const validation=window.FasKeywordSearch?.compile(query)?.intent||window.FasQueryIntent?.parse(query,{cities:typeof CITY_CENTERS==='object'?CITY_CENTERS:{},capitals:typeof REGION_CAPITALS==='object'?REGION_CAPITALS:{},regions:typeof RF_REGIONS!=='undefined'?RF_REGIONS:[]});
  if(validation?.error)return {action:'invalid',message:validation.error};
  const quantities=extractQuantities(query,criteria);if(quantities.message)return {action:'invalid',message:quantities.message};query=quantities.query;
  const enums=extractEnums(query,criteria);if(enums.message)return {action:'invalid',message:enums.message};query=enums.query;
  // Mileage is removed before radius; distance is removed before money.
  query=query.replace(/(^|[\s,])(?:свыше|более|дальше|over|more than)\s+1000\s*(?:км|километр(?:а|ов)?|kilomet(?:er|re)s?|km)(?![a-zа-яё0-9])/ig,(whole,prefix)=>{let point=null;try{point=typeof userOrigin==='function'?userOrigin():null}catch{}if(point){criteria.radius='gt1000'}else warnings.push('Для радиуса выберите своё местоположение в разделе «Ваш регион». Разрешение геолокации не запрашивалось.');return prefix});
  query=query.replace(/(^|[\s,])(?:(?:(?:расширь|увеличь|уменьши|измени|expand|increase|reduce|change|set)\s+(?:the\s+)?)?(?:в\s+)?(?:радиусе?|radius)(?:\s+(?:до|to|of))?\s*|within\s+|до\s+)?(\d+(?:[.,]\d+)?)\s*(?:км|километр(?:а|ов)?|kilomet(?:er|re)s?|km)(?![a-zа-яё0-9])/ig,(whole,prefix,value)=>{const radius=Number(value.replace(',','.'));if([5,10,30,50,100,300,500,1000].includes(radius)){let originPoint=null;try{originPoint=typeof userOrigin==='function'?userOrigin():null}catch{}if(originPoint){criteria.radius=String(radius)}else warnings.push('Для радиуса выберите своё местоположение в разделе «Ваш регион». Разрешение геолокации не запрашивалось.')}else warnings.push('Доступные радиусы: 5, 10, 30, 50, 100, 300, 500 и 1000 км. Уточните расстояние.');return prefix});
  const location=locationIntent(query);query=location.query;if(location.city){criteria.city=location.city}if(location.regionCode)criteria.regionCode=location.regionCode;
  if(window.FasQueryIntent){const ordering=window.FasQueryIntent.extractSort(query);query=ordering.query;if(ordering.sort){criteria.sort=ordering.sort;sharedSortSpecified=true}}
  query=query.replace(/(?:сначала ближайшие|ближе ко мне|рядом со мной|near me|nearest first|closest first)/ig,' ');
  query=query.replace(/(?:сначала дешев(?:ые|ле)|по возрастанию цены|cheapest first|lowest price first|price low to high)/ig,()=>{criteria.sort='low';return ' '});
  query=query.replace(/(?:сначала дорогие|сначала дороже|по убыванию цены|most expensive first|highest price first|price high to low)/ig,()=>{criteria.sort='high';return ' '});
  const simpleSort=clean(query).match(/^(?:дешевле|cheaper|дороже|more expensive|ближе|nearest)$/);if(simpleSort){criteria.sort=/^(?:дешевле|cheaper)$/.test(simpleSort[0])?'low':/^(?:дороже|more expensive)$/.test(simpleSort[0])?'high':'nearest';query=''}
  let sortSpecified=sharedSortSpecified||criteria.sort!=='nearest'||!!simpleSort||/(?:сначала ближайшие|ближе ко мне|рядом со мной|near me|nearest first|closest first)/i.test(raw);
  const isMoney=amount=>amount&&(amount.scale>0||amount.currency||amount.value>=10000),valid=amount=>Number.isSafeInteger(amount)&&amount>=0;
  const range=/(^|[\s,])(?:от|from|between)\s+/ig;let match;
  while((match=range.exec(query))){const start=match.index+match[0].length,low=amountAt(query.slice(start));if(!low)continue;const connector=query.slice(start+low.end).match(/^\s*(?:до|to|and|[-–])\s*/i);if(!connector)continue;const secondStart=start+low.end+connector[0].length,high=amountAt(query.slice(secondStart));if(!high||!isMoney(high)&&!isMoney(low))continue;let minimum=low.value;if(!low.scale&&!low.currency&&high.scale&&minimum<100&&minimum<=high.value/high.scale)minimum*=high.scale;if(!valid(minimum)||!valid(high.value)||high.value<=0||minimum>high.value)return {action:'invalid',message:'Минимальная цена должна быть не выше максимальной. Уточните диапазон.'};criteria.priceMin=minimum;criteria.priceMax=high.value;query=query.slice(0,match.index)+' '+query.slice(secondStart+high.end);break}
  const bound=/(^|[\s,])(?:(не дороже|не более|максимум|до|за|under|up to|less than)|(не дешевле|не менее|от|over|at least|more than)|(бюджет(?:ом)?|цен(?:а|ой|е)|стоимость(?:ю|ь)?|budget|price)(?:\s+(до|от|under|over|up to|at least))?)\s+/ig;
  while((match=bound.exec(query))){const start=match.index+match[0].length,amount=amountAt(query.slice(start));if(!amount||!isMoney(amount)&&!match[4]||!valid(amount.value)||amount.value<=0)continue;const tail=clean(query.slice(start+amount.end));if(/^(?:год|года|году|годы|year)/.test(tail))continue;const minimum=!!match[3]||/^(?:от|over|at least)$/.test(match[5]||'');criteria[minimum?'priceMin':'priceMax']=amount.value;query=query.slice(0,match.index)+' '+query.slice(start+amount.end);bound.lastIndex=0}
  if(criteria.priceMin!==undefined&&criteria.priceMax!==undefined&&criteria.priceMin>criteria.priceMax)return {action:'invalid',message:'Минимальная цена должна быть не выше максимальной. Уточните диапазон.'};
  const shared=window.FasKeywordSearch?.compile(query)?.intent||window.FasQueryIntent?.parse(query,{cities:typeof CITY_CENTERS==='object'?CITY_CENTERS:{},capitals:typeof REGION_CAPITALS==='object'?REGION_CAPITALS:{},regions:typeof RF_REGIONS!=='undefined'?RF_REGIONS:[]});
  if(shared?.error)return {action:'invalid',message:shared.error};
  if(shared){if(shared.criteria.sort)sortSpecified=true;const manualKeys=new Set(['priceMin','priceMax','yearMin','yearMax','mileageMin','mileageMax','areaMin','areaMax','roomsMin','roomsMax','fuel','transmission','condition','sort','city','regionCode']);let retainsQuery=false;for(const [key,value]of Object.entries(shared.criteria)){if(!manualKeys.has(key))retainsQuery=true;if(/Min$/.test(key)&&criteria[key]!==undefined)criteria[key]=Math.max(criteria[key],value);else if(/Max$/.test(key)&&criteria[key]!==undefined)criteria[key]=Math.min(criteria[key],value);else criteria[key]=value}if(!retainsQuery)query=shared.residual;sharedApplied=shared.labels||[];const message=rangeError(criteria);if(message)return {action:'invalid',message}}
  query=query.replace(/\s+/g,' ').replace(/^[\s,;]+|[\s,;.!?]+$/g,'').trim();
  const hasCriteria=Object.keys(criteria).some(key=>key!=='sort')||sortSpecified,explicitSearch=/^(?:(?:пожалуйста|please)[, ]+)?(?:найди|найти|поищи|покажи|показать|ищи|ищу|search|find|show)\s/i.test(raw),contextual=refinement||!explicitSearch&&!query&&(hasCriteria||warnings.length);
  if(contextual){if(!lastSearch)return {action:'invalid',message:'Сначала выполните поиск лота, затем уточните его условия.'};if(query)return {action:'invalid',message:'Уточнение не распознано. Укажите цену, год, пробег, площадь, комнаты или параметр поиска.'};const merged={...lastSearch.criteria,...criteria};if(criteria.regionCode!==undefined&&criteria.city===undefined)delete merged.city;if(criteria.city!==undefined&&criteria.regionCode===undefined)delete merged.regionCode;if(!sortSpecified)merged.sort=lastSearch.criteria.sort||'nearest';for(const key of Object.keys(criteria))delete criteria[key];Object.assign(criteria,merged);query=lastSearch.query;const message=rangeError(criteria);if(message)return {action:'invalid',message}}
  return refreshRadius({action:'search',query,criteria,warnings,applied:[...new Set([...describeCriteria(criteria),...(window.FasQueryIntent?.labels(criteria)||sharedApplied).filter(label=>/^(?:ОЗУ|Накопитель|Мощность):/.test(label))])],recognized:raw});
 }
 function siteCommand(text){
  const raw=String(text??'').trim().slice(0,500),normal=clean(raw).replace(/[.!?]+$/g,'').replace(/^(?:пожалуйста[, ]+|please[, ]+)/,'');
  if(!normal)return {action:'empty'};
  if(/^(?:мою ставку перебили|меня перебили|перебили ли мою ставку|was i outbid|is my bid outbid)$/.test(normal))return {action:'lot_status',kind:'outbid'};
  if(/^(?:какая (?:сейчас )?текущая цена(?: (?:этого|текущего) лота)?|сколько стоит (?:этот|текущий) лот|what(?:'s| is) the current price(?: of this lot)?)$/.test(normal))return {action:'lot_status',kind:'price'};
  if(/^(?:когда заканчиваются торги(?: по этому лоту)?|когда (?:заканчивается|завершается) аукцион|when does (?:this|the) auction end)$/.test(normal))return {action:'lot_status',kind:'ends'};
  const preference=window.FasAssistantPreferences?.parseCommand?.(raw);if(preference)return preference;
  const ru='(?:(?:открой|открыть|покажи|показать) )?',en='(?:(?:open|show) )?';
  const exact=(r,e)=>new RegExp('^(?:'+ru+'(?:'+r+')|'+en+'(?:'+e+'))$','i').test(normal);
  if(exact('кабинет|личный кабинет|мой кабинет','account|my account|cabinet'))return {action:'cabinet'};
  if(exact('мои лоты|мои объявления','my lots|my listings'))return {action:'my_lots'};
  if(exact('мои ставки','my bids'))return {action:'my_bids'};
  if(exact('мои покупки','my purchases'))return {action:'my_purchases'};
  if(exact('карта|карту|лоты на карте','map|lots on map'))return {action:'map'};
  if(exact('главная|главную|на главную|домой','home|homepage|home page')||/^(?:перейди|вернись) на главную$/.test(normal))return {action:'home'};
  if(exact('каталог(?: лотов)?|все лоты|лоты','catalog|catalogue|all lots|lots'))return {action:'catalog'};
  if(exact('избранное|избранные(?: лоты)?','favorites|favourites|saved lots'))return {action:'favorites'};
  if(exact('помощь|поддержка|техподдержка','help|support'))return {action:'help'};
  if(exact('лент[ау]|смотреть ленту','feed|auction feed'))return {action:'feed'};
  if(/^(?:закрыть|закрой|закрыть помощника|close|dismiss)$/.test(normal))return {action:'close'};
  if(/^(?:повтори|повторить|повтори поиск|повторить поиск|еще раз|repeat|again|repeat search|search again)$/.test(normal))return {action:'repeat'};
  if(/^(?:(?:сбрось|сбросить|очисти|очистить) (?:поиск|фильтры|все фильтры)|(?:reset|clear) (?:search|filters|all filters))$/.test(normal))return {action:'reset'};
  if(/^(?:назад|вернуться назад|back|go back)$/.test(normal))return {action:'back'};
  if(exact('недавно смотрел(?:а|и)?|недавно просмотренные(?: лоты)?|история(?: просмотров)?','recent|recent lots|recently viewed|history'))return {action:'recent'};
  const bid=normal.match(/^(?:подготовь|подготовить)\s+(?:демо)?ставку\s+(.+)$|^prepare\s+(?:a\s+)?(?:demo\s+)?bid\s+(.+)$/i);
  if(bid){const value=bid[1]||bid[2],amount=amountAt(value);if(!amount||!Number.isSafeInteger(amount.value)||amount.value<=0||value.slice(amount.end).trim())return {action:'invalid',message:'Укажите целую сумму: например, «Подготовь ставку 1,5 миллиона рублей».'};return {action:'prepare_bid',amount:amount.value}}
  if(/^(?:да|подтверждаю|подтверди ставку|подтвердить ставку|yes|confirm|confirm bid)$/.test(normal))return {action:'confirm_only_by_button'};
  if(/^(?:что ты умеешь|какие команды|что можно сказать|help commands|what can you do)$/.test(normal))return {action:'info',message:'Я могу искать лоты, уточнять поиск, открывать кабинет, ставки, покупки и карту, менять настройки уведомлений. Демоставку можно подготовить командой; отправка — только по кнопке подтверждения.'};
  if(/^(?:заплати|заплатить|перечисли|перечислить|спиши|пополни|withdraw|charge|send\s+money)(?:\s|$)/.test(normal))return {action:'blocked'};
  if(/^(?:(?:сделай|сделать|поставь|поставить|повысить|повысь|подай|поднять|подними)\s+(?:демо)?ставк\S*|ставк\S*|купи|купить|покупка|оплати|оплатить|переведи|перевести|удали|удалить|опубликуй|опубликовать|bid|buy|purchase|pay|transfer|delete|remove|publish|place\s+(?:a\s+)?bid|make\s+(?:a\s+)?bid)(?:\s|$)/i.test(normal))return {action:'blocked'};
  if(/^(?:отправь|позвони|создай|вызови|send|call|create)(?:\s|$)/.test(normal))return {action:'unsupported',message:'Такую команду пока не выполняю. Можно искать лоты, открыть кабинет, карту, покупки или настройки уведомлений.'};
  return searchIntent(raw);
 }
 function command(text){
  const original=String(text??'').trim().slice(0,500),module=window.FasAssistantPersonalization,invocation=module?.parseInvocation?.(original),raw=invocation?.addressed?String(invocation.command||''):original;
  if(invocation?.addressed&&!raw.trim())return {action:'greeting',message:String(invocation.greeting||module?.getGreeting?.()||'Слушаю. Как помочь?')};
  const parsed=module?.parseCommand?.(raw)||siteCommand(raw);
  return invocation?.addressed?{...parsed,addressed:true,greeting:String(invocation.greeting||module?.getGreeting?.()||'')}:parsed;
 }
 function cleanupClosed(){
  if(dialog.open||closedCleaned)return;closedCleaned=true;clearBid();stop();try{window.speechSynthesis?.cancel?.()}catch{}document.body.classList.remove('voice-open');
  let top=null;try{top=typeof window.FasDialogLifecycle?.top==='function'?window.FasDialogLifecycle.top():Array.from(document.querySelectorAll('dialog[open]')).filter(node=>node.open).at(-1)}catch{}
  if(origin?.isConnected!==false&&(!top||top.contains?.(origin)))origin?.focus?.({preventScroll:true});
  if(typeof reelsMode!=='undefined'&&reelsMode&&typeof syncReels==='function'&&typeof swipeIndex==='function')syncReels(swipeIndex());
 }
 function close(){clearBid();stop();if(dialog.open){dialog.close();cleanupClosed()}else{try{window.speechSynthesis?.cancel?.()}catch{}}}
 function searchFeedback(parsed){
  const parts=['Распознано: «'+(parsed.recognized||parsed.query)+'»','Поиск: «'+(parsed.query||'Все лоты')+'»',...(parsed.applied||[]),...(parsed.warnings||[])];lastFeedback=parts.join(' · ');status(lastFeedback);const preview=['Ищу: '+(parsed.query||'Все лоты').slice(0,60),...(parsed.applied||[]),...(parsed.warnings?.length?['Радиус не применён: уточните расстояние или «Ваш регион».']:[])].join(' · ');if(typeof toast==='function')toast(preview.length>160?preview.slice(0,157)+'…':preview);speak(lastFeedback);
 }
 function applySearch(parsed){
  const criteria=parsed.criteria||{},route=window.FasGlobalSearch;
  if(route.supportsCriteria===true)return route(parsed.query,{criteria});
  const result=route(parsed.query);if(!Object.keys(criteria).length)return result;
  const set=(id,value)=>{const node=document.querySelector('#'+id);if(node)node.value=String(value)};
  const fields=[['priceMin','adv-price-min'],['priceMax','adv-price-max'],['yearMin','adv-year-min'],['yearMax','adv-year-max'],['mileageMin','adv-mileage-min'],['mileageMax','adv-mileage-max'],['areaMin','adv-area-min'],['areaMax','adv-area-max'],['roomsMin','adv-rooms-min'],['roomsMax','adv-rooms-max'],['fuel','adv-fuel'],['transmission','adv-transmission'],['condition','adv-condition'],['radius','adv-radius'],['sort','sort']];
  set('budget','');set('region-filter','');set('city','');for(const [,id]of fields)if(id!=='sort')set(id,'');
  if(criteria.regionCode!==undefined)set('region-filter',criteria.regionCode);
  if(typeof syncSearchFields==='function')syncSearchFields();
  if(criteria.city!==undefined)set('city',criteria.city);
  for(const [key,id] of fields)if(criteria[key]!==undefined)set(id,criteria[key]);
  if(typeof render==='function')render();return result;
 }
 function execute(text){
  window.FasAssistantPreferences?.pauseSpeech?.();
  replyGreeting='';let parsed=command(text);error();
  if(parsed.action==='repeat'){if(!lastCommand){error('Сначала выполните поиск или откройте раздел. Затем можно сказать «Повтори».');return {ok:false,action:'repeat'}}parsed=JSON.parse(JSON.stringify(lastCommand))}
  parsed=refreshRadius(parsed);
  replyGreeting=parsed.greeting||'';
  if(!['prepare_bid','confirm_only_by_button','lot_status'].includes(parsed.action))clearBid();
  if(parsed.action==='empty'){error('Введите запрос или команду.');return {ok:false,action:'empty'}}
  if(parsed.action==='invalid'){error(parsed.message);return {ok:false,...parsed}}
  if(parsed.action==='confirm_only_by_button'){error('Отправить демоставку можно только кнопкой «Подтвердить демоставку» после проверки суммы.');return {ok:false,...parsed}}
  if(parsed.action==='unsupported'){error(parsed.message);return {ok:false,...parsed}}
  if(parsed.action==='info'){status(parsed.message);speak(parsed.message);return {ok:true,...parsed}}
  if(parsed.action==='greeting'){status(parsed.message);speak(parsed.message);return {ok:true,...parsed}}
  if(parsed.action==='personalization'){
   clearBid();const module=window.FasAssistantPersonalization;if(typeof module?.execute!=='function'){error('Персональные настройки сейчас недоступны.');return {ok:false,...parsed}}
   const result=module.execute(parsed.request);syncPersonalization();if(result?.showSettings){setQuick(false);field('voice-personalization').open=true;}if(result?.ok===false)error(result.message);else{status(result?.message||'Настройки обновлены.');speak(result?.message||'Настройки обновлены.')}return {...parsed,...result};
  }
  if(parsed.action==='lot_status')return lotStatus(parsed.kind);
  if(parsed.action==='preferences'){
   clearBid();const module=window.FasAssistantPreferences;if(typeof module?.execute!=='function'){error('Настройки помощника сейчас недоступны.');return {ok:false,action:'preferences'}}
   const result=module.execute(parsed.request);syncPreferences();if(result?.showSettings){setQuick(false);field('voice-preferences').open=true;dialog.querySelector('[data-assistant-preferences-panel]')?.focus?.({preventScroll:true})}if(result?.ok===false)error(result.message);else{status(result?.message||'Настройки обновлены.');speak(result?.message||'Настройки обновлены.')}return {...parsed,...result};
  }
  if(parsed.action==='prepare_bid')return prepareBid(parsed.amount);
  if(parsed.action==='blocked'){error('Для ставки, покупки, удаления или публикации используйте соответствующую форму на сайте.');return {ok:false,action:'blocked'}}
  const routes={cabinet:()=>window.FasSellerUI.openDashboard('all'),my_lots:()=>window.FasSellerUI.openDashboard('all'),my_bids:()=>window.FasAuctionNotifications.openMyBids({onBack:()=>window.FasSellerUI?.openDashboard?.('all')}),my_purchases:()=>window.FasAuctionHistory.openPurchases({onBack:()=>window.FasSellerUI?.openDashboard?.('all')}),map:()=>window.FasPropertyMap.open(),home:()=>window.FasHomeNavigation.goHome()};
  const available={cabinet:window.FasSellerUI?.openDashboard,my_lots:window.FasSellerUI?.openDashboard,my_bids:window.FasAuctionNotifications?.openMyBids,my_purchases:window.FasAuctionHistory?.openPurchases,map:window.FasPropertyMap?.open,home:window.FasHomeNavigation?.goHome};
  const ready=routes[parsed.action]?typeof available[parsed.action]==='function':['search','reset'].includes(parsed.action)?typeof window.FasGlobalSearch==='function':parsed.action==='help'?typeof window.FasSupport?.open==='function':parsed.action==='recent'?typeof window.FasBuyerTools?.openRecent==='function':true;
  if(!ready){error('Этот раздел сейчас недоступен. Попробуйте открыть его из кабинета.');return {ok:false,action:parsed.action}}
  const main=mainModal();
  if(['search','reset','catalog','favorites','recent','feed','cabinet','my_lots','my_bids','my_purchases','home'].includes(parsed.action)&&main?.open&&main.classList?.contains('seller-dialog')){
   if(typeof window.FasSellerUI?.prepareNavigation!=='function'||!window.FasSellerUI.prepareNavigation()){error(main.querySelector?.('#seller-error')?.textContent||'Сначала сохраните изменения в кабинете. Если файлы ещё обрабатываются, дождитесь завершения.');return {ok:false,action:parsed.action}}
  }
  close();closeLauncher();
  if(routes[parsed.action]){try{if(routes[parsed.action]()===false){open();error('Переход не завершён. Проверьте сообщение в текущем окне.');return {ok:false,...parsed}}speak(({cabinet:'Кабинет открыт.',my_lots:'Мои лоты открыты.',my_bids:'Мои ставки открыты.',my_purchases:'Мои покупки открыты.',map:'Карта открыта.',home:'Главная страница открыта.'})[parsed.action]);return {ok:true,...parsed}}catch{open();error('Не удалось открыть раздел. Попробуйте ещё раз.');return {ok:false,...parsed}}}
  if(parsed.action==='search'||parsed.action==='reset'){
   const search=parsed.action==='reset'?{action:'search',query:'',criteria:{sort:'nearest'},warnings:[],applied:['Поиск и фильтры сброшены.'],recognized:String(text??'').trim().slice(0,500)}:parsed;let result;
   try{result=applySearch(search)}catch{open();error('Поиск сейчас недоступен. Попробуйте ещё раз.');return {ok:false,action:parsed.action}}
   if(result?.error){open();error(result.error);return {ok:false,action:parsed.action,message:result.error}}
   if(parsed.action==='reset'){lastSearch=null;lastCommand=null;searchFeedback(search);return {ok:true,action:'reset'}}
   lastSearch=JSON.parse(JSON.stringify(search));searchFeedback(search);
  }
  if(parsed.action==='catalog'){if(!catalogue())return {ok:false,action:parsed.action};speak('Каталог открыт.')}
  if(parsed.action==='favorites'){if(!closeMain())return {ok:false,action:parsed.action};if(typeof setReels==='function'&&typeof reelsMode!=='undefined'&&reelsMode)setReels(false);if(typeof setTab==='function')setTab('fav');document.querySelector('#lot-results')?.scrollIntoView?.({block:'start'});speak('Избранное открыто.')}
  if(parsed.action==='help'){window.FasSupport.open();speak('Помощь открыта.')}
  if(parsed.action==='recent'){if(!closeMain())return {ok:false,action:parsed.action};window.FasBuyerTools.openRecent();speak('История просмотров открыта.')}
  if(parsed.action==='feed'){if(!closeMain())return {ok:false,action:parsed.action};if(typeof openLocalFeed==='function')openLocalFeed();else{if(typeof setTab==='function')setTab('all');if(typeof setReels==='function')setReels(true)}speak('Лента открыта.')}
  if(parsed.action==='back'){
   const handled=window.FasBackSwipe?.back?.();
   if(!handled){const modal=mainModal();if(modal?.open&&modal.classList?.contains('seller-dialog')){if(typeof window.FasBackSwipe?.back==='function'||window.FasSellerUI?.back?.()!==true)return {ok:false,action:parsed.action}}else if(modal?.open)modal.close();else if(typeof reelsMode!=='undefined'&&reelsMode&&typeof setReels==='function')setReels(false)}
   speak('Назад.');
  }
  lastCommand=JSON.parse(JSON.stringify(parsed));return {ok:true,...parsed};
 }
 function open(options={}){
  if(!dialog.open){
   stop();
   const module=window.FasAssistantPersonalization,prompt=module?.promptIfNeeded?.();
   setQuick(options.settings!==true&&(options.listen===true||prompt?.needed!==true));clearBid();syncPreferences();syncPersonalization();if(!dialog.contains(document.activeElement))origin=document.activeElement;epoch++;error();field('voice-interim').textContent='';
   document.querySelectorAll('video').forEach(video=>{if(!video.paused)video.pause()});document.body.classList.add('voice-open');closedCleaned=false;dialog.showModal();dialog.scrollTop=0;
   const supported=sync(),greeting=module?.getGreeting?.();if(prompt?.needed&&!quick)field('voice-personalization').open=true;
   status(greeting?greeting+(prompt?.needed&&!quick?' '+prompt.message:''):lastFeedback||(supported?'Нажмите «Говорить» или введите запрос.':'Браузер не поддерживает голосовой ввод. Введите запрос ниже.'));(supported?startButton:field('voice-command')).focus?.({preventScroll:true});
  }
  if(options.settings===true)showSettings();
  if(options.listen===true)start();
 }
 function showSettings(){stop();setQuick(false);syncPreferences();syncPersonalization();const prompt=window.FasAssistantPersonalization?.promptIfNeeded?.();field('voice-personalization').open=true;field('voice-preferences').open=true;status('Настройки помощника. Для записи нажмите «Говорить».');field('voice-language').focus?.({preventScroll:true})}
 dialog.querySelector('[data-voice-settings]').onclick=showSettings;
 dialog.querySelector('[data-voice-type]').onclick=()=>{stop();status('Введите запрос или команду и нажмите «Выполнить».');field('voice-command').focus?.({preventScroll:true})};
 startButton.onclick=start;stopButton.onclick=()=>{stop();status('Запись остановлена. Можно изменить запрос или начать снова.');startButton.focus?.({preventScroll:true})};dialog.querySelector('[data-voice-close]').onclick=close;
 dialog.querySelector('[data-voice-confirm-bid]').onclick=confirmBid;dialog.querySelector('[data-voice-cancel-bid]').onclick=()=>{clearBid();error();status('Подготовка демоставки отменена.')};
 field('voice-language').onchange=()=>{stop();error();status('Язык изменён. Нажмите «Говорить», чтобы начать запись.')};
 field('voice-command').addEventListener('input',()=>{clearBid();if(starting||listening){stop();status('Используется введённый вами запрос.')}error()});
 field('voice-form').onsubmit=event=>{event.preventDefault();execute(field('voice-command').value)};
 dialog.addEventListener('close',cleanupClosed);
 document.addEventListener('click',event=>{const button=event.target.closest?.('[data-voice-open]');if(!button)return;event.preventDefault();open({listen:button.hasAttribute?.('data-voice-start')===true})});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){clearBid();if(starting||listening){stop();if(dialog.open)status('Запись остановлена при уходе со страницы.')}}});
 window.addEventListener?.('fas-assistant-personalization-change',event=>{if(event.detail?.profileChanged){stop();clearBid();lastCommand=null;lastSearch=null;replyGreeting='';try{window.speechSynthesis?.cancel?.()}catch{}field('voice-auto-execute').checked=false;field('voice-speak').checked=false;field('voice-command').value='';if(dialog.open)status('Профиль изменился. Проверьте настройки и задайте новый запрос.')}if(dialog.open)syncPersonalization()});
 window.FasVoiceAssistant=Object.freeze({open,close,execute,start,stop,parse:command,state:()=>({supported:typeof Recognition()==='function',listening,starting,language:field('voice-language').value==='en-US'?'en-US':'ru-RU',lastFeedback,presentation:quick?'quick':'settings',externalAI:false,pendingBid:pendingBid?{lotId:pendingBid.id,amount:pendingBid.amount}:null})});
 sync();
})();
