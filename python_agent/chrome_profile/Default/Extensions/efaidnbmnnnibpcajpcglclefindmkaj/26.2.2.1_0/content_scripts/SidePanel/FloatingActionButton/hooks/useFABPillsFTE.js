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
import{useState,useEffect,useRef,useCallback}from"react";export const useFABPillsFTE=(e,t)=>{const[l,s]=useState(!1),[a,c]=useState(!1),o=useRef(null),r=useCallback(()=>{s(!1),e(!1),t(!1)},[s,e,t]);useEffect(()=>((async()=>{await initDcLocalStorage();const l=window.dcLocalStorage?.getItem("fabPillsFTEShown");l||(c(!0),s(!0),e(!0),t(!0),window.dcLocalStorage?.setItem("fabPillsFTEShown",!0),o.current=setTimeout(()=>{r(),c(!1),o.current=null},15e3))})(),()=>{o.current&&clearTimeout(o.current)}),[r]);return{showPills:l,setShowPills:s,isFTE:a,setIsFTE:c,handlePillsClose:async()=>{r(),c(!1),o.current&&(clearTimeout(o.current),o.current=null),await initDcLocalStorage(),window.dcLocalStorage?.setItem("fabPillsFTEShown",!0)},collapseFAB:r,pillsFTETimeoutRef:o}};