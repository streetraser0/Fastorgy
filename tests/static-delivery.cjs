const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'worker/index.js'),'utf8');
const binary=Buffer.alloc(65537);for(let i=0;i<binary.length;i++)binary[i]=i%256;
const fixtures={
 '/bytes.bin':binary,
 '/empty.bin':Buffer.alloc(0),
 '/unicode.js':Buffer.from('globalThis.message="Фото: автомобиль 🚗, Россия";'),
 '/index.html':Buffer.from('<!doctype html><title>ФАС торги</title>'),
 '/assets/photos/trucks-type-sitrak-c7h.jpg':fs.readFileSync(path.join(root,'dist/assets/photos/trucks-type-sitrak-c7h.jpg'))
};
const assets=Object.fromEntries(Object.entries(fixtures).map(([name,data])=>[name,{data:data.toString('base64'),size:data.length,type:name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.js')?'text/javascript; charset=utf-8':name.endsWith('.jpg')?'image/jpeg':'application/octet-stream',etag:'"'+crypto.createHash('sha256').update(data).digest('hex')+'"'}]));
(async()=>{
 const worker=(await import('data:text/javascript;base64,'+Buffer.from(source.replace('/* SITES_STATIC_ASSETS */ {}',JSON.stringify(assets))).toString('base64'))).default;
 const originalAtob=globalThis.atob;let decodes=0;globalThis.atob=value=>{decodes++;return originalAtob(value)};
 const fetch=(name,options={})=>worker.fetch(new Request('https://delivery.example.test'+name,options),{});
 try{
  for(const [name,bytes]of Object.entries(fixtures)){
   const response=await fetch(name);assert.equal(response.status,200);assert(Buffer.from(await response.arrayBuffer()).equals(bytes),'all bytes survive decoding: '+name);assert.equal(response.headers.get('Content-Length'),String(bytes.length));assert.match(response.headers.get('Cache-Control'),/private/);assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
   const etag=assets[name].etag,before=decodes;
   for(const header of [etag,'W/'+etag,'"other", '+etag,' W/"other",\tW/'+etag+' ', '"opaque,comma", '+etag,'*'])for(const method of ['GET','HEAD']){
    const cached=await fetch(name,{method,headers:{'If-None-Match':header}});assert.equal(cached.status,304,method+' '+header);assert.equal((await cached.arrayBuffer()).byteLength,0);assert.equal(cached.headers.get('ETag'),etag);assert.match(cached.headers.get('Cache-Control'),/private/);if(name.endsWith('.html'))assert(cached.headers.get('Content-Security-Policy'));
   }
   const head=await fetch(name,{method:'HEAD'});assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);assert.equal(decodes,before,'HEAD and conditional hits never decode image bytes');
   for(const header of ['"different"','W/"different"',etag.slice(1,-1),etag+',broken','"bad tag", '+etag,'w/'+etag,etag+',','*, '+etag]){
    const fresh=await fetch(name,{headers:{'If-None-Match':header}});assert.equal(fresh.status,200,'nonmatching or malformed validator does not hide content: '+header);assert(Buffer.from(await fresh.arrayBuffer()).equals(bytes));
   }
  }
  assert.equal((await fetch('/missing',{headers:{'If-None-Match':'*'}})).status,404);
  assert.equal((await fetch('/bytes.bin',{method:'POST',headers:{'If-None-Match':'*'}})).status,405);
  const api=await fetch('/api/analytics/sales',{headers:{'If-None-Match':'*'}});assert.equal(api.status,401);assert.equal(api.headers.get('Cache-Control'),'no-store, private');assert.equal(api.headers.get('Access-Control-Allow-Origin'),null);
 }finally{globalThis.atob=originalAtob}
 console.log('PASS: byte-identical binary/UTF-8/static photos, weak/list/wildcard ETags, malformed validators, decode-free HEAD/304, CSP and unchanged private/API boundaries.');
})().catch(error=>{console.error(error);process.exitCode=1});
