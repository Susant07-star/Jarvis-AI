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
import{dcLocalStorage}from"../../common/local-storage.js";import{sendAnalytics,sendErrorLog}from"./util.js";const IMPLICIT_TOAST_CONTAINER_ID="acrobat-implicit-toast-container",IMPLICIT_TOAST_CLOSE_BUTTON_ID="acrobat-implicit-toast-close",IMPLICIT_TOAST_CLOSE_ICON_ID="acrobat-implicit-toast-close-icon",IMPLICIT_TOAST_MESSAGE_ID="acrobat-implicit-toast-message",TOAST_AUTO_DISMISS_DELAY=5e3;let autoDismissTimeout=null,isToastShowing=!1;const removeImplicitToast=()=>{const t=document.getElementById(IMPLICIT_TOAST_CONTAINER_ID);t&&t.remove(),autoDismissTimeout&&(clearTimeout(autoDismissTimeout),autoDismissTimeout=null),isToastShowing=!1},addToastDismissListeners=(t,i)=>{const s=t.querySelector("#acrobat-implicit-toast-close");s?.addEventListener("click",()=>{removeImplicitToast(),sendAnalytics([[`DCBrowserExt:${i}:ImplicitDV:Toast:Dismissed`]])}),autoDismissTimeout=setTimeout(()=>{removeImplicitToast()},5e3)},setToastText=(t,i)=>{const s=t.querySelector(`#${IMPLICIT_TOAST_MESSAGE_ID}`);s&&(s.textContent=i)},setToastIcons=t=>{const i=t.querySelector(`#${IMPLICIT_TOAST_CLOSE_ICON_ID}`);i&&(i.src=chrome.runtime.getURL("browser/images/SDC_Close_22_N.svg"))},addImplicitDefaultViewershipToast=async(t,i)=>{const s=document.createElement("div");s.id=IMPLICIT_TOAST_CONTAINER_ID;const o=await fetch(chrome.runtime.getURL("resources/gsuite/implicit-toast.html")),e=await o.text();s.innerHTML=e,setToastIcons(s),setToastText(s,t),document.body.appendChild(s),addToastDismissListeners(s,i)},showImplicitDefaultViewershipToast=async(t,i)=>{try{if(isToastShowing)return;isToastShowing=!0;const s="gmail"===t?"Gmail":"GDrive";await addImplicitDefaultViewershipToast(i,s),sendAnalytics([[`DCBrowserExt:${s}:ImplicitDV:Toast:Shown`]])}catch(i){isToastShowing=!1,sendErrorLog("ImplicitDV",`Failure in showImplicitDefaultViewershipToast for ${t}`)}},shouldShowImplicitDefaultViewerToast=(t,i)=>"true"===dcLocalStorage.getItem(`${t}-show-implicit-dv-toast`)&&(dcLocalStorage.removeItem(`${t}-show-implicit-dv-toast`),i.implicitToastShownInSession=!0,!0);export{showImplicitDefaultViewershipToast,shouldShowImplicitDefaultViewerToast};