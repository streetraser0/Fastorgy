const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),sharp=require(path.join(root,'mobile/node_modules/sharp')),hash=value=>crypto.createHash('sha256').update(value).digest('hex');
async function main(){
 const master=path.join(root,'design/brand/fas-torgi-centered-gradient-master.svg'),target=path.join(root,'dist/assets/brand/fas-torgi-logo.png'),legacy=path.join(root,'design/brand/fas-torgi-oval-master.png'),source=fs.readFileSync(master,'utf8');
 assert.equal(hash(source.replace(/\r\n?/g,'\n')),'2d3469781fad19d03a9c18a26fab2830dfabec681282596aa1b9181ced904c47','preserve the centered gradient artwork selected by the user');
 const original=fs.readFileSync(path.join(root,'design/brand/fas-torgi-blue-master.svg'),'utf8');
 const tiers=[...original.matchAll(/<path[^>]*\bd="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(tiers.length,3);for(const tier of tiers)assert(source.includes('d="'+tier+'"'),'original rounded pyramid tiers remain unchanged');
 assert(source.includes('ФАС торги')&&source.includes('Федеральная аукционная сеть'));
 assert(!/<text\b/.test(source),'outlined wordmark does not depend on platform fonts');
 for(const color of ['#50B8FF','#0877EF','#0648AF'])assert(source.includes(color),'approved gradient colour '+color);
 assert.equal(hash(fs.readFileSync(legacy)),'e583451babb554968fc133cdfd86eb3cd044fdff52f70b9724a4cabee28417f5','the prior oval master is preserved unchanged');
 const generate=()=>cp.execFileSync(process.execPath,['scripts/generate-brand-logo.mjs'],{cwd:root,stdio:['ignore','pipe','pipe'],timeout:15000});
 const approvedMaster=hash(fs.readFileSync(master));generate();const first=hash(fs.readFileSync(target));generate();assert.equal(hash(fs.readFileSync(target)),first,'identical approved SVG and renderer generate identical output bytes');assert.equal(hash(fs.readFileSync(master)),approvedMaster,'generation does not rewrite the vector master');
 const metadata=await sharp(target).metadata();assert.equal(metadata.width,1116);assert.equal(metadata.height,694);assert.equal(metadata.hasAlpha,true);assert.equal(metadata.isPalette,false,'gradient is not reduced to a palette');
 const pixels=await sharp(target).ensureAlpha().raw().toBuffer();let opaque=0,transparent=0;const blues=new Set();
 for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]===0)transparent++;if(pixels[i+3]===255){opaque++;if(pixels[i+2]>pixels[i]&&pixels[i+2]>pixels[i+1])blues.add(pixels.subarray(i,i+3).join(','));}}
 assert(opaque>20000&&transparent>100000&&blues.size>100,'visible gradient artwork sits on a genuinely transparent canvas');
 for(const pixel of [0,1115,1116*693,1116*694-1])assert.equal(pixels[pixel*4+3],0,'canvas corners contain no background');
 for(const [name,size] of [['icon-192',192],['icon-512',512],['maskable-512',512],['apple-touch-icon',180]]){
  const icon=path.join(root,'dist/assets/app',name+'.png'),meta=await sharp(icon).metadata();assert.equal(meta.width,size);assert.equal(meta.height,size);assert.equal(meta.hasAlpha,false,'home-screen icon is opaque');
 }
 const {data,info}=await sharp(path.join(root,'dist/assets/app/maskable-512.png')).removeAlpha().raw().toBuffer({resolveWithObject:true});
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  const i=(y*info.width+x)*info.channels;
  if(data[i+2]>data[i]+20)assert(Math.hypot(x-256,y-256)<=205,'pyramid remains inside the maskable safe circle');
 }
 const favicon=fs.readFileSync(path.join(root,'dist/favicon.svg'),'utf8');for(const tier of tiers)assert(favicon.includes('d="'+tier+'"'));assert(!favicon.includes('<image'),'favicon keeps crisp vector pyramid');
 let consumers=0;for(const name of fs.readdirSync(path.join(root,'dist'))){if(!/\.(?:html|js)$/.test(name))continue;const content=fs.readFileSync(path.join(root,'dist',name),'utf8');for(const match of content.matchAll(/<img\b[^>]*src="assets\/brand\/fas-torgi-logo\.png([^"<>]*)"[^>]*>/g)){consumers++;assert.equal(match[1],'?v=20261116-gradient1',name+' has a current logo asset version');assert(match[0].includes('alt="ФАС торги — Федеральная аукционная сеть"'),name+' retains the complete accessible brand name')}}assert(consumers>=15);
 const index=fs.readFileSync(path.join(root,'dist/index.html'),'utf8'),contrast=fs.readFileSync(path.join(root,'dist/brand-contrast.css'),'utf8'),footer=fs.readFileSync(path.join(root,'dist/footer.css'),'utf8');
 assert(!index.includes('<span class="brand-description">'));assert(!index.includes('<p>Федеральная аукционная сеть</p>'),'footer does not repeat the tagline already contained in the artwork');assert(!footer.includes('mask-image:url("assets/brand/fas-torgi-logo.png'),'no stale footer tint mask recolors the blue wordmark');assert(contrast.includes('height: auto'),'logo keeps its intrinsic aspect ratio');
 console.log('PASS: selected centered gradient master, original pyramid, transparent crisp PNG, deterministic generation, safe app icons, versioned accessible consumers and preserved historical masters. PNG SHA256 '+first);
}
main().catch(error=>{console.error(error);process.exitCode=1});
