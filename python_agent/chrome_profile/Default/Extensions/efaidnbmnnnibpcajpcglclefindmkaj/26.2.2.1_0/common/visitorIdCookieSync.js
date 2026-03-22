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
import{dcLocalStorage as t,getInstallUpdateTimestamps as i}from"./local-storage.js";import{loggingApi as n}from"./loggingApi.js";const o="visitorIdECIDMap";export function recordECIDAndDetectRotation(e){var r;if(null!=e&&""!==e)try{const s=t.getItem("anonUserUUID");if(!s)return;let a={};try{const i=t.getItem(o);i&&(a=JSON.parse(i))}catch(t){a={}}const c=(r=a[s],Array.isArray(r)?r:null!=r&&""!==r?[String(r)]:[]);if(c.includes(e))return;if(c.push(e),a[s]=c,t.setItem(o,JSON.stringify(a)),c.length>1){const{install:o,update:e}=i();n.info({message:"VisitorIdRotationDetected",context:"visitorIdRotation",ecidArray:c.join(","),visitorsCount:c.length,anonUserUUID:s,iV:t.getItem("installVersion"),iT:o,uT:e})}}catch(t){}}