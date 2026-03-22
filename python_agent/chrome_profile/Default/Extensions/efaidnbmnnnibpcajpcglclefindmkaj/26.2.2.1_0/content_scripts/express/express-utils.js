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
class ExpressUtils{expressEventsCache={};addFontToDocument=async()=>{if("true"===sessionStorage.getItem("adobeCleanFontAdded"))return;const e=chrome.runtime.getURL("browser/css/fonts/AdobeClean-Regular.otf"),t=chrome.runtime.getURL("browser/css/fonts/AdobeClean-Bold.otf"),s=new FontFace("AdobeClean-Regular",`url(${e})`),n=new FontFace("AdobeClean-Bold",`url(${t})`);document.fonts.add(s),document.fonts.add(n),await s.load(),await n.load(),sessionStorage.setItem("adobeCleanFontAdded","true")};isExpressFteTooltipSecond=async()=>{const{env:e}=await chrome.storage.local.get("env");if("prod"===e)return!1;return!!new URLSearchParams(window.location.search).has("expressFteTooltipSecond")};sendAnalyticsEvent=e=>{try{chrome.runtime.sendMessage({main_op:"analytics",analytics:e})}catch(e){}};sendAnalyticsEventOncePerDay=(e,t,s)=>{this.sendAnalyticsEvent([[e,t,{...s,frequency:"daily"}]])};getElementsFromTagNames(e,t){const s=[];for(const n of t){const t=e?.getElementsByTagName?.(n);t&&s.push(...t)}return s}getElementsFromClassNames(e,t){const s=[];for(const n of t){const t=e?.getElementsByClassName?.(n);t&&s.push(...t)}return s}getClosestElementBasedOnSelectors(e,t){for(const s of t){const t=e.closest(s);if(t)return t}return null}getElementsFromXPath=(e,t)=>{const s=[];for(const n of t){const t=document.evaluate(n,e,null,XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,null);for(let e=0;e<t.snapshotLength;e++)s.push(t.snapshotItem(e))}return s};launchExpress=(e,t,s)=>{chrome.runtime.sendMessage({main_op:"launch-express",imgUrl:e,intent:s,touchpoint:t})};sendInfoLog=(e,...t)=>{chrome.runtime.sendMessage({main_op:"log-info",log:{message:e,...t}})};sendErrorLog=(e,t)=>{chrome.runtime.sendMessage({main_op:"log-error",log:{message:e,error:t}})};removeContextualFte=()=>{const e=document.getElementById("express-contextual-fte");e&&e.remove()}}const expressUtils=new ExpressUtils;export default expressUtils;