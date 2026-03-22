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
import state from"./state.js";import{getParsedJSON}from"../utils/util.js";const parseMessageAndUpdateState=(e,t,n)=>{let s=state?.getLRUMessageData(e);s||(s={attachments:{}}),(t=t.trim())&&n&&(s.attachments[t]||(s.attachments[t]=[]),s.attachments[t].push(n)),state?.setLRUMessageData(e,s)},parseLinkedinMessagesResponse=e=>{const t=getParsedJSON(e),n=t?.data?.messengerMessagesBySyncToken?.elements||t?.data?.messengerMessagesByConversation?.elements||t?.data?.messengerMessagesByAnchorTimestamp?.elements||[];for(const e of n){const t=e?.entityUrn;if(!t)continue;const n=e?.renderContent||[];for(const e of n){const n=e?.file;"application/pdf"===n?.mediaType&&n?.url&&n?.name&&parseMessageAndUpdateState(t,n.name,n.url)}}},getFileUrlFromState=(e,t,n)=>{const s=state?.getLRUMessageData(e);if(!s)return null;const a=s.attachments[t];if(!a?.length)return null;for(const e of a)if(!n.includes(e))return n.push(e),e;return null},acrobatLinkedinDataHandler=(e,t)=>{parseLinkedinMessagesResponse(e?.detail?.responseData),t()},injectResponseListenerScript=()=>{if(state?.linkedinResponseListenerAdded)return;const e=document.createElement("script");e.setAttribute("id","linkedin-acrobat-response-interceptor"),e.src=chrome.runtime.getURL("content_scripts/linkedin/linkedin-inject.js"),e.onload=function(){this.remove()},(document.head||document.documentElement).appendChild(e),state.linkedinResponseListenerAdded=!0},addLinkedinDataEventListener=e=>{document.addEventListener("linkedin-messages-data",t=>{setTimeout(()=>{acrobatLinkedinDataHandler(t,e)},0)},{signal:state?.eventControllerSignal})};export{getFileUrlFromState,injectResponseListenerScript,addLinkedinDataEventListener};