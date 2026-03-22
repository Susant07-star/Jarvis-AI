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
"use strict";import reUtils from"./re-utils.js";class IframeManager{constructor(){this.iframeTrackingMap=new Map}getIframeInfoBySender(e){return reUtils.consoleLog("iframeTrackingMap.entries().length",this.iframeTrackingMap.entries().length),Array.from(this.iframeTrackingMap.entries()).find(([r,n])=>(reUtils.consoleLog("iframeInfo",n),reUtils.consoleLog("sender",e),reUtils.consoleLog("iframeInfo.iframe.contentWindow",n.iframe.contentWindow),reUtils.consoleLog("sender === iframeInfo.iframe.contentWindow",e===n.iframe.contentWindow),n.iframe&&n.iframe.contentWindow===e))}getIframeTrackingMap(){return this.iframeTrackingMap}}const iframeManager=new IframeManager;export default iframeManager;