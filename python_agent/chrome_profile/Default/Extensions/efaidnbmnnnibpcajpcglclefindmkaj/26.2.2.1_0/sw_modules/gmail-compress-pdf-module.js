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
import{floodgate as o}from"./floodgate.js";import{dcLocalStorage as t}from"../common/local-storage.js";import{setExperimentCodeForAnalytics as e,removeExperimentCodeForAnalytics as s}from"../common/experimentUtils.js";import{checkUserLocaleEnabled as i,safeParseFeatureFlag as n}from"./gsuite/util.js";import{util as l}from"./util.js";async function r(t){const[r,a]=await Promise.all([o.hasFlag("dc-cv-gmail-compress-pdf-touch-point"),o.hasFlag("dc-cv-gmail-compress-pdf-touch-point-control")]);let c;r?c=n("dc-cv-gmail-compress-pdf-touch-point"):a&&(c=n("dc-cv-gmail-compress-pdf-touch-point-control"));const m=i(c?.enLocaleEnabled,c?.nonEnLocaleEnabled);r&&m?(s("GCOC"),e("GCO")):a&&m?(s("GCO"),e("GCOC")):(s("GCO"),s("GCOC"));const p=c?.selectors||{},g=c?.tooltip||{},T=c?.fteEnabled||!1,C=!l.isAcrobatTouchPointEnabled("acrobat-touch-point-in-gmail");t({enableGmailCompressPDFTouchPoint:r&&!C&&m,selectors:p,compressPDFSizeThreshold:c?.compressPDFSizeThreshold,compressPDFString:l.getTranslation("gmailCompressPDFTouchPoint"),fteToolTipStrings:{title:l.getTranslation("gmailCompressPDFTouchPointFTEHeader"),description:l.getTranslation("gmailCompressPDFTouchPointFteDescription"),button:l.getTranslation("closeButton")},enableGmailCompressPDFFteTooltip:T,gmailCompressPDFFteConfig:g,gmailCompressPDFOnHoverTooltip:l.getTranslation("gmailCompressPDFTouchPointOnHoverTooltip")})}export{r as gmailCompressPDFInit};