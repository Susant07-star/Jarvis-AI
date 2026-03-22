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
import{acroActions as o}from"./acro-actions.js";import{util as r}from"./util.js";import{SETTINGS as R}from"./settings.js";import{dcLocalStorage as E}from"../common/local-storage.js";export async function versionChecks(){return new Promise((r,E)=>{o.getVersion(o=>{o.ver!==R.READER_VER&&o.ver!==R.ERP_READER_VER||(R.IS_READER=!0,R.IS_ACROBAT=!1,o.ver===R.ERP_READER_VER&&(R.IS_ERP_READER=!0)),r(o)})})}