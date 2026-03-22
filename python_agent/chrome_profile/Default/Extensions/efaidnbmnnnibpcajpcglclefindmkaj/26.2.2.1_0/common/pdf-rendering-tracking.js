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
import{dcSessionStorage as e,dcLocalStorage as t}from"./local-storage.js";import{CACHE_PURGE_SCHEME as o}from"../sw_modules/constant.js";import{analytics as r}from"./analytics.js";import{getFloodgateFlag as i,getSurfaceId as n}from"./util.js";import{logDirectVerbPerfMetrics as s}from"../sw_modules/direct-verb-utils.js";const c="pdfRenderingSession_";export function getSessionKey(e){return`${c}${e}`}function a(t){const o=getSessionKey(t),r=e.getItem(o);return r&&e.removeItem(o),r}async function m(){const t=await i("dc-cv-pdf-tab-close-analytics",o.NO_CALL);return t||Object.keys(e).forEach(t=>{t.startsWith(c)&&e.removeItem(t)}),t}export function cleanupOldPdfRenderingTrackingStorage(){e.getItem("directFlowSessionsWhereViewerLoading")&&e.removeItem("directFlowSessionsWhereViewerLoading")}export async function registerPDFRenderingSession(t,o){if(!await m())return;const r=function(t){const o=getSessionKey(t);return e.getItem(o)}(t);r||function(t,o){const r=getSessionKey(t);e.setItem(r,o)}(t,{source:o,startTime:Date.now()})}export async function removeAllPDFRenderingSessionsFromTab(e){await m()&&a(e)}export function shouldShowImplicitDVCoachmark(e){const o=n(e);if(!o)return!1;const r=t.getItem(`${o}-pdf-default-viewership`),i=(t.getItem("viewerStorage")||{})[`${o}-default-viewership-coach-mark-shown`];return"true"===r&&!i&&"gdrive_chrome-native_view-NDV"!==e}export async function pdfRenderingTabCloseListener(e){if(!await m())return;const t=a(e);if(t){const o=t.startTime?Date.now()-t.startTime:void 0,i=t.directFlowSuccess?"afterDirectFlowSuccess":"beforeDirectFlowSuccess",n=shouldShowImplicitDVCoachmark(t.source)?"coachmarkEligible":"coachmarkIneligible";r.event("DCBrowserExt:Viewer:DirectFlow:TabClosedBeforeViewerLoaded",{source:t.source,loadTime:o,workflow:i,experimentEnablementStatus:n}),s(e)}}export async function pdfRenderingTabNavigatedAwayListener(e,t,o){await m()&&(o&&o(t)||a(e))}