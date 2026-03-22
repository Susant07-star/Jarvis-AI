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
"use strict";import reUtils from"./re-utils.js";const _requestCallbackMap=new Map;class RequestCallbackManager{static has(e){return _requestCallbackMap.has(e)}static get(e){return _requestCallbackMap.get(e)||null}static registerCallback(e,t,a=!1){if("function"!=typeof t)throw new Error("Callback must be a function");_requestCallbackMap.set(e,{callback:t,deleteAfterExecute:a})}static delete(e){return _requestCallbackMap.delete(e)}static execute(e,t){const a=_requestCallbackMap.get(e);if(!a)return!1;const{callback:l,deleteAfterExecute:r=!1}=a;if(!l)return!1;try{return l(t),r&&_requestCallbackMap.delete(e),!0}catch(t){return reUtils.consoleLog(`Error executing callback for requestId ${e}:`,t),_requestCallbackMap.delete(e),!1}}static clear(){_requestCallbackMap.clear()}static size(){return _requestCallbackMap.size}static getRequestIds(){return Array.from(_requestCallbackMap.keys())}static isEmpty(){return 0===_requestCallbackMap.size}static getSnapshot(){const e={};for(const[t,{callback:a,deleteAfterExecute:l}]of _requestCallbackMap.entries())e[t]={callbackType:typeof a,callbackName:a.name||"anonymous",callbackLength:a.length,deleteAfterExecute:l};return e}}export default RequestCallbackManager;