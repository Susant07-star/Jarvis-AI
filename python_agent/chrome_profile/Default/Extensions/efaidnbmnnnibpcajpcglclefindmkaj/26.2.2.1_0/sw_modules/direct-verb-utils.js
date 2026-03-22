/*************************************************************************
* ADOBE CONFIDENTIAL
* ___________________
*
*  Copyright 2015 Adobe Systems Incorporated
*  All Rights Reserved.
*
* NOTICE:  All information contained herein is, and remains
* the property of Adobe Systems Incorporated and its suppliers,
* if any.  The intellectual and technical concepts contained
* herein are proprietary to Adobe Systems Incorporated and its
* suppliers and are protected by all applicable intellectual property laws,
* including trade secret and or copyright laws.
* Dissemination of this information or reproduction of this material
* is strictly forbidden unless prior written permission is obtained
* from Adobe Systems Incorporated.
**************************************************************************/
import{loggingApi as e}from"../common/loggingApi.js";import{dcSessionStorage as r}from"../common/local-storage.js";import{getSessionKey as t}from"../common/pdf-rendering-tracking.js";import{util as o}from"./util.js";export function getDirectVerbStorageKey(e){return`${e}_DirectVerbPerformance`}export async function executeDirectVerb(t){try{let e=t.srcUrl;const c=t.promotionSource;e=`${e}&acrobatPromotionSource=${c}`;const i=t.viewerURL,n=t.name,m=t.verb,s=t.clickTimestamp,a=o.uuid(),g=t?.verbConfig||{};let f=`${i}?pdfurl=${encodeURIComponent(e)}&acrobatPromotionWorkflow=${m}&pdffilename=${encodeURIComponent(n)}&directVerbSessionId=${a}`;g&&Object.keys(g).length>0&&Object.entries(g).forEach(([e,r])=>{null!=r&&""!==r&&(f+=`&${e}=${encodeURIComponent(r)}`)});!async function(e,t,o,c){try{const i=getDirectVerbStorageKey(e),n=r.getItem(i)||{};n[t]={promotionSource:o,clickTimestamp_startTime:c},await r.setItem(i,n)}catch(e){}}((await chrome.tabs.create({url:f,active:!0})).id,a,c,s)}catch(r){e.error({message:"Error executing direct verb",error:r.message})}}export function markDirectFlowSuccess(e){const o=t(e),c=r.getItem(o);c&&r.setItem(o,{...c,directFlowSuccess:!0})}export async function logDirectVerbPerfMetrics(t){if(t)try{const o=getDirectVerbStorageKey(t),c=r.getItem(o);if(c){const[t,i]=Object.entries(c)[0]||[];t&&i&&e.info({message:"Direct verb performance metrics",directVerbSessionId:t,...i}),await r.removeItem(o)}}catch(r){e.error({message:"Failed to log direct verb performance metrics",error:r?.message})}}