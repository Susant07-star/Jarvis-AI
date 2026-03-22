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
const GMAIL_COMPRESS_PDF_FTE_TOOLTIP_STORAGE_KEY="acrobat-gmail-compress-pdf-fte-config";class GmailCompressPDFFte{id="GmailCompressPDFFte";timeout=3e3;static GMAIL_DOMAINS=["mail.google.com"];constructor(){const t=window.location.hostname;if(!GmailCompressPDFFte.GMAIL_DOMAINS.some(i=>t.includes(i)))return this.isEligible=async()=>!1,void(this.render=async()=>{});this.initPromise=this.loadServices()}async loadServices(){[this.fteUtils,this.gmailCompressPDFFteService,this.state]=await Promise.all([import(chrome.runtime.getURL("content_scripts/utils/fte-utils.js")),import(chrome.runtime.getURL("content_scripts/gmail/gmail-compress-pdf-fte-service.js")),import(chrome.runtime.getURL("content_scripts/gmail/state.js"))])}async render(){this.gmailCompressPDFFteService?.addFte()}async isEligible(){const t=await chrome.runtime.sendMessage({main_op:"gmail-compress-pdf-init"});if(!t?.enableGmailCompressPDFTouchPoint)return!1;await this.initPromise;const i=this.state?.default,e=i?.compressPdfFteState?.compressPDFTouchPointWithFTE;if(!e)return!1;const s=await(this.fteUtils?.initFteStateAndConfig("acrobat-gmail-compress-pdf-fte-config")),o=t?.gmailCompressPDFFteConfig,a=t?.enableGmailCompressPDFFteTooltip;return await(this.fteUtils?.shouldShowFteTooltip(o,s,a))}}