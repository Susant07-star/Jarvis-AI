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
(()=>{let e={};const t=(t,o)=>{if(t){const n=e?.selectors,r=n&&n[o];for(let e=0;e<r?.length;e++){let o=t.querySelector(r[e]);if(o)return o}}return null},o=()=>{const o=new URLSearchParams(window.location.search);o?.has("acrobatPromotionSource")&&(o?.has("uuid")&&"https://accounts.google.com/"!==document.referrer||chrome.runtime.sendMessage({main_op:"gdrive-download-init"},async o=>{if(o?.acrobatTouchPointEnabled){e=o;const n=(()=>{const e=t(document,"confirmInput")?.value,o=t(document,"atInput")?.value,n=t(document,"uuidInput")?.value,r=t(document,"fileName");let a=new URL(window.location.href);if(!e&&!o&&!n)return`https://drive.google.com/file/d/${a.searchParams.get("id")}/view`;a.searchParams.set("uuid",n),a.searchParams.set("at",o),a.searchParams.set("confirm",e);let c=chrome.runtime.getURL("viewer.html")+"?pdfurl="+encodeURIComponent(a.toString());return r?.textContent&&(c=c+"&pdffilename="+encodeURIComponent(r?.textContent)),c})();(e=>{try{chrome.runtime.sendMessage({main_op:"analytics",analytics:e})}catch(e){}})([["DCBrowserExt:GdriveDPage:Redirect"]]),window.location.replace(n)}}))};(async()=>{"drive.usercontent.google.com"===window?.document?.location?.host&&window.top===window.self&&0===window?.document?.location?.ancestorOrigins.length&&o()})()})();