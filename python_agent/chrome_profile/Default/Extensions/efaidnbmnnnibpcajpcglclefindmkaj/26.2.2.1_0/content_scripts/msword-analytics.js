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
(async()=>{const t="dc-cv-msword-web-opportunity-size";if(!await chrome.runtime.sendMessage({main_op:"getFloodgateFlag",flag:t}))return;const e=await chrome.runtime.sendMessage({main_op:"getFloodgateMeta",flag:t}),n=JSON.parse(e||"{}");let o;try{if(o=await import(chrome.runtime.getURL("content_scripts/utils/util.js")),(()=>{const t=window.top!==window.self,e=window.location.hostname,o=n.hostnames.includes(e);return t&&o})()){const t="DCBrowserExt:MSWord:Visited";o?.isAnalyticsSentInTheMonthOrSession(t)||o?.sendAnalyticsOncePerMonth(t)}}catch(t){o?.sendErrorLog("MS Word analytics error",t)}})();