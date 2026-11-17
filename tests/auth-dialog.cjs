const assert=require('assert/strict');
const {boot}=require('./helpers/category-seller-harness.cjs');
const response=data=>({status:200,ok:true,json:async()=>data});
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve}};

(async()=>{
 const h=boot(),query=h.context.document.querySelector;
 let phoneForm=h.node('#phone-form'),codeForm=h.node('#code-form');
 h.context.document.querySelector=selector=>selector==='#phone-form'?phoneForm:selector==='#code-form'?codeForm:query(selector);
 const event={preventDefault(){}};
 const consent=()=>{h.node('#auth-agreement').checked=true;h.node('#auth-consent').checked=true;h.node('#send-code').disabled=false};
 let request=deferred();h.context.fetch=()=>request.promise;
 h.run('openPhoneAuth()');consent();h.node('#auth-phone').value='+79991234567';
 let submit=phoneForm.onsubmit(event);h.node('#modal').close();
 request.resolve(response({challengeId:'closed-challenge'}));await submit;
 assert.equal(h.node('#modal').open,false,'late SMS response cannot reopen a closed dialog');

 request=deferred();h.context.fetch=()=>request.promise;
 h.run('openPhoneAuth()');consent();submit=phoneForm.onsubmit(event);
 h.run('openPlans()');phoneForm=null;const plans=h.node('#modal-content').innerHTML;
 request.resolve({status:404,ok:false});await submit;
 assert.equal(h.node('#modal-content').innerHTML,plans,'late error cannot replace another dialog');
 assert.equal(h.node('#modal').open,true);

 phoneForm=h.node('#phone-form-next');request=deferred();h.context.fetch=()=>request.promise;
 h.run('openPhoneAuth()');consent();submit=phoneForm.onsubmit(event);
 request.resolve(response({challengeId:'current-challenge'}));await submit;
 assert(h.node('#modal-content').innerHTML.includes('Введите SMS-код'),'current response advances to confirmation');

 request=deferred();h.context.fetch=()=>request.promise;h.node('#auth-code').value='123456';
 const verify=codeForm.onsubmit(event);h.run('openPlans()');codeForm=null;
 const replacement=h.node('#modal-content').innerHTML;
 request.resolve(response({authenticated:true}));await verify;
 assert.equal(h.node('#modal').open,true,'late verification cannot close another dialog');
 assert.equal(h.node('#modal-content').innerHTML,replacement);

 codeForm=h.node('#code-form-current');h.node('#verify-code').disabled=false;h.run(`{const a=window.FasUserAgreement.capture({checked:true});openCodeAuth("+79991234567","challenge",a,{purpose:'phone-auth',...a})}`);
 request=deferred();h.context.fetch=()=>request.promise;
 submit=codeForm.onsubmit(event);request.resolve(response({authenticated:true}));await submit;
 assert.equal(h.node('#modal').open,false,'current verification completes normally');
 assert(h.node('#account').innerHTML.includes('Мой кабинет'));
 console.log('PASS: stale SMS and verification responses do not reopen/replace/close other dialogs; current requests still complete.');
})().catch(error=>{console.error(error);process.exitCode=1});
