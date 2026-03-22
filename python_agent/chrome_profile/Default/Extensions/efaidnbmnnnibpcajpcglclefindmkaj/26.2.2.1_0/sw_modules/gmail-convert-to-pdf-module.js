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
import{floodgate as t}from"./floodgate.js";import{util as e}from"./util.js";import{setExperimentCodeForAnalytics as o,removeExperimentCodeForAnalytics as a}from"../common/experimentUtils.js";import{dcLocalStorage as n}from"../common/local-storage.js";async function l(l){const[c,r,i]=await Promise.all([t.hasFlag("dc-cv-gmail-convert-to-pdf"),t.hasFlag("dc-cv-gmail-convert-to-pdf-fte"),t.hasFlag("dc-cv-gmail-convert-to-pdf-control")]),s=t.getFeatureMeta("dc-cv-gmail-convert-to-pdf-fte"),m=t.getFeatureMeta("dc-cv-gmail-convert-to-pdf"),f=t.getFeatureMeta("dc-cv-gmail-convert-to-pdf-control");let p,d,g,T;try{p=JSON.parse(s),d=c?JSON.parse(m):JSON.parse(f),g=d?.enLocaleEnabled||!1,T=d?.nonEnLocaleEnabled||!1}catch(t){}const v=function(t,e){const o=n.getItem("locale"),a="en-US"===o||"en-GB"===o;return a&&t||!a&&e}(d?.enLocaleEnabled,d?.nonEnLocaleEnabled);c&&v?(a("GCPC"),o("GCP")):i&&v?(a("GCP"),o("GCPC")):(a("GCP"),a("GCPC"));const u=await async function(e){const o=[];let a={};const n=e.map(async e=>{const n=`dc-cv-gmail-${e}-metadata`;if(!await t.hasFlag(n))return;const l=t.getFeatureMeta(n);if(!l)return;let c;try{c=JSON.parse(l)}catch(t){}c?.selectors?.forEach(t=>o.push(t)),a={...a,...c?.types}});return await Promise.all(n),{selectors:o,fileExtToMimeTypeMap:a}}(d?.fileTypes||[]);l({enableConvertToPdfTouchpointInGmail:c&&v,enableGmailConvertToPdfFteToolTip:r&&v,acrobatTouchPointText:e.getTranslation("gmailConvertToPdf"),enableConvertToPdfTouchpointInGmailControl:i&&v,fteTooltipStrings:{title:e.getTranslation("gmailConvertToPdfFteToolTipTitle"),description:e.getTranslation("gmailConvertToPdfFteToolTipDescription"),button:e.getTranslation("closeButton")},fteConfig:p,metadata:u})}export{l as gmailConvertToPdfInit};