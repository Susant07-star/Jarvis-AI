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
import{dcLocalStorage as e}from"../../common/local-storage.js";import{analytics as t,events as o}from"../../common/analytics.js";import{LOCAL_FILE_PERMISSION_URL as n,ONE_WEEKS_IN_MS as c,POPUP_CONTEXT as a,TWO_WEEKS_IN_MS as i}from"../../common/constant.js";import{util as s}from"../js/content-util.js";await e.init();const{id:l,url:r}=await chrome.tabs.getCurrent(),m=e.getItem("showLocalisedGif");t.event(o.LOCAL_FTE_DISPLAYED,{VARIANT:m?"WithLocalisedGif":"WithoutLocalisedGif"});const d=e.getItem("dc")?c:i;e.setWithTTL("localFteCooldown",!0,d);const L=(e.getItem("localFteCount")||0)+1;e.setItem("localFteCount",L),$(document).ready(()=>{s.translateElements(".translate");let c=chrome.i18n.getMessage("@@ui_locale");const i=m?"fte.svg":"fte_old.svg";$("#local-file-animated-fte").css("background-image",`url(../images/LocalizedFte/${c}/${i}),url(../images/LocalizedFte/en_US/${i})`),$("#closeLocalFte").click(()=>{s.sendAnalytics(o.LOCAL_FTE_CROSS_BUTTON_CLICKED),chrome.runtime.sendMessage({main_op:"closeLocalFte"})}),$("#continueLocalFte").click(async()=>{s.sendAnalytics(o.LOCAL_FTE_GO_TO_SETTINGS_CLICKED),e.setItem("pdfViewer","true");const c=e.getItem("openSettingsInWindow");if(c){const t=e.getItem("localFteWindow"),{id:o,height:c,width:i,left:l,top:r}=t;chrome.windows.remove(o),chrome.windows.create({height:c,width:1.2*i,left:l,top:r,focused:!0,type:"normal",url:s.constructUrlWithParams(n,{context:a.LOCAL_FILE_COACHMARK,autoDismiss:!0})},t=>{chrome.action.openPopup().catch(e=>console.error(e)),e.setItem("settingsWindow",{id:t.tabs[0].id})})}else{const{windowId:e}=await chrome.tabs.create({url:s.constructUrlWithParams(n,{context:a.LOCAL_FILE_COACHMARK,autoDismiss:!0}),active:!0});chrome.windows.update(e,{focused:!0},()=>{chrome.action.openPopup().catch(e=>console.error(e))})}t.event(o.LOCAL_FTE_SETTINGS_OPENED,{VARIANT:c?"InWindow":"InTab"})}),$("#localFteDontShowAgainInput").click(()=>{document.getElementById("localFteDontShowAgainInput").checked?(t.event(o.LOCAL_FTE_DONT_ASK_CHECKED),e.setItem("localFteDontShowAgain",!0)):(t.event(o.LOCAL_FTE_DONT_ASK_UNCHECKED),e.removeItem("localFteDontShowAgain"))}),L>4&&$("#localFteDontShowAgainInput,#localFteDontShowAgainText").removeAttr("hidden"),window.onbeforeunload=()=>{s.sendAnalytics(o.LOCAL_FTE_WINDOW_CLOSED);const e=Date.now();for(;Date.now()-e<60;);},document.addEventListener("keydown",e=>{"F11"==e.key&&e.preventDefault()})});