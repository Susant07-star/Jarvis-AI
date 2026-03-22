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
export const sendAnalyticsEvent=e=>{try{chrome.runtime.sendMessage({main_op:"analytics",analytics:e})}catch(e){console.error("[FAB Utils] Analytics event error:",e)}};export const shouldDisableTouchpoints=async()=>"undefined"!=typeof GenAIWebpageEligibilityService&&await GenAIWebpageEligibilityService.shouldDisableTouchpoints();export const openSidePanel=e=>{sendAnalyticsEvent([[`DCBrowserExt:SidePanel:${e}:Clicked`]]),chrome.runtime.sendMessage({type:"open_side_panel",touchpoint:e})};export const openQnAPanel=e=>{window.initialQuestion=void 0,openSidePanel(e)};export const openSummarizeWebpage=()=>{window.initialQuestion="Give me a summary of this webpage",openSidePanel("FABPill:Summarize")};export const convertWebpageToPDF=async()=>{sendAnalyticsEvent([["DCBrowserExt:SidePanel:FABPill:ConvertToPDF:Clicked"]]);try{const{tabId:e}=await chrome.runtime.sendMessage({main_op:"get-tab-id"});if(e){const o=(document.title||"webpage").replace(/[<>:"/\\|?*\x00-\x1F]/g,"").replace(/\s+/g," ").trim().substring(0,200)||"webpage",n=o.endsWith(".html")?o:`${o}.html`,t=window.location.href,i=`https://convert-pdf-webpage/?tabId=${e}&tabOriginalUrl=${encodeURIComponent(t)}`,a=i+"&acrobatPromotionSource="+"webpage_chrome-convert_to_pdf";let r=`${chrome.runtime.getURL("viewer.html")}?pdfurl=${encodeURIComponent(a)}`;r=r+"&pdffilename="+encodeURIComponent(n),r=r+"&acrobatPromotionWorkflow="+encodeURIComponent("html-to-pdf"),window.open(r,"_blank")}else console.error("Failed to get tabId (undefined)")}catch(e){console.error("Failed to convert webpage to PDF",e)}};