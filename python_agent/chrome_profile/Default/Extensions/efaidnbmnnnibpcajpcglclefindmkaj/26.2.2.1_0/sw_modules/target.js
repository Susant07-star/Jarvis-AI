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
import{common as e}from"./common.js";import{dcLocalStorage as s}from"../common/local-storage.js";import{util as t}from"./util.js";import{OFFSCREEN_DOCUMENT_PATH as r}from"../common/constant.js";let a=null;class o{async getTargetOfferFromOffscreen(s){const a={main_op:"callTargetAPI",target:"offscreen",mboxes:s},o=`${r}?env=${e.getEnv()}`;await t.setupOffscreenDocument(o);return await new Promise(async e=>{const s=await chrome.runtime.sendMessage(a);try{s&&s.targetOffersResponse?e(JSON.parse(s.targetOffersResponse||"[]")):e([])}catch(s){console.log("Error parsing target offers response",s),e([])}this.callInProgress=!1})}removeMboxFromStorage=e=>{this.availableResponse=this.availableResponse.filter(s=>!Object.prototype.hasOwnProperty.call(s,e))};mergeResponses=(e,s)=>{const t=new Map;return e.forEach(e=>{const s=Object.keys(e).find(e=>"expiry"!==e);s&&t.set(s,e)}),s.forEach(e=>{const s=Object.keys(e).find(e=>"expiry"!==e);s&&t.set(s,e)}),Array.from(t.values())};checkOfferInStorage=async e=>{if(this.availableResponse=s.getItem("targetResponse"),this.availableResponse)try{this.availableResponse=JSON.parse(this.availableResponse)}catch(e){console.log("Error parsing target response",e),this.availableResponse=[]}else this.availableResponse=[];if(0===this.availableResponse.length)return null;const t=await Promise.all(e.map(async e=>{const s=this.availableResponse.find(s=>Object.prototype.hasOwnProperty.call(s,e));if(!s)return null;return Date.now()>s.expiry?(this.removeMboxFromStorage(e),null):s}));return this.availableResponse.length>0?s.setItem("targetResponse",JSON.stringify(this.availableResponse)):s.removeItem("targetResponse"),t.some(e=>null===e)?null:t};async getTargetOffer(e){const t=await this.checkOfferInStorage(e);if(t)return t;this.callInProgress||(this.callInProgress=!0,this.callPromise=this.getTargetOfferFromOffscreen(e));let r=await this.callPromise;if(this.callInProgress=!1,r){let e=s.getItem("targetResponse");try{e=e?JSON.parse(e):[]}catch(s){console.log("Error parsing target response",s),e=[]}r=r.map(e=>({...e,expiry:Date.now()+864e5})),this.targetResponse=this.mergeResponses(e,r),s.setItem("targetResponse",JSON.stringify(this.targetResponse))}return r}}a||(a=new o);export const target=a;