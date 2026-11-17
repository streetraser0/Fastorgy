const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
(async()=>{
 const h=setup({mobile:true}),{context,document,Element}=h;
 const set=Element.prototype.setAttribute;Element.prototype.setAttribute=function(name,value){set.call(this,name,value);if(name==='hidden')this.hidden=true};
 Element.prototype.select=function(){this.selected=true};
 context.navigator={userAgent:'Test Browser\nSecond line'};
 const video=h.add('playing','video');video.paused=false;video.pause=function(){this.paused=true};
 h.modal.open=true;h.content.innerHTML='<form id="unchanged-editor"><textarea>Несохранённое описание</textarea></form>';
 const before=h.content.innerHTML,trigger=h.add('open-help','button',h.content);trigger.setAttribute('data-open-support','');trigger.focus();
 vm.runInContext(fs.readFileSync('dist/support.js','utf8'),context);
 const api=context.FasSupport,dialog=document.querySelector('#support-dialog'),field=id=>dialog.querySelector('#'+id);
 h.click(trigger);assert.equal(dialog.open,true);assert.equal(h.modal.open,true);assert.equal(h.content.innerHTML,before,'help preserves unsaved underlying editor');assert.equal(document.activeElement,field('support-title'));assert.equal(video.paused,true);
 assert.equal(dialog.getAttribute('aria-labelledby'),'support-title');assert.equal(dialog.querySelector('a').getAttribute('href'),'tel:+78000000001');assert(h.body.classList.contains('support-open'));
 api.close();assert.equal(document.activeElement,trigger);assert(!h.body.classList.contains('support-open'));assert.equal(h.modal.open,true);
 // Closing support should restore the active feed through its usual media gate.
 const resumed=[];context.reelsMode=false;context.swipeIndex=()=>3;context.syncReels=slot=>resumed.push(slot);
 api.open();api.close();assert.equal(resumed.length,0,'catalog support must not start feed media');
 context.reelsMode=true;api.open();api.close();assert.deepEqual(resumed,[3],'closing feed support resumes its current slot via canonical syncReels');context.reelsMode=false;
 for(const input of [null,[],false,{message:3},{message:'Коротко'},{message:'Достаточно длинное описание',lotId:'javascript:1'},{message:'Достаточно длинное описание',lotId:'9999999999999999'}])assert.equal(api.buildReport(input).ok,false);
 const report=api.buildReport({topic:'invented',message:'  Достаточно длинное описание  ',lotId:'1042',browser:'Browser\nInjected line'});assert.equal(report.ok,true);assert(report.text.includes('Тема: Другая проблема'));assert(report.text.includes('Лот № 1042'));assert(report.text.includes('Browser Injected line'));
 api.open({lotId:1042});field('support-topic').value='listing';field('support-message').value='Не удаётся сохранить фотографии лота';field('support-diagnostics').checked=true;
 let copied;context.navigator.clipboard={writeText:async value=>{copied=value}};
 let result=await api.copyReport();assert.equal(result.ok,true);assert.equal(result.method,'clipboard');assert(copied.includes('Размещение имущества'));assert(copied.includes('Лот № 1042'));assert(copied.includes('Браузер: Test Browser Second line'));assert(field('support-status').textContent.includes('ещё не отправлено'));assert.equal(field('support-copy').disabled,false);
 const images=dialog.querySelectorAll('img').length;field('support-message').value='<img src=x onerror=alert(1)> Ошибка формы';context.navigator.clipboard.writeText=async()=>{throw Error('denied')};
 result=await api.copyReport();assert.equal(result.manual,true);assert.equal(field('support-preview').hidden,false);assert(field('support-preview').value.includes('<img src=x'));assert.equal(dialog.querySelectorAll('img').length,images,'request text is never inserted as HTML');assert.equal(field('support-preview').selected,true);
 field('support-message').value='Мало';result=await api.copyReport();assert.equal(result.ok,false);assert.equal(field('support-error').hidden,false);assert(field('support-error').textContent.includes('10 символов'));
 // A late clipboard rejection after closing help must not reopen or alter another window.
 field('support-message').value='Достаточно длинное описание проблемы';let reject;context.navigator.clipboard.writeText=()=>new Promise((_,fail)=>reject=fail);
 const pending=api.copyReport();api.close();const content=h.content.innerHTML;reject(Error('denied'));result=await pending;assert.equal(result.stale,true);assert.equal(dialog.open,false);assert.equal(h.content.innerHTML,content);assert.equal(h.modal.open,true);
 // Closing/reopening starts an independent request even if the old clipboard
 // permission remains unresolved. Its late cleanup cannot unlock the new one.
 api.open();field('support-message').value='Первое обращение перед закрытием окна';const requests=[];
 context.navigator.clipboard.writeText=value=>new Promise((resolve,reject)=>requests.push({value,resolve,reject}));
 const first=api.copyReport();assert.equal(requests.length,1);api.close();api.open();field('support-message').value='Второе обращение в новом открытом окне';
 const second=api.copyReport();assert.equal(requests.length,2,'a reopened support form is not blocked by a stale permission request');assert.equal(field('support-copy').disabled,true);
 requests[0].reject(Error('denied'));assert.equal((await first).stale,true);assert.equal(field('support-copy').disabled,true,'old cleanup must not unlock a newer copy operation');
 assert.equal((await api.copyReport()).busy,true);requests[1].resolve();assert.equal((await second).ok,true);assert.equal(field('support-copy').disabled,false);assert(field('support-status').textContent.includes('ещё не отправлено'));
 api.close();const beforeClosed=requests.length;assert.equal((await api.copyReport()).reason,'closed');assert.equal(requests.length,beforeClosed,'closed support does not write the clipboard');
 api.open();assert.equal(field('support-copy').disabled,false);dialog.dispatchEvent({type:'click',target:dialog.querySelector('[data-support-close]')});assert.equal(dialog.open,false);
 // A queued native close event from a previous session is harmless after a
 // synchronous close/reopen, including an unresolved clipboard permission.
 const queued=[];dialog.close=function(){this.open=false;this.removeAttribute('open');queued.push(()=>this.dispatchEvent({type:'close'}))};
 api.open();field('support-message').value='Первое обращение с отложенным закрытием';const queuedFirst=api.copyReport();api.close();api.open();field('support-message').value='Новое обращение после повторного открытия';const queuedSecond=api.copyReport();
 context.reelsMode=true;const resumedBeforeStale=resumed.length;
 assert.equal(requests.length,4,'opening a fresh session releases stale copying even before the native close task');queued.shift()();assert(h.body.classList.contains('support-open'));assert.equal(field('support-copy').disabled,true);
 requests[2].reject(Error('old denied'));assert.equal((await queuedFirst).stale,true);assert.equal(field('support-copy').disabled,true);requests[3].resolve();assert.equal((await queuedSecond).ok,true);assert.equal(resumed.length,resumedBeforeStale,'a queued old close cannot resume media below reopened support');api.close();queued.shift()();assert.equal(resumed.length,resumedBeforeStale+1,'normal closing still resumes after a stale close was ignored');
 console.log('PASS: separate support dialog preserves editor/focus, published contact, validated copy-only request, safe manual fallback and stale-response isolation.');
})().catch(error=>{console.error(error);process.exitCode=1});
