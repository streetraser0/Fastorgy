/* This dedicated worker downloads only pinned public model files. User text stays in this worker. */
import './local-ai-policy.js';
const P=globalThis.FasLocalAIPolicy;
const MODEL='Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const REVISION='2c4055b12046f11709e9df2c122e59ffbdc2f900';
const BASE='https://huggingface.co/'+MODEL+'/resolve/'+REVISION+'/';
const ENGINE=new URL('/vendor/transformers-2.17.2.min.js',self.location.href).href;
const PROTOTYPES=new URL('/local-ai-prototypes.json',self.location.href).href;
const WASM='https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/ort-wasm-simd.wasm';
const CACHE='fas-local-ai-artifacts-v1';
const FILES=new Map([
 [PROTOTYPES,{bytes:325775,sha256:'812f918d37e079a9804167346cdaf2def298fd4968e656fd820b125359f31bf3'}],
 [ENGINE,{bytes:897938,sha256:'bcf7cf304e51f470ed59409622b9d6ffbad80dfcf5baf6a40c919e4b9c4ff812'}],
 [WASM,{bytes:10014674,sha256:'9bd07bababc65f53d061f457233eeae501be7ceb8a2adb9eef52d87fe776d865'}],
 [BASE+'config.json',{bytes:673,sha256:'05b570bff786faa5c4604152aa16f19f77ed6dfc31e47dd0f3dd987078693ac7'}],
 [BASE+'tokenizer_config.json',{bytes:496,sha256:'3f5961b9ac86288cccdb97f32fb848d6187c78e1603958c53f3ea1f296b7d8a2'}],
 [BASE+'tokenizer.json',{bytes:17082913,sha256:'b60b6b43406a48bf3638526314f3d232d97058bc93472ff2de930d43686fa441'}],
 [BASE+'onnx/model_quantized.onnx',{bytes:118308126,sha256:'66fc00f5f29afcaff34092e1bdd20008ca3918265a82fb9695a551e510cc4ebc'}]
]);
const nativeFetch=globalThis.fetch.bind(globalThis),blobURLs=new Set();
let generation=null,extractor=null,busy=false,serial=Promise.resolve(),downloaded=0,anchors=null;
const TOTAL=[...FILES.values()].reduce((sum,f)=>sum+f.bytes,0);
function message(type,value={}){postMessage({type,generation,...value})}
async function digest(buffer){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function verify(buffer,file){if(buffer.byteLength!==file.bytes||await digest(buffer)!==file.sha256)throw new Error('integrity');return buffer}
function response(buffer,url){return new Response(buffer,{status:200,headers:{'Content-Length':String(buffer.byteLength),'Content-Type':url===ENGINE?'text/javascript':url.endsWith('.json')?'application/json':'application/octet-stream'}})}
async function cache(){try{return await caches.open(CACHE)}catch{return null}}
async function resource(url,options={}){
 const file=FILES.get(url);if(!file)throw new Error('resource-policy');
 const store=await cache();const cached=await store?.match(url);
 if(cached){try{const data=await verify(await cached.arrayBuffer(),file);downloaded+=file.bytes;message('progress',{progress:Math.min(.95,downloaded/TOTAL*.95)});return response(data,url)}catch{await store?.delete(url)}}
 const result=await nativeFetch(url,{method:'GET',credentials:new URL(url).origin===self.location.origin?'same-origin':'omit',referrerPolicy:'no-referrer',redirect:'follow',signal:options.signal});
 if(!result.ok||!['https:'].includes(new URL(result.url||url).protocol))throw new Error('download');
 const finalHost=new URL(result.url||url).hostname;
 if(![self.location.hostname,'cdn.jsdelivr.net','huggingface.co','us.aws.cdn.hf.co'].includes(finalHost))throw new Error('redirect-policy');
 const header=Number(result.headers.get('content-length'));if(header&&!result.headers.get('content-encoding')&&header!==file.bytes)throw new Error('length');
 // A single fixed-size buffer bounds memory; resources are fetched serially. No chunk-array concatenation.
 const reader=result.body?.getReader();let data;
 if(reader){const bytes=new Uint8Array(file.bytes);let offset=0;for(;;){const chunk=await reader.read();if(chunk.done)break;if(offset+chunk.value.byteLength>bytes.length){await reader.cancel();throw new Error('length')}bytes.set(chunk.value,offset);offset+=chunk.value.byteLength;message('progress',{progress:Math.min(.94,(downloaded+offset)/TOTAL*.95)})}if(offset!==bytes.length)throw new Error('length');data=bytes.buffer}
 else data=await result.arrayBuffer();
 await verify(data,file);downloaded+=file.bytes;
 const output=response(data,url);try{await store?.put(url,output.clone())}catch{/* Cache quota must not change application data or invent a ready model. */}
 return output;
}
globalThis.fetch=(input,options={})=>{
 const url=typeof input==='string'?input:input?.url||String(input),method=options.method||(input instanceof Request?input.method:'GET');
 if(String(method).toUpperCase()!=='GET')return Promise.reject(new Error('request-policy'));
 if(blobURLs.has(url))return nativeFetch(url,{method:'GET',credentials:'omit',referrerPolicy:'no-referrer'});
 if(!FILES.has(url))return Promise.reject(new Error('resource-policy'));
 const next=serial.then(()=>resource(url,options));serial=next.catch(()=>{});return next;
};
function makeBlob(buffer,type){const url=URL.createObjectURL(new Blob([buffer],{type}));blobURLs.add(url);return url}
function cosine(a,b){let value=0;for(let i=0;i<a.length;i++)value+=a[i]*b[i];return value}
function classify(vector){
 const scores=new Map();for(const row of anchors.rows){const score=cosine(vector,row.vector);if(!scores.has(row.intent)||scores.get(row.intent)<score)scores.set(row.intent,score)}
 const ordered=[...scores].sort((a,b)=>b[1]-a[1]),first=ordered[0],second=ordered[1];
 if(!first||first[1]<anchors.threshold||first[1]-(second?.[1]??-1)<anchors.margin)return 'unsupported';
 return P.intents.includes(first[0])?first[0]:'unsupported';
}
async function load(){
 // SIMD is tested before the large model download. Threads and WebGPU are deliberately not used.
 if(/iP(hone|od|ad).+16_4.+AppleWebKit/.test(globalThis.navigator?.userAgent||''))throw new Error('unsupported-ios');
 if(!WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,2,1,0,10,30,1,28,0,65,0,253,15,253,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,253,186,1,26,11])))throw new Error('simd');
 const engineBytes=await(await fetch(ENGINE)).arrayBuffer();const engineBlob=makeBlob(engineBytes,'text/javascript');
 const lib=await import(engineBlob);URL.revokeObjectURL(engineBlob);blobURLs.delete(engineBlob);
 const wasmBytes=await(await fetch(WASM)).arrayBuffer(),wasmBlob=makeBlob(wasmBytes,'application/wasm');
 lib.env.allowLocalModels=false;lib.env.allowRemoteModels=true;lib.env.useBrowserCache=false;lib.env.useFSCache=false;lib.env.useCustomCache=false;
 lib.env.backends.onnx.wasm.numThreads=1;lib.env.backends.onnx.wasm.simd=true;lib.env.backends.onnx.wasm.proxy=false;lib.env.backends.onnx.wasm.wasmPaths={'ort-wasm-simd.wasm':wasmBlob};
 // Prototype data is self hosted and fixed by the publication. It contains reviewed phrases, never profiles.
 const prototypeResponse=await fetch(PROTOTYPES);
 if(!prototypeResponse.ok)throw new Error('prototypes');anchors=await prototypeResponse.json();
 if(anchors.model!==MODEL||anchors.revision!==REVISION||!Array.isArray(anchors.rows)||anchors.rows.length>100||anchors.rows.some(row=>!P.intents.includes(row.intent)||!Array.isArray(row.vector)||row.vector.length!==384||row.vector.some(x=>!Number.isFinite(x)))||anchors.threshold!==.5||anchors.margin!==.08)throw new Error('prototypes');
 extractor=await lib.pipeline('feature-extraction',MODEL,{revision:REVISION,quantized:true});
 URL.revokeObjectURL(wasmBlob);blobURLs.delete(wasmBlob);message('ready');
}
self.onmessage=async event=>{
 const data=event.data;if(!data||typeof data!=='object')return;
 if(data.type==='load'&&generation===null&&Number.isSafeInteger(data.generation)){generation=data.generation;busy=true;try{await load()}catch{message('error',{reason:'initialization'})}finally{busy=false}return}
 if(data.type!=='ask'||data.generation!==generation||!extractor||busy||!Number.isSafeInteger(data.id)||typeof data.text!=='string'||!data.text.trim()||data.text.length>450)return;
 busy=true;try{const output=await extractor(data.text,{pooling:'mean',normalize:true});if(output.data.length!==384)throw new Error('embedding');const intent=classify(output.data);message('result',{id:data.id,raw:JSON.stringify({intent})})}catch{message('error',{reason:'inference'})}finally{busy=false}
};
