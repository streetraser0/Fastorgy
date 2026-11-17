const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../dist/seller-media.js'),'utf8');
function fakeDatabase(){
 const state={data:new Map(),failWrites:false,failAfterWrites:Infinity,writeCount:0};
 const db={objectStoreNames:{contains:()=>true},close(){},transaction(name,mode){
  const data=new Map(state.data);let pending=0,done=false,scheduled=false;
  const tx={error:null};
  function fail(error){if(done)return;done=true;tx.error=error;tx.onerror?.({target:{error}});tx.onabort?.({target:{error}})}
  function commit(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;if(done||pending)return;done=true;if(mode==='readwrite')state.data=data;tx.oncomplete?.()})}
  function request(operation){const req={};pending++;queueMicrotask(()=>{if(done)return;try{req.result=operation();req.onsuccess?.({target:req})}catch(error){req.error=error;fail(error)}finally{pending--;if(!pending)commit()}});return req}
  const store={get:id=>request(()=>data.get(id)),add:record=>request(()=>{if(state.failWrites||state.writeCount++>=state.failAfterWrites){const e=new Error('quota');e.name='QuotaExceededError';throw e}if(data.has(record.id))throw Error('duplicate');data.set(record.id,record);return record.id}),delete:id=>request(()=>data.delete(id))};
  tx.objectStore=()=>store;tx.abort=()=>fail(Error('abort'));queueMicrotask(commit);return tx;
 }};
 state.indexedDB={open(){const request={};queueMicrotask(()=>{request.result=db;request.onsuccess?.()});return request}};return state;
}
function harness(withDatabase=true,suppliedDb){const db=suppliedDb||fakeDatabase(),events={},created=[],revoked=[],dispatched=[];let sequence=0;const window={Blob,CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail}},dispatchEvent:event=>dispatched.push(event),crypto:{randomUUID:()=>`uuid_12345678_${++sequence}`},URL:{createObjectURL(){const url='blob:demo/'+sequence+'/'+created.length;created.push(url);return url},revokeObjectURL(url){revoked.push(url)}},addEventListener:(name,fn)=>events[name]=fn};if(withDatabase)window.indexedDB=db.indexedDB;vm.runInNewContext(source,{window,Blob,Uint8Array,Date,Math,Promise,Map,Set,Object,Array,Number,String,Error});return {api:window.FasSellerMedia,window,db,events,created,revoked,dispatched}}
// Dimension-bearing header fixtures: codecs are not invoked by these VM tests.
function jpegHeader(width=1,height=1,metadata=Buffer.alloc(0)){
 const frame=Buffer.from([255,192,0,17,8,0,0,0,0,3,1,17,0,2,17,0,3,17,0]);frame.writeUInt16BE(height,5);frame.writeUInt16BE(width,7);
 return Buffer.concat([Buffer.from([255,216]),metadata,frame,Buffer.from([255,217])]);
}
function pngChunk(type,data){const bytes=Buffer.alloc(data.length+12);bytes.writeUInt32BE(data.length,0);bytes.write(type,4);data.copy(bytes,8);let crc=0xffffffff;for(const value of bytes.subarray(4,-4)){crc^=value;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}bytes.writeUInt32BE((crc^0xffffffff)>>>0,bytes.length-4);return bytes}
function pngImage(width=1,height=1){const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',ihdr),pngChunk('IDAT',require('node:zlib').deflateSync(Buffer.alloc((width+1)*height))),pngChunk('IEND',Buffer.alloc(0))])}
function gifImage(width=1,height=1,frameWidth=width,frameHeight=height,frames=2){const header=Buffer.from([71,73,70,56,57,97,0,0,0,0,128,0,0,0,0,0,255,255,255]);header.writeUInt16LE(width,6);header.writeUInt16LE(height,8);const frame=Buffer.from([33,249,4,0,10,0,0,0,44,0,0,0,0,0,0,0,0,0,2,2,68,1,0]);frame.writeUInt16LE(frameWidth,13);frame.writeUInt16LE(frameHeight,15);return Buffer.concat([header,...Array.from({length:frames},()=>frame),Buffer.from([59])])}
function webpChunk(type,data){const bytes=Buffer.alloc(8+data.length+(data.length%2));bytes.write(type,0);bytes.writeUInt32LE(data.length,4);data.copy(bytes,8);return bytes}
function webpImage(chunks){const data=Buffer.concat(chunks),header=Buffer.alloc(12);header.write('RIFF');header.writeUInt32LE(data.length+4,4);header.write('WEBP',8);return Buffer.concat([header,data])}
function webpFrame(type,width=1,height=1){
 if(type==='VP8X'){const bytes=Buffer.alloc(10);bytes.writeUIntLE(width-1,4,3);bytes.writeUIntLE(height-1,7,3);return webpChunk(type,bytes)}
 if(type==='VP8 '){const bytes=Buffer.from([0,0,0,157,1,42,0,0,0,0]);bytes.writeUInt16LE(width,6);bytes.writeUInt16LE(height,8);return webpChunk(type,bytes)}
 const bytes=Buffer.alloc(5);bytes[0]=47;bytes[1]=(width-1)&255;bytes[2]=((width-1)>>8)|(((height-1)&3)<<6);bytes[3]=((height-1)>>2)&255;bytes[4]=((height-1)>>10)&15;return webpChunk('VP8L',bytes);
}
const jpeg=jpegHeader(),png=pngImage();
const mp4=new Uint8Array([0,0,0,24,102,116,121,112,105,115,111,109,0,0,0,0]);
const photo=(name='Фото.jpg')=>new File([jpeg],name,{type:'image/jpeg'});
const video=()=>new File([mp4],'Видео.mp4',{type:'video/mp4'});
const box=(type,payload)=>{const bytes=Buffer.alloc(8+payload.length);bytes.writeUInt32BE(bytes.length,0);bytes.write(type,4,4,'ascii');Buffer.from(payload).copy(bytes,8);return bytes};
function isoImage(major='heic',compatible=['mif1'],width=4000,height=3000){const ispe=Buffer.alloc(12);ispe.writeUInt32BE(width,4);ispe.writeUInt32BE(height,8);return Buffer.concat([box('ftyp',Buffer.concat([Buffer.from(major),Buffer.alloc(4),...compatible.map(brand=>Buffer.from(brand))])),box('meta',Buffer.concat([Buffer.alloc(4),box('iprp',box('ipco',box('ispe',ispe)))]))])}
function bmp(width=4000,height=3000){const bytes=Buffer.alloc(54);bytes.write('BM');bytes.writeUInt32LE(bytes.length,2);bytes.writeUInt32LE(54,10);bytes.writeUInt32LE(40,14);bytes.writeUInt32LE(width,18);bytes.writeInt32LE(height,22);bytes.writeUInt16LE(1,26);bytes.writeUInt16LE(24,28);return bytes}
function tiff(little=true,width=4000,height=3000){const bytes=Buffer.alloc(38),short=(value,at)=>little?bytes.writeUInt16LE(value,at):bytes.writeUInt16BE(value,at),long=(value,at)=>little?bytes.writeUInt32LE(value,at):bytes.writeUInt32BE(value,at);bytes.write(little?'II':'MM');short(42,2);long(8,4);short(2,8);for(const [index,value]of [width,height].entries()){const at=10+index*12;short(256+index,at);short(4,at+2);long(1,at+4);long(value,at+8)}return bytes}
const special=(bytes=isoImage(),name='Камера.HEIC',type='image/heic')=>new File([bytes],name,{type});
function browserDecoder(h,options={}){
 const stats={calls:0,active:0,peak:0,closed:0,canvases:[],fills:[],draws:[],paintOrder:[],encodes:[],orientations:[],imageReleased:0};
 if(options.bitmap!==false)h.window.createImageBitmap=async(blob,settings)=>{stats.calls++;stats.active++;stats.peak=Math.max(stats.peak,stats.active);stats.orientations.push(settings.imageOrientation);await Promise.resolve();if(options.failAt===stats.calls){stats.active--;throw Error('unsupported decoder')}return{width:options.width||4000,height:options.height||3000,close(){stats.closed++;stats.active--}}};
 h.window.document={createElement(type){if(type!=='canvas')return null;const canvas={width:0,height:0,getContext(){if(options.noContext)return null;return{fillStyle:'',fillRect(x,y,width,height){stats.fills.push({color:this.fillStyle,width,height});stats.paintOrder.push('fill')},drawImage(image,x,y,width,height){stats.draws.push({width,height});stats.paintOrder.push('draw')}}},toBlob(callback,type,quality){stats.encodes.push({type,quality});if(options.emptyOutput){callback(null);return}const output=options.outputSize?new Blob([jpeg,new Uint8Array(options.outputSize-jpeg.length)],{type:options.outputType||'image/jpeg'}):new Blob([jpeg],{type:options.outputType||'image/jpeg'});callback(output)}};stats.canvases.push(canvas);return canvas}};
 if(options.image)h.window.Image=class{get naturalWidth(){return options.width||4000}get naturalHeight(){return options.height||3000}set src(value){this.value=value;queueMicrotask(()=>options.imageError?this.onerror?.():this.onload?.())}removeAttribute(){stats.imageReleased++}};
 h.window.fetch=()=>{throw Error('conversion must never fetch remotely')};
 return stats;
}
function queuedTimers(h){
 const pending=new Map(),scheduled=[],cleared=[];let next=0;
 h.window.setTimeout=(callback,delay)=>{const id=++next;pending.set(id,callback);scheduled.push(delay);return id};h.window.clearTimeout=id=>{cleared.push(id);pending.delete(id)};
 return{pending,scheduled,cleared,fire(){const [id,callback]=pending.entries().next().value||[];assert(callback,'conversion scheduled a bounded timer');pending.delete(id);callback()}};
}
const nextTurn=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 const h=harness(),a=h.api;
 assert.equal((await a.validateFiles([photo()]))[0].kind,'image');assert.equal((await a.validateFiles([video()]))[0].kind,'video');
 assert.equal((await a.validateFiles([new File([png],'picture',{type:''})]))[0].type,'image/png');
 {
  const raster=harness(),decoder=browserDecoder(raster),file=(bytes,type)=>new File([bytes],'source',{type});
  const animatedFrame=Buffer.alloc(16);animatedFrame.writeUIntLE(1,12,3);
  const animation=webpImage([webpFrame('VP8X'),webpChunk('ANIM',Buffer.alloc(6)),webpChunk('ANMF',Buffer.concat([animatedFrame,webpFrame('VP8L')]))]);animation[20]=2;
  const originals=[file(jpeg,'image/jpeg'),file(png,'image/png'),file(gifImage(),'image/gif'),...['VP8 ','VP8L','VP8X'].map(type=>file(webpImage([webpFrame(type)]),'image/webp')),file(animation,'image/webp')];
  const checked=await raster.api.validateFiles(originals);for(let index=0;index<originals.length;index++)assert.strictEqual(checked[index].file,originals[index],'ordinary originals, including animations, retain their exact bytes');
  const saved=await raster.api.storeFiles(originals,'raster-owner');for(let index=0;index<saved.length;index++)assert.deepEqual(Buffer.from(await raster.db.data.get(saved[index].id).blob.arrayBuffer()),Buffer.from(await originals[index].arrayBuffer()));
  assert.equal(decoder.calls,0);assert.equal(raster.created.length,0,'dimension checks neither decode nor create preview URLs');
  const hugePng=pngImage(8192,8192);assert(hugePng.length<100000,'real 67-megapixel PNG remains far below the 10 MB compressed file limit');
  for(const [bytes,type]of [[hugePng,'image/png'],[jpegHeader(8192,8192),'image/jpeg'],[gifImage(8192,8192),'image/gif'],[gifImage(1,1,8192,8192),'image/gif'],...['VP8 ','VP8L','VP8X'].map(kind=>[webpImage([webpFrame(kind,8192,8192)]),'image/webp'])])await assert.rejects(raster.api.validateFiles([file(bytes,type)]),/40 мегапикселей/,type+' oversized dimensions fail before decoding');
  const largeFrame=Buffer.from(animatedFrame);largeFrame.writeUIntLE(8191,6,3);largeFrame.writeUIntLE(8191,9,3);
  await assert.rejects(raster.api.validateFiles([file(webpImage([webpFrame('VP8X'),webpChunk('ANMF',largeFrame)]),'image/webp')]),/40 мегапикселей/,'a small animation canvas cannot conceal an oversized frame');
  const badRiff=Buffer.from(animation);badRiff.writeUInt32LE(animation.length+10,4);
  const badChunk=webpImage([webpFrame('VP8L')]);badChunk.writeUInt32LE(999,16);
  const badPng=Buffer.from(png);badPng.writeUInt32BE(0,16);
  for(const [bytes,type]of [[jpegHeader(0,1),'image/jpeg'],[jpeg.subarray(0,9),'image/jpeg'],[Buffer.from([255,216,255,225,255,255,0]),'image/jpeg'],[png.subarray(0,25),'image/png'],[badPng,'image/png'],[gifImage(0,1),'image/gif'],[gifImage().subarray(0,40),'image/gif'],[badRiff,'image/webp'],[badChunk,'image/webp'],[webpImage([webpChunk('VP8L',Buffer.from([47]))]),'image/webp']])await assert.rejects(raster.api.validateFiles([file(bytes,type)]),/повреждена|полностью/,type+' malformed headers are rejected');
  const atomic=harness();await assert.rejects(atomic.api.storeFiles([photo(),file(hugePng,'image/png')],'raster-owner'),/40 мегапикселей/);assert.equal(atomic.db.writeCount,0,'an invalid second image rejects the batch before the first IDB write');assert.equal(atomic.db.data.size,0);assert.equal(decoder.calls,0);
  const measure=bytes=>{const original=file(bytes,''),reads=[];return{reads,file:{name:original.name,type:original.type,size:original.size,slice(start,end){reads.push([start,end]);return original.slice(start,end)}}}};
  const metadata=Buffer.alloc(65537);metadata[0]=255;metadata[1]=225;metadata.writeUInt16BE(65535,2);
  const distant=measure(jpegHeader(640,480,metadata));assert.strictEqual((await raster.api.validateFiles([distant.file]))[0].file,distant.file);assert(distant.reads.every(([start,end])=>end-start<=64),'JPEG metadata is skipped, not loaded');assert(distant.reads.length<10);
  const fill=measure(jpegHeader(1,1,Buffer.alloc(120,255)));await raster.api.validateFiles([fill.file]);
  const manyMarkers=measure(Buffer.concat([Buffer.from([255,216]),Buffer.from(Array.from({length:4097},()=>[255,1]).flat()),jpeg.subarray(2)]));await assert.rejects(raster.api.validateFiles([manyMarkers.file]),/повреждена/);assert(manyMarkers.reads.length<4100,'JPEG marker scanning has a fixed work bound');
  const gif=gifImage(),subblock=Buffer.alloc(256);subblock[0]=255;
  const bigComment=measure(Buffer.concat([gif.subarray(0,19),Buffer.from([33,254]),...Array.from({length:8000},()=>subblock),Buffer.from([0]),gif.subarray(19)]));await raster.api.validateFiles([bigComment.file]);assert(bigComment.reads.every(([start,end])=>end-start<=65536));assert(bigComment.reads.length<40,'GIF subblocks use bounded read windows instead of thousands of Blob reads');
  const manyGifBlocks=measure(Buffer.concat([gif.subarray(0,19),Buffer.from([33,254]),Buffer.from(Array.from({length:65537},()=>[1,0]).flat()),Buffer.from([0]),gif.subarray(19)]));await assert.rejects(raster.api.validateFiles([manyGifBlocks.file]),/повреждена/);assert(manyGifBlocks.reads.length<5,'malicious GIF subblock counts terminate without decoding');
  const padded=webpImage([webpChunk('EXIF',Buffer.from([1,2,3])),webpFrame('VP8L')]);await raster.api.validateFiles([file(padded,'image/webp')]);
  const manyWebpChunks=webpImage([...Array.from({length:4097},()=>webpChunk('EXIF',Buffer.alloc(0))),webpFrame('VP8L')]);await assert.rejects(raster.api.validateFiles([file(manyWebpChunks,'image/webp')]),/повреждена/);
  const tail=measure(Buffer.from([255,216,255]));await assert.rejects(raster.api.validateFiles([tail.file]),/повреждена/);assert.equal(tail.reads.length,1,'truncated JPEG marker fails immediately');
 }
 {
  const assets=path.join(__dirname,'../dist/assets'),actual=harness(),decoder=browserDecoder(actual),counts={};
  for(const name of fs.readdirSync(assets,{recursive:true}).filter(name=>/\.(jpe?g|png|webp)$/i.test(name))){
   const type=/\.png$/i.test(name)?'image/png':/\.webp$/i.test(name)?'image/webp':'image/jpeg',original=new File([fs.readFileSync(path.join(assets,name))],name,{type});
   const checked=await actual.api.validateFiles([original]);assert.strictEqual(checked[0].file,original,name+' existing site image must remain accepted');counts[type]=(counts[type]||0)+1;
  }
  for(const type of ['image/jpeg','image/png','image/webp'])assert(counts[type]>0,type+' real repository fixtures were exercised');
  assert.equal(decoder.calls,0);assert.equal(actual.db.writeCount,0);assert.equal(actual.created.length,0);console.log('PASS: existing asset header compatibility '+JSON.stringify(counts)+'; no decoder, preview or IDB writes.');
 }
 await assert.rejects(a.validateFiles([new File(['<svg onload="alert(1)"></svg>'],'x.svg',{type:'image/svg+xml'})]),/Поддерживаются/);
 await assert.rejects(a.validateFiles([new File([jpeg],'fake.png',{type:'image/png'})]),/не соответствует/);
 await assert.rejects(a.validateFiles([new File([],'empty.jpg',{type:'image/jpeg'})]),/непустые/);
 await assert.rejects(a.validateFiles(Array.from({length:21},()=>photo())),/20 фотографий/);
 await assert.rejects(a.validateFiles(Array.from({length:6},()=>video())),/5 видео/);
 await assert.rejects(a.validateFiles([{size:11*1024*1024,type:'image/jpeg',slice:()=>new Blob([jpeg])}]),/10 МБ/);
 await assert.rejects(a.validateFiles([{size:31*1024*1024,type:'video/mp4',slice:()=>new Blob([mp4])}]),/30 МБ/);
 const existing=Array.from({length:20},(_,i)=>({id:'idb:photo_12345678_'+i,kind:'image',size:5*1024*1024}));
 await assert.rejects(a.validateFiles([photo()],existing),/20 фотографий/);
 await assert.rejects(a.validateFiles([video()],existing),/100 МБ/);
 const refs=await a.storeFiles([photo(),video()],'seller-1');assert.equal(refs.length,2);assert(refs.every(ref=>ref.id.startsWith('idb:')));assert.equal(h.db.data.size,2);assert(!JSON.stringify(refs).includes('blob:'));
 const first=await a.getMedia(refs,{ownerId:'seller-1'});assert.equal(first.length,2);assert(a.isSafeObjectUrl(first[0].url));assert(!a.isSafeObjectUrl('blob:attacker'));
 const again=await a.getMedia(refs,{ownerId:'seller-1'});assert.equal(again[0].url,first[0].url);assert.equal(h.created.length,2);
 const reopened=harness(true,h.db),reopenedMedia=await reopened.api.getMedia(refs,{ownerId:'seller-1'});assert.equal(reopenedMedia.length,2);assert.equal(reopened.created.length,2);assert.notEqual(reopenedMedia[0].url,first[0].url);
 assert.equal((await a.getMedia(refs,{ownerId:'seller-2'})).length,0);
 await assert.rejects(a.getMedia(refs),/владельца файлов/,'reading private local files requires an explicit owner');
 await assert.rejects(a.getMedia(refs,{ownerId:{id:'seller-1'}}),/владельца файлов/);
 const orphaned=[{id:701,category:'cars',image:'blob:stale',mediaRefs:refs},{id:702,category:'cars',sellerOwnerId:{id:'seller-1'},mediaRefs:refs},{id:703,category:'cars',sellerOwnerId:'seller-2',mediaRefs:refs}];
 await a.hydrateLots(orphaned);for(const lot of orphaned){assert.equal(lot.image,'assets/cars.svg');assert.equal(lot.media.length,0);assert.equal(lot.mediaMissingCount,2,'missing, malformed or different owner must never expose saved private photos')}

 const lots=[{id:1,category:'cars',sellerOwnerId:'seller-1',image:'assets/cars.svg',mediaRefs:refs,media:[{url:'https://example.com/detail.jpg',type:'image'}]},{id:2,category:'cars',sellerOwnerId:'seller-1',mediaRefs:[refs[0]]}];
 await a.hydrateLots(lots);assert.equal(lots[0].image,first[0].url);assert.equal(lots[0].media.length,3);assert.equal(lots[0].mediaMissingCount,0);
 const serial=a.serializeLot(lots[0]);assert.equal(serial.image,'assets/cars.svg');assert.equal(serial.media.length,1);assert.equal(serial.mediaRefs,refs);assert(!JSON.stringify(serial).includes('blob:'));assert.equal(lots[0].image,first[0].url);
 let deleted=await a.deleteMedia(refs,'seller-2');assert.equal(deleted.deleted.length,0);assert.equal(h.db.data.size,2);
 deleted=await a.deleteMedia([refs[0]],'seller-1');assert.equal(deleted.deleted.length,0,'a file used by either lot must not be deleted');
 await a.hydrateLots([{id:2,sellerOwnerId:'seller-1',category:'cars',mediaRefs:[refs[0]]}]);deleted=await a.deleteMedia(refs,'seller-1');assert.equal(deleted.deleted.length,1);assert.equal(deleted.deleted[0],refs[1].id);assert.equal(h.db.data.size,1);assert(!a.isSafeObjectUrl(first[1].url));
 await a.hydrateLots([]);deleted=await a.deleteMedia([refs[0]],'seller-1',{keepRefs:[refs[0]]});assert.equal(deleted.deleted.length,0);
 deleted=await a.deleteMedia([refs[0]],'seller-1');assert.equal(deleted.deleted.length,1);assert.equal(h.db.data.size,0);
 const rollback=harness();rollback.db.failAfterWrites=1;await assert.rejects(rollback.api.storeFiles([photo(),photo()],'seller-1'),/недостаточно места/);assert.equal(rollback.db.data.size,0);
 const unsupported=harness(false);await assert.rejects(unsupported.api.storeFiles([photo()],'seller-1'),/недоступно/);
 const missing=[{category:'property',sellerOwnerId:'seller-1',image:'blob:stale',mediaRefs:[{id:'idb:missing123456',kind:'image'}],media:[]}];await a.hydrateLots(missing);assert.equal(missing[0].image,'assets/property.svg');assert.equal(missing[0].mediaMissingCount,1);
 const last=await a.storeFiles([photo()],'seller-1');const restoredLots=[{category:'cars',sellerOwnerId:'seller-1',mediaRefs:last,media:[]}];await a.hydrateLots(restoredLots);const lastMedia=await a.getMedia(last,{ownerId:'seller-1'});h.events.pagehide({persisted:true});assert(a.isSafeObjectUrl(lastMedia[0].url));await h.events.pageshow({persisted:true});assert(a.isSafeObjectUrl(restoredLots[0].image));assert.equal(h.dispatched.at(-1).type,'fas-seller-media-restored');
 h.events.pagehide({persisted:false});assert(!a.isSafeObjectUrl(lastMedia[0].url));await h.events.pageshow({persisted:true});assert(a.isSafeObjectUrl(restoredLots[0].image));assert.notEqual(restoredLots[0].image,lastMedia[0].url);assert.equal(h.dispatched.at(-1).type,'fas-seller-media-restored');
 assert(a.photoAccept.includes('image/heic')&&a.photoAccept.includes('.avif')&&a.photoAccept.includes('.tiff'));assert(a.fileAccept.includes('video/mp4'));
 {
  const modern=harness(),stats=browserDecoder(modern),input=special(),refs=await modern.api.storeFiles([input],'seller-camera'),record=modern.db.data.get(refs[0].id);
  assert.equal(refs[0].type,'image/jpeg');assert.equal(refs[0].name,'Камера.jpg');assert.equal(refs[0].sourceType,'image/heic');assert.equal(refs[0].sourceSize,input.size);assert.equal(record.blob.type,'image/jpeg');assert.equal(record.blob.size,jpeg.length);assert.equal(stats.orientations[0],'from-image');assert.deepEqual(stats.draws,[{width:2560,height:1920}]);assert.deepEqual(stats.encodes,[{type:'image/jpeg',quality:0.85}]);assert.equal(stats.closed,1);assert.equal(stats.active,0);assert.equal(stats.canvases[0].width,1);assert.equal(modern.created.length,0,'bitmap conversion needs no temporary URL');
  assert.deepEqual(stats.fills,[{color:'#fff',width:2560,height:1920}]);assert.deepEqual(stats.paintOrder,['fill','draw'],'transparent source pixels are flattened onto a white JPEG background');
  const metadata=special(Buffer.concat([tiff(),Buffer.from('GPS PRIVATE LOCATION')]),'scan.tif','image/tiff'),normalized=await modern.api.validateFiles([metadata]);assert(!(await normalized[0].file.text()).includes('GPS PRIVATE LOCATION'),'only canvas JPEG bytes survive, never original metadata');
  const originals=[photo(),new File([gifImage()],'animated.gif',{type:'image/gif'})],calls=stats.calls,checked=await modern.api.validateFiles(originals);assert.strictEqual(checked[0].file,originals[0]);assert.strictEqual(checked[1].file,originals[1]);assert.equal(checked[1].type,'image/gif');assert.equal(stats.calls,calls,'existing JPEG/GIF paths never decode or flatten animation');
 }
 {
  const modern=harness(),stats=browserDecoder(modern);
  for(const [bytes,name,type,sourceType]of [[isoImage('mif1',['avif']),'compatible.avif','','image/avif'],[isoImage('avis',['avif']),'sequence.avif','image/avif','image/avif'],[isoImage('isom',['mif1','heix']),'compatible.heic','image/heic-sequence','image/heic'],[isoImage('mif1',['msf1']),'image.heif','image/heif-sequence','image/heif'],[bmp(),'image.bmp','image/x-ms-bmp','image/bmp'],[bmp(4000,-3000),'top-down.bmp','','image/bmp'],[tiff(),'little.tiff','image/tiff','image/tiff'],[tiff(false),'big.tif','image/x-tiff','image/tiff']]){
   const checked=await modern.api.validateFiles([special(bytes,name,type)]);assert.equal(checked[0].type,'image/jpeg',name);assert.equal(checked[0].sourceType,sourceType,name);
  }
  assert.equal(stats.closed,8);
  await assert.rejects(modern.api.validateFiles([special(isoImage('avif'),'fake.heic','image/heic')]),/не соответствует/);
  await assert.rejects(modern.api.validateFiles([special(bmp(),'fake.png','image/png')]),/не соответствует/);
  await assert.rejects(modern.api.validateFiles([special(Buffer.from('<svg/>'),'fake.heic','image/heic')]),/Поддерживаются/);
  const calls=stats.calls;
  for(const [bytes,type]of [[Buffer.from('BM'),'image/bmp'],[tiff().subarray(0,12),'image/tiff'],[isoImage('avif').subarray(0,12),'image/avif']])await assert.rejects(modern.api.validateFiles([special(bytes,'truncated',type)]),/повреждена|полностью/);
  for(const [bytes,type]of [[bmp(10000,10000),'image/bmp'],[tiff(true,10000,10000),'image/tiff'],[isoImage('avif',[],10000,10000),'image/avif']])await assert.rejects(modern.api.validateFiles([special(bytes,'huge',type)]),/40 мегапикселей/);
  assert.equal(stats.calls,calls,'bad/truncated/oversized headers fail before browser decoding');
 }
 {
  const fallback=harness(),stats=browserDecoder(fallback,{failAt:1,image:true}),refs=await fallback.api.storeFiles([special()],'seller-camera');assert.equal(stats.calls,1);assert.equal(fallback.created.length,1);assert.equal(fallback.revoked[0],fallback.created[0]);assert.equal(stats.imageReleased,1);assert(!fallback.api.isSafeObjectUrl(fallback.created[0]),'temporary conversion URLs never become gallery-safe');assert.equal(refs[0].type,'image/jpeg');
  const unsupportedImage=harness(),failed=browserDecoder(unsupportedImage,{bitmap:false,image:true,imageError:true});await assert.rejects(unsupportedImage.api.storeFiles([special(tiff(),'camera.tif','image/tiff')],'seller-camera'),/Экспортируйте.*JPEG.*PNG/);assert.equal(unsupportedImage.db.data.size,0);assert.equal(unsupportedImage.created.length,1);assert.equal(unsupportedImage.revoked.length,1);assert.equal(failed.imageReleased,1);
  const unsupportedFormat=harness();await assert.rejects(unsupportedFormat.api.validateFiles([special()]),/Экспортируйте.*JPEG.*PNG/);
 }
 {
  const sequential=harness(),stats=browserDecoder(sequential);await sequential.api.storeFiles([special(),special(),special()],'seller-camera');assert.equal(stats.peak,1);assert.equal(stats.closed,3,'every decoded bitmap closes before the next conversion');
  const atomic=harness(),failed=browserDecoder(atomic,{failAt:2});await assert.rejects(atomic.api.storeFiles([special(),special()],'seller-camera'),/Экспортируйте/);assert.equal(atomic.db.data.size,0);assert.equal(atomic.db.writeCount,0,'all conversions finish before an IndexedDB write is attempted');assert.equal(failed.closed,1);
  for(const options of [{width:10000,height:10000},{noContext:true},{emptyOutput:true},{outputType:'image/png'},{outputSize:11*1024*1024}]){const invalid=harness(),cleanup=browserDecoder(invalid,options);await assert.rejects(invalid.api.storeFiles([special()],'seller-camera'),/40 мегапикселей|Экспортируйте|10 МБ/);assert.equal(cleanup.closed,1);assert.equal(invalid.db.data.size,0);assert(cleanup.canvases.every(canvas=>canvas.width===1&&canvas.height===1),'failed conversions release canvas memory')}
  const overSource=harness(),sourceStats=browserDecoder(overSource);await assert.rejects(overSource.api.validateFiles([{size:11*1024*1024,type:'image/heic',slice:()=>new Blob([isoImage()])}]),/10 МБ/);assert.equal(sourceStats.calls,0);
  const sourceTotals=harness(),sourceDecoder=browserDecoder(sourceTotals),sourceRefs=Array.from({length:10},(_,i)=>({id:'idb:source_total_'+i,kind:'image',size:1024*1024,sourceSize:9.5*1024*1024}));await assert.rejects(sourceTotals.api.validateFiles([{size:6*1024*1024,type:'image/heic',slice:()=>new Blob([isoImage()])}],sourceRefs),/100 МБ/);assert.equal(sourceDecoder.calls,0,'source totals are checked before decoding');
  const normalizedTotals=harness(),normalizedDecoder=browserDecoder(normalizedTotals,{outputSize:8*1024*1024}),storedRefs=Array.from({length:10},(_,i)=>({id:'idb:stored_total_'+i,kind:'image',size:7.5*1024*1024}));await assert.rejects(normalizedTotals.api.storeFiles([special(),special(),special(),special()],'seller-camera',{existingRefs:storedRefs}),/100 МБ/);assert.equal(normalizedTotals.db.data.size,0);assert.equal(normalizedDecoder.closed,4,'normalized totals also reject atomically after all local conversions');
 }
 {
  const timed=harness();browserDecoder(timed);const timers=queuedTimers(timed);await timed.api.storeFiles([special()],'seller-camera');assert.equal(timers.pending.size,0,'successful decode and encode clear their timeout timers');assert(timers.cleared.length>=2);assert(timers.scheduled.every(delay=>delay>0&&delay<=15000));
 }
 {
  const stuck=harness(),stats=browserDecoder(stuck),timers=queuedTimers(stuck);let finishBitmap,lateClosed=0;
  stuck.window.createImageBitmap=()=>new Promise(resolve=>{finishBitmap=resolve});const rejected=assert.rejects(stuck.api.storeFiles([special()],'seller-camera'),/15 секунд.*Выберите.*заново|15 секунд.*повторите/);
  await nextTurn();assert.equal(typeof finishBitmap,'function');assert.equal(timers.pending.size,1);timers.fire();await rejected;assert.equal(stuck.db.writeCount,0);assert.equal(stuck.created.length,0,'bitmap timeout does not start a second image decode');
  finishBitmap({width:4000,height:3000,close(){lateClosed++}});await nextTurn();assert.equal(lateClosed,1,'a bitmap arriving after timeout is immediately closed');assert.equal(stats.canvases.length,0);assert.equal(stuck.db.data.size,0);
 }
 {
  const stuck=harness(),stats=browserDecoder(stuck,{bitmap:false}),timers=queuedTimers(stuck);let image,lateLoad,releases=0;
  stuck.window.Image=class{constructor(){image=this}get naturalWidth(){return 4000}get naturalHeight(){return 3000}set src(value){lateLoad=this.onload}removeAttribute(){releases++}};
  const rejected=assert.rejects(stuck.api.storeFiles([special()],'seller-camera'),/15 секунд/);await nextTurn();assert.equal(stuck.created.length,1);assert.equal(timers.pending.size,1);timers.fire();await rejected;
  assert.equal(image.onload,null);assert.equal(image.onerror,null);assert.equal(stuck.revoked[0],stuck.created[0]);assert.equal(releases,1);lateLoad();await nextTurn();assert.equal(releases,1,'late image events cannot release the same URL twice');assert.equal(stuck.revoked.length,1);assert.equal(stats.canvases.length,0);assert.equal(stuck.db.writeCount,0);
 }
 {
  const stuck=harness(),stats=browserDecoder(stuck),timers=queuedTimers(stuck),createElement=stuck.window.document.createElement;let finishEncode;
  stuck.window.document.createElement=type=>{const canvas=createElement(type);if(canvas)canvas.toBlob=callback=>{finishEncode=callback};return canvas};
  const rejected=assert.rejects(stuck.api.storeFiles([special()],'seller-camera'),/15 секунд/);await nextTurn();assert.equal(typeof finishEncode,'function');assert.equal(timers.pending.size,1);timers.fire();await rejected;
  assert.equal(stats.closed,1);assert.equal(stats.active,0);assert.equal(stats.canvases[0].width,1);assert.equal(stats.canvases[0].height,1);finishEncode(new Blob([jpeg],{type:'image/jpeg'}));await nextTurn();assert.equal(stuck.db.writeCount,0,'late canvas callbacks cannot revive an expired atomic batch');assert.equal(stuck.db.data.size,0);
 }
 console.log('PASS: bounded JPEG/PNG/GIF/WebP dimensions and frame headers before atomic storage, original animations preserved; signatures/limits/ownership/hydration; local special-photo JPEG conversion, source/normalized limits and bounded decode/encode with late-resource cleanup.');
})().catch(error=>{console.error(error);process.exitCode=1});
