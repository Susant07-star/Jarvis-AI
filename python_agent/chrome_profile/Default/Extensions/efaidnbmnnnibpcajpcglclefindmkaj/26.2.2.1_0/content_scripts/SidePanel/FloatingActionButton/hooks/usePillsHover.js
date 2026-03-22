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
import{useRef}from"react";export const usePillsHover=(e,r,t,l,n)=>{const o=useRef(null);return{pillsHideTimeoutRef:o,handlePillsAreaMouseEnter:()=>{o.current&&(clearTimeout(o.current),o.current=null)},handlePillsAreaMouseLeave:()=>{n||(o.current=setTimeout(async()=>{await initDcLocalStorage();const n=window.dcLocalStorage?.getItem("fabPillsFTEShown");n&&!l&&(e(!1),r(!1),t(!1)),o.current=null},100))}}};