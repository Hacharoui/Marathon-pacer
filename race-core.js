/* Pure course calculations shared by the browser and regression tests. */
(function(root) {
  'use strict';
  function create(data) {
    const {route,cum,plan,COURSE_KM}=data;
    const mappedKm=cum[cum.length-1]/1000;
    const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
    function pointAt(km) {
      const m=clamp(km,0,mappedKm)*1000;
      let i=0;while(i<cum.length-2 && cum[i+1]<m)i++;
      const t=(m-cum[i])/(cum[i+1]-cum[i]);
      return route[i].map((v,j)=>v+t*(route[i+1][j]-v));
    }
    function slice(a,b) {
      a=clamp(a,0,mappedKm);b=clamp(b,a,mappedKm);
      return [pointAt(a),...route.filter((_,i)=>cum[i]>a*1000&&cum[i]<b*1000),pointAt(b)];
    }
    function index(km) {return clamp(Math.floor(km),0,plan.length-1);}
    function planned(km) {
      km=clamp(km,0,COURSE_KM);
      return plan.reduce((sum,p)=>sum+clamp(km-p.start,0,p.end-p.start)*p.paceSec,0)
        +Math.max(0,km-plan[plan.length-1].end)*plan[plan.length-1].paceSec;
    }
    function project(lat,lon,a,b) {
      const mx=111195*Math.cos(lat*Math.PI/180),my=111195;
      const ax=(a[1]-lon)*mx,ay=(a[0]-lat)*my;
      const vx=(b[1]-a[1])*mx,vy=(b[0]-a[0])*my;
      const t=clamp(-(ax*vx+ay*vy)/(vx*vx+vy*vy||1),0,1);
      return {t,dist:Math.hypot(ax+t*vx,ay+t*vy),bearing:(Math.atan2(vx,vy)*180/Math.PI+360)%360};
    }
    // Bound progression without forcing distance to increase. Long gaps require re-anchoring.
    function match(coords,previous,time) {
      if(!Number.isFinite(coords.latitude)||!Number.isFinite(coords.longitude)||!Number.isFinite(coords.accuracy)||coords.accuracy<0)return {accepted:false,reason:'Invalid GPS fix'};
      const accuracy=coords.accuracy, dt=previous?clamp((time-previous.time)/1000,0,120):0;
      const allowance=Math.max(35,Math.min(accuracy,50)*2);
      let nearest=null,best=null;
      for(let i=0;i<route.length-1;i++) {
        const q=project(coords.latitude,coords.longitude,route[i],route[i+1]);
        q.meters=cum[i]+q.t*(cum[i+1]-cum[i]);q.i=i;
        if(!nearest||q.dist<nearest.dist)nearest=q;
        if(previous && (previous.seed
          ? q.meters<previous.meters-30 || q.meters>previous.meters+1030
          : q.meters<previous.meters-allowance-Math.min(dt*3,150) || q.meters>previous.meters+allowance+dt*7))continue;
        let score=q.dist;
        if(previous&&!previous.seed)score+=Math.abs(q.meters-previous.meters)*0.08;
        if(Number.isFinite(coords.heading)&&coords.speed>=1) {
          const angle=Math.abs(((q.bearing-coords.heading+540)%360)-180);
          score+=angle/180*12;
        }
        if(!best||score<best.score)best={...q,score};
      }
      const far=nearest.dist>Math.max(60,accuracy*1.5);
      if(accuracy>65)return {accepted:false,reason:'Poor GPS accuracy — position held',nearest,far};
      if(far)return {accepted:false,reason:'POSSIBLY OFF ROUTE',nearest,far};
      if(!best||best.dist>Math.max(45,accuracy*1.5)||best.dist>nearest.dist+Math.max(20,accuracy))return {accepted:false,reason:'Course match uncertain — position held',nearest};
      if(!previous) {
        for(let i=0;i<route.length-1;i++) {
          const q=project(coords.latitude,coords.longitude,route[i],route[i+1]);
          const meters=cum[i]+q.t*(cum[i+1]-cum[i]);
          if(Math.abs(meters-best.meters)>250&&q.dist<=best.dist+Math.max(12,accuracy))return {accepted:false,reason:'Shared course section — select KM, then GPS AUTO',nearest};
        }
      }
      const meters=previous&&Math.abs(best.meters-previous.meters)<3?previous.meters:best.meters;
      return {...best,meters,km:meters/1000,time,accepted:true,nearest};
    }
    return {mappedKm,clamp,pointAt,slice,index,planned,project,match};
  }
  function clock(sec) {sec=Math.max(0,Math.round(sec));const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return (h?h+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');}
  const api={create,clock};if(typeof module!=='undefined')module.exports=api;else root.RaceCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
