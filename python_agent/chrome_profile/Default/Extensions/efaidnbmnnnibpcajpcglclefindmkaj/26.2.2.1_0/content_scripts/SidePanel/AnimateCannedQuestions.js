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
class AnimateCannedQuestions{static typingInterval;static deletingInterval;static typingSpeed=120;static deletingSpeed=120;static pauseDuration=500;static scrollThrottle=50;static lastScrollUpdate=0;static scrollDelay=120;static cannedQuestionTextIdArray=["canQuesBriefOverview","canQuesSummarise","canQuesImpTopics","canQuesDraftEmail","canQuesCreateFAQ"];static currentQuestionIndex=0;static userQuestion="";static inFocus=!1;static getCannedQuestion(){return util.getTranslation(this.cannedQuestionTextIdArray[this.currentQuestionIndex])}static getQuestion(){return this.userQuestion||AnimateCannedQuestions.getCannedQuestion()}static start(t){t.addEventListener("input",t=>{this.userQuestion=t.target.value}),t.addEventListener("focus",()=>{t.parentElement.classList.add("nudge-clicked"),this.userQuestion||(t.value=""),this.inFocus=!0,clearInterval(this.typingInterval),clearInterval(this.deletingInterval),t.scrollLeft=t.scrollWidth}),t.addEventListener("blur",()=>{this.inFocus=!1,t.parentElement.classList.remove("nudge-clicked"),this.userQuestion||this.typeQuestion(t)}),t.addEventListener("keydown",t=>{"Enter"===t.key&&(t.preventDefault(),clearInterval(this.typingInterval),clearInterval(this.deletingInterval))}),this.typeQuestion(t)}static typeQuestion(t){const e=AnimateCannedQuestions.getCannedQuestion();let s=0;t.value="",this.typingInterval=setInterval(()=>{s<e.length?(t.value+=e.charAt(s),s++,setTimeout(()=>{this.throttleScroll(t)},this.scrollDelay)):(clearInterval(this.typingInterval),setTimeout(()=>{this.inFocus||this.deleteQuestion(t)},this.pauseDuration))},this.typingSpeed)}static deleteQuestion(t){const e=AnimateCannedQuestions.getCannedQuestion();let s=e.length;this.deletingInterval=setInterval(()=>{s>0?(t.value=e.substring(0,s-1),s--,setTimeout(()=>{this.throttleScroll(t)},this.scrollDelay)):(clearInterval(this.deletingInterval),setTimeout(()=>{this.currentQuestionIndex=(this.currentQuestionIndex+1)%this.cannedQuestionTextIdArray.length,this.inFocus||this.typeQuestion(t)},this.pauseDuration))},this.deletingSpeed)}static throttleScroll(t){const e=Date.now();e-this.lastScrollUpdate>=this.scrollThrottle&&(t.scrollLeft=t.scrollWidth,this.lastScrollUpdate=e)}}