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
const BUTTON_CLASS="cc440d50ba-express-entrypoint-button",BUTTON_TEXT_CLASS="cc440d50ba-express-entrypoint-button-text",BUTTON_ICON_CLASS="cc440d50ba-express-entrypoint-button-icon",TOUCHPOINT_TYPE_EDIT_IMAGE="editImage",TOUCHPOINT_TYPE_IMAGE_TOOLS="imageTools",DEFAULT_SMALL_SCREEN_THRESHOLD=1e3,COMPACT_SIZE="32px";class ResponsiveButtonHandler{constructor(t,e="editImage",s={}){this.button=t,this.touchpointType=e,this.smallScreenThreshold=s.smallScreenThreshold??1e3,this.resizeHandler=null}getButtonElement(){return this.button?.getElementsByClassName(BUTTON_CLASS)[0]||null}toggleButtonSize(t){const e=this.getButtonElement();if(!e)return;const s=e.getElementsByClassName(BUTTON_TEXT_CLASS)[0],n=e.getElementsByClassName(BUTTON_ICON_CLASS)[0];if(s&&(s.style.display=t?"none":""),e.style.width=t?"32px":"","imageTools"===this.touchpointType){const s=n?.getElementsByTagName("img")[0];e.style.height=t?"32px":"",e.style.padding=t?"0":"",e.style.justifyContent=t?"center":"",s&&(s.style.marginRight=t?"0":"")}else n&&(n.style.padding=t?"7px 9px 7px 5px":"",n.style.width=t?"32px":"")}updateButtonStyles(){const t=this.getButtonElement();if(!t)return;t.style.visibility="hidden",this.toggleButtonSize(!1);const e=t.offsetWidth,s=window.innerWidth-e<this.smallScreenThreshold;this.toggleButtonSize(s),t.style.visibility="visible"}handleResponsiveButton(){if(!this.button)return!1;return!!this.getButtonElement()&&(this.updateButtonStyles(),this.resizeHandler=()=>this.updateButtonStyles(),window.addEventListener("resize",this.resizeHandler),!0)}cleanup(){this.resizeHandler&&(window.removeEventListener("resize",this.resizeHandler),this.resizeHandler=null)}}export default ResponsiveButtonHandler;export{TOUCHPOINT_TYPE_EDIT_IMAGE,TOUCHPOINT_TYPE_IMAGE_TOOLS};