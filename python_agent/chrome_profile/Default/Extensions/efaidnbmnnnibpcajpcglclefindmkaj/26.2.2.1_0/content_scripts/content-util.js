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
const util={getTranslation:(t,e)=>{if(t)return e?chrome.i18n.getMessage(t,e):chrome.i18n.getMessage(t)},translateElements:(t,e)=>{(e?$(e).find(t):$(t)).each(function(){"INPUT"===this.tagName?$(this).val(util.getTranslation(this.id)):$(this).text(util.getTranslation(this.id))})},consoleLog:function(...t){SETTINGS.DEBUG_MODE&&console.log(...t)}},ONE_DAY_IN_MILLISECONDS=864e5;