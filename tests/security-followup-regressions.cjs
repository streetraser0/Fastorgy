'use strict';
// Real browser-module control flow with isolated local data. No network or live accounts.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {setup}=require('./helpers/quickbar-dom.cjs');
const read=name=>fs.readFileSync(path.join(__dirname,'../dist',name),'utf8');
function preferences(){
 const h=setup({mobile:true}),c=h.context,records={},spoken=[],cancelled=[];let owner='alice';
 c.localStorage={getItem:key=>records[key]??null,setItem(key,value){records[key]=value}};
 c.speechSynthesis={speaking:false,pending:false,speak(value){spoken.push(value);this.speaking=true},cancel(){cancelled.push(true);this.speaking=false}};
 c.SpeechSynthesisUtterance=class{constructor(text){this.text=text}};
 vm.runInContext(read('assistant-preferences.js'),c);const api=c.FasAssistantPreferences;
 const end=new Date(Date.now()+3600000).toISOString(),lots=[{id:1,name:'Интерес Алисы № 1',price:100,status:'live',ends:end},{id:2,name:'Интерес Алисы № 2',price:100,status:'live',ends:end}],notices=lots.map(lot=>({id:'notice-'+lot.id,type:'new-lot',lotId:lot.id}));
 api.configure({getProfileId:()=>owner,getLots:()=>lots,getNotices:()=>notices,getIsOwn:()=>false,getCurrentPrice:lot=>lot.price,isLive:()=>true});
 const set=(key,value=true)=>api.execute({type:'set',key,value});
 const queue=()=>{set('spoken');set('matchingNew');for(const notice of notices)assert.equal(api.onNotice(notice).ok,true);assert.equal(spoken.length,1);assert.equal(api.state().queued,1)};
 const endSpeech=()=>{c.speechSynthesis.speaking=false;spoken.at(-1)?.onend?.()};
 const panel=()=>{const holder=h.add('preferences-'+h.nodes.length);holder.innerHTML=api.settingsHTML();return holder.querySelector('[data-assistant-pref-owner]')};
 return{...h,c,api,records,spoken,cancelled,set,queue,endSpeech,panel,setOwner:value=>owner=value};
}
for(const remote of ['mute','quiet','event-off','delete']){
 const h=preferences();h.queue();const key='fas-assistant-preferences-v1:alice',stored=JSON.parse(h.records[key]);
 if(remote==='delete')delete h.records[key];else{if(remote==='mute')stored.preferences.spoken=false;if(remote==='quiet'){stored.preferences.quiet=true;stored.preferences.quietStart='00:00';stored.preferences.quietEnd='00:00'}if(remote==='event-off')stored.preferences.matchingNew=false;h.records[key]=JSON.stringify(stored)}
 // The local storage event has not arrived; the next queued phrase is the use boundary.
 h.endSpeech();assert.equal(h.spoken.length,1,remote+' must stop the already queued second phrase before storage delivery');assert.equal(h.api.state().queued,0);
}
{
 const h=preferences();h.queue();h.setOwner('bob');h.endSpeech();assert.equal(h.spoken.length,1,'a new profile must never hear the previous profile queue');assert.equal(h.api.state().scope,'bob');assert.equal(h.api.state().spoken,false);assert.equal(h.api.state().queued,0);
}
{
 const h=preferences();h.set('spoken');h.set('matchingNew');h.c.FasAssistantPersonalization={decorateUtterance(){h.setOwner('bob')}};
 const notice={id:'notice-1',type:'new-lot',lotId:1};h.api.onNotice(notice);assert.equal(h.spoken.length,0,'a profile switch discovered during decoration cancels before speak');assert.equal(h.api.state().scope,'bob');
}
{
 const h=preferences(),old=h.panel(),checkbox=old.querySelector('[data-assistant-pref="spoken"]'),command=h.api.parseCommand('озвучивай события');
 assert.equal(old.dataset.assistantPrefOwner,'alice');h.setOwner('bob');checkbox.checked=true;h.event('change',checkbox);
 assert.equal(h.api.state().spoken,false,'the old Alice form must not enable Bob notifications');assert.equal(h.records['fas-assistant-preferences-v1:bob'],undefined);assert.equal(checkbox.disabled,true);assert.match(old.querySelector('[data-assistant-pref-status]').textContent,/Профиль изменился/);
 assert.equal(h.api.execute(command.request).ok,false,'a parsed Alice voice preference cannot mutate Bob');
 const current=h.panel(),fresh=current.querySelector('[data-assistant-pref="spoken"]');fresh.checked=true;h.event('change',fresh);assert.equal(h.api.state().spoken,true,'a newly rendered Bob control remains usable');assert.equal(JSON.parse(h.records['fas-assistant-preferences-v1:bob']).owner,'bob');
 current.remove();fresh.checked=false;h.event('change',fresh);assert.equal(h.api.state().spoken,true,'a detached control cannot alter preferences');
}
function localAI(){
 const h=setup({mobile:true}),c=h.context,records={'fas-seller-workspace-v1':JSON.stringify({version:1,profile:{id:'alice'}})},workers=[],executed=[];let owner='alice';
 h.Element.prototype.replaceChildren=function(){for(const node of this.children){node.parentElement=null;node.isConnected=false}this.children=[]};
 c.localStorage={getItem:key=>records[key]??null,setItem(key,value){records[key]=value}};c.crypto=crypto.webcrypto;c.WebAssembly=WebAssembly;c.isSecureContext=true;c.navigator={storage:{async estimate(){return{quota:1e9,usage:0}}}};
 c.CustomEvent=class{constructor(type,options={}){this.type=type;this.detail=options.detail}};c.dispatchEvent=event=>{for(const listener of h.winEvents[event.type]||[])listener(event)};
 c.Worker=class{constructor(){this.messages=[];this.terminated=false;workers.push(this)}postMessage(value){this.messages.push(value)}terminate(){this.terminated=true}send(value){this.onmessage?.({data:value})}};
 c.FasAssistantPreferences={pauseSpeech(){}};c.speechSynthesis={cancel(){},getVoices(){return[]},addEventListener(){}};
 c.FasVoiceAssistant={stop(){},open(){},parse(command){c.FasAssistantPersonalization.parseInvocation(command);return{action:command.startsWith('Найди ')?'search':'unsupported'}},execute(command){executed.push(command);return{ok:true}}};
 for(const name of ['local-ai-policy.js','assistant-personalization.js','local-ai.js'])vm.runInContext(read(name),c);
 c.FasAssistantPersonalization.configure({getProfileId:()=>owner});
 return{...h,c,workers,executed,api:c.FasLocalAI,setOwner(value){owner=value;records['fas-seller-workspace-v1']=JSON.stringify({version:1,profile:{id:value}})}};
}
async function proposal(h){
 h.api.open();await h.api.enable();const worker=h.workers.at(-1),generation=worker.messages[0].generation;worker.send({type:'ready',generation});
 const done=h.api.ask('Квартира из личного запроса Алисы'),id=worker.messages.at(-1).id;worker.send({type:'result',generation,id,raw:'{"intent":"search"}'});await done;
 return h.document.querySelector('#local-ai-result').children.at(-1);
}
(async()=>{
 {
  const h=localAI(),button=await proposal(h);h.setOwner('bob');button.onclick();assert.equal(h.executed.length,0,'an old proposal cannot run after fresh profile detection before storage delivery');assert.equal(h.c.FasAssistantPersonalization.state().scope,'bob');assert.equal(h.document.querySelector('#local-ai-query').value,'');assert.equal(h.workers[0].terminated,true);
 }
 {
  const h=localAI(),button=await proposal(h),local=h.document.querySelector('#local-ai-dialog');h.modal.showModal();h.c.FasDialogLifecycle={top:()=>h.modal};
  button.onclick();assert.equal(h.executed.length,0,'a queued old Apply callback cannot navigate through another top dialog');assert.equal(local.open,true);assert.equal(h.modal.open,true,'the new top window remains open');h.api.stop();
 }
 for(const cancel of ['stop','profile','hidden','query','overlay']){
  const h=localAI(),button=await proposal(h);h.c.FasVoiceAssistant.parse=()=>{if(cancel==='stop')h.api.stop();if(cancel==='profile'){h.setOwner('bob');h.c.FasAssistantPersonalization.state()}if(cancel==='hidden')h.document.hidden=true;if(cancel==='query')h.document.querySelector('#local-ai-query').value='Другой запрос';if(cancel==='overlay'){h.modal.showModal();h.c.FasDialogLifecycle={top:()=>h.modal}}return{action:'search'}};
  button.onclick();assert.equal(h.executed.length,0,'parser callback cancellation ('+cancel+') must be rechecked before execution');h.api.stop();
 }
 {
  const h=localAI(),button=await proposal(h);button.onclick();assert.equal(h.executed.length,1,'a current, reviewed proposal still performs its safe search');assert.match(h.executed[0],/^Найди /);assert.equal(h.workers[0].terminated,true);
 }
 console.log('PASS: queued TTS rereads mute/quiet/event/removal/profile at use, old controls and parsed requests stay owner-bound, and real local-AI/personalization cancellation cannot execute a stale private query. No network/device inference exercised.');
})().catch(error=>{console.error(error);process.exitCode=1});
