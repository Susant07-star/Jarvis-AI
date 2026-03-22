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
import{dcLocalStorage as e}from"../../common/local-storage.js";import{signInUtil as o}from"../../browser/js/viewer/signInUtils.js";const s=new URLSearchParams(window.location.search),n=parseInt(s.get("tabId"),10);if(isNaN(n))window.close();else if(e.getItem("upsellFromAnon"))chrome.tabs.query({active:!0,currentWindow:!0},function(e){if(e.length>0){const s=e[0].id;o.sidepanelPostAnonUpsellSignIn(!0,s,n),chrome.runtime.sendMessage({main_op:"post_upsell_anon",tabId:n})}});else{const e={main_op:"post_upsell",tabId:n};chrome.runtime.sendMessage(e,()=>{try{chrome.runtime.lastError&&console.error("Error sending message:",chrome.runtime.lastError.message)}finally{window.close()}})}