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
import{floodgate as t}from"./floodgate.js";import{dcLocalStorage as e}from"../common/local-storage.js";import{fetchDefaultViewershipConfig as i}from"../content_scripts/utils/util.js";import{setExperimentCodeForAnalytics as a,removeExperimentCodeForAnalytics as r}from"../common/experimentUtils.js";import{util as o}from"./util.js";const l=e=>{try{return JSON.parse(t.getFeatureMeta(e))}catch(t){return{}}},n=(t,e)=>({gmail:{treatment:"GIT",control:"GIC"},gdrive:{treatment:"GDIT",control:"GDIC"}}[t]?.[e]||"");async function s(s,c){const[m,p]=await Promise.all([t.hasFlag(`dc-cv-${s}-implicit-default-viewership`),t.hasFlag(`dc-cv-${s}-implicit-default-viewership-control`)]);if(!m&&!p)return void c({enableImplicitDefaultViewershipFeature:!1,isAcrobatDefaultForSurface:!1,toastMessage:"",fteToolTipStrings:{title:"",description:"",button:""}});let u={};m?u=l(`dc-cv-${s}-implicit-default-viewership`):p&&(u=l(`dc-cv-${s}-implicit-default-viewership-control`));const f=((t,i)=>{const a="en-US"===e.getItem("locale")||"en-GB"===e.getItem("locale");return a&&t||!a&&i})(!!u&&u.enLocaleEnabled,!!u&&u.nonEnLocaleEnabled),d=e.getItem(`${s}-pdf-default-viewership`),g=e.getItem("pdfViewer");""===d&&"false"!==g&&f&&(m?(e.setItem(`${s}-pdf-implicit-dv-feature-enablement-status`,"true"),e.setItem(`${s}-pdf-default-viewership`,"true")):p&&e.setItem(`${s}-pdf-implicit-dv-feature-enablement-status`,"false"));const I=n(s,"treatment"),v=n(s,"control"),$=e.getItem(`${s}-pdf-implicit-dv-feature-enablement-status`);"true"===$&&f?(r(v),a(I)):"false"===$&&f?(r(I),a(v)):(r(v),r(I));const b="true"===await i(s),T=m&&f&&"true"===$;e.setItem(`${s}-pdf-implicit-dv-feature-enabled`,T.toString()),c({enableImplicitDefaultViewershipFeature:T,isAcrobatDefaultForSurface:b,toastMessage:o.getTranslation(`${s}ImplicitDVNotification`),fteToolTipStrings:{title:o.getTranslation(`${s}ImplicitDVFTEHeader`),description:o.getTranslation(`${s}ImplicitDVFTEBody`),button:o.getTranslation("closeButton")}})}export{s as implicitDefaultViewershipInit};