/* Local pre-push diagnostics. No schedules, notifications, network calls or validation bypass flags. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const ZERO=/^0+$/,OID=/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
function isCode(file){
 const name=String(file).replaceAll('\\','/');
 if(/^(?:docs\/|\.openai\/local(?:[./-]|$))/.test(name)||/\.(?:md|txt|rst|adoc)$/i.test(name))return false;
 return /^(?:dist|mobile|src|server|workers|scripts|tests|\.github)\//.test(name)||/^(?:\.gitignore|\.gitattributes|Dockerfile|Makefile)$/.test(name)||/\.(?:[cm]?js|[cm]?ts|jsx|tsx|css|html?|json|toml|ya?ml|sql|vue|svelte|swift|kt|kts|java|gradle|xml|sh|ps1)$/.test(name);
}
function parseUpdates(input){return String(input).split(/\r?\n/).filter(line=>line.trim()).map(line=>{const parts=line.trim().split(/\s+/);if(parts.length!==4||!OID.test(parts[1])||!OID.test(parts[3]))throw Error('Некорректные данные pre-push: проверка остановлена.');return {localRef:parts[0],local:parts[1],remoteRef:parts[2],remote:parts[3]}})}
function gitAt(cwd){return args=>{const result=spawnSync('git',args,{cwd,encoding:'utf8',maxBuffer:16*1024*1024});if(result.status!==0)throw Error('Не удалось проверить Git-версию. Обновите локальную историю перед push.');return result.stdout}}
const paths=value=>value.split('\0').filter(Boolean);
function planPush(input,git){
 const updates=parseUpdates(input).filter(update=>!ZERO.test(update.local)),required=[];
 for(const update of updates){
  const changed=ZERO.test(update.remote)?paths(git(['ls-tree','-r','--name-only','-z',update.local])):paths(git(['diff','--name-only','-z',update.remote,update.local,'--']));
  if(changed.some(isCode))required.push(update);
 }
 if(!required.length)return {run:false,reason:'unchanged-or-docs-only',versions:[]};
 // The scripts execute the working tree. It must be the code actually being pushed.
 const untracked=paths(git(['ls-files','--others','--exclude-standard','-z']));
 if(untracked.some(isCode))throw Error('Есть неотслеживаемые файлы кода. Добавьте их в коммит или уберите из рабочей копии перед проверкой push.');
 for(const update of required)if(paths(git(['diff','--name-only','-z',update.local,'--'])).some(isCode))throw Error('Код рабочей копии отличается от отправляемой версии. Сохраните изменения и переключитесь на проверяемую версию перед push.');
 return {run:true,reason:'code-changed',versions:[...new Set(required.map(update=>update.local))]};
}
function runDiagnostics(root,versions,execute=spawnSync){
 const runner=path.join(root,'scripts/diagnostics/model-marketplace-100.cjs');
 if(!fs.existsSync(runner))throw Error('Не найден обязательный прогон 100 модельных участников.');
 const security=fs.readdirSync(path.join(root,'tests')).filter(name=>/^security-[\w-]+\.cjs$/.test(name)).sort();
 if(!security.length)throw Error('Не найдены обязательные проверки безопасности.');
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'fas-change-diagnostics-'));
 try{
  const env={...process.env,MODEL_PROFILES:'100',MODEL_REPORT:path.join(folder,'models.json'),MODEL_SOURCE:versions.join(',')};
  for(const args of [['--expose-gc',runner],...security.map(name=>[path.join(root,'tests',name)])]){
   const result=execute(process.execPath,args,{cwd:root,env,stdio:'inherit'});
   if(result.status!==0)throw Error('Диагностика не прошла. Push остановлен; пользовательские данные не изменялись.');
  }
  const report=JSON.parse(fs.readFileSync(env.MODEL_REPORT,'utf8'));
  if(report.finished!==true||report.sourceUnchangedDuringRun!==true||report.requestedProfiles!==100||report.totals?.completed!==100||report.totals?.passed!==100||report.totals?.failed!==0||report.runnerError)throw Error('Прогон не подтвердил успешное завершение всех 100 профилей на неизменённом коде. Push остановлен.');
 }finally{fs.rmSync(folder,{recursive:true,force:true})}
}
function checkPush({input,git,run}){const plan=planPush(input,git);if(plan.run){run(plan.versions);planPush(input,git)}return plan}
function main(){const root=path.resolve(__dirname,'..'),git=gitAt(root),input=fs.readFileSync(0,'utf8');checkPush({input,git,run:versions=>runDiagnostics(root,versions)})}
module.exports={isCode,parseUpdates,planPush,runDiagnostics,checkPush,gitAt};
if(require.main===module){try{main()}catch(error){console.error(error.message);process.exitCode=1}}
