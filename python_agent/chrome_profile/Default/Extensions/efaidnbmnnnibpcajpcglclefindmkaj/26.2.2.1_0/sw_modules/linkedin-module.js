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
import{floodgate as t}from"./floodgate.js";import{dcLocalStorage as n}from"../common/local-storage.js";import{setExperimentCodeForAnalytics as e,removeExperimentCodeForAnalytics as o}from"../common/experimentUtils.js";import{util as i}from"./util.js";import{viewerModuleUtils as a}from"./viewer-module-utils.js";import{loggingApi as c}from"../common/loggingApi.js";const l=(t,e)=>{const o="en-US"===n.getItem("locale")||"en-GB"===n.getItem("locale");return o&&t||!o&&e},r=n=>{try{return JSON.parse(t.getFeatureMeta(n))}catch(t){return c.error({context:"LinkedInTouchPoint",message:`Failure in parsing FeatureFlag ${n}`,error:t.message||t.toString()}),{}}};async function d(e,o){await n.init();const[d,s,h,p,u]=await Promise.all([t.hasFlag("dc-cv-linkedin-pdf-touch-point"),t.hasFlag("dc-cv-linkedin-pdf-touch-point-control"),t.hasFlag("dc-cv-linkedin-chat-pdf-touch-point"),t.hasFlag("dc-cv-linkedin-chat-pdf-touch-point-control"),t.hasFlag("dc-cv-linkedin-chat-pdf")]);try{await a.initializeViewerVariables(e)}catch(t){c.error({context:"LinkedInTouchPoint",message:"Error initializing viewer variables for LinkedIn",error:t.message||t.toString()})}let g;const m=!i.isAcrobatTouchPointEnabled("acrobat-touch-point-in-linkedin");let T;d?T=r("dc-cv-linkedin-pdf-touch-point"):s&&(T=r("dc-cv-linkedin-pdf-touch-point-control")),g=T?T.selectors:{};const f=!!T&&T.fteEnabled,F=!!T&&T.enLocaleEnabled,k=!!T&&T.nonEnLocaleEnabled,b=l(F,k),P=T?T.tooltip:{};if(u){const t=r("dc-cv-linkedin-chat-pdf");g={...g,linkedInChat:t}}let E;h?E=r("dc-cv-linkedin-chat-pdf-touch-point"):p&&(E=r("dc-cv-linkedin-chat-pdf-touch-point-control")),E&&(g={...g,linkedInChatTouchPoint:E});const I=!!E&&E.enLocaleEnabled,v=!!E&&E.nonEnLocaleEnabled,L=l(I,v),C=!!E&&E.fteEnabled,S=E?E.tooltip:{};return{enableLinkedinPDFTouchPoint:d&&!m&&b,enableLinkedinChatPDFTouchPoint:h&&!m&&L,enableLinkedinChatPDFAnalytics:u,selectors:g,openInAcrobatString:i.getTranslation("gsuiteOpenWithAcrobat"),summariseTouchPointString:i.getTranslation("linkedInSummarizePDF"),fteToolTipStrings:{title:i.getTranslation("outlookPDFTouchPointFTEHeader"),description:i.getTranslation("linkedInFeedPDFTouchPointFTEBody"),button:i.getTranslation("closeButton")},chatFteToolTipStrings:{title:i.getTranslation("linkedInChatPDFTouchPointFTEHeader"),description:i.getTranslation("linkedInChatPDFTouchPointFTEBody"),button:i.getTranslation("closeButton")},enableLinkedinFeedFteTooltip:f,enableLinkedinChatFteTooltip:C,frameId:o?.frameId,feedFteConfig:P,chatFteConfig:S}}export{d as linkedinInit};