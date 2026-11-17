const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {setup}=require('./helpers/quickbar-dom.cjs'),read=name=>fs.readFileSync(path.join(__dirname,'../dist',name),'utf8');
function boot({supported=true,configured=true}={}){
 const h=setup({mobile:true}),c=h.context,records=new Map(),instances=[],routes=[],spoken=[];let owner='alice',cancels=0;
 records.set('fas-assistant-personalization-v1:alice',JSON.stringify({version:1,owner:'alice',settings:{configured,userName:'Иван',assistantName:'Ася'}}));
 c.localStorage={getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,value)};
 c.CustomEvent=class{constructor(type,options={}){this.type=type;this.detail=options.detail}};c.dispatchEvent=event=>{for(const listener of h.winEvents[event.type]||[])listener(event)};
 c.SpeechSynthesisUtterance=class{constructor(text){this.text=text}};c.speechSynthesis={getVoices:()=>[],cancel(){cancels++},speak:utterance=>spoken.push(utterance)};
 class Recognition{constructor(){instances.push(this)}start(){this.started=true}abort(){this.aborted=true;this.onend?.()}}
 if(supported)c.SpeechRecognition=Recognition;
 for(const name of ['geo-data.js','catalog-data.js','search-intent.js','assistant-personalization.js','assistant-preferences.js'])vm.runInContext(read(name),c);
 c.FasAssistantPersonalization.configure({getProfileId:()=>owner});c.FasAssistantPreferences.configure({getProfileId:()=>owner});
 c.FasGlobalSearch=Object.assign((query,options)=>{assert.equal(h.document.querySelector('#voice-dialog').open,false);routes.push({query,options});return {query,count:1}},{supportsCriteria:true});
 vm.runInContext(read('voice-assistant.js'),c);
 const voice=c.FasVoiceAssistant,dialog=h.document.querySelector('#voice-dialog'),field=id=>dialog.querySelector('#'+id),button=selector=>dialog.querySelector(selector);
 const click=node=>{node.onclick?.({target:node,type:'click',preventDefault(){}});h.click(node)};
 const final=(instance,text)=>{const result=[{transcript:text}];result.isFinal=true;instance.onresult?.({results:[result]})};
 return {...h,c,records,instances,routes,spoken,voice,dialog,field,button,click,final,setOwner(value){owner=value;c.FasAssistantPersonalization.state()},changeOwnerSilently(value){owner=value},get cancels(){return cancels}};
}
{
 const h=boot();assert.equal(h.instances.length,0);assert.equal(h.dialog.open,false,'page load does not open or record');
 const draft=h.content.firstChild;h.modal.showModal();h.modal.scrollTop=210;
 const mic=h.add('explicit-mic','button');mic.setAttribute('data-voice-open','');mic.setAttribute('data-voice-start','');h.click(mic);
 assert.equal(h.instances.length,1);assert.equal(h.voice.state().presentation,'quick');assert.equal(h.voice.state().starting,true);assert(h.dialog.classList.contains('voice-quick'));assert(h.dialog.classList.contains('voice-listening'));assert.equal(h.button('[data-voice-animation]').hidden,false);assert.equal(h.button('[data-voice-settings]').hidden,false);assert.equal(h.field('voice-personalization').open,false);assert.equal(h.field('voice-preferences').open,false);assert.equal(h.modal.scrollTop,210);assert.equal(h.content.firstChild,draft);
 h.click(mic);assert.equal(h.instances.length,1,'a repeated microphone click does not overlap ASR');
 const current=h.instances[0];current.onstart();assert.equal(h.voice.state().listening,true);assert.equal(h.document.activeElement,h.button('[data-voice-stop]'),'keyboard focus follows the visible stop action');
 const part=[{transcript:'Найди Тойоту'}];part.isFinal=false;current.onresult({results:[part]});assert.equal(h.field('voice-interim').textContent,'Найди Тойоту');
 h.final(current,'Найди Toyota');assert.equal(h.routes.length,0,'automatic execution remains off by default');assert.equal(h.voice.state().presentation,'quick','a result does not expand settings');assert.equal(h.button('[data-voice-animation]').hidden,true);assert.equal(h.field('voice-command').value,'Найди Toyota');assert.equal(h.document.activeElement,h.dialog.querySelector('.voice-apply'),'review focuses the visible action without opening a keyboard');assert.equal(h.field('voice-personalization').open,false);
 h.field('voice-form').onsubmit({preventDefault(){}});assert.equal(h.routes.length,1);assert.equal(h.dialog.open,false);
}
{
 const h=boot({configured:false});h.voice.open();assert.equal(h.instances.length,0);assert.equal(h.voice.state().presentation,'settings');assert.equal(h.field('voice-personalization').open,true,'optional initial setup is available from full mode');
 const skip=h.dialog.querySelector('[data-personalization-skip]');h.click(skip);assert.equal(h.c.FasAssistantPersonalization.state().configured,true);h.voice.close();h.voice.open({listen:true});assert.equal(h.instances.length,1);assert.equal(h.voice.state().presentation,'quick');assert.equal(h.field('voice-personalization').open,false,'skipped setup does not reappear on microphone entry');
}
{
 const h=boot({configured:false});h.voice.open({listen:true});assert.equal(h.instances.length,1);assert.equal(h.voice.state().presentation,'quick');assert.equal(h.c.FasAssistantPersonalization.state().configured,false,'microphone does not silently accept optional setup');h.click(h.button('[data-voice-settings]'));assert.equal(h.voice.state().presentation,'settings');assert.equal(h.field('voice-personalization').open,true);
}
{
 const h=boot();h.voice.open({settings:true});h.field('voice-command').value='Сохранённый запрос';h.click(h.button('[data-voice-start]'));assert.equal(h.voice.state().presentation,'quick','the full panel Speak button enters the same compact flow');const current=h.instances.at(-1);h.click(h.button('[data-voice-settings]'));assert(current.aborted);assert.equal(h.voice.state().presentation,'settings');assert.equal(h.field('voice-command').value,'Сохранённый запрос');assert.equal(h.document.activeElement,h.field('voice-language'));
 h.click(h.button('[data-voice-start]'));const next=h.instances.at(-1);h.click(h.button('[data-voice-type]'));assert(next.aborted);assert.equal(h.voice.state().presentation,'quick');assert.equal(h.document.activeElement,h.field('voice-command'));assert.equal(h.button('[data-voice-animation]').hidden,true);
}
{
 const h=boot({supported:false});h.voice.open({listen:true});assert.equal(h.instances.length,0);assert.equal(h.voice.state().presentation,'quick');assert.equal(h.button('[data-voice-animation]').hidden,true);assert.equal(h.button('[data-voice-start]').disabled,true);assert.equal(h.document.activeElement,h.field('voice-command'));assert.match(h.field('voice-status').textContent,/не поддерживает/);h.field('voice-command').value='Найди Toyota';h.field('voice-form').onsubmit({preventDefault(){}});assert.equal(h.routes.length,1,'compact mode retains typed fallback');
}
{
 const h=boot();h.voice.open({listen:true});const denied=h.instances[0],late=denied.onresult;denied.onstart();denied.onerror({error:'not-allowed'});assert(denied.aborted);assert.match(h.field('voice-error').textContent,/запрещён/);assert.equal(h.button('[data-voice-animation]').hidden,true);assert.equal(h.voice.state().presentation,'quick');assert.equal(h.document.activeElement,h.field('voice-command'));h.click(h.button('[data-voice-start]'));assert.equal(h.instances.length,2);h.field('voice-command').value='Текущий запрос';const result=[{transcript:'Старый запрос'}];result.isFinal=true;late({results:[result]});assert.equal(h.field('voice-command').value,'Текущий запрос');
}
{
 const h=boot();h.voice.open({settings:true});h.field('voice-auto-execute').checked=true;h.field('voice-speak').checked=true;h.voice.close();h.voice.open({listen:true});assert.equal(h.field('voice-auto-execute').checked,true,'ordinary reopen preserves the explicit session choice');h.final(h.instances[0],'Найди Toyota');assert.equal(h.routes.length,1,'saved explicit opt-in still executes a safe query');
 h.voice.open({listen:true});const old=h.instances.at(-1);h.field('voice-command').value='Приватный запрос Алисы';h.setOwner('bob');assert(old.aborted);assert.equal(h.field('voice-command').value,'');assert.equal(h.field('voice-auto-execute').checked,false,'a new profile does not inherit old safe-execution consent');assert.equal(h.field('voice-speak').checked,false,'a new profile does not inherit old speech consent');h.final(old,'Найди старый запрос');assert.equal(h.routes.length,1);
}
{
 const h=boot();h.voice.open({listen:true});const old=h.instances[0];h.document.hidden=true;for(const listener of h.docEvents.visibilitychange||[])listener({type:'visibilitychange'});assert(old.aborted);h.document.hidden=false;h.final(old,'Найди Toyota');assert.equal(h.routes.length,0);h.voice.close();h.voice.open({listen:true});const fresh=h.instances.at(-1);for(const listener of h.dialog.events.close||[])listener({type:'close'});assert.equal(fresh.aborted,undefined,'late old native close cannot abort the reopened listener');assert.equal(h.voice.state().starting,true);
}
{
 const h=boot();h.voice.open({listen:true});const current=h.instances[0],other=h.add('new-top','dialog');other.showModal();h.final(current,'Найди Toyota');assert(current.aborted);assert.equal(h.routes.length,0,'hidden-under-dialog recognition cannot route');assert.equal(h.voice.state().listening,false);assert.equal(h.voice.start(),false,'an underlying helper cannot start its microphone');
}
for(const [command,section]of [['Открой настройки помощника','voice-preferences'],['Настройки голоса','voice-personalization']]){
 const h=boot();h.voice.open({listen:true});h.voice.stop();const result=h.voice.execute(command);assert.equal(result.ok,true,command);assert.equal(h.voice.state().presentation,'settings',command+' reveals its requested panel');assert.equal(h.field(section).open,true);
}
for(const configured of [true,false]){
 const h=boot({configured});h.voice.open();assert.equal(h.voice.state().presentation,configured?'quick':'settings');assert.equal(h.instances.length,0,'ordinary open never starts a microphone');h.voice.close();h.voice.open({settings:true});assert.equal(h.voice.state().presentation,'settings','explicit settings are always reachable');
}
{
 const h=boot();h.voice.open({settings:true});h.click(h.dialog.querySelector('[data-personalization-skip]'));h.voice.close();h.voice.open();assert.equal(h.voice.state().presentation,'quick','ordinary open after skipped setup is compact');
 const before=h.cancels;h.voice.start();assert(h.cancels>before,'a new microphone cancels the assistant own synthesized reply before ASR');
}
for(const nativeClose of [false,true]){
 const h=boot();h.voice.open({listen:true});const old=h.instances[0];h.dialog.close=function(){this.open=false;this.removeAttribute('open')};
 if(nativeClose)h.dialog.close();else h.voice.close();h.voice.open({listen:true});const fresh=h.instances.at(-1);for(const listener of h.dialog.events.close||[])listener({type:'close'});
 assert.equal(h.instances.length,2,'reopening before a native queued close creates one fresh recognizer');assert(old.aborted);assert.equal(fresh.aborted,undefined);assert.equal(h.voice.state().starting,true);h.final(old,'Найди старый запрос');assert.equal(h.routes.length,0);
}
{
 const h=boot();h.voice.open({settings:true});h.field('voice-auto-execute').checked=true;h.field('voice-speak').checked=true;h.voice.start();const old=h.instances[0];h.changeOwnerSilently('bob');h.final(old,'Найди приватный запрос Алисы');assert(old.aborted);assert.equal(h.routes.length,0,'profile change before storage delivery cannot auto-execute the old ASR query');assert.equal(h.field('voice-command').value,'');assert.equal(h.field('voice-auto-execute').checked,false);assert.equal(h.field('voice-speak').checked,false);
}
{
 const h=boot();h.voice.open({settings:true});h.field('voice-speak').checked=true;h.dialog.close=function(){this.open=false;this.removeAttribute('open')};
 const result=h.voice.execute('Найди Toyota');assert.equal(result.ok,true);assert.equal(h.spoken.length,1);const before=h.cancels;for(const listener of h.dialog.events.close||[])listener({type:'close'});assert.equal(h.cancels,before,'queued programmatic close must not cancel the new spoken reply');
}
{
 const h=boot();h.voice.open({listen:true});const old=h.instances[0];h.dialog.close=function(){this.open=false;this.removeAttribute('open')};h.dialog.close();const other=h.add('new-top-after-native-close','dialog');other.showModal();const focus=h.add('new-top-focus','button',other);focus.focus();const before=h.cancels;for(const listener of h.dialog.events.close||[])listener({type:'close'});assert(old.aborted);assert(h.cancels>before,'native close retains speech cleanup');assert.equal(h.document.activeElement,focus,'native late cleanup does not steal focus from a newer dialog');
}
const css=read('voice-assistant.css');assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{#voice-dialog\.voice-listening[^}]*animation:none/);assert.match(css,/#voice-dialog\.voice-quick\.voice-listening #voice-form/);assert(!/voice-quick[^{}]*#voice-bid-preview[^}]*display:none/.test(css),'the explicit bid confirmation is not hidden by compact mode');
console.log('PASS: one-click compact microphone flow, active-only animation, explicit settings/text access, optional setup, saved safe-choice and profile reset, permission/retry/stale/hidden/top-dialog guards, queued close isolation and reduced motion. No physical browser/audio proof.');
