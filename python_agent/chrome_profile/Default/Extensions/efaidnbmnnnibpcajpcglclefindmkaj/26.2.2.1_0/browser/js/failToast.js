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
import{util as e}from"./content-util.js";$(document).ready(()=>{const s=new URLSearchParams(window.location.search).get("errorType");if(s){document.getElementsByClassName("toastDescription")[0].id=s+"ToastText","sessionExpired"===s&&$("#refreshButton").show()}e.translateElements(".translate"),$("#closeFailToast").click(()=>{chrome.runtime.sendMessage({main_op:"closeExpressApp"})}),$("#refreshButton").click(()=>{$("#refreshButton").addClass("loading"),chrome.runtime.sendMessage({main_op:"reloadCurrentTab"})})});