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
import{viewerModuleUtils as o}from"../viewer-module-utils.js";import{util as t}from"../util.js";import{floodgate as e}from"../floodgate.js";import{loggingApi as n}from"../../common/loggingApi.js";import{removeExperimentCodeForAnalytics as r,setExperimentCodeForAnalytics as a}from"../../common/experimentUtils.js";import{checkUserLocaleEnabled as c}from"./util.js";const i=o=>{try{return JSON.parse(e.getFeatureMeta(o))}catch(t){return n.error({context:"Google Docs",message:`Failure in parsing FeatureFlag ${o}`,error:t.message||t.toString()}),{validPaths:["document","spreadsheets","presentation"],selectors:{touchPointContainer:["docs-titlebar-buttons"],docTitle:["docs-title-input"]}}}},l={document:{treatmentFlag:"dc-cv-google-docs-convert-to-pdf-touch-point",controlFlag:"dc-cv-google-docs-convert-to-pdf-touch-point-control",treatmentCode:"GDCT",controlCode:"GDCC",preferenceKey:"acrobat-touch-point-in-google-docs"},spreadsheets:{treatmentFlag:"dc-cv-google-sheets-convert-to-pdf-touch-point",controlFlag:"dc-cv-google-sheets-convert-to-pdf-touch-point-control",treatmentCode:"GSH",controlCode:"GSHC",preferenceKey:"acrobat-touch-point-in-google-sheets"},presentation:{treatmentFlag:"dc-cv-google-slides-convert-to-pdf-touch-point",controlFlag:"dc-cv-google-slides-convert-to-pdf-touch-point-control",treatmentCode:"GST",controlCode:"GSC",preferenceKey:"acrobat-touch-point-in-google-slides"}};async function s(n,s,g){await o.initializeViewerVariables(g);const{docType:d}=n,p=l[d];let m=!1,u={};if(p){const o=!t.isAcrobatTouchPointEnabled(p.preferenceKey),n=await e.hasFlag(p.treatmentFlag),l=await e.hasFlag(p.controlFlag);n&&(u=i("dc-cv-google-docs-convert-to-pdf-selectors"));const s=n&&i(p.treatmentFlag),g=l&&i(p.controlFlag),d=n&&c(s?.isEnLocaleEnabled,s?.isNonEnLocaleEnabled)&&!o,T=l&&c(g?.isEnLocaleEnabled,g?.isNonEnLocaleEnabled)&&!o;d?(a(p.treatmentCode),r(p.controlCode)):T&&(a(p.controlCode),r(p.treatmentCode)),m=d}const T=t.getTranslation("gmailConvertToPdf"),f=t.getTranslation("convertToPDFTouchPointTooltip"),h={enableConvertToPDFTouchPoint:m,...u,text:{acrobatTouchPointTooltip:f,acrobatTouchPointText:T}};if(n?.surfaceNameTranslationKey){const o=t.getTranslation(n?.fteDocTypeNameKey||"fteDocTypeNameFile");h.text.touchPointFTE={title:t.getTranslation("convertToPDFFTEHeading",o),description:t.getTranslation("convertToPDFFTEBody",t.getTranslation(n?.surfaceNameTranslationKey)),button:t.getTranslation("closeButton")}}s(h)}export{s as googleDocsInit};