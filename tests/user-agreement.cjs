const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {boot}=require('./helpers/category-seller-harness.cjs');
const root=path.resolve(__dirname,'..'),event={preventDefault(){}},copy=x=>JSON.parse(JSON.stringify(x));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
function harness(){
 const h=boot({fixtureInventory:[]}),calls=[];let phoneForm=h.node('#phone-form'),codeForm=h.node('#code-form'),request;
 const query=h.context.document.querySelector;h.context.document.querySelector=s=>s==='#phone-form'?phoneForm:s==='#code-form'?codeForm:query(s);
 h.context.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return request?request.promise:{ok:true,status:200,json:async()=>url.includes('/request')?{challengeId:'agreed-challenge'}:{authenticated:true}}};
 return Object.assign(h,{calls,open(){phoneForm=h.node('#phone-form-'+calls.length);h.node('#send-code').disabled=false;h.run('openPhoneAuth()');h.node('#auth-phone').value='+79991234567';h.node('#auth-agreement').checked=false;h.node('#auth-consent').checked=false},submit:()=>phoneForm.onsubmit(event),verify:()=>codeForm.onsubmit(event),setRequest(value){request=value},replaceCode(){codeForm=h.node('#code-form-next');h.node('#verify-code').disabled=false}});
}
(async()=>{
 const h=harness(),A=h.context.window.FasUserAgreement;
 assert.equal(A.version,'2026-11-14-r2');assert.equal(A.capture({checked:false}),null);assert.equal(A.capture({value:'on'}),null);
 const explicit=A.capture({checked:true});assert(A.isCurrent(explicit));assert(Object.isFrozen(explicit));
 for(const value of [null,[],{version:'old',acceptedAt:explicit.acceptedAt},{version:A.version,acceptedAt:'invalid'},{version:A.version,acceptedAt:'2999-01-01T00:00:00Z'}])assert.equal(A.normalize(value),null);
 const checkbox=A.fieldHTML('legal-test');assert.match(checkbox,/name="agreementAccepted"/);assert(!/<input[^>]*\bchecked\b/.test(checkbox));assert.match(checkbox,/required/);assert(checkbox.includes('href="'+A.url+'"'));assert.throws(()=>A.fieldHTML('x" onclick="bad'));
 h.open();const html=h.node('#modal-content').innerHTML;assert.match(html,/id="auth-agreement"/);assert.match(html,/id="auth-consent"/);assert.match(html,/privacy\.html#phone-consent/);assert(!/<input[^>]*\bchecked\b/.test(html));
 await h.submit();assert.equal(h.calls.length,0);assert.match(h.node('#auth-error').textContent,/соглашение/);
 h.node('#auth-agreement').checked=true;await h.submit();assert.equal(h.calls.length,0);assert.match(h.node('#auth-error').textContent,/обработку номера/);
 h.node('#auth-consent').checked=true;h.node('#auth-agreement').checked=false;await h.submit();assert.equal(h.calls.length,0,'processing consent cannot substitute agreement');
 h.node('#auth-agreement').checked=true;await h.submit();assert.equal(h.calls.length,1);const request=copy(h.calls[0]);assert.equal(request.url,'/api/auth/request');assert(A.isCurrent(request.body.agreementAcceptance));assert.equal(request.body.personalDataConsent.purpose,'phone-auth');assert.equal(request.body.personalDataConsent.acceptedAt,request.body.agreementAcceptance.acceptedAt);assert.match(h.node('#modal-content').innerHTML,/Введите SMS-код/);
 h.node('#auth-code').value='123456';await h.verify();assert.equal(h.calls.length,2);assert.equal(h.calls[1].url,'/api/auth/verify');assert.deepEqual(h.calls[1].body.agreementAcceptance,request.body.agreementAcceptance,'challenge carries original explicit version/time, never recaptures');assert.deepEqual(h.calls[1].body.personalDataConsent,request.body.personalDataConsent);assert.equal(h.node('#modal').open,false);
 const bypass=harness();bypass.run('openCodeAuth("+79991234567","forged")');await bypass.verify();assert.equal(bypass.calls.length,0,'direct verification without captured acceptance is blocked');assert.match(bypass.node('#code-error').textContent,/актуальное соглашение/);
 const missing=harness();missing.open();missing.node('#auth-agreement').checked=true;missing.node('#auth-consent').checked=true;delete missing.context.window.FasUserAgreement;await missing.submit();assert.equal(missing.calls.length,0,'missing module fails closed');
 const changed=harness();changed.open();changed.node('#auth-agreement').checked=true;changed.node('#auth-consent').checked=true;await changed.submit();changed.context.window.FasUserAgreement={isCurrent:()=>false};await changed.verify();assert.equal(changed.calls.length,1,'version change requires explicit acceptance again');
 const pending=harness();pending.open();pending.node('#auth-agreement').checked=true;pending.node('#auth-consent').checked=true;const late=deferred();pending.setRequest(late);const one=pending.submit();await pending.submit();assert.equal(pending.calls.length,1,'double submit cannot duplicate challenge');pending.node('#auth-agreement').checked=false;late.resolve({ok:true,status:200,json:async()=>({challengeId:'late'})});await one;assert(!pending.node('#modal-content').innerHTML.includes('Введите SMS-код'),'revoked checkbox cannot advance after response');
 const terms=fs.readFileSync(path.join(root,'dist/terms.html'),'utf8'),privacy=fs.readFileSync(path.join(root,'dist/privacy.html'),'utf8');
 assert.match(terms,new RegExp('name="fas-agreement-version" content="'+A.version+'"'));for(const source of [terms,privacy]){for(const value of ['3663143055','1193668026012','Fastorgy@gmail.com','Ключевая'])assert(source.includes(value));assert(!/паспорт.{0,40}\d{4}\s?\d{6}/iu.test(source))}
 assert.match(terms,/Текущая цена изменяется/);assert.match(terms,/правообладателем/);assert.match(terms,/не согласие обучать модели/);assert.match(privacy,/id="phone-consent"/);assert.match(privacy,/запрос с этими сведениями передаётся по HTTPS на хостинг/);assert.match(privacy,/tel:\+78000000001/);
 const crypto=require('node:crypto'),meta=JSON.parse(fs.readFileSync(path.join(root,'docs/legal/agreement-'+A.version+'.json'),'utf8')),digest=text=>crypto.createHash('sha256').update(text).digest('hex');
 assert.equal(meta.version,A.version);const text=fs.readFileSync(path.join(root,meta.agreementMarkdown),'utf8');
 assert.equal(digest(text),meta.agreementMarkdownSHA256,'archived draft text must be reviewed deliberately');
 const agreementBody=terms.match(/<main class="legal-document" id="agreement-text">([\s\S]*?)<\/main>/)[1].trim(),consentBody=privacy.match(/<section id="phone-consent">([\s\S]*?)<\/section>/)[1].trim();
 assert.equal(digest(agreementBody),meta.agreementHTMLMainSHA256,'accepted version cannot silently change its agreement text');assert.equal(digest(consentBody),meta.phoneConsentHTMLSectionSHA256,'phone consent version has a portable exact snapshot');
 const decode=text=>text.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
 const plainHTML=decode(agreementBody.replace(/<\/(?:p|h[12])>/g,'\n').replace(/<[^>]*>/g,'')).replace(/\s+/g,' ').trim(),plainMD=text.replace(/^#{1,2} /gm,'').replace(/\*\*/g,'').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/\s+/g,' ').trim();
 assert.equal(digest(plainHTML),digest(plainMD),'public text and portable draft must contain the same complete final clauses');
 console.log('PASS: separate unchecked agreement and phone consent block actual auth handlers; original version/time follows challenge, missing/stale/revoked acceptance and double submits fail closed; legal/operator text agrees.');
})().catch(error=>{console.error(error);process.exitCode=1});
