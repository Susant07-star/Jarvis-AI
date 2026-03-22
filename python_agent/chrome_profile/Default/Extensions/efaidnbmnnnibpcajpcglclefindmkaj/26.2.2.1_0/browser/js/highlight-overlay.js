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
export default class t{constructor(){this.overlay=null,this.innerRectangle=null,this.originalBoundingBox=null,this.animationInterval=null,this.highlightedSections=[]}create(t,i=[]){this.remove(),this.originalBoundingBox=t,this.highlightedSections=i,this.overlay=$("<div/>",{class:"highlight-overlay-component",css:{position:"absolute",top:t.top+"px",left:t.left+"px",width:t.width+"px",height:t.height+"px",pointerEvents:"none",opacity:0,zIndex:1}}),this.innerRectangle=$("<div/>",{class:"highlight-inner-rectangle"}),this.overlay.append(this.innerRectangle),$("body").append(this.overlay),requestAnimationFrame(()=>{this.overlay.css("opacity",1)}),this.startPaddingAnimation()}startPaddingAnimation(){let t=0;this.animationInterval=setInterval(()=>{if(!this.overlay||!this.originalBoundingBox)return;const i=t/120,e=1-(Math.cos(i*Math.PI*2)+1)/2,n=0+4*e,o=38+4*e,h=e,r=this.interpolateColor({r:21,g:122,b:243},{r:137,g:188,b:249},h),s=this.interpolateColor({r:134,g:186,b:249},{r:208,g:229,b:253},h);this.overlay.css({top:this.originalBoundingBox.top-n+"px",left:this.originalBoundingBox.left-o+"px",width:this.originalBoundingBox.width+2*o+"px",height:this.originalBoundingBox.height+2*n+"px",borderColor:`rgba(${r.r}, ${r.g}, ${r.b}, 1)`}),this.innerRectangle&&this.innerRectangle.css({borderColor:`rgba(${s.r}, ${s.g}, ${s.b}, 1)`}),t=(t+1)%120},1e3/60)}interpolateColor(t,i,e){return{r:Math.round(t.r+(i.r-t.r)*e),g:Math.round(t.g+(i.g-t.g)*e),b:Math.round(t.b+(i.b-t.b)*e)}}setupHoverDetection(t){this.detectionArea=$("<div/>",{class:"highlight-detection-area",css:{position:"absolute",top:t.top+"px",left:t.left+"px",width:t.width+"px",height:t.height+"px",backgroundColor:"transparent",pointerEvents:"none",zIndex:1}}),$("body").append(this.detectionArea)}fadeOutAndRemove(){this.overlay?(this.overlay.css("opacity",0),setTimeout(()=>this.remove(),300)):this.remove()}checkAndRemoveIfHighlightedSettingChanged(t){if(!this.overlay||0===this.highlightedSections.length)return;const i=$(t);for(const t of this.highlightedSections)if(i.closest(`.${t}`).length>0)return void this.fadeOutAndRemove()}remove(){this.overlay&&(this.overlay.remove(),this.overlay=null),this.innerRectangle&&(this.innerRectangle=null),this.animationInterval&&(clearInterval(this.animationInterval),this.animationInterval=null),this.originalBoundingBox=null,this.highlightedSections=[]}}