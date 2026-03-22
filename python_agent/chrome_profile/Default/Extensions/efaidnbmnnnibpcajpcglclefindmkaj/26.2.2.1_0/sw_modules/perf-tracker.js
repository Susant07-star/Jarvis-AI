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
const _=(_=null)=>{const e={startTime:Date.now(),requestId:_?.requestId||`req${Date.now()}`,markers:[]},E=_?{...e,..._,markers:[..._.markers||[]]}:e;return{getStartTime:()=>E.startTime,getRequestId:()=>E.requestId,getMarkers:()=>E.markers,mark(_,e={}){const t={name:_,timestamp:Date.now(),...e};E.markers.push(t)},getPerfTimings(){const _=E.markers.map(_=>{const{name:e,timestamp:E,...t}=_;return{[e]:E,...t}});return{startTime:E.startTime,requestId:E.requestId,..._}},getMarker(_){const e=E.markers.find(e=>e.name===_);if(!e)return null;const{name:t,...r}=e;return r},getDuration(_,e){const t=E.markers.find(e=>e.name===_),r=E.markers.find(_=>_.name===e);return t&&r?r.timestamp-t.timestamp:null},getDurations(_){const e={};return _.forEach(({start:_,end:E,label:t})=>{const r=this.getDuration(_,E);null!==r&&(e[t]=r)}),e}}},e={AWPP_CONTEXT_MENU_CLICKED:"AWPP_Context_Menu_Clicked",AWPP_EXTENSION_IFRAME_LOADED:"AWPP_Extension_Iframe_Loaded",AWPP_EXTENSION_IFRAME_SCRIPT_EXECUTION_FAILED:"AWPP_Extension_Iframe_Script_Execution_Failed",AWPP_EXTENSION_IFRAME_SCRIPT_EXECUTION_COMPLETED:"AWPP_Extension_Iframe_Script_Execution_Completed",AWPP_EXTENSION_IFRAME_CREATION_STARTED:"AWPP_Extension_Iframe_Creation_Started",AWPP_EXTENSION_IFRAME_CREATION_COMPLETED:"AWPP_Extension_Iframe_Creation_Completed",AWPP_EXTENSION_IFRAME_ADDED_TO_DOCUMENT:"AWPP_Extension_Iframe_Added_To_Document",AWPP_EXTENSION_IFRAME_REMOVED:"AWPP_Extension_Iframe_Removed",AWPP_EXTENSION_IFRAME_ERROR:"AWPP_Extension_Iframe_Error",AWPP_HOSTED_IFRAME_READY_EVENT_RESOLVED:"AWPP_Hosted_Iframe_Ready_Event_Resolved",AWPP_HOSTED_IFRAME_LOAD_STARTED:"AWPP_Hosted_Iframe_Load_Started",AWPP_HOSTED_IFRAME_LOAD_TIMEOUT:"AWPP_Hosted_Iframe_Load_Timeout",AWPP_HOSTED_IFRAME_LOADED:"AWPP_Hosted_Iframe_Loaded",AWPP_HOSTED_IFRAME_ERROR:"AWPP_Hosted_Iframe_Error",AWPP_HOSTED_IFRAME_READY_EVENT_TIMEOUT:"AWPP_Hosted_Iframe_Ready_Event_Timeout",PDF_CONVERT_REQUEST_INITIATED:"PDF_Convert_Request_Initiated",PDF_CONVERT_VIEWER_INITIALIZED:"PDF_Convert_Viewer_Initialized",PDF_CONVERT_SOURCE_FILE_RECEIVED:"PDF_Convert_Source_File_Received",PDF_CONVERT_PDF_RECEIVED:"PDF_Convert_PDF_Received",PDF_CONVERT_RENDERED:"PDF_Convert_Rendered"};export{_ as createPerfTracker,e as PERF_MARKERS};