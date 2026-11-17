const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {isCode,parseUpdates,checkPush,gitAt,runDiagnostics}=require('../scripts/diagnostics-on-change.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fas-change-hook-test-')),zero='0'.repeat(40);
const command=(args)=>{const r=spawnSync('git',args,{cwd:dir,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim()};
const write=(name,value)=>{fs.mkdirSync(path.dirname(path.join(dir,name)),{recursive:true});fs.writeFileSync(path.join(dir,name),value)};
const commit=()=>{command(['add','.']);command(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','fixture']);return command(['rev-parse','HEAD'])};
let calls=0;const git=gitAt(dir),line=(local,remote)=>`refs/heads/main ${local} refs/heads/main ${remote}\n`,run=input=>checkPush({input,git,run(){calls++}});
try{
 command(['init']);write('README.md','docs');const docs=commit();assert.equal(run(line(docs,zero)).run,false,'a docs-only first push skips');assert.equal(run('').run,false);assert.equal(run(line(docs,docs)).run,false);assert.equal(run(line(zero,docs)).run,false,'ref deletion skips');assert.equal(calls,0);
 write('dist/app.js','const value=1;');const firstCode=commit();assert.equal(run(line(firstCode,zero)).run,true,'first push with code validates');assert.equal(calls,1);
 write('docs/help.md','documentation only');const nextDocs=commit();assert.equal(run(line(nextDocs,firstCode)).run,false,'docs-only follow-up skips');assert.equal(calls,1);
 write('dist/app.js','const value=2;');const change=commit();assert.equal(run(line(change,nextDocs)).run,true);assert.equal(calls,2);
 assert.throws(()=>checkPush({input:line(change,nextDocs),git,run(){throw Error('checks failed')}}),/checks failed/,'a failing diagnostic blocks the push');
 write('dist/app.js','dirty');assert.throws(()=>run(line(change,nextDocs)),/отличается/);write('dist/app.js','const value=2;');write('tests/untracked.cjs','code');assert.throws(()=>run(line(change,nextDocs)),/неотслеживаемые/);fs.unlinkSync(path.join(dir,'tests/untracked.cjs'));
 assert.equal(run(line(change,change)).run,false,'unchanged code is not revalidated');assert.equal(calls,2);assert.throws(()=>parseUpdates('bad'),/Некорректные/);
 assert.throws(()=>checkPush({input:line(change,nextDocs),git,run(){write('dist/app.js','changed while diagnostics ran')}}),/отличается/,'a source edit during diagnostics blocks the push after the run');write('dist/app.js','const value=2;');
 for(const file of ['AGENTS.md','docs/help.md','tests/README.md','.openai/local.report.json'])assert.equal(isCode(file),false,file);
 for(const file of ['dist/logo.webp','mobile/app.swift','scripts/git-hooks/pre-push','tests/security-inputs.cjs','.github/workflows/check.yml'])assert.equal(isCode(file),true,file);
 // Inject child execution only through the exported testable function, never a CLI/env bypass.
 write('scripts/diagnostics/model-marketplace-100.cjs','fixture');write('tests/security-fixture.cjs','fixture');let children=0;
 runDiagnostics(dir,['verified-sha'],(_exe,args,options)=>{children++;assert.equal(options.env.MODEL_PROFILES,'100');assert.equal(options.env.MODEL_SOURCE,'verified-sha');if(args.includes('--expose-gc'))fs.writeFileSync(options.env.MODEL_REPORT,JSON.stringify({finished:true,sourceUnchangedDuringRun:true,requestedProfiles:100,totals:{completed:100,passed:100,failed:0}}));return {status:0}});assert.equal(children,2,'model runner and security checks both execute');
 assert.throws(()=>runDiagnostics(dir,['sha'],()=>({status:1})),/не прошла/);
 assert.throws(()=>runDiagnostics(dir,['sha'],(_exe,args,options)=>{if(args.includes('--expose-gc'))fs.writeFileSync(options.env.MODEL_REPORT,JSON.stringify({finished:true,sourceUnchangedDuringRun:false,requestedProfiles:100,totals:{completed:100,passed:100,failed:0}}));return {status:0}}),/неизменённом коде/,'all-pass totals cannot hide a runner source change');
 assert.throws(()=>runDiagnostics(dir,['sha'],(_exe,args,options)=>{if(args.includes('--expose-gc'))fs.writeFileSync(options.env.MODEL_REPORT,JSON.stringify({finished:true,requestedProfiles:1,totals:{completed:1,passed:1,failed:0}}));return {status:0}}),/всех 100/,'a reduced or forged partial report is not accepted');
 // Exercise the real CLI report contract, rather than only fabricating child output.
 const actualReport=path.join(dir,'actual-model-report.json'),actualRunner=path.join(__dirname,'../scripts/diagnostics/model-marketplace-100.cjs');
 const actual=spawnSync(process.execPath,['--expose-gc',actualRunner],{cwd:path.join(__dirname,'..'),env:{...process.env,MODEL_PROFILES:'1',MODEL_REPORT:actualReport},encoding:'utf8',timeout:30000});
 assert.equal(actual.status,0,actual.stderr);const modelReport=JSON.parse(fs.readFileSync(actualReport,'utf8'));
 assert.equal(modelReport.finished,true);assert.equal(modelReport.requestedProfiles,1);assert.equal(modelReport.totals.passed,1);
 assert.equal(modelReport.sourceUnchangedDuringRun,true,'the real model runner produces the field required by pre-push');assert.equal(modelReport.sourceDigestAfterRun,modelReport.sourceDigest);
 const hook=fs.readFileSync(path.join(__dirname,'../scripts/git-hooks/pre-push'),'utf8');assert(hook.includes('diagnostics-on-change.cjs'));assert(!/git config|chmod|curl|fetch|schedule/.test(hook));
 console.log('PASS: real Git fixtures skip unchanged/docs/deletion, validate first/code pushes, reject dirty/untracked code and failed checks, force 100 profiles plus security and reject incomplete reports without touching existing hooks/config.');
}finally{fs.rmSync(dir,{recursive:true,force:true})}
