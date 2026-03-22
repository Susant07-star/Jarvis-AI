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
"use strict";class ReUtils{environment=null;constructor(){this.allowedOrigins=["chrome-extension://"+chrome.runtime.id],this.cdnExceptionDomains=[]}isValidMessageOrigin(e){return this.allowedOrigins.some(n=>{if(n.includes("*")){const t=n.replace("*",".*");return new RegExp(t).test(e)}return e===n})}isDomainExcluded(){const e=window.location.hostname;return this.cdnExceptionDomains.includes(e)}async getEnvironment(){if(this.environment)return this.environment;const e=await chrome.runtime.sendMessage({main_op:"getEnvironment"});return this.environment=e.environment,this.environment}async consoleLog(...e){const n=await chrome.storage.local.get("remoteExecutionDebugMode"),t=n?.remoteExecutionDebugMode;"prod"!==await this.getEnvironment()&&t&&console.log(...e)}async logInfo(e){chrome.runtime.sendMessage({main_op:"log-info",log:{message:e}})}}const reUtils=new ReUtils;export default reUtils;