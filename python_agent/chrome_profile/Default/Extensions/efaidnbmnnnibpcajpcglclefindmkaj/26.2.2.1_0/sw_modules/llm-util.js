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
import{floodgate as e}from"./floodgate.js";import{dcLocalStorage as t}from"../common/local-storage.js";import{analytics as r}from"../common/analytics.js";import{loggingApi as a}from"../common/loggingApi.js";import{util as i}from"./util.js";import{CACHE_PURGE_SCHEME as o}from"./constant.js";import{safeJsonParse as n}from"../common/util.js";const c=new class{constructor(){this.STORAGE_KEY="gemini_nano_model_check",this.FEATURE_FLAG="dc-cv-gemini-nano-check-availability"}static async checkGeminiNanoAvailability(){try{if("Summarizer"in self){return await self.Summarizer.availability()}return"api_not_available"}catch(e){return a.error({message:"Error checking Gemini Nano availability",error:e?.message}),"error_checking"}}getFeatureFlagMetadata(){try{const t=e.getFeatureMeta(this.FEATURE_FLAG);if(t){const e=n(t,{});return e?.checkCounter||0}return 0}catch(e){return a.error({message:"Error getting feature flag metadata",error:e?.message}),0}}async isFeatureFlagEnabled(){try{return!!await e.hasFlag(this.FEATURE_FLAG,o.NO_CALL)}catch(e){return a.error({message:"Error checking feature flag",error:e?.message}),!1}}getStoredCheckData(){try{return t.getItem(this.STORAGE_KEY)}catch(e){return a.error({message:"Error getting stored check data",error:e?.message}),null}}async shouldRunCheck(){if(i.isEdge())return!1;if(!await this.isFeatureFlagEnabled())return!1;const e=this.getStoredCheckData();if(!e)return!0;return this.getFeatureFlagMetadata()!==e?.checkCounter}async checkAndLogGeminiNanoModel(){try{if(!await this.shouldRunCheck())return;const e=this.getFeatureFlagMetadata(),a=await this.constructor.checkGeminiNanoAvailability();r.event(r.e.GEMINI_NANO_MODEL_AVAILABILITY,{AVAILABILITY:a}),t.setItem(this.STORAGE_KEY,{availability:a,checkCounter:e})}catch(e){r.event(r.e.GEMINI_NANO_MODEL_AVAILABILITY,{AVAILABILITY:"ERROR_IN_CHECKING"})}}};export{c as llmUtil};