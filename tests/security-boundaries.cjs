const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../worker/index.js'),'utf8');
 const assets={'/index.html':{data:Buffer.from('<!doctype html><title>ФАС торги</title>').toString('base64'),type:'text/html; charset=utf-8',size:37,etag:'"test"'}};
 const worker=(await import('data:text/javascript;base64,'+Buffer.from(source.replace('/* SITES_STATIC_ASSETS */ {}',JSON.stringify(assets))).toString('base64'))).default;
 let touched=0;const db={prepare(){touched++;throw Error('must not reach storage')},batch(){touched++;throw Error('must not reach storage')}};
 const request=(route,headers={},method='GET',body)=>new Request('https://fas.example'+route,{method,headers,...(body===undefined?{}:{body,duplex:'half'})});
 for(const route of ['/api/metrics/visit','/api/analytics/sales']){
  let response=await worker.fetch(request(route),{DB:db});assert.equal(response.status,401);assert.equal(touched,0);
  for(const headers of [{Origin:'https://evil.example'},{'Sec-Fetch-Site':'cross-site'},{'Sec-Fetch-Site':'same-site'},{'Sec-Fetch-Site':'unexpected'},{Origin:'null'}])for(const method of ['GET','POST']){
   response=await worker.fetch(request(route,{'oai-authenticated-user-id':'viewer',...headers},method),{DB:db});
   assert.equal(response.status,403,route+' '+method+' rejects cross-origin database requests');assert.equal(touched,0);
   assert.equal(response.headers.get('Cache-Control'),'no-store, private');assert.equal(response.headers.get('Cross-Origin-Resource-Policy'),'same-origin');assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
  }
 }
 // Same-site sibling pages are still different origins; only same-origin and
 // user-initiated metadata may omit Origin. Non-browser clients remain valid.
 let acceptedWork=0;const acceptedDB={prepare(){acceptedWork++;return {bind(){return this},async first(){return {total_users:0,online_users:0}},async run(){return {success:true,meta:{changes:1}}}}},async batch(){return []}};
 for(const metadata of [{},{Origin:'https://fas.example','Sec-Fetch-Site':'same-origin'},{'Sec-Fetch-Site':'same-origin'},{'Sec-Fetch-Site':'none'}]){
  const response=await worker.fetch(request('/api/metrics/visit',{'oai-authenticated-user-id':'viewer',...metadata}),{DB:acceptedDB});assert.equal(response.status,200,'legitimate same-origin and metadata-free requests remain supported');
 }
 assert.equal(acceptedWork,8);
 const api='/api/analytics/sales',headers={'oai-authenticated-user-id':'viewer','Content-Type':'application/json'};
 const chunks=[new Uint8Array(32768),new Uint8Array(32768),new Uint8Array(1)];let cancelled=false;
 const stream=new ReadableStream({pull(controller){if(chunks.length)controller.enqueue(chunks.shift())},cancel(){cancelled=true}});
 const response=await worker.fetch(request(api,headers,'POST',stream),{DB:db});assert.equal(response.status,413);assert.equal(cancelled,true,'oversized streamed request is cancelled');assert.equal(touched,0);
 let invalidCancelled=false;
 const invalidStream=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array([0xff]))},cancel(){invalidCancelled=true}});
 const invalidResponse=await worker.fetch(request(api,headers,'POST',invalidStream),{DB:db});
 assert.equal(invalidResponse.status,400);assert.equal(invalidCancelled,true,'malformed UTF-8 cancels the unread body rather than leaving its producer live');assert.equal(touched,0);
 for(const body of ['{',new Uint8Array([0xff]),JSON.stringify({records:Array.from({length:51},()=>({}))})]){
  const response=await worker.fetch(request(api,headers,'POST',body),{DB:db});assert([400,422].includes(response.status));assert.equal(touched,0);
 }
 const page=await worker.fetch(request('/'),{});assert.equal(page.status,200);assert.equal(page.headers.get('Strict-Transport-Security'),'max-age=31536000');assert.equal(page.headers.get('X-Content-Type-Options'),'nosniff');assert.equal(page.headers.get('Cache-Control'),'no-store, private');
 console.log('PASS: API authentication/origin/resource isolation, no cross-origin DB work, streamed size cancellation, malformed UTF-8/JSON/batch bounds and secure private headers.');
})().catch(error=>{console.error(error);process.exitCode=1});
