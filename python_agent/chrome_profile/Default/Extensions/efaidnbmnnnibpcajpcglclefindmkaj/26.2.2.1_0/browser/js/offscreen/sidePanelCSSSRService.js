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
import{extractWebpageHTML as e}from"../../../resources/addWebpage/extractWebpageHTML.js";import{largeBlobStorage as t}from"../../../common/large-blob-storage.js";import{dcLocalStorage as r}from"./offscrenUtil.js";export const saveGenAISidePanelRenderedHTML=async n=>{if(document.querySelector("iframe#sidepanel"))return;const a=await r.getItem("sidepanelUrl"),o=await r.getItem("appLocale")||chrome.i18n.getMessage("@@ui_locale"),s=new URL(a),i=s.origin;s.searchParams.append("la",!1),s.searchParams.append("ca",chrome.runtime.id),s.searchParams.append("locale",o),s.searchParams.append("utl",!0);const m=(e=>{const t=document.createElement("iframe");return t.setAttribute("id","sidepanel"),t.width="373px",t.height="914px",t.border="none",t.onerror=e=>{console.error("Error in loading sidepanel iframe",e)},t.src=e,t})(s.href);document.body.appendChild(m);const d=(()=>{let e;return{promise:new Promise((t,r)=>{const n=setTimeout(()=>{r(new Error("Hosted sidepanel ready event timeout"))},2e4);e=()=>{clearTimeout(n),t()}}),resolver:e}})(),l=e=>{m&&d.promise.then(()=>m.contentWindow.postMessage(e,i)).catch(e=>{console.error("Error in sending message to sidepanel:",e.toString())})};window.addEventListener("message",async r=>{if(r.origin===i)switch(r.data.main_op){case"saveHtmlContent":await async function(r){const n=(new DOMParser).parseFromString(r.htmlContent,"text/html"),a=await e(n);!0===r?.isAnonUser&&a?.html?(await t.setItem("anonGenAISSRHtml",a.html),l({type:"sidepanelHtmlRenderSaved"})):m.remove()}(r.data);break;case"cdnReady":d.resolver();break;case"exHostedDeploymentVersionUpdated":m.remove()}}),l({type:"sidepanelHtmlContent",htmlContent:"<html><body><h1>Hello</h1></body></html>",disqualified:!1,pageLanguage:"en",url:"https://www.hello.com",touchpoint:"offscreen"})};