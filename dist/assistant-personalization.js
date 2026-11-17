/* Names and speech choices belong to the current local profile. No microphone is started here. */
(()=>{
 'use strict';
 if(window.FasAssistantPersonalization)return;
 const PREFIX='fas-assistant-personalization-v1:',WORKSPACE='fas-seller-workspace-v1';
 const DEFAULT_NAME='Помощник',MAX_NAME=40,MAX_PENDING=8;
 const pending=new Map();
 let adapter={},owner=null,value,storageAvailable=true,workspaceRaw,workspaceOwner='device',preview=null;
 const record=item=>item&&typeof item==='object'&&!Array.isArray(item);
 const read=(action,fallback)=>{try{return action()}catch{return fallback}};
 const escape=text=>String(text??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const clean=text=>String(text??'').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s+/g,' ').trim();
 const defaults=()=>({assistantName:DEFAULT_NAME,userName:'',voiceURI:'',gender:'auto',rate:1,configured:false});

 function profile(){
  if(typeof adapter.getProfileId==='function'){
   const id=read(()=>adapter.getProfileId(),null);
   return typeof id==='string'&&id.trim()&&id.length<=256?id:'device';
  }
  const raw=read(()=>localStorage.getItem(WORKSPACE),null);
  if(raw!==workspaceRaw){
   workspaceRaw=raw;workspaceOwner='device';
   const workspace=read(()=>JSON.parse(raw||'null'),null),id=workspace?.profile?.id;
   if(workspace?.version===1&&typeof id==='string'&&id.trim()&&id.length<=256)workspaceOwner=id;
  }
  return workspaceOwner;
 }
 function key(){return PREFIX+encodeURIComponent(owner)}
 function validName(input,allowEmpty=false){
  if(typeof input!=='string'||input.length>200)return null;
  const name=input.normalize('NFC').replace(/\s+/g,' ').trim();
  if(!name)return allowEmpty?'':null;
  if(Array.from(name).length>MAX_NAME||!/^[\p{L}][\p{L}\p{M}\d '\u2019\u2010-\u2015-]*$/u.test(name))return null;
  if(/(?:^|[\s-])(?:найди|найти|покажи|открой|закрой|купи|купить|оплати|переведи|удали|опубликуй|ставку|подготовь|подтверди|отправь|позвони|создай|включи|выключи|говори|зови|назови|называйся|обращайся|переименуй|buy|pay|delete|publish|confirm|prepare|send|call|create|rename)(?:$|[\s-])/iu.test(name))return null;
  return name;
 }
 function sanitize(raw){
  const result=defaults();if(!record(raw))return result;
  result.assistantName=validName(raw.assistantName)||DEFAULT_NAME;
  result.userName=validName(raw.userName,true)??'';
  if(typeof raw.voiceURI==='string'&&raw.voiceURI.length<=512&&!/[\u0000-\u001f\u007f]/.test(raw.voiceURI))result.voiceURI=raw.voiceURI;
  if(['auto','male','female'].includes(raw.gender))result.gender=raw.gender;
  if(typeof raw.rate==='number'&&Number.isFinite(raw.rate)&&raw.rate>=0.7&&raw.rate<=1.4)result.rate=Math.round(raw.rate*100)/100;
  result.configured=raw.configured===true;return result;
 }
 function load(){
  let raw=null,readOK=true;try{raw=localStorage.getItem(key())}catch{readOK=false}
  const stored=typeof raw==='string'&&raw.length<5000?read(()=>JSON.parse(raw),null):null;
  value=stored?.version===1&&stored.owner===owner?sanitize(stored.settings):defaults();
  if(pending.has(owner)){value={...value,...pending.get(owner)};storageAvailable=false}else storageAvailable=readOK;
 }
 function stopPreview(){
  if(!preview)return;preview=null;read(()=>window.speechSynthesis?.cancel?.(),null);
 }
 function emit(profileChanged=false){
  if(typeof window.CustomEvent==='function')window.dispatchEvent?.(new window.CustomEvent('fas-assistant-personalization-change',{detail:{profileChanged}}));
 }
 function scope(){
  const next=profile();if(next===owner)return false;
  const previous=owner;stopPreview();owner=next;load();if(previous!==null)emit(true);return true;
 }
 function shared(){
  if(scope())return;
  let raw;try{raw=localStorage.getItem(key())}catch{storageAvailable=false;return}
  const stored=typeof raw==='string'&&raw.length<5000?read(()=>JSON.parse(raw),null):null;
  value={...(stored?.version===1&&stored.owner===owner?sanitize(stored.settings):defaults()),...(pending.get(owner)||{})};
 }
 function save(patch){
  shared();value={...value,...patch};
  try{localStorage.setItem(key(),JSON.stringify({version:1,owner,settings:value}));pending.delete(owner);storageAvailable=true}
  catch{pending.set(owner,{...(pending.get(owner)||{}),...patch});while(pending.size>MAX_PENDING)pending.delete(pending.keys().next().value);storageAvailable=false}
  emit();return storageAvailable;
 }

 // Browsers expose names and languages, not a reliable gender field. These
 // recognizable voice names are suggestions only; the user can audition any voice.
 function inferredGender(name){
  const text=clean(name);
  if(/(?:^|[^a-z])(?:pavel|dmitry|dmitri|yuri|aleksandr|alexander|david|mark|daniel|fred|alex|aaron|matthew|sergey)(?:$|[^a-z])/.test(text))return 'male';
  if(/(?:^|[^a-z])(?:irina|svetlana|milena|katya|anna|elena|tatyana|victoria|samantha|karen|moira|susan|zira|hazel|allison|aria|jenny|natasha)(?:$|[^a-z])/.test(text))return 'female';
  return 'unknown';
 }
 function voices(){
  const list=read(()=>window.speechSynthesis?.getVoices?.(),[]);
  return Array.isArray(list)?list.filter(voice=>voice&&typeof voice.name==='string'&&voice.name.length<=200&&typeof voice.lang==='string'&&voice.lang.length<=40).slice(0,200):[];
 }
 const voiceId=voice=>String(voice.voiceURI||voice.name+'|'+voice.lang).slice(0,512);
 function selectedVoice(language='ru-RU'){
  const list=voices();
  if(value.voiceURI)return list.find(voice=>voiceId(voice)===value.voiceURI)||null;
  if(value.gender==='auto')return null;
  const base=String(language).split('-')[0].toLowerCase();
  return list.find(voice=>voice.lang.toLowerCase().split('-')[0]===base&&inferredGender(voice.name)===value.gender)||null;
 }
 function voiceStatus(){
  const list=voices(),selected=selectedVoice();
  if(!window.speechSynthesis||typeof window.SpeechSynthesisUtterance!=='function')return 'Озвучивание в этом браузере недоступно. Текстовый помощник продолжает работать.';
  if(!list.length)return 'Браузер пока не предоставил голоса. Можно продолжить текстом и проверить список позже.';
  if(selected)return 'Выбран голос «'+selected.name+'». Проверьте его кнопкой «Прослушать».';
  if(value.voiceURI)return 'Сохранённый голос сейчас недоступен. Используется голос браузера по умолчанию.';
  if(value.gender!=='auto')return (value.gender==='male'?'Мужской':'Женский')+' вариант для русского языка не найден. Используется голос браузера по умолчанию; можно выбрать другой из списка.';
  return 'Используется голос браузера по умолчанию. Доступные голоса зависят от устройства.';
 }
 function state(){
  shared();return {...value,scope:owner,storageAvailable,voiceStatus:voiceStatus(),voices:voices().map(voice=>({id:voiceId(voice),name:voice.name,lang:voice.lang,gender:inferredGender(voice.name)}))};
 }
 function getGreeting(){shared();return value.userName?value.userName+', чем могу помочь?':'Здравствуйте! Чем могу помочь?'}
 function promptIfNeeded(){shared();return {needed:!value.configured,message:'Как к вам обращаться? Какое имя выбрать для помощника? Это можно изменить в настройках.'}}
 function decorateUtterance(utterance){
  if(!utterance||typeof utterance!=='object')return utterance;
  shared();const voice=selectedVoice(utterance.lang||'ru-RU');
  utterance.rate=value.rate;utterance.voice=voice;
  if(voice?.lang)utterance.lang=voice.lang;
  return utterance;
 }
 function previewVoice(){
  scope();if(document.hidden===true)return {ok:false,message:'Прослушивание доступно, пока страница открыта.'};
  const microphone=read(()=>window.FasVoiceAssistant?.state?.(),{});
  if(microphone.listening||microphone.starting)return {ok:false,message:'Сначала остановите запись, затем прослушайте голос.'};
  const synth=window.speechSynthesis,Utterance=window.SpeechSynthesisUtterance;
  if(!synth?.speak||typeof Utterance!=='function')return {ok:false,message:voiceStatus()};
  if(!preview&&(synth.speaking||synth.pending))return {ok:false,message:'Дождитесь окончания текущей фразы.'};
  stopPreview();const utterance=new Utterance(getGreeting()+' Я '+value.assistantName+'.');utterance.lang='ru-RU';decorateUtterance(utterance);preview=utterance;
  const finish=()=>{if(preview===utterance)preview=null};utterance.onend=finish;utterance.onerror=finish;
  try{synth.speak(utterance);return {ok:true,message:'Пример голоса запущен.'}}catch{finish();return {ok:false,message:'Не удалось воспроизвести голос. Выберите другой или продолжите текстом.'}}
 }

 function parseInvocation(text){
  shared();const raw=String(text??'').trim().slice(0,500),name=value.assistantName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/[её]/ig,'[её]');
  const match=new RegExp('^(?:(?:привет|здравствуй|здравствуйте|эй|hello|hey|hi)[,\\s]+)?'+name+'(?=$|[\\s,!:;.?—])','iu').exec(raw);
  if(!match)return {addressed:false,command:raw,greeting:''};
  let command=raw.slice(match[0].length).replace(/^[\s,!:;.?—-]+/,'');
  if(/^(?:привет|здравствуй|здравствуйте|hello|hi)[.!?]*$/i.test(command))command='';
  return {addressed:true,command,greeting:command?'':getGreeting()};
 }
 function unquote(text){const raw=String(text??'').trim();return /^(?:".*"|«.*»|'.*')$/.test(raw)?raw.slice(1,-1).trim():raw}
 function parseCommand(text){
  shared();const raw=String(text??'').trim().slice(0,500).replace(/[.!?]+$/,'');let match,request;
  if(/^(?:(?:открой|покажи|измени) )?(?:настройки (?:имени|голоса)|имя и голос помощника|персонализация помощника)$/iu.test(raw))request={type:'show'};
  else if((match=/^(?:тебя зовут|буду звать тебя|называйся(?: теперь)?|твое имя|твоё имя|переименуй себя в|назови себя)\s+(.+)$/iu.exec(raw)))request={type:'rename-assistant',value:unquote(match[1])};
  else if((match=/^(?:зови меня|называй меня|обращайся ко мне(?: как)?|мое имя|моё имя|меня зовут)\s+(.+)$/iu.exec(raw)))request={type:'rename-user',value:unquote(match[1])};
  else if(/^(?:не обращайся ко мне по имени|не называй меня по имени)$/iu.test(raw))request={type:'rename-user',value:''};
  else if((match=/^(?:говори|озвучивай|выбери|включи)\s+(мужским|женским|мужской|женский)\s+голос(?:ом)?$/iu.exec(raw)))request={type:'voice-preference',value:/^муж/i.test(match[1])?'male':'female'};
  else if(/^(?:говори|читай)\s+(?:чуть )?(?:помедленнее|медленнее|побыстрее|быстрее)$/iu.test(raw))request={type:'rate-step',direction:/медленнее/i.test(raw)?-1:1};
  if(!request)return null;
  return {action:'personalization',request:{...request,scope:owner}};
 }
 function execute(request){
  shared();if(!record(request)||request.scope!==undefined&&request.scope!==owner)return {ok:false,handled:true,message:'Профиль изменился. Откройте настройки помощника заново.'};
  if(request.type==='show')return {ok:true,handled:true,showSettings:true,message:'Здесь можно выбрать имена, голос и скорость речи.'};
  let patch,message;
  if(request.type==='rename-assistant'||request.type==='rename-user'){
   const name=validName(request.value,request.type==='rename-user');
   if(name===null)return {ok:false,handled:true,message:'Укажите имя до 40 символов: буквы, пробелы, дефис или апостроф. Команды и разметка не подходят.'};
   patch={[request.type==='rename-user'?'userName':'assistantName']:name,configured:true};message=request.type==='rename-user'?(name?name+', так и буду к вам обращаться.':'Буду обращаться к вам без имени.'):'Теперь меня зовут '+name+'.';
  }else if(request.type==='voice-preference'&&['auto','male','female'].includes(request.value)){patch={gender:request.value,voiceURI:''};message='Предпочтение голоса сохранено. Доступность зависит от голосов вашего браузера.'}
  else if(request.type==='rate-step'&&[-1,1].includes(request.direction)){patch={rate:Math.max(0.7,Math.min(1.4,Math.round((value.rate+request.direction*0.15)*100)/100))};message='Скорость голоса: '+patch.rate+'×.'}
  else return {ok:false,handled:true,message:'Настройка не распознана.'};
  const persisted=save(patch);return {ok:true,handled:true,message:message+(persisted?'':' Настройка действует до закрытия страницы: сохранить её не удалось.')};
 }

 function voiceOptions(selected,list){
  return '<option value="">Подобрать автоматически</option>'+(selected&&!list.some(voice=>voice.id===selected)?'<option value="'+escape(selected)+'" selected>Сохранённый голос — сейчас недоступен</option>':'')+list.map(voice=>'<option value="'+escape(voice.id)+'" '+(selected===voice.id?'selected':'')+'>'+escape(voice.name+' · '+voice.lang)+'</option>').join('');
 }
 function settingsHTML(){
  const current=state();
  return '<section class="assistant-personalization" data-assistant-personalization-panel data-personalization-owner="'+escape(owner)+'"><h3>Давайте познакомимся</h3><p>Как к вам обращаться и как назвать помощника?</p><div class="assistant-name-fields"><label>Ваше имя<input data-personalization="userName" maxlength="40" autocomplete="off" placeholder="Можно оставить пустым" value="'+escape(current.userName)+'"></label><label>Имя помощника<input data-personalization="assistantName" maxlength="40" autocomplete="off" value="'+escape(current.assistantName)+'"></label></div><label>Предпочтение голоса<select data-personalization="gender">'+[['auto','Любой'],['male','Мужской'],['female','Женский']].map(([id,title])=>'<option value="'+id+'" '+(current.gender===id?'selected':'')+'>'+title+'</option>').join('')+'</select></label><label>Голос на этом устройстве<select data-personalization="voiceURI">'+voiceOptions(current.voiceURI,current.voices)+'</select></label><p class="assistant-voice-note">Браузер не гарантирует пол голоса. Предпочтение подбирается по известным названиям; прослушайте результат.</p><label>Скорость речи<select data-personalization="rate">'+[...new Set([0.7,0.85,1,1.15,1.3,1.4,current.rate])].sort((a,b)=>a-b).map(rate=>'<option value="'+rate+'" '+(current.rate===rate?'selected':'')+'>'+rate+'×'+(rate===1?' — обычная':'')+'</option>').join('')+'</select></label><div class="assistant-personalization-actions"><button type="button" class="primary" data-personalization-save>Сохранить</button><button type="button" class="outline" data-personalization-preview>Прослушать</button><button type="button" class="outline" data-personalization-skip>Пока без изменений</button></div><p data-personalization-status role="status">'+escape(current.voiceStatus)+(current.storageAvailable?'':' Сохранить настройки не удалось; они действуют до закрытия страницы.')+'</p><small>Имена и голос сохраняются в этом профиле браузера. Обращение по имени работает в открытом помощнике после вашего запуска ввода. Постоянного прослушивания нет.</small></section>';
 }
 function panelStatus(panel,message){const active=Array.from(document.querySelectorAll?.('[data-assistant-personalization-panel]')||[]).find(node=>node.dataset.personalizationOwner===owner);const field=(active||panel).querySelector('[data-personalization-status]');if(field)field.textContent=message}
 function savePanel(panel){
  scope();if(panel.dataset.personalizationOwner!==owner)return {ok:false,message:'Профиль изменился. Откройте настройки заново.'};
  const field=name=>panel.querySelector('[data-personalization="'+name+'"]'),assistantName=validName(field('assistantName')?.value),userName=validName(field('userName')?.value,true),gender=field('gender')?.value,voiceURI=field('voiceURI')?.value||'',rate=Number(field('rate')?.value);
  if(assistantName===null||userName===null)return {ok:false,message:'Проверьте имена: до 40 символов, без команд и разметки.'};
  if(!['auto','male','female'].includes(gender)||!Number.isFinite(rate)||rate<0.7||rate>1.4||voiceURI&&voiceURI!==value.voiceURI&&!voices().some(voice=>voiceId(voice)===voiceURI))return {ok:false,message:'Выберите доступный голос и скорость речи.'};
  const persisted=save({assistantName,userName,gender:voiceURI?'auto':gender,voiceURI,rate,configured:true});return {ok:true,message:persisted?getGreeting()+' Настройки сохранены.':getGreeting()+' Настройки действуют до закрытия страницы: сохранить их не удалось.'};
 }
 function configure(options={}){adapter={...adapter,...options};scope();return state()}
 scope();
 document.addEventListener?.('click',event=>{
  const button=event.target.closest?.('[data-personalization-save],[data-personalization-preview],[data-personalization-skip]');if(!button)return;
  const panel=button.closest('[data-assistant-personalization-panel]');if(!panel)return;event.preventDefault();
  if(button.hasAttribute('data-personalization-skip')){scope();if(panel.dataset.personalizationOwner!==owner){panelStatus(panel,'Профиль изменился. Откройте настройки заново.');return}save({configured:true});panelStatus(panel,getGreeting());return}
  const result=savePanel(panel);panelStatus(panel,result.message);if(result.ok&&button.hasAttribute('data-personalization-preview')){const spoken=previewVoice();panelStatus(panel,spoken.message+' '+voiceStatus())}
 });
 document.addEventListener?.('visibilitychange',()=>{if(document.hidden)stopPreview();scope()});
 window.addEventListener?.('storage',event=>{if(scope())return;if(event.key===key()){stopPreview();load();emit()}});
 document.addEventListener?.('change',event=>{
  const field=event.target;if(!field?.matches?.('[data-personalization]'))return;
  const panel=field.closest('[data-assistant-personalization-panel]');scope();if(!panel||panel.dataset.personalizationOwner!==owner)return;
  if(field.dataset.personalization==='gender')panel.querySelector('[data-personalization="voiceURI"]').value='';
  if(field.dataset.personalization==='voiceURI')panel.querySelector('[data-personalization="gender"]').value='auto';
 });
 window.speechSynthesis?.addEventListener?.('voiceschanged',()=>{
  // OS voices often arrive after opening the panel. Preserve unsaved name input.
  const list=voices().map(voice=>({id:voiceId(voice),name:voice.name,lang:voice.lang}));
  document.querySelectorAll?.('[data-assistant-personalization-panel]').forEach(panel=>{
   const select=panel.querySelector('[data-personalization="voiceURI"]');if(select){const selected=select.value;select.innerHTML=voiceOptions(selected,list);select.value=selected}
  });
 });
 window.FasAssistantPersonalization=Object.freeze({configure,state,getGreeting,promptIfNeeded,settingsHTML,parseInvocation,parseCommand,execute,decorateUtterance,previewVoice});
})();
