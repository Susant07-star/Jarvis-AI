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
!function(){function e(e,t){document.dispatchEvent(new CustomEvent(e,{detail:t}))}async function t(t,n){try{const o=t?.clone(),c=await(o?.json());o?.url&&function(e){try{const t=new URL(e);return t&&["outlook.live.com","outlook.office.com","outlook.office365.com"].includes(t.hostname)}catch(e){return!1}}(o.url)&&e(n,{success:!0,data:c,responseUrl:o.url})}catch(t){e(n,{success:!1,error:t.message})}}function n(t,n,o){const c=t?.headers?.get("Content-Type");if(c&&!c.toLowerCase().includes("application/pdf"))return;const s=t?.headers?.get("Content-Disposition"),r=function(e){if(!e)return null;const t=e.match(/filename=([^;]+)/i);if(t){let e=t[1].trim();e=e.replace(/^["']|["']$/g,""),e=e.replace(/\\(.)/g,"$1");try{const t=decodeURIComponent(e);t===e||t.includes("�")||(e=t)}catch(e){}return e}return null}(s),a=function(e){if(!e||!Array.isArray(e)||e.length<2)return null;const t=e[1];return t&&t.headers?t.headers instanceof Headers?t.headers.get("X-Token"):"object"==typeof t.headers?t.headers["X-Token"]:null:null}(o);e(n,t?.url&&r&&a?{success:!0,responseUrl:t.url,filename:r,xToken:a}:{success:!1,error:"No response URL, filename, or xToken"})}!function(){const o=window.fetch;window.fetch=function(...c){const s=c[0]||"";if(s&&(s.includes("service.svc?action=GetAttachmentDownloadToken")||s.includes("service.svc/s/GetFileAttachment"))){const r=s.includes("service.svc?action=GetAttachmentDownloadToken")?"acrobat-outlook-token-intercept-response":"acrobat-outlook-attachment-intercept-response";return o(...c).then(o=>(o.ok?(async()=>{"acrobat-outlook-token-intercept-response"===r?t(o,r):n(o,r,c)})():(async()=>{e(r,{success:!1,status:o.status})})(),o)).catch(t=>{throw e(r,{success:!1,error:t.message}),t})}return o(...c)}}()}();