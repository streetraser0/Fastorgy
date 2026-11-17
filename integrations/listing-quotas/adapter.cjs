/* Server-only, disabled boundary. A repository must provide a real serializable
   transaction; this module never uses browser profiles or paid-preview flags. */
'use strict';
const {createHash}=require('node:crypto');
const policy=require('../../dist/listing-quotas.js');
const fail=code=>{throw new policy.QuotaError(code)};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function id(value){if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/.test(value))fail('invalid-id');return value}
function command(value){
 const fields=['version','idempotencyKey','listingId','expectedListingRevision','preparedChangeId'];
 if(!object(value)||Object.keys(value).length!==fields.length||fields.some(key=>!Object.hasOwn(value,key))||value.version!==1||typeof value.idempotencyKey!=='string'||!/^[A-Za-z0-9:_-]{16,128}$/.test(value.idempotencyKey)||!Number.isSafeInteger(value.expectedListingRevision)||value.expectedListingRevision<0)fail('invalid-command');
 return Object.freeze({version:1,idempotencyKey:value.idempotencyKey,listingId:id(value.listingId),expectedListingRevision:value.expectedListingRevision,preparedChangeId:id(value.preparedChangeId)});
}
function publicResult(value,expected){
 if(!object(value)||value.accepted!==true||value.listingId!==expected.listingId||value.listingRevision!==expected.expectedListingRevision+1||!Number.isSafeInteger(value.policyRevision)||value.policyRevision<0)fail('invalid-repository-result');
 return Object.freeze({accepted:true,listingId:value.listingId,listingRevision:value.listingRevision,policyRevision:value.policyRevision,usage:policy.usage(value.usage),limits:policy.limits(value.limits)});
}
function createListingQuotaCoordinator({configuration={state:'disabled'},authorize,repository,clock=Date.now}={}){
 const settings=Object.freeze({...configuration});
 return Object.freeze({async apply(input,requestContext){
  if(settings.state!=='ready'||typeof settings.reviewReference!=='string'||!settings.reviewReference.trim()||typeof authorize!=='function'||typeof repository?.withQuotaTransaction!=='function')fail('integration-disabled');
  const nextCommand=command(input);let grant;
  try{grant=await authorize(requestContext)}catch{fail('authorization-unavailable')}
  if(!object(grant)||grant.allowed!==true)fail('forbidden');
  const principalId=id(grant.principalId),owner=policy.scope(grant.scope);
  const fingerprint=createHash('sha256').update(JSON.stringify(nextCommand)).digest('hex');
  try{
   return await repository.withQuotaTransaction(owner,async tx=>{
    // Take trusted time after acquiring the scope lock, not while waiting for it.
    const now=clock();if(!Number.isSafeInteger(now)||now<=0)fail('invalid-clock');
    const claim=await tx.claimCommand({principalId,scope:owner,idempotencyKey:nextCommand.idempotencyKey,fingerprint});
    if(!object(claim)||!policy.sameScope(claim.scope,owner)||claim.principalId!==principalId||claim.fingerprint!==fingerprint)fail('command-conflict');
    if(claim.status==='complete')return publicResult(claim.result,nextCommand);
    if(claim.status!=='new')fail('command-conflict');
    const before=await tx.getListing(nextCommand.listingId);
    if(before===null)fail('listing-not-found');policy.listing(before);
    if(!policy.sameScope(before.scope,owner))fail('forbidden');
    if(before.revision!==nextCommand.expectedListingRevision)fail('listing-version-conflict');
    const prepared=await tx.getPreparedChange({principalId,scope:owner,listingId:before.id,preparedChangeId:nextCommand.preparedChangeId,expectedListingRevision:before.revision});
    if(!object(prepared)||prepared.principalId!==principalId||!policy.sameScope(prepared.scope,owner)||prepared.listingId!==before.id||prepared.expectedListingRevision!==before.revision||typeof prepared.expiresAt!=='string'||!Number.isFinite(Date.parse(prepared.expiresAt))||Date.parse(prepared.expiresAt)<=now)fail('prepared-change-unavailable');
    const next=policy.listing(prepared.next);if(next.id!==before.id||!policy.sameScope(next.scope,owner))fail('forbidden');
    // validateAuctionChange also validates immutable subject/price/terms, rights
    // and publication rules in the SAME transaction as bid/withdraw commands.
    if(await tx.validateAuctionChange({principalId,scope:owner,before,next,now})!==true)fail('auction-policy-rejected');
    const selected=policy.resolvePolicy(await tx.getEntitlement(owner),owner,now),snapshot=await tx.getUsage(owner,now);
    if(!object(snapshot)||!Number.isSafeInteger(snapshot.revision)||snapshot.revision<0)fail('invalid-usage');
    const decision=policy.decide({policy:selected,currentUsage:snapshot.counts,before,next,now});
    if(!decision.allowed)fail('quota-exceeded');
    const committed=await tx.commitChange({principalId,scope:owner,before,next,expectedListingRevision:before.revision,expectedUsageRevision:snapshot.revision,usageDelta:decision.delta,policyRevision:selected.revision});
    if(!object(committed)||committed.listingRevision!==next.revision||!Number.isSafeInteger(committed.usageRevision)||committed.usageRevision!==snapshot.revision+1)fail('repository-commit-conflict');
    const result=publicResult({accepted:true,listingId:next.id,listingRevision:next.revision,policyRevision:selected.revision,usage:decision.usage,limits:selected.limits},nextCommand);
    if(await tx.completeCommand({principalId,scope:owner,idempotencyKey:nextCommand.idempotencyKey,fingerprint,result})!==true)fail('repository-commit-conflict');
    return result;
   });
  }catch(error){if(error instanceof policy.QuotaError)throw error;fail('repository-unavailable')}
 }});
}
module.exports=Object.freeze({createListingQuotaCoordinator});
