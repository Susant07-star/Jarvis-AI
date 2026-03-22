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
import{dcTabStorage as e}from"../tab-storage.js";import{signInUtil as t}from"./signInUtils.js";!function(){let n;const o=()=>{chrome.tabs.query({active:!0,lastFocusedWindow:!0},function(o){if(o[0]){n=o[0].url;if(!(n.indexOf("access_token")>-1&&e.getItem("signInSource"))){let e=t.getSearchParamFromURL("mimePdfUrl",n),o=e&&decodeURIComponent(e);return void chrome.tabs.update({url:o})}!function(){try{let e=n;e&&e.indexOf("#")>-1&&t.signInAnalyticsLogging(e),t.saveAccessToken(e);let o=t.getSearchParamFromURL("mimePdfUrl",n),r=o&&decodeURIComponent(o);chrome.tabs.update({url:r})}catch(e){}}()}})};chrome.tabs.query({active:!0,lastFocusedWindow:!0},r=>{if(r[0])if(n=r[0].url,new URLSearchParams(new URL(n).search).get("socialSignIn")){const o=e.getItem("idp_token");let r=function(e){let t=new URL(window.location.href),n=new URLSearchParams(new URL(window.location.href).search);return n.delete(e),t.search=n,t}("socialSignIn");n=r.href,t.socialSignIn({idp_token:o},r,n),e.removeItem("idp_token")}else o()})}();