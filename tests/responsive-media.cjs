const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),sharp=require(path.join(root,'mobile/node_modules/sharp')),hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const originals=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/photo-original-sha256.json'),'utf8'));
function api(file){const context={window:{},URLSearchParams};vm.runInNewContext(fs.readFileSync(file,'utf8'),context);return context.FasResponsiveMedia}
(async()=>{
 const media=api(path.join(root,'dist/responsive-media.js'));assert.equal(Object.keys(originals).length,21);let total=0,count=0;
 for(const [name,expectedHash]of Object.entries(originals)){
  const originalSrc='assets/photos/'+name,source=fs.readFileSync(path.join(root,'dist',originalSrc));assert.equal(hash(source),expectedHash,'full-resolution original unchanged: '+name);
  const meta=await sharp(source).metadata(),preview=media.image(originalSrc);assert(preview);assert(Object.isFrozen(preview));assert.equal(preview.width,meta.width);assert.equal(preview.height,meta.height);assert.equal(preview.originalSrc,originalSrc);
  assert.equal(media.original(originalSrc+'?view=2'),originalSrc);assert.equal(media.image('/'+originalSrc+'?view=1').src,preview.src);
  const candidates=preview.srcset.split(', ').map(value=>value.split(' '));assert.equal(new Set(candidates.map(row=>row[1])).size,candidates.length);
  assert.equal(candidates.length,2);for(const [url,descriptor]of candidates){
   const bytes=fs.readFileSync(path.join(root,'dist',url)),m=await sharp(bytes).metadata(),width=Number(descriptor.slice(0,-1));count++;total+=bytes.length;
   assert.equal(m.format,'webp');assert.equal(m.width,width);assert([480,960].includes(width));assert(width<=meta.width);assert(Math.abs(m.height-m.width*meta.height/meta.width)<=1);assert(url.includes(hash(bytes).slice(0,12)),'encoded-content fingerprint is part of the URL');
   const expected=await sharp(source).resize({width,withoutEnlargement:true}).raw().toBuffer(),actual=await sharp(bytes).raw().toBuffer();assert.equal(actual.length,expected.length);let absolute=0,squared=0;for(let i=0;i<actual.length;i++){const difference=actual[i]-expected[i];absolute+=Math.abs(difference);squared+=difference*difference}assert(absolute/actual.length<8,'preview retains the original frame/colors: '+name);assert(10*Math.log10(255*255/(squared/actual.length))>28,'preview is a resized encoding of this asset: '+name);
  }
  assert(preview.fullSrcset.endsWith(originalSrc+' '+meta.width+'w'));assert.equal(preview.src,candidates[0][0]);
 }
 assert.equal(count,42);assert(total<2600000,'bounded preview set fits the existing Worker budget');
 for(const unknown of ['https://external.example/assets/photos/cars-1.jpg','blob:local-photo','data:image/png;base64,AA','assets/photos/unknown.jpg','assets/photos/cars-1.jpg?token=secret','assets/photos/cars-1.jpg?view=two','assets/photos/../photos/cars-1.jpg','assets/photos/cars-1.jpg#fragment',' assets/photos/cars-1.jpg']){assert.equal(media.image(unknown),null);assert.equal(media.original(unknown),unknown,'unknown/private/external URL remains untouched')}
 const logo=await sharp(path.join(root,'dist/assets/brand/fas-torgi-logo.png')).metadata();assert.equal(logo.width,1116);assert.equal(logo.height,694);assert.equal(logo.hasAlpha,true);

 // A disposable small-image source proves actual-width descriptors, no upscale
 // and repeatable output, without modifying the reviewed production originals.
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'fas-responsive-test-'));
 try{
  for(const dir of ['scripts','tests/fixtures','dist/assets/photos','dist/assets/brand','mobile'])fs.mkdirSync(path.join(temporary,dir),{recursive:true});fs.symlinkSync(path.join(root,'mobile/node_modules'),path.join(temporary,'mobile/node_modules'),process.platform==='win32'?'junction':'dir');fs.copyFileSync(path.join(root,'scripts/generate-responsive-media.mjs'),path.join(temporary,'scripts/generate-responsive-media.mjs'));
  const fixture={};for(const [name,width,height]of [['small.jpg',320,200],['medium.jpg',640,400]]){const bytes=await sharp({create:{width,height,channels:3,background:{r:35,g:95,b:155}}}).jpeg().toBuffer();fs.writeFileSync(path.join(temporary,'dist/assets/photos',name),bytes);fixture[name]=hash(bytes)}fs.writeFileSync(path.join(temporary,'tests/fixtures/photo-original-sha256.json'),JSON.stringify(fixture));
  const logoBytes=await sharp({create:{width:1536,height:512,channels:4,background:{r:13,g:76,b:211,alpha:0.5}}}).png().toBuffer();fs.writeFileSync(path.join(temporary,'dist/assets/brand/fas-torgi-logo.png'),logoBytes);
  const generate=()=>cp.execFileSync(process.execPath,['scripts/generate-responsive-media.mjs'],{cwd:temporary,stdio:['ignore','pipe','pipe'],timeout:10000});generate();assert.equal(hash(fs.readFileSync(path.join(temporary,'dist/assets/brand/fas-torgi-logo.png'))),hash(logoBytes),'photo optimization leaves independently generated brand artwork untouched');const generated=api(path.join(temporary,'dist/responsive-media.js'));
  for(const [name,widths]of [['small.jpg',[320]],['medium.jpg',[480,640]]]){const values=generated.image('assets/photos/'+name);assert.deepEqual(values.srcset.split(', ').map(value=>Number(value.split(' ')[1].slice(0,-1))),widths);assert.equal(new Set(values.fullSrcset.split(', ').map(value=>value.split(' ')[1])).size,widths.length)}
  const files=[...fs.readdirSync(path.join(temporary,'dist/assets/photos/responsive')).map(name=>'dist/assets/photos/responsive/'+name),'dist/responsive-media.js','dist/assets/brand/fas-torgi-logo.png'],before=files.map(name=>hash(fs.readFileSync(path.join(temporary,name))));generate();assert.deepEqual(files.map(name=>hash(fs.readFileSync(path.join(temporary,name)))),before,'same sources and encoder produce identical output');
 }finally{fs.rmSync(temporary,{recursive:true,force:true})}
 console.log('PASS: 21 immutable originals, 42 content-hashed same-frame previews, dimensions/no upscale/descriptor dedup, logo alpha/aspect, private URL pass-through and deterministic generation.');
})().catch(error=>{console.error(error);process.exitCode=1});
