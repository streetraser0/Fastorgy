/* Demo payment selection: no payment credentials, transfers, provider requests or paid state. */
(()=>{
 'use strict';
 if(window.FasPayments)return;
 const METHODS=Object.freeze({
  card:{label:'Банковская карта',hint:'Через платёжного партнёра',detail:'После подключения эквайринга оплата будет открываться на защищённой странице платёжного партнёра. Номер карты и CVV на сайте ФАС торги не запрашиваются.',requires:'Требуется подключение эквайринга продавца.'},
  sbp:{label:'СБП',documentLabel:'Система быстрых платежей',hint:'В приложении вашего банка',detail:'Ссылка или QR для СБП должны формироваться банком по подтверждённому заказу. Пока банк не подключён, платёжная ссылка и QR не создаются.',requires:'Требуется подключение СБП и проверка получателя.'},
  digital:{label:'Цифровой рубль',hint:'Через банк — участник платформы',detail:'Оплата цифровыми рублями требует отдельной интеграции с банком — участником платформы цифрового рубля и подтверждения в приложении банка.',requires:'Требуется отдельное подключение банка для цифрового рубля.'},
  receipt:{label:'По квитанции',documentLabel:'Банковская квитанция',hint:'По реквизитам продавца',detail:'Платёжная квитанция станет доступна после подтверждения сделки и банковских реквизитов продавца. Сейчас можно распечатать только образец, по которому нельзя платить.',requires:'Проверенные реквизиты продавца не предоставлены.'}
 });
 const icon=name=>typeof uiIcon==='function'?uiIcon(name):'';
 const methodGlyphs={card:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h4"/>',sbp:'<path d="M4 8h15m-4-4 4 4-4 4M20 16H5m4-4-4 4 4 4"/>',digital:'<circle cx="12" cy="12" r="9"/><path d="M9 18V6h4a3 3 0 0 1 0 6H7m0 3h7"/>',receipt:'<path d="M7 3h10a2 2 0 0 1 2 2v16l-3-2-4 2-4-2-3 2V5a2 2 0 0 1 2-2Z"/><path d="M9 8h6M9 12h6"/>'};
 const methodIcon=key=>'<svg class="payment-method-glyph" data-payment-decoration="'+key+'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+methodGlyphs[key]+'</svg>';
 const dialog=document.createElement('dialog');dialog.id='payment-dialog';dialog.className='payment-dialog';dialog.setAttribute('aria-labelledby','payment-title');
 dialog.innerHTML=`<div class="payment-shell"><header class="payment-header"><img src="assets/brand/fas-torgi-logo.png?v=20261116-gradient1" alt="ФАС торги — Федеральная аукционная сеть" width="145" height="90"><button type="button" data-payment-close class="payment-close" aria-label="Закрыть выбор оплаты">${icon('close')||'×'}</button></header><div class="payment-body"><div class="payment-intro"><span class="payment-kicker">Демоверсия</span><h2 id="payment-title" tabindex="-1">Оплата лота</h2><p>Выберите удобный способ</p></div><section class="payment-order" aria-label="Сведения о лоте"><div class="payment-lot-overview"><div class="payment-lot-thumbnail" id="payment-lot-thumbnail" aria-hidden="true"></div><div class="payment-lot-copy"><span id="payment-lot-number"></span><strong id="payment-lot-name"></strong></div></div><div class="payment-total" id="payment-total"><span id="payment-amount-label"></span><b id="payment-amount"></b></div><p class="payment-recipient-line"><span>Текущая цена торгов</span><strong id="payment-current-price"></strong></p><p class="payment-recipient-line"><span>Продавец</span><strong id="payment-recipient"></strong></p></section><p class="payment-demo" role="status"><span class="payment-demo-mark" aria-hidden="true">i</span><span><strong>Деньги не списываются</strong><small>Оплата ещё не подключена. Реквизиты продавца не проверены.</small></span></p><fieldset class="payment-choice"><legend>Способ оплаты</legend><div class="payment-methods">${Object.entries(METHODS).map(([value,method])=>`<label class="payment-method" data-payment-option="${value}"><span class="payment-method-icon payment-icon-${value}" aria-hidden="true">${methodIcon(value)}</span><span class="payment-method-copy"><strong>${method.label}</strong><small>${method.hint}</small></span><input type="radio" name="payment-method" value="${value}"></label>`).join('')}</div></fieldset><details class="payment-method-info"><summary>Как будет работать оплата</summary><div class="payment-method-description" aria-live="polite"><h3 id="payment-method-title"></h3><p id="payment-method-description"></p><p class="payment-requires" id="payment-requires"></p></div></details><div class="payment-actions"><button type="button" class="primary" id="payment-continue" disabled>Оплата пока недоступна</button></div><details class="payment-receipt-preview" id="payment-receipt-preview"><summary><span>Образец квитанции<small>Посмотреть, распечатать или отправить</small></span><span class="payment-disclosure-plus" aria-hidden="true">+</span></summary><div class="payment-document-actions"><button type="button" class="outline" id="payment-print">Распечатать образец</button><button type="button" class="outline" id="payment-share">Поделиться образцом</button></div><p class="payment-share-status" id="payment-share-status" role="status" aria-live="polite"></p><label class="payment-share-manual-label" id="payment-share-manual-label" for="payment-share-manual" hidden>Образец для ручного копирования</label><textarea class="payment-share-manual" id="payment-share-manual" rows="10" readonly hidden></textarea><p class="payment-print-status" id="payment-print-status" role="status"></p><section class="payment-receipt" aria-labelledby="payment-receipt-title"><div class="payment-watermark">ОБРАЗЕЦ — НЕ ДЛЯ ОПЛАТЫ</div><h3 id="payment-receipt-title">Образец банковской квитанции</h3><p>Этот документ не подтверждает оплату и не содержит проверенных банковских реквизитов. Не используйте его для перевода денег.</p><dl><dt>Получатель — продавец лота</dt><dd id="payment-receipt-recipient"></dd><dt>Лот</dt><dd id="payment-receipt-lot"></dd><dt>Сумма, RUB</dt><dd id="payment-receipt-amount"></dd><dt>Способ оплаты</dt><dd id="payment-receipt-method"></dd><dt>ИНН получателя</dt><dd>Не предоставлен</dd><dt>КПП получателя (для организаций)</dt><dd>Не предоставлен</dd><dt>Банк получателя</dt><dd>Не предоставлен</dd><dt>БИК банка</dt><dd>Не предоставлен</dd><dt>Расчётный счёт</dt><dd>Не предоставлен</dd><dt>Корреспондентский счёт</dt><dd>Не предоставлен</dd><dt>Назначение платежа</dt><dd id="payment-receipt-purpose"></dd><dt>Подтверждённый номер сделки</dt><dd>Не предоставлен</dd></dl><p class="payment-watermark">ОБРАЗЕЦ — НЕ ДЛЯ ОПЛАТЫ</p></section></details><p class="payment-card-note">Номер карты, CVV и коды подтверждения здесь не запрашиваются.</p></div></div>`;
 document.body.appendChild(dialog);
 const field=id=>dialog.querySelector('#'+id);
 let origin=null,quote=null,method='card',printing=false,sharing=false,epoch=0,displayedCurrentPrice=null;
 const text=(value,max=250)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';
 const amount=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0?value:null;
 const currency=value=>value===null?'Не определена':new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0}).format(value);
 function updatePhoto(lot){
  const preview=field('payment-lot-thumbnail'),version=epoch;preview.innerHTML='';preview.classList.remove('has-photo');
  try{
   if(typeof lotMedia!=='function'||typeof lotMediaItem!=='function')return;
   const gallery=lotMedia(lot),first=(Array.isArray(gallery)?gallery:[]).find(item=>item?.type==='image');
   const item=first&&lotMediaItem(lot,first);if(item?.type!=='image')return;
   const photo=document.createElement('img');photo.setAttribute('alt','');photo.setAttribute('width','72');photo.setAttribute('height','72');photo.setAttribute('decoding','async');photo.setAttribute('referrerpolicy','no-referrer');photo.setAttribute('draggable','false');
   photo.addEventListener('error',()=>{if(epoch!==version||photo.parentElement!==preview)return;photo.remove();preview.classList.remove('has-photo')});
   photo.setAttribute('src',item.url);preview.appendChild(photo);preview.classList.add('has-photo');
  }catch{/* Missing or unavailable gallery media leaves the neutral placeholder. */}
 }
 function state(){return {open:dialog.open,mode:quote?.mode||null,method,lotId:quote?.lotId??null,amount:quote?.amount??null,currency:'RUB',status:'unavailable',canPay:false,recipientVerified:false,sampleOnly:true,sharing,currentPrice:displayedCurrentPrice}}
 function refreshLot(lot){
  if(!quote||lot&&String(lot.id)!==quote.lotId)return false;
  let value=null;try{value=lot?typeof current==='function'?current(lot):lot.currentPrice??lot.price:null}catch{}
  displayedCurrentPrice=amount(value);field('payment-current-price').textContent=currency(displayedCurrentPrice);return true;
 }
 function updateMethod(value){
  if(sharing||!Object.hasOwn(METHODS,value))return false;method=value;
  dialog.querySelectorAll('[data-payment-option]').forEach(label=>{const selected=label.dataset.paymentOption===method;label.classList.toggle('is-selected',selected);label.querySelector('input').checked=selected});
  const item=METHODS[method];field('payment-method-title').textContent=item.label;field('payment-method-description').textContent=item.detail;field('payment-requires').textContent=item.requires;field('payment-receipt-method').textContent=item.documentLabel||item.label;return true;
 }
 function open(lot,options={}){
  if(!lot||typeof lot!=='object'||Array.isArray(lot))return {ok:false,reason:'invalid-lot'};
  const mode=options?.mode||'buy-now';if(!['buy-now','auction-settlement'].includes(mode))return {ok:false,reason:'invalid-mode'};
  if(dialog.open)return {ok:false,reason:'already-open',...state()};
  const id=Number.isSafeInteger(lot.id)&&lot.id>0?String(lot.id):text(lot.id,32),recipient=text(lot.sellerName)||text(lot.bank)||'Продавец не указан';
  epoch++;sharing=false;quote=Object.freeze({mode,lotId:id||null,name:text(lot.name)||'Имущество',recipient,amount:mode==='buy-now'?amount(lot.buyNowPrice):amount(lot.settlement?.amount)});method='card';origin=document.activeElement;
  refreshLot(lot);field('payment-lot-number').textContent=quote.lotId?'Лот № '+quote.lotId:'Номер лота не указан';field('payment-lot-name').textContent=quote.name;updatePhoto(lot);
  field('payment-amount-label').textContent=mode==='buy-now'?'Цена выкупа':'Итоговая сумма';field('payment-amount').textContent=quote.amount!==null?currency(quote.amount):mode==='auction-settlement'?'После завершения торгов':'Цена пока не указана';field('payment-total').classList.toggle('is-pending',quote.amount===null);field('payment-total').classList.toggle('is-large',quote.amount!==null&&quote.amount>=10000000000);
  field('payment-recipient').textContent=quote.recipient;field('payment-receipt-recipient').textContent=quote.recipient+' (не проверен)';field('payment-receipt-lot').textContent=(quote.lotId?'№ '+quote.lotId+' — ':'')+quote.name;field('payment-receipt-amount').textContent=currency(quote.amount);
  field('payment-receipt-purpose').textContent='Оплата имущества: '+(quote.lotId?'лот № '+quote.lotId+' — ':'')+quote.name+'. Только образец.';field('payment-print-status').textContent='Печатается только образец. Платёжные реквизиты и QR пока отсутствуют.';field('payment-receipt-preview').open=false;field('payment-continue').disabled=true;field('payment-print').disabled=typeof window.print!=='function';field('payment-share-manual').hidden=true;field('payment-share-manual-label').hidden=true;field('payment-share-manual').value='';field('payment-share-status').textContent=shareAvailable()?'Поделиться можно только образцом, который не предназначен для оплаты.':'Меню отправки недоступно. Откройте «Поделиться образцом», чтобы скопировать текст вручную.';updateMethod(method);syncShare();
  document.querySelectorAll('video').forEach(video=>{if(!video.paused)video.pause()});document.body.classList.add('payment-open');dialog.showModal();dialog.scrollTop=0;field('payment-title').focus?.({preventScroll:true});return {ok:true,...state()};
 }
 function close(){if(dialog.open)dialog.close()}
 function printSample(){
  if(!dialog.open||!quote)return {ok:false,reason:'closed'};
  if(printing)return {ok:false,reason:'printing'};
  if(typeof window.print!=='function'){field('payment-print-status').textContent='Печать не поддерживается этим браузером. Образец можно посмотреть ниже.';return {ok:false,reason:'unsupported'}}
  printing=true;field('payment-receipt-preview').open=true;
  try{window.print();return {ok:true,sampleOnly:true}}catch{field('payment-print-status').textContent='Не удалось открыть печать. Образец можно посмотреть ниже.';return {ok:false,reason:'print-failed'}}finally{printing=false}
 }
 function shareAvailable(){const nav=window.navigator||{};return typeof window.FasNativeShare?.share==='function'||typeof nav.share==='function'||typeof nav.clipboard?.writeText==='function'}
 function syncShare(){field('payment-share').disabled=sharing;field('payment-share').setAttribute('aria-busy',String(sharing));dialog.querySelectorAll('input[name="payment-method"]').forEach(input=>{input.disabled=sharing})}
 function receiptText(){
  if(!quote)return '';
  const q=quote,lot=(q.lotId?'№ '+q.lotId+' — ':'')+q.name;
  return ['ОБРАЗЕЦ — НЕ ДЛЯ ОПЛАТЫ','ФАС торги — образец банковской квитанции','Этот документ не подтверждает оплату. Не используйте его для перевода денег.','',
   'Получатель — продавец лота: '+q.recipient+' (не проверен)','Деньги должны поступать непосредственно продавцу лота.','Лот: '+lot,'Сумма, RUB: '+currency(q.amount),'Способ оплаты: '+(METHODS[method].documentLabel||METHODS[method].label),
   'ИНН получателя: Не предоставлен','КПП получателя (для организаций): Не предоставлен','Банк получателя: Не предоставлен','БИК банка: Не предоставлен','Расчётный счёт: Не предоставлен','Корреспондентский счёт: Не предоставлен',
   'Назначение платежа: Оплата имущества: '+(q.lotId?'лот № '+q.lotId+' — ':'')+q.name+'. Только образец.','Подтверждённый номер сделки: Не предоставлен','Платёжные реквизиты и QR отсутствуют.','','ОБРАЗЕЦ — НЕ ДЛЯ ОПЛАТЫ'].join('\n');
 }
 async function shareSample(){
  if(!dialog.open||!quote)return {ok:false,reason:'closed'};
  if(sharing)return {ok:false,reason:'busy'};
  field('payment-receipt-preview').open=true;
  if(!shareAvailable()){field('payment-share-manual').value=receiptText();field('payment-share-manual').hidden=false;field('payment-share-manual-label').hidden=false;field('payment-share-status').textContent='Меню отправки недоступно. Скопируйте текст образца из поля ниже.';field('payment-share-manual').focus?.({preventScroll:true});field('payment-share-manual').select?.();return {ok:false,reason:'unsupported',manual:true}};
  const version=epoch,body=receiptText(),nav=window.navigator||{},send=typeof window.FasNativeShare?.share==='function'?data=>window.FasNativeShare.share(data):typeof nav.share==='function'?data=>nav.share(data):null;sharing=true;syncShare();field('payment-share-status').textContent='Подготавливаем образец…';field('payment-share-manual').hidden=true;field('payment-share-manual-label').hidden=true;
  const current=()=>dialog.open&&epoch===version;
  try{
   if(send){
    const result=await send({title:'Образец квитанции — НЕ ДЛЯ ОПЛАТЫ',text:body});
    if(!current())return {ok:false,stale:true};
    if(result?.cancelled===true){field('payment-share-status').textContent='Отправка образца отменена.';return {ok:false,cancelled:true}}
    field('payment-share-status').textContent='Окно отправки закрыто. Образец не подтверждает оплату.';return {ok:true,method:'share',sampleOnly:true};
   }
   await nav.clipboard.writeText(body);
   if(!current())return {ok:false,stale:true};
   field('payment-share-status').textContent='Образец скопирован. Вставьте его в сообщение получателю. Это не подтверждение оплаты.';return {ok:true,method:'clipboard',sampleOnly:true};
  }catch(reason){
   if(!current())return {ok:false,stale:true};
   if(reason?.name==='AbortError'||/^share\s+cancel(?:ed|led)?[.!]?$/i.test(String(reason?.message||'').trim())){field('payment-share-status').textContent='Отправка образца отменена.';return {ok:false,cancelled:true}}
   field('payment-share-manual').value=body;field('payment-share-manual').hidden=false;field('payment-share-manual-label').hidden=false;field('payment-share-status').textContent='Не удалось отправить или скопировать образец. Скопируйте текст из поля ниже.';field('payment-share-manual').focus?.({preventScroll:true});field('payment-share-manual').select?.();return {ok:false,manual:true};
  }finally{if(current()){sharing=false;syncShare()}}
 }
 dialog.addEventListener('change',event=>{if(event.target.matches?.('input[name="payment-method"]'))updateMethod(event.target.value)});
 dialog.querySelector('[data-payment-close]').onclick=close;field('payment-print').onclick=printSample;field('payment-share').onclick=shareSample;
 dialog.addEventListener('close',()=>{if(dialog.open)return;epoch++;sharing=false;document.body.classList.remove('payment-open');printing=false;if(origin?.isConnected!==false)origin?.focus?.({preventScroll:true});if(typeof reelsMode!=='undefined'&&reelsMode&&typeof syncReels==='function'&&typeof swipeIndex==='function')syncReels(swipeIndex())});
 window.FasPayments=Object.freeze({open,close,state,printSample,shareSample,refreshLot});
})();
