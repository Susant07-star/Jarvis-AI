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
import{wrapTask as e}from"./offscreenTaskManager.js";import{logError as t,consoleLog as o,logInfo as n}from"./offscrenUtil.js";const r=new Map;let i=null;const c=chrome.runtime.sendMessage({main_op:"getFloodgateMeta",flag:"dc-cv-remote-execution-logging",tab:{id:"offscreenTabId"}});export async function createRemoteExecutionIframe(e,t){const a=new URL(t.url).hostname;c?.then(e=>{const t=JSON.parse(e);t?.loggingEnabled&&n("Remote Execution: Creating remote execution iframe",{domain:a,executionSource:"remoteExecution"})}).catch(()=>{}),o("createRemoteExecutionIframe",e,t);const m=t.tab.id;r.has(m)&&removeRemoteExecutionIframe(e,t);const s=window.document;i=e.iframeURL;const u=new URL(i),f=s.createElement("iframe");f.setAttribute("id","remote-execution-iframe-"+Math.random().toString(36).substring(2,15)),f.setAttribute("src",u.toString());s.getElementById("cdn-re-iframe").appendChild(f),r.set(m,f)}export async function sendMessageToRemoteExecutionIframe(e,n){o("sendMessageToRemoteExecutionIframe",e,n);const i=n.tab.id;if(!r.has(i))return void t("Remote execution iframe not found");const c=r.get(i);c.contentWindow.postMessage({...e},new URL(c.src).origin)}export async function removeRemoteExecutionIframe(e,t){c?.then(e=>{const t=JSON.parse(e);t?.loggingEnabled&&n("Remote Execution: Removing remote execution iframe",{executionSource:"remoteExecution"})}).catch(()=>{});const o=t.tab.id,i=r.get(o);i?.remove(),r.delete(o)}export function handleRemoteExecutionEvent(e){if(o("handleRemoteExecutionEvent",e),!i||e.origin!==new URL(i).origin)return;const t=e.data;if("remote_execution"!==t?.messageType)return;const n=e.source,c=r.entries(),[a,m]=c.find(([e,t])=>t.contentWindow===n);a&&chrome.runtime.sendMessage({...t,main_op:"relayOffscreenMessageToContentScript",target:"background",tab:{id:a}})}export function getRemoteExecutionTaskHandlers(){return{createRemoteExecutionIframe:e("createRemoteExecutionIframe",createRemoteExecutionIframe),removeRemoteExecutionIframe:e("removeRemoteExecutionIframe",removeRemoteExecutionIframe),sendMessageToRemoteExecutionIframe:e("sendMessageToRemoteExecutionIframe",sendMessageToRemoteExecutionIframe)}}