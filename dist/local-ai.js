/* Optional free on-device inference. No engine, model, microphone or worker starts at page load. */
(()=>{
 'use strict';
 if(window.FasLocalAI)return;
 const P=window.FasLocalAIPolicy;
 if(!P)return;
 const MAX_QUERY=450,MODEL_PREFIX='https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2/resolve/2c4055b12046f11709e9df2c122e59ffbdc2f900/';
 let dialog=null,worker=null,epoch=0,request=0,phase='off',progress=0,pending=null,proposal=null,proposalQuery='',timer=null;
 const field=id=>dialog?.querySelector('#local-ai-'+id);
 function status(text){if(field('status'))field('status').textContent=text}
 function render(){if(!dialog)return;field('enable').disabled=phase!=='off'&&phase!=='error';field('stop').disabled=phase==='off';field('ask').disabled=phase==='loading'||phase==='thinking';field('query').disabled=phase==='thinking';field('progress').value=progress;field('progress').classList.toggle('local-ai-hidden',phase!=='loading');field('ask').textContent=phase==='thinking'?'Разбираю запрос…':'Понять запрос';dialog.setAttribute('aria-busy',String(phase==='loading'||phase==='thinking'))}
 function hideResult(){proposal=null;proposalQuery='';const result=field('result');if(result){result.replaceChildren();result.classList.add('local-ai-hidden')}}
 function stop(message='Локальная модель выключена. Обычный помощник продолжает работать.'){
  epoch++;request++;clearTimeout(timer);timer=null;const previous=worker;worker=null;try{previous?.terminate()}catch{}phase='off';progress=0;hideResult();
  if(pending){pending.resolve({ok:false,reason:'cancelled'});pending=null}status(message);render();
 }
 function fail(message){stop(message);phase='error';render()}
 function ensureDialog(){
  if(dialog)return dialog;
  dialog=document.createElement('dialog');dialog.id='local-ai-dialog';dialog.className='local-ai-dialog';dialog.setAttribute('aria-labelledby','local-ai-title');
  dialog.innerHTML='<header class="local-ai-header" data-dialog-swipe-header><h2 id="local-ai-title">Локальный ИИ</h2><button type="button" data-local-ai-close aria-label="Закрыть локальный ИИ">✕</button></header><div class="local-ai-content"><p>Бесплатная многоязычная нейросеть помогает понять свободную фразу и предлагает раздел или поиск. Действие выполняется только после вашей проверки.</p><p class="local-ai-note">Первое включение загрузит примерно 150 МБ с внешних серверов. Нужны современный браузер с WebAssembly и свободная память устройства. При нехватке ресурсов доступен обычный помощник. Это модель понимания запросов, а не свободный чат. Запрос обрабатывается на устройстве; профиль и документы в модель не передаются.</p><div class="local-ai-actions"><button id="local-ai-enable" class="local-ai-primary" type="button">Включить и скачать модель</button><button id="local-ai-stop" type="button">Остановить</button></div><p id="local-ai-status" class="local-ai-status" role="status" aria-live="polite">Модель выключена. Загрузка начнётся только по вашей кнопке.</p><progress id="local-ai-progress" class="local-ai-progress local-ai-hidden" max="1" value="0" aria-label="Загрузка модели"></progress><form id="local-ai-form"><label for="local-ai-query">Запрос к помощнику</label><textarea id="local-ai-query" maxlength="450" placeholder="Например: где посмотреть сохранённые лоты?"></textarea><div class="local-ai-actions"><button id="local-ai-ask" class="local-ai-primary" type="submit">Понять запрос</button><button id="local-ai-ordinary" type="button">Обычный помощник</button></div></form><div id="local-ai-result" class="local-ai-result local-ai-hidden" aria-live="polite"></div><p class="local-ai-note">Модель может ошибаться. Цены, статус, деньги и юридические ответы определяются данными и правилами сайта. ИИ не делает ставки, покупки, переводы или публикации.</p><div class="local-ai-actions"><button id="local-ai-clear" type="button">Удалить скачанную модель</button></div><p class="local-ai-note"><a href="/local-ai-notice.html" target="_blank" rel="noopener">Источники, лицензии и ограничения</a></p></div>';
  document.body.appendChild(dialog);
  dialog.addEventListener('close',()=>stop());
  dialog.addEventListener('cancel',()=>stop());
  dialog.querySelector('[data-local-ai-close]').onclick=close;
  field('enable').onclick=enable;field('stop').onclick=()=>{stop();hideResult()};
  field('form').onsubmit=event=>{event.preventDefault();ask(field('query').value)};
  field('ordinary').onclick=()=>{close();window.FasVoiceAssistant?.open?.()};
  field('clear').onclick=clearCache;render();return dialog;
 }
 function open(options={}){
  window.FasVoiceAssistant?.stop?.();window.FasAssistantPreferences?.pauseSpeech?.();
  const voice=document.querySelector?.('#voice-dialog');if(voice?.open){try{window.speechSynthesis?.cancel?.()}catch{}}
  const d=ensureDialog();if(options.prefill===true){const value=document.querySelector?.('#voice-command')?.value?.trim();if(value&&value.length<=MAX_QUERY){field('query').value=value;hideResult()}else if(value){status('Голосовой запрос длиннее 450 символов. Сократите его; исходный текст сохранён в голосовом помощнике.')}}if(!d.open){if(typeof d.showModal==='function')d.showModal();else{status('В этом браузере окно недоступно. Используйте обычный помощник.');return false}}return true}
 function close(){stop();if(dialog?.open)dialog.close()}
 async function enable(){
  ensureDialog();if(worker||phase==='loading')return {ok:false,reason:'busy'};
  if(!window.isSecureContext||typeof WebAssembly!=='object'||typeof Worker!=='function'||!window.crypto?.subtle){fail('В этом браузере нет доступного WebAssembly или защищённого локального выполнения. Используйте обычный помощник.');return {ok:false,reason:'unsupported'}}
  stop();hideResult();const generation=epoch;phase='loading';status('Проверяю возможность запуска на устройстве…');render();
  try{
   const estimate=await navigator.storage?.estimate?.().catch(()=>null);if(generation!==epoch)return {ok:false,reason:'cancelled'};
   if(estimate?.quota&&estimate.quota-(estimate.usage||0)<220*1024*1024){fail('Недостаточно свободного места для модели. Освободите около 220 МБ или используйте обычный помощник.');return {ok:false,reason:'storage'}}
   worker=new Worker('/local-ai-worker.js',{type:'module',name:'fas-local-ai'});const active=worker;
   active.onmessage=event=>onMessage(event.data,generation,active);
   active.onerror=()=>{if(worker===active&&generation===epoch)fail('Не удалось запустить локальную модель. Проверьте WebAssembly, память и доступность загрузки; обычный помощник работает.')};
   timer=setTimeout(()=>{if(worker===active&&generation===epoch)fail('Загрузка заняла слишком много времени. Она остановлена; можно повторить или открыть обычный помощник.')},15*60*1000);
   active.postMessage({type:'load',generation});return {ok:true};
  }catch{if(generation===epoch)fail('Локальная модель недоступна: загрузка, память или политика браузера. Используйте обычный помощник.');return {ok:false,reason:'initialization'}}
 }
 function showProposal(raw,query){
  proposal=P.proposal(raw,query);proposalQuery=query.trim();const box=field('result');if(!box)return;box.replaceChildren();
  for(const [tag,text]of [['h3',proposal.title],['p',proposal.text],['p','Источник: '+proposal.source]]){const node=document.createElement(tag);node.textContent=text;if(tag==='p'&&text.startsWith('Источник:'))node.className='local-ai-note';box.appendChild(node)}
  if(proposal.kind!=='help'){const button=document.createElement('button');button.type='button';button.className='local-ai-primary';button.textContent=proposal.title;const expected=proposal;button.onclick=()=>apply(expected);box.appendChild(button)}
  box.classList.remove('local-ai-hidden');
 }
 function onMessage(data,generation,active){
  if(worker!==active||epoch!==generation||!data||data.generation!==generation)return;
  if(data.type==='progress'&&phase==='loading'){progress=Number.isFinite(data.progress)?Math.max(0,Math.min(1,data.progress)):0;status('Загрузка и подготовка модели: '+Math.round(progress*100)+'%. Можно остановить.');render()}
  if(data.type==='ready'&&phase==='loading'){clearTimeout(timer);timer=null;phase='ready';progress=1;status('Модель загружена. Введите фразу; предложение нужно будет подтвердить.');render()}
  if(data.type==='error'){fail('Не удалось выполнить локальный ИИ. Возможны нехватка памяти, ошибка загрузки или проверки файлов. Используйте обычный помощник.');return}
  if(data.type==='result'&&phase==='thinking'&&pending&&data.id===pending.id){clearTimeout(timer);timer=null;const current=pending;pending=null;phase='ready';showProposal(typeof data.raw==='string'?data.raw:'',current.query);status('Предложение готово. Проверьте его; модель может ошибаться.');render();current.resolve({ok:true,intent:proposal.intent,kind:proposal.kind})}
 }
 function ask(text){
  ensureDialog();const query=typeof text==='string'?text.trim():'';
  if(!query||query.length>MAX_QUERY){status('Введите запрос длиной от 1 до 450 символов.');return Promise.resolve({ok:false,reason:'query'})}
  if(phase==='loading'||phase==='thinking')return Promise.resolve({ok:false,reason:'busy'});
  field('query').value=query;
  if(/(?:^|[^а-яё])(?:купи|покупай|заплати|оплати|переведи|перечисли|спиши|удали|удаляй|сотри|стери|сними|снять|убери|убрать|подтверди|сделай\s+ставку|поставь\s+(?:ставку|миллион|полмиллиона|\d))(?=$|[^а-яё])/iu.test(query)){showProposal('{"intent":"help"}',query);status('Показаны правила сайта. Денежные и необратимые действия выполняются только в штатных формах.');return Promise.resolve({ok:true,intent:'help',kind:'help',source:'site-policy'})}
  if(/не\s+(?:открывай|открывать|показывай|показывать|переходи|переходить|ищи|искать)|не\s+хочу\s+(?:откры|пере|смотр|искать)/iu.test(query)){showProposal('{"intent":"unsupported"}',query);status('В запросе есть отрицание. Уточните, какое действие вы хотите выполнить.');return Promise.resolve({ok:true,intent:'unsupported',kind:'help',source:'site-policy'})}
  const trusted=window.FasVoiceAssistant?.parse?.(query),known={favorites:'favorites',cabinet:'cabinet',my_bids:'my_bids',my_purchases:'purchases',map:'map',feed:'feed',catalog:'catalog'};
  if(trusted&&Object.hasOwn(known,trusted.action)){showProposal(JSON.stringify({intent:known[trusted.action]}),query);status('Команда распознана правилами сайта. Проверьте переход.');return Promise.resolve({ok:true,intent:known[trusted.action],kind:'route',source:'site-command'})}
  if(phase!=='ready'||!worker){status('Для свободной фразы включите нейросеть или откройте обычный помощник.');return Promise.resolve({ok:false,reason:'not-ready'})}
  hideResult();phase='thinking';status('Разбираю фразу на устройстве. Никакие действия ещё не выполняются.');render();const id=++request,generation=epoch;
  return new Promise(resolve=>{pending={id,query,resolve};timer=setTimeout(()=>{if(pending?.id===id&&epoch===generation)fail('Разбор занял слишком много времени. Модель остановлена; ваш запрос остался в поле.')},90*1000);worker.postMessage({type:'ask',generation,id,text:query})});
 }
 function apply(expected){
  const generation=epoch;
  const top=()=>window.FasDialogLifecycle?.top?.()||Array.from(document.querySelectorAll('dialog[open]')).filter(node=>node.open).at(-1)||null;
  const current=()=>proposal===expected&&epoch===generation&&dialog?.open&&top()===dialog&&phase!=='loading'&&phase!=='thinking'&&!document.hidden;
  if(!proposal||!current())return {ok:false,reason:'stale'};
  // Refresh profile ownership before using an old panel. This may synchronously
  // dispatch profileChanged and cancel the proposal before the storage event.
  try{window.FasAssistantPersonalization?.state?.()}catch{return {ok:false,reason:'profile'}}
  if(!current())return {ok:false,reason:'cancelled'};
  if((field('query')?.value?.trim()||'')!==proposalQuery){status('Запрос изменился. Сначала повторите разбор.');hideResult();return {ok:false,reason:'changed'}}
  const confirmed=P.proposal(JSON.stringify({intent:expected.intent}),field('query')?.value?.trim()||'');
  if(confirmed.command!==expected.command||!['route','search'].includes(confirmed.kind)){status('Запрос изменился. Сначала повторите разбор.');hideResult();return {ok:false,reason:'changed'}}
  const engine=window.FasVoiceAssistant;if(typeof engine?.execute!=='function'){status('Навигация помощника сейчас недоступна. Откройте раздел из меню.');return {ok:false,reason:'unavailable'}}
  const parsed=engine.parse?.(confirmed.command),allowed=new Set(['favorites','cabinet','my_bids','my_purchases','map','feed','catalog','search']);
  // The ordinary parser can also discover a profile change. Never continue
  // after its callback has stopped this worker or replaced the reviewed query.
  if(!current()||(field('query')?.value?.trim()||'')!==proposalQuery)return {ok:false,reason:'cancelled'};
  if(!parsed||!allowed.has(parsed.action)||confirmed.kind==='search'&&parsed.action!=='search'){status('Предложенное действие не прошло проверку. Используйте меню сайта.');return {ok:false,reason:'policy'}}
  proposal=null;close();return engine.execute(confirmed.command);
 }
 async function clearCache(){
  stop();hideResult();status('Удаляю только файлы локальной модели…');
  try{if(globalThis.caches){for(const name of ['fas-local-ai-artifacts-v1']){const cache=await caches.open(name);for(const req of await cache.keys()){if(name==='fas-local-ai-artifacts-v1'||req.url.startsWith(MODEL_PREFIX))await cache.delete(req)}}}status('Скачанная модель удалена. Профиль, ставки, фото и черновики сохранены.');return {ok:true}}
  catch{status('Браузер не позволил полностью удалить модель. Её можно удалить через настройки данных сайта; сначала сохраните нужные черновики.');return {ok:false,reason:'storage'}}
 }
 document.addEventListener('click',event=>{if(event.target?.closest?.('[data-local-ai-open]')){event.preventDefault();open({prefill:true})}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){stop('Модель остановлена при уходе со страницы. Для продолжения включите её снова.');hideResult()}});
 window.addEventListener('fas-assistant-personalization-change',event=>{if(event.detail?.profileChanged){stop('Профиль изменён. Предыдущий запрос удалён.');if(field('query'))field('query').value='';hideResult()}});
 window.FasLocalAI=Object.freeze({open,close,enable,stop,ask,clearCache,state:()=>({phase,ready:phase==='ready',onDevice:true,model:'multilingual-MiniLM-L12-v2',progress,requestPending:!!pending})});
})();
