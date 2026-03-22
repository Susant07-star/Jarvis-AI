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
class t{LOAD_STATE={NOT_LOADED:0,CDN_READY:1,FULLY_LOADED:2};constructor(){if(t.instance)return t.instance;t.instance=this,this.tabStates={},this.loadStates={}}setIsOpen(t,e){this.tabStates[t]=e}getIsOpen(t){return this.tabStates[t]??!1}setLoadState(t,e){this.loadStates[t]=e}getLoadState(t){return this.loadStates[t]??this.LOAD_STATE.NOT_LOADED}clear(t){delete this.tabStates[t],delete this.loadStates[t]}}const e=new t;export{e as sidepanelState};