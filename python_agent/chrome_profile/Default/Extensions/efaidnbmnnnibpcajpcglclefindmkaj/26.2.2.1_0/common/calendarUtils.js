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
const e=864e5,t=6048e5,n=e=>new Date(e).getFullYear(),r=e=>new Date(e).getMonth(),a=e=>new Date(e).getDate(),D=(e,t)=>n(t)-n(e)||r(t)-r(e),g=(n,r)=>{if(r-n>t)return 1;if(n-r>t)return-1;if(r-n===0)return 0;const a=new Date(n).getDay(),D=new Date(r).getDay();return D===a?r-n<e?0:r-n:(r-n)*(D-a)>0?0:r-n},u=(e,t)=>D(e,t)||a(t)-a(e);export{D as compareCalendarMonth,g as compareCalendarWeek,u as compareCalendarDay};