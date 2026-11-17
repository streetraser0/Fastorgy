const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {boot}=require('./helpers/category-seller-harness.cjs'),{setup}=require('./helpers/quickbar-dom.cjs');
const read=name=>fs.readFileSync(path.join(__dirname,'../dist',name),'utf8');
const app=boot({fixtureInventory:[],profileAccepted:false}),dom=setup({mobile:true}),c=app.context,w=c.window,document=dom.document;
// Keep the real seller closure and delegated handler; replace only its small
// selector fixture with a connected DOM so node identity and nested modals matter.
c.document=document;w.document=document;document.getElementById=id=>document.querySelector('#'+id);
w.FasSellerUI.openDashboard('profile');
const form=document.querySelector('#seller-profile-form'),name=form.querySelector('[name="displayName"]'),email=form.querySelector('[name="email"]'),consent=form.querySelector('[name="agreementAccepted"]'),entry=document.querySelector('[data-voice-settings-open]');
assert(entry,'Profile contains the real assistant-settings control');assert.equal(entry.getAttribute('type'),'button');assert.match(document.querySelector('#seller-voice-title').textContent,/Голосовой помощник/);assert(!entry.hasAttribute('data-voice-open'),'settings entry cannot also invoke the microphone delegate');
name.value='Несохранённое новое имя';email.value='private-unsaved@example.org';consent.checked=false;dom.modal.scrollTop=530;dom.grid.scrollTop=3200;
const workspace=app.records['fas-seller-workspace-v1'],beforeWrites=app.writes.length;let reads=0,microphones=0;
c.FormData=function(){reads++;throw Error('Opening assistant settings must not read or save the profile form')};
function unchanged(){assert.equal(document.querySelector('#seller-profile-form'),form);assert.equal(form.querySelector('[name="displayName"]'),name);assert.equal(name.value,'Несохранённое новое имя');assert.equal(email.value,'private-unsaved@example.org');assert.equal(consent.checked,false);assert.equal(dom.modal.open,true);assert.equal(dom.modal.scrollTop,530);assert.equal(dom.grid.scrollTop,3200);assert.equal(app.records['fas-seller-workspace-v1'],workspace);assert.equal(app.writes.length,beforeWrites);assert.equal(reads,0)}
function click(node){node.onclick?.({type:'click',target:node,preventDefault(){}});const event=dom.click(node);app.dispatchClick(event);return event}
// Missing optional module explains the failure and leaves even an unaccepted,
// dirty profile intact. It must not redirect, register or silently save it.
const toasts=[];c.toast=text=>toasts.push(text);click(entry);assert.match(toasts.at(-1),/помощник.*не загрузился/);unchanged();
c.CustomEvent=class{constructor(type,options={}){this.type=type;this.detail=options.detail}};w.CustomEvent=c.CustomEvent;w.dispatchEvent=event=>app.dispatchWindow(event.type,event);
w.SpeechRecognition=class{constructor(){microphones++}start(){}abort(){}};w.speechSynthesis={getVoices:()=>[],cancel(){},addEventListener(){}};
for(const file of ['assistant-personalization.js','assistant-preferences.js','voice-assistant.js'])vm.runInContext(read(file),c,{filename:file});
let opens=0;const voice=w.FasVoiceAssistant;w.FasVoiceAssistant={...voice,open(options){opens++;assert.equal(options.settings,true);return voice.open(options)}};
const assistant=document.querySelector('#voice-dialog');
const event=click(entry);assert.equal(event.prevented,true);assert.equal(opens,1,'one settings click has one owner');assert.equal(assistant.open,true);assert.equal(voice.state().presentation,'settings');assert.equal(microphones,0,'opening settings never requests the microphone');assert.equal(assistant.querySelector('[data-assistant-personalization-panel]').dataset.personalizationOwner,'seller-owner');assert(assistant.querySelector('[data-assistant-personalization-panel]'),'real name and voice settings are mounted');assert(assistant.querySelector('[data-assistant-preferences-panel]').innerHTML.includes('Мою ставку перебили'),'real notification settings are mounted');unchanged();
// Repeated or stale activation underneath an already-open overlay is ignored.
click(entry);assert.equal(opens,1);unchanged();click(assistant.querySelector('[data-voice-close]'));assert.equal(assistant.open,false);assert.equal(document.activeElement,entry,'close restores focus without scrolling the dirty form');unchanged();
click(entry);assert.equal(opens,2);assert.equal(voice.state().presentation,'settings');voice.close();unchanged();
// The ordinary microphone uses its separate delegate and compact listening.
const mic=dom.add('test-profile-mic','button');mic.setAttribute('data-voice-open','');mic.setAttribute('data-voice-start','');click(mic);assert.equal(microphones,1);assert.equal(voice.state().presentation,'quick');assert.equal(opens,2,'microphone is not routed through profile settings');unchanged();voice.close();
console.log('PASS: actual Cabinet → Profile assistant settings, single delegated open, real name/voice/language/notification panels, no microphone/registration/consent/write on settings, missing-module recovery, underlying overlay isolation and dirty profile DOM/scroll retained; microphone remains compact.');
