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
import{floodgate as e}from"./floodgate.js";import{dcLocalStorage as t,dcSessionStorage as a}from"../common/local-storage.js";import{loggingApi as s}from"../common/loggingApi.js";import{safeJsonParse as o}from"../common/util.js";import{communicate as r}from"./communicate.js";import{Proxy as i}from"./proxy.js";import{getStorageEstimation as n,formatSize as l}from"./storage-analyzer-utils.js";let y=null;class g{constructor(){this.proxy=i.proxy.bind(this)}calculateSize(e){try{return null==e?0:"string"==typeof e?e.length:new Blob([JSON.stringify(e)]).size}catch(e){return 0}}calculateStorageStats(e){const t={totalSize:0,totalKeys:0,keys:[],timestamp:Date.now()};return e?(Object.keys(e).forEach(a=>{const s=e[a],o=this.calculateSize(s);t.keys.push({key:a,size:o}),t.totalSize+=o}),t.totalKeys=t.keys.length,t.keys.sort((e,t)=>t.size-e.size),t):t}getTopKeys(e,t=20){const a=e.slice(0,t);return{topKeysString:a.map((e,t)=>`${t+1}. ${e.key}: ${l(e.size)}`).join(" | "),topKeys:a}}async analyzeStorage(e,t={}){const{topKeysLimit:a=20,includeAllKeys:s=!1}=t,o=this.calculateStorageStats(e),r=await n(),i=this.getTopKeys(o.keys,a);return{totalKeysSizeBytes:o.totalSize,totalKeys:o.totalKeys,storageQuotaBytes:r.quota,storageUsageBytes:r.usage,storageUsagePercent:r.usagePercent,totalKeysSizeFormatted:l(o.totalSize),storageCapacityInfo:r.capacityInfo,storageUsageDetails:r.usageDetailsString,topKeysString:i.topKeysString,usageDetailsBreakdown:r.usageDetailsBreakdown,allKeys:s?JSON.stringify(o.keys):""}}async handleQuotaError(r){try{if(!await e.hasFlag("dc-cv-storage-analyzer"))return;const{storageType:i,errorMessage:n="Unknown error",key:l="unknown"}=r,y="local"===i?t:a;await y.init();const g=e.getFeatureMeta("dc-cv-storage-analyzer"),c=o(g,{topKeysLimit:20,includeAllKeys:!1}),u=await this.analyzeStorage(y.storage,c),m=chrome.runtime.getManifest().version,p=t.getItem("anonUserUUID");s.error({storageType:i,message:n,key:l,totalKeysSizeBytes:u.totalKeysSizeBytes,totalKeys:u.totalKeys,storageQuotaBytes:u.storageQuotaBytes,storageUsageBytes:u.storageUsageBytes,storageUsagePercent:u.storageUsagePercent,totalKeysSizeFormatted:u.totalKeysSizeFormatted,storageCapacityInfo:u.storageCapacityInfo,storageUsageDetailsString:u.storageUsageDetails,topKeysString:u.topKeysString,allKeys:u.allKeys,extensionVersion:m,userUUID:p})}catch(e){}}}y||(y=new g),r.registerHandlers({"log-quota-error":y.proxy(y.handleQuotaError)});export const storageAnalyzer=y;