const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('mobile/scripts/native-bridge.js','utf8').replace(/^import .*;\n/gm,'');
const listeners={},calls=[];let dialog={open:true,close(){calls.push('close')}};
const document={documentElement:{classList:{add(){}}},querySelectorAll:selector=>selector==='dialog[open]'?[dialog]:[],addEventListener(){}};
const context={console,URL,document,navigator:{geolocation:{}},location:{origin:'https://localhost'},Capacitor:{isNativePlatform:()=>true,getPlatform:()=> 'android'},App:{addListener:(type,fn)=>listeners[type]=fn,minimizeApp:()=>Promise.resolve(calls.push('minimize'))},Browser:{open:()=>Promise.resolve()},Geolocation:{requestPermissions:async()=>({location:'granted'}),getCurrentPosition:async()=>({})},Share:{share:async()=>({})},StatusBar:{setStyle:()=>Promise.resolve(),setOverlaysWebView:()=>Promise.resolve(),setBackgroundColor:()=>Promise.resolve()},Style:{Dark:'dark'},history:{back(){calls.push('history')}},FasBackSwipe:{back(){calls.push('route-back');return true}}};
context.window=context;vm.runInNewContext(source,context);
listeners.backButton({canGoBack:true});assert.deepEqual(calls,['route-back'],'native Back uses the same hierarchical route as the swipe/on-screen back');
calls.length=0;context.FasBackSwipe.back=()=>false;listeners.backButton({canGoBack:true});assert.deepEqual(calls,['close'],'lot or unsupported dialog falls back to close');
calls.length=0;context.FasBackSwipe=undefined;listeners.backButton({canGoBack:true});assert.deepEqual(calls,['close'],'missing optional route helper is safe');

// A full-screen photo overlays either the lot or feed and closes first.
dialog={id:'lot-photo-viewer',open:true,close(){calls.push('photo-close')}};calls.length=0;context.FasBackSwipe={back(){calls.push('unexpected-route');return true}};listeners.backButton({canGoBack:true});assert.deepEqual(calls,['photo-close']);
// Seller storage/validation failure is an intentional refusal, never a close fallback.
dialog={id:'modal',open:true,classList:{contains:value=>value==='seller-dialog'},close(){calls.push('unsafe-seller-close')}};calls.length=0;context.FasSellerUI={back(){calls.push('seller-refused');return false}};listeners.backButton({canGoBack:true});assert.deepEqual(calls,['seller-refused']);
dialog=null;calls.length=0;context.reelsMode=true;context.setReels=value=>calls.push(['reels',value]);listeners.backButton({canGoBack:true});assert.deepEqual(calls,[['reels',false]]);
context.reelsMode=false;calls.length=0;listeners.backButton({canGoBack:true});assert.deepEqual(calls,['history']);
calls.length=0;listeners.backButton({canGoBack:false});assert.deepEqual(calls,['minimize']);
console.log('PASS: Android Back follows nested navigation, dialog fallback, feed exit, browser history and app minimize.');
