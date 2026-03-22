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
const abortController=new AbortController,lruMessagesData=new Map,state={config:{},linkedinResponseListenerAdded:!1,getLRUMessageData(e){let s=lruMessagesData.get(e);return s?(lruMessagesData.delete(e),lruMessagesData.set(e,s),s):null},setLRUMessageData(e,s){const a=this.config?.selectors?.maxLRUSizeForMessageData||6e3;if(lruMessagesData.has(e))lruMessagesData.delete(e);else if(lruMessagesData.size===a){const e=lruMessagesData.keys().next().value;lruMessagesData.delete(e)}lruMessagesData.set(e,s)},get eventControllerSignal(){return abortController.signal},disconnectEventListeners(){abortController?.abort()}};export default state;