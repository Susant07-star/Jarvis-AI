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
import{useState,useEffect,useCallback,useRef}from"react";import{sendAnalyticsEvent}from"../utils/fabUtils";const DRAG_START_DELAY_MS=250;export const useFABDrag=({containerRef:e,iframeRef:t,fabManager:r,isDraggedRef:n,onDragStart:a,onDragEnd:o})=>{const[s,c]=useState(r.fabDraggedTop||null),[u,i]=useState(!1),g=useRef(0),f=useRef(null);useEffect(()=>{r.fabDraggedTop&&c(r.fabDraggedTop)},[r.fabDraggedTop]);const l=useCallback(t=>{if(0!==t.button||t.ctrlKey)return;t.stopPropagation(),t.preventDefault();const a=t.clientY;f.current=setTimeout(()=>{i(!0),r.isFABActiveForDrag=!0,n.current=!1;const t=e.current;if(t){const e=t.getBoundingClientRect();g.current=a-e.top}},250)},[r,n,e]),d=useCallback(t=>{if(!u&&!r.isFABActiveForDrag)return;const o=e.current;if(!o)return;n.current||a?.(),n.current=!0;let s=t.clientY-g.current;const i=o.offsetHeight,f=window.innerHeight-i-20;s=Math.max(20,Math.min(f,s)),r.fabDraggedTop=s,c(s)},[u,r,n,e,a]),m=useCallback(()=>{clearTimeout(f.current),(u||r.isFABActiveForDrag)&&(i(!1),r.isFABActiveForDrag=!1,n.current&&(window.dcLocalStorage.setItem("genAIFabTopPosition",r.fabDraggedTop),sendAnalyticsEvent([["DCBrowserExt:SidePanel:FabIcon:Dragged"]]),chrome.runtime.sendMessage({main_op:"log-info",log:{message:"FAB dragged",fabTop:`${r.fabDraggedTop}px`}}),o?.()))},[u,r,n,o]);useEffect(()=>(document.addEventListener("mousemove",d),document.addEventListener("mouseup",m),()=>{document.removeEventListener("mousemove",d),document.removeEventListener("mouseup",m)}),[d,m]),useEffect(()=>()=>clearTimeout(f.current),[]);return{fabTop:s,handleDragHandleMouseDown:useCallback(e=>{l(e)},[l]),handleIconMouseDown:useCallback(e=>{l(e)},[l]),isFABActiveForDrag:u}};