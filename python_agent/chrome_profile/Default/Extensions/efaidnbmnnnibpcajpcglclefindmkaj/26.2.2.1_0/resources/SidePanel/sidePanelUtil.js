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
import e from"../../libs/readability.js";const{Readability:t,isProbablyReaderable:n}=e;function r(e){return e.clientHeight>0&&e.clientWidth>0}async function a(e,t=!0){const a=()=>n(e,{visibilityChecker:t?r:void 0});if(a())return!0;const i=(await chrome.runtime.sendMessage({type:"get_sidepanel_state"})).isOpen?1500:5e3;return new Promise(e=>{const t=setInterval(()=>{a()&&(clearInterval(t),clearTimeout(n),e(!0))},300),n=setTimeout(()=>{clearInterval(t),e(!1)},i)})}async function i(e){const n=(new DOMParser).parseFromString(e,"text/html");if(await a(n,!1)){return new t(n).parse().content}return e}async function c(e){return(await chrome.i18n.detectLanguage(e)).languages.reduce((e,t)=>e.percentage>t.percentage?e:t,{language:"en",percentage:0})}export{a as isProbablyReaderableAsync,i as getReadableContent,c as getContentLocale};