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
let utils,observer,chatgptAnalyticsMetaData;(async()=>{const t="DCBrowserExt:ChatGPT:Visited",e="DCBrowserExt:ChatGPT:DownloadAsPdf:Clicked",s="download-as-pdf-btn-analytics",n=()=>{const t=(t=>{const e=utils?.getElementsListBasedOnSelectors(chatgptAnalyticsMetaData?.downloadAsPdfBtnClassesSelector||[],document)||[],s=e?.find(e=>(e.textContent||"").trim()===t)||null;if(s)return utils?.getClosestElementBySelectors(s,chatgptAnalyticsMetaData?.downloadAsPdfBtnMenuItemSelector||[])||s})("PDF Document (.pdf)");t&&(t.classList.contains(s)||(t.classList.add(s),t.addEventListener("click",()=>{utils?.isAnalyticsSentInTheMonthOrSession(e)||utils?.sendAnalyticsOncePerMonth(e)},{capture:!0,once:!0})))},a=()=>{if(document?.body)try{const t={childList:!0,subtree:!0};observer=new MutationObserver(()=>{observer.takeRecords(),chrome?.runtime?.id?n():observer?.disconnect()}),observer.observe(document.body,t)}catch(t){utils?.sendErrorLog("ChatGPT analytics error",t)}else setTimeout(a,500)};chrome.runtime.sendMessage({main_op:"chatgpt-init"},async s=>{s?.enableChatGPTAnalytics&&(async()=>(utils||(utils=await import(chrome.runtime.getURL("content_scripts/utils/util.js"))),utils))().then(()=>{utils?.isAnalyticsSentInTheMonthOrSession(t)||utils?.sendAnalyticsOncePerMonth(t),utils?.isAnalyticsSentInTheMonthOrSession(e)||(chatgptAnalyticsMetaData=s?.metaData||{},a())})})})();