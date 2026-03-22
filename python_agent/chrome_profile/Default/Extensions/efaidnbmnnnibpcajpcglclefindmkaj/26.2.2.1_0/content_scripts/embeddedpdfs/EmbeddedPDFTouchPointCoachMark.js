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
const FTE_STATE_STORAGE_KEY="embeddedPDFTouchPointFTEState";class EmbeddedPDFTouchPointCoachMark{shouldResetFteToolTip(e,o){return-1!==e?.resetDay&&o>e?.resetDay}static BLOCKED_DOMAINS=["outlook.office365.com","outlook.office.com","outlook.live.com","www.linkedin.com","mail.google.com","www.google.com","drive.google.com","www.facebook.com","web.whatsapp.com"];async initFteStateAndConfig(e){const o=(new Date).getTime();let t={count:0,nextDate:o};t=(await chrome.storage.local.get(FTE_STATE_STORAGE_KEY))?.[FTE_STATE_STORAGE_KEY]||t;const i=e?.touchPointConfig?.tooltip;return this?.shouldResetFteToolTip(i,o)&&(t.count=0,t.nextDate=o),chrome.storage.local.set({[FTE_STATE_STORAGE_KEY]:t}),t}constructor(){const e=window.location.hostname;if(EmbeddedPDFTouchPointCoachMark.BLOCKED_DOMAINS.some(o=>e.includes(o)))return this.isEligible=async()=>!1,void(this.render=async()=>{});import(chrome.runtime.getURL("content_scripts/utils/fte-utils.js")).then(e=>this.fteUtils=e)}id="embeddedpdfscoachmark";timeout=3e3;async render(){const e=await chrome.runtime.sendMessage({main_op:"embedded-pdf-touch-point-config"});e?.enableEmbeddedPDFTouchPoint&&chrome.runtime.sendMessage({main_op:"embedded-pdf-touch-point-fte",frameId:this.frameId})}isTouchPointPresent(){return embeddedPDFTouchPointAddedPromise}isTouchPointPositionAllowsForFTE(e){return e?.top>=0&&e?.left>=0&&e?.bottom+50<=window.innerHeight&&e?.right<=window.innerWidth}async isEligible(){let e;const o=await chrome.runtime.sendMessage({main_op:"embedded-pdf-touch-point-config"});if(!o?.enableEmbeddedPDFTouchPoint)return Promise.resolve(!1);let t=new Promise(o=>{e=o});const i=await this.initFteStateAndConfig(o),{isTouchPointPresent:n,frameId:s,position:c}=await this.isTouchPointPresent();if(this.frameId=s,n&&this.isTouchPointPositionAllowsForFTE(c)){const t=o?.touchPointConfig?.tooltip,n=await(this.fteUtils?.shouldShowFteTooltip(t,i,!!t));e(n)}return t}}