'use strict';
const core=RaceCore.create({route,cum,plan,COURSE_KM}),$=id=>document.getElementById(id);
const STORE='race-day-state-v2';
const fresh=()=>({version:2,mode:'auto',km:0,known:false,start:null,match:null,tiles:true,wake:true,gps:true});
let state=fresh(),storageOK=true;
try {
  const saved=JSON.parse(localStorage.getItem(STORE));
  if(saved&&saved.version===2) {
    state={...fresh(),...saved};
    state.km=Number.isFinite(state.km)?core.clamp(state.km,0,COURSE_KM):0;
    state.mode=state.mode==='manual'?'manual':'auto';
    state.start=Number.isFinite(state.start)&&state.start>0&&state.start<=Date.now()?state.start:null;
    state.known=state.known===true;
    if(!state.match||!Number.isFinite(state.match.meters)||!Number.isFinite(state.match.time)||state.match.time>Date.now()||state.match.meters<0||state.match.meters>21000)state.match=null;
  }
} catch {storageOK=false;}
let sim=false,simKm=0,simInterval=null,watchId=null,gpsGeneration=0,lastFix=null,lastAccepted=0,fixReliable=false,gpsMessage='Connecting GPS…';
let map=null,wholeLine,activeLine,nextLine,tiles,userMarker,accuracyCircle,snapMarker,association,markers=[];
let follow=true,programmatic=false,tileFailed=false,lastSection=-1,lastElevKey='',wakeLock=null,wakePending=false;
function persist(){if(sim)return;try{localStorage.setItem(STORE,JSON.stringify(state));}catch{storageOK=false;$('offlineStatus').textContent='Race state cannot be saved in this browser. Keep the app open.';}}
function position(){return sim?simKm:state.km;}
function stage(km){return km>=21?21:core.index(km);}
function displayStage(km){const next=stage(km);return !sim&&state.mode==='auto'&&lastSection>0&&next===lastSection-1&&km>lastSection-.012?lastSection:next;}
function warn(message){$('warning').hidden=!message;$('warning').textContent=message;}
function moveMap(fn){programmatic=true;try{fn();}finally{programmatic=false;}}
function followPosition(force=false) {
  if(!map||!follow)return;
  const ll=sim?core.pointAt(simKm):lastFix?[lastFix.coords.latitude,lastFix.coords.longitude]:core.pointAt(state.km);
  const zoom=force?16:Math.max(15,map.getZoom());
  const pt=map.project(ll,zoom).subtract([0,map.getSize().y*.16]);
  moveMap(()=>map.setView(map.unproject(pt,zoom),zoom,{animate:false}));
}
function pauseFollow(){if(programmatic)return;follow=false;$('recenterBtn').textContent='RECENTER';}
function initMap() {
  if(typeof L==='undefined')return;
  map=L.map('map',{zoomControl:false,attributionControl:true,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false});
  L.control.zoom({position:'bottomright'}).addTo(map);
  wholeLine=L.polyline(route,{color:'#64748b',weight:6,opacity:.45}).addTo(map);
  nextLine=L.polyline([],{color:'#3c7187',weight:7,opacity:.65,dashArray:'6 7'}).addTo(map);
  activeLine=L.polyline([],{color:'#2563eb',weight:9,opacity:1}).addTo(map);
  markers=kmPoints.map((p,i)=>L.marker(p,{interactive:false,icon:L.divIcon({className:'',html:`<div class="kmMarker">${i+1}</div>`,iconSize:[26,26],iconAnchor:[13,13]})}).addTo(map));
  moveMap(()=>map.fitBounds(wholeLine.getBounds(),{padding:[28,45]}));
  map.on('dragstart zoomstart',pauseFollow);
  // Native gestures stop follow immediately, including a pinch or wheel before zoom finishes.
  $('map').addEventListener('wheel',pauseFollow,{passive:true});
  $('map').addEventListener('touchstart',e=>{if(e.touches.length>1)pauseFollow();},{passive:true});
  updateTiles();
}
function updateTiles() {
  const enabled=state.tiles&&navigator.onLine&&!tileFailed;
  if(map) {
    if(!enabled&&tiles&&map.hasLayer(tiles))map.removeLayer(tiles);
    if(enabled) {
      if(!tiles) {
        tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',keepBuffer:1,updateWhenIdle:true});
        tiles.on('tileerror',()=>{tileFailed=true;updateTiles();});
      }
      if(!map.hasLayer(tiles))tiles.addTo(map);
    }
  }
  $('mapStatus').textContent=!map?'Course diagram · north up':enabled?'North up · street map':'North up · route only (no street tiles)';
}
// Last-resort vector diagram also works if the local Leaflet file is missing/corrupt.
function fallbackMap() {
  if(map)return;
  const lats=route.map(p=>p[0]),lons=route.map(p=>p[1]);
  const minX=Math.min(...lons),maxX=Math.max(...lons),minY=Math.min(...lats),maxY=Math.max(...lats);
  const scale=Math.min(360/((maxX-minX)*Math.cos(minY*Math.PI/180)),210/(maxY-minY));
  const xy=p=>[200+(p[1]-(minX+maxX)/2)*Math.cos(minY*Math.PI/180)*scale,135-(p[0]-(minY+maxY)/2)*scale];
  const points=arr=>arr.map(p=>xy(p).join(',')).join(' '),idx=core.index(position()),p=plan[idx];
  const here=xy(core.pointAt(position()));
  const raw=lastFix&&!sim?xy([lastFix.coords.latitude,lastFix.coords.longitude]):null;
  $('map').innerHTML=`<svg class="mapFallback" viewBox="0 0 400 270" role="img" aria-label="Offline course diagram"><polyline points="${points(route)}" fill="none" stroke="#64748b" stroke-width="3"/><polyline points="${points(core.slice(p.start,p.end))}" fill="none" stroke="${p.color}" stroke-width="5"/>${state.known||sim?`<circle cx="${here[0]}" cy="${here[1]}" r="5" fill="#0785ce" stroke="white" stroke-width="2"/>`:''}${raw?`<circle cx="${raw[0]}" cy="${raw[1]}" r="6" fill="none" stroke="#0785ce" stroke-width="3"/>`:''}</svg>`;
  updateTiles();
}
function drawStrategy() {
  const km=position(),section=displayStage(km),idx=Math.min(20,section),p=plan[idx];
  if(section===lastSection)return;
  lastSection=section;
  document.documentElement.style.setProperty('--strategy',p.color);
  $('kmTitle').textContent=section===21?'FINAL 100 m':`KM ${p.km}`;
  $('kmTitle').style.fontSize=section===21?'30px':'';
  $('pace').textContent=p.pace;$('action').textContent=p.action;
  $('note').textContent=section===21?'ALL IN. Follow the marked finish route — final 100 m is not mapped.':p.note;
  const n=plan[idx+1];$('nextText').textContent=n?`KM ${n.km} · ${n.pace}/km · ${n.action}`:section===21?'FINISH · ALL IN':'Final ~100 m · ALL IN';
  if(map) {
    activeLine.setStyle({color:p.color});activeLine.setLatLngs(section===21?[]:core.slice(p.start,p.end));
    nextLine.setLatLngs(n?core.slice(n.start,n.end):[]);
    markers.forEach((m,i)=>{const element=m.getElement()?.firstElementChild;if(element)element.className='kmMarker'+(i===idx?' active':i===idx+1?' nextMarker':'');m.setZIndexOffset(i===idx?500:0);});
  }
}
function elevationAt(km) {
  const i=Math.min(profile.length-2,Math.max(0,Math.floor(km/.25)));
  const a=profile[i],b=profile[i+1],t=core.clamp((km-a[0])/(b[0]-a[0]),0,1);
  return a[1]+t*(b[1]-a[1]);
}
function drawElevation() {
  const km=position(),idx=Math.min(20,displayStage(km)),start=Math.max(0,Math.min(idx-.2,19)),end=Math.min(21,start+2.3);
  const key=`${idx}:${sim||state.known}:${Math.round(km*1000/5)}`;
  if(lastElevKey===key)return;lastElevKey=key;
  const pts=[[start,elevationAt(start)],...profile.filter(p=>p[0]>start&&p[0]<end),[end,elevationAt(end)]];
  const emin=Math.floor((Math.min(...pts.map(p=>p[1]))-3)/5)*5;
  const emax=Math.max(emin+20,Math.ceil((Math.max(...pts.map(p=>p[1]))+3)/5)*5);
  const x=k=>43+(k-start)/(end-start)*363,y=e=>132-(e-emin)/(emax-emin)*102;
  let html=`<rect x="${x(Math.max(start,idx))}" y="30" width="${Math.max(0,x(Math.min(end,idx+1))-x(Math.max(start,idx)))}" height="102" fill="${plan[idx].color}" opacity=".18"/>`;
  for(let e=emin;e<=emax;e+=10)html+=`<line x1="43" x2="406" y1="${y(e)}" y2="${y(e)}" stroke="#3a4d63"/><text x="37" y="${y(e)+4}" text-anchor="end" fill="#c7d5e7" font-size="12">${e} m</text>`;
  for(let k=Math.ceil(start*2)/2;k<=end;k+=.5)html+=`<text x="${x(k)}" y="153" text-anchor="middle" fill="#c7d5e7" font-size="12">${k.toFixed(1)}</text>`;
  html+=`<text x="406" y="165" text-anchor="end" fill="#c7d5e7" font-size="10">km</text><path d="${pts.map((p,i)=>`${i?'L':'M'}${x(p[0])},${y(p[1])}`).join(' ')}" fill="none" stroke="#83dafa" stroke-width="3"/>`;
  if((state.known||sim)&&km<=21) {
    const xp=x(km);html+=`<line id="elevCursor" x1="${xp}" x2="${xp}" y1="25" y2="132" stroke="white" stroke-width="2" stroke-dasharray="3 3"/><circle cx="${xp}" cy="${y(elevationAt(km))}" r="5" fill="white"/><text x="${core.clamp(xp,96,351)}" y="17" text-anchor="middle" fill="white" font-size="12" font-weight="bold">${sim?'SIMULATED':state.mode==='manual'?'MANUAL ESTIMATE':'YOU ARE HERE'}</text>`;
  } else if(km>21)html+='<text x="230" y="17" text-anchor="middle" fill="#ffcf70" font-size="12">FINAL 100 m: NO ELEVATION DATA</text>';
  $('elev').innerHTML=html;$('elevRange').textContent=`${start.toFixed(1)}–${end.toFixed(1)} km`;
}
function updateTiming() {
  const km=position(),expected=core.planned(km),offset=core.clamp(Number($('simOffset').value)||0,-600,600);
  const elapsed=sim?Math.max(0,expected+offset):state.start===null?0:Math.max(0,(Date.now()-state.start)/1000);
  $('elapsed').textContent=RaceCore.clock(elapsed);
  $('targetNow').textContent=sim||state.known?RaceCore.clock(expected):'—';
  const reliable=sim||(state.mode==='auto'&&fixReliable&&Date.now()-lastAccepted<20000);
  if((sim||state.start!==null)&&reliable) {
    const delta=Math.round(elapsed-expected);$('delta').textContent=delta===0?'On plan':`${delta<0?'Ahead':'Behind'} ${RaceCore.clock(Math.abs(delta))}`;
  } else $('delta').textContent=state.start!==null?(state.mode==='manual'?'Manual estimate':'GPS needed'):'—';
  $('timerBtn').textContent=sim?'SIMULATION · timer isolated':state.start!==null?'RACE TIMER RUNNING':'START RACE';
  $('timerBtn').disabled=sim||state.start!==null;
}
function render() {
  const km=position();drawStrategy();drawElevation();fallbackMap();updateTiming();
  $('mode').textContent=sim?'SIMULATION · NOT LIVE GPS':state.mode==='manual'?'MANUAL MODE':fixReliable?'GPS AUTO':'GPS AUTO · position held';
  $('mode').parentElement.className='modebar'+(sim?' sim':state.mode==='manual'?' manual':'');
  $('autoBtn').hidden=sim||state.mode!=='manual';
  $('distance').textContent=state.known||sim?km.toFixed(2)+' km':'—';
  $('remain').textContent=state.known||sim?Math.max(0,COURSE_KM-km).toFixed(2)+' km':'—';
  $('courseProgress').style.width=km/COURSE_KM*100+'%';
  $('positionLabel').textContent=sim?'Simulated progress — real race state is unchanged.':state.mode==='manual'?'Approximate position from your selected section.':fixReliable?'GPS matched to the supplied course.':state.known?'Last known position — waiting for a reliable GPS match.':'No reliable position yet. Select a KM if the course overlaps.';
  if(km>=20.95)$('positionLabel').textContent+=' Map and GPS progress end at 21.00 km; use + KM for the unmapped final 100 m.';
  $('prevBtn').disabled=sim&&stage(km)===0;$('nextBtn').disabled=stage(km)===21;
  $('gpsBtn').disabled=sim;$('gpsStopBtn').disabled=sim;
}
function setManual(delta) {
  const selected=core.clamp(stage(position())+delta,0,21);
  if(sim){simKm=selected;$('simDistance').value=simKm;updateSimulation();return;}
  state.mode='manual';state.km=selected;state.known=true;fixReliable=false;follow=false;
  warn('MANUAL MODE — select your section, then GPS AUTO to resume.');persist();render();
  if(map)moveMap(()=>map.fitBounds(L.latLngBounds(core.slice(Math.min(selected,20),Math.min(selected+1,21))),{padding:[35,55],maxZoom:16}));
}
function plotFix(coords,matched) {
  if(!map){fallbackMap();return;}
  const ll=[coords.latitude,coords.longitude];
  if(!userMarker)userMarker=L.marker(ll,{zIndexOffset:1000,icon:L.divIcon({className:'',html:'<div class="youMarker"></div>',iconSize:[22,22],iconAnchor:[11,11]})}).addTo(map);else userMarker.setLatLng(ll);
  if(!accuracyCircle)accuracyCircle=L.circle(ll,{radius:coords.accuracy,color:'#0785ce',weight:1,fillOpacity:.08,interactive:false}).addTo(map);else accuracyCircle.setLatLng(ll).setRadius(coords.accuracy);
  if(matched) {
    const snapped=core.pointAt(matched.km);
    if(!snapMarker)snapMarker=L.circleMarker(snapped,{radius:4,color:'#fff',fillColor:'#087dc1',fillOpacity:1,weight:2,interactive:false}).addTo(map);else snapMarker.setLatLng(snapped);
    if(!association)association=L.polyline([ll,snapped],{color:'#0785ce',weight:2,dashArray:'3 5',interactive:false}).addTo(map);else association.setLatLngs([ll,snapped]);
  } else {if(snapMarker){map.removeLayer(snapMarker);snapMarker=null;}if(association){map.removeLayer(association);association=null;}}
}
function onGps(pos) {
  if(sim)return;
  const c=pos.coords,now=Date.now();
  if(!Number.isFinite(pos.timestamp)||now-pos.timestamp>20000||pos.timestamp>now+5000)return;
  if(lastFix&&pos.timestamp<=lastFix.timestamp)return;
  if(!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude)||Math.abs(c.latitude)>90||Math.abs(c.longitude)>180||!Number.isFinite(c.accuracy)||c.accuracy<0)return;
  lastFix=pos;
  const match=core.match(c,state.match,pos.timestamp);
  $('offRoute').textContent=match.nearest?Math.round(match.nearest.dist)+' m':'—';
  gpsMessage=`GPS ±${Math.round(c.accuracy)} m`;fixReliable=match.accepted&&state.mode==='auto';
  if(state.mode==='auto'&&match.accepted) {
    state.km=match.km;state.known=true;state.match={meters:match.meters,time:pos.timestamp};lastAccepted=now;
    gpsMessage+=' · matched';warn(state.km>=20.95?'Final 100 m is not mapped. Follow race signs; use + KM at 21 km.':'');persist();
  } else if(state.mode==='auto') {
    gpsMessage+=' · position held';warn((match.far?'POSSIBLY OFF ROUTE · '+Math.round(match.nearest.dist)+' m from course. ':match.reason+'. ')+'Use − KM / + KM if needed.');
  } else warn(match.far?`POSSIBLY OFF ROUTE · ${Math.round(match.nearest.dist)} m from course. MANUAL MODE remains active.`:'MANUAL MODE — GPS is not changing your selected strategy.');
  $('gpsStatus').textContent=gpsMessage;
  plotFix(c,state.mode==='auto'&&match.accepted?match:null);render();followPosition();
}
function gpsError(err) {
  fixReliable=false;
  gpsMessage=err?.code===1?'GPS permission denied':err?.code===3?'GPS signal timed out':'GPS unavailable';
  $('gpsStatus').textContent=gpsMessage;
  warn(gpsMessage+'. Use − KM / + KM. Allow Precise Location in iPhone Settings, then Retry GPS.');render();
}
function clearGps(){gpsGeneration++;if(watchId!==null&&navigator.geolocation)navigator.geolocation.clearWatch(watchId);watchId=null;}
function startGps() {
  if(sim)return;clearGps();state.gps=true;persist();
  if(!window.isSecureContext){gpsError();warn('GPS requires HTTPS (or localhost for development).');return;}
  if(!navigator.geolocation)return gpsError();
  $('gpsStatus').textContent='Connecting GPS…';const generation=gpsGeneration;
  watchId=navigator.geolocation.watchPosition(p=>{if(generation===gpsGeneration)onGps(p);},e=>{if(generation===gpsGeneration)gpsError(e);},{enableHighAccuracy:true,maximumAge:1000,timeout:15000});
}
function stopGps() {clearGps();state.gps=false;fixReliable=false;persist();$('gpsStatus').textContent='GPS stopped';warn('GPS stopped. Use manual KM controls or Retry GPS.');render();}
function resumeAuto() {
  state.match={meters:Math.min(state.km,20)*1000,time:Date.now(),seed:true};
  state.mode='auto';fixReliable=false;follow=true;lastFix=null;persist();warn('Matching GPS within your selected kilometre…');render();startGps();
}
async function requestWake() {
  if(!state.wake||document.visibilityState!=='visible'||wakeLock||wakePending)return;
  if(!('wakeLock' in navigator)){$('wakeStatus').textContent='Screen wake lock unavailable. Set Auto-Lock to Never before running.';return;}
  wakePending=true;
  try {
    const lock=await navigator.wakeLock.request('screen');
    if(!state.wake||document.visibilityState!=='visible'){await lock.release();return;}
    wakeLock=lock;$('wakeStatus').textContent='Screen wake lock active while this app is visible.';
    lock.addEventListener('release',()=>{if(wakeLock===lock)wakeLock=null;$('wakeStatus').textContent='Screen wake lock released. Tap Keep screen awake to retry.';});
  } catch {$('wakeStatus').textContent='Screen wake lock unavailable or refused. Set Auto-Lock to Never.';}
  finally {wakePending=false;}
}
function updateSimulation() {
  if(!sim)return;simKm=core.clamp(Number($('simDistance').value)||0,0,COURSE_KM);
  $('simReadout').textContent=simKm.toFixed(2)+' km';$('gpsStatus').textContent='SIMULATED · GPS paused';$('offRoute').textContent='—';
  warn(simKm>21?'SIMULATION · Final 100 m is not mapped.':'SIMULATION — real race timer and position are preserved.');
  plotFix({latitude:core.pointAt(simKm)[0],longitude:core.pointAt(simKm)[1],accuracy:0},simKm<=21?{km:simKm}:null);render();followPosition();
}
function stopPlayback(){clearInterval(simInterval);simInterval=null;$('simPlay').textContent='Play course';}
$('prevBtn').onclick=()=>setManual(-1);$('nextBtn').onclick=()=>setManual(1);
$('autoBtn').onclick=resumeAuto;$('gpsBtn').onclick=()=>{startGps();requestWake();};$('gpsStopBtn').onclick=stopGps;
$('recenterBtn').onclick=()=>{follow=true;followPosition(true);$('recenterBtn').textContent='FOLLOWING';requestWake();};
$('overviewBtn').onclick=()=>{follow=false;if(map)moveMap(()=>map.fitBounds(wholeLine.getBounds(),{padding:[30,55]}));$('recenterBtn').textContent='RECENTER';};
$('timerBtn').onclick=()=>{
  if(sim||state.start!==null)return;
  state.start=Date.now();state.km=0;state.known=true;state.mode='auto';state.match={meters:0,time:Date.now()};fixReliable=false;lastFix=null;follow=true;
  persist();render();startGps();requestWake();
};
$('resetBtn').onclick=()=>{
  if(sim){warn('Exit simulation before resetting your real race.');return;}
  if(!confirm('Reset the race timer and saved course position? This cannot be undone.'))return;
  const preferences={tiles:state.tiles,wake:state.wake,gps:state.gps};state={...fresh(),...preferences};lastFix=null;lastAccepted=0;fixReliable=false;lastSection=-1;lastElevKey='';
  for(const layer of [userMarker,accuracyCircle,snapMarker,association])if(layer&&map)map.removeLayer(layer);
  userMarker=accuracyCircle=snapMarker=association=null;$('offRoute').textContent='—';persist();warn('Race reset. Press START RACE only at the start line.');render();if(state.gps)startGps();
};
$('tilesToggle').checked=state.tiles;$('wakeToggle').checked=state.wake;
$('tilesToggle').onchange=()=>{state.tiles=$('tilesToggle').checked;tileFailed=false;persist();updateTiles();};
$('wakeToggle').onchange=async()=>{state.wake=$('wakeToggle').checked;persist();if(state.wake)requestWake();else{if(wakeLock)await wakeLock.release();$('wakeStatus').textContent='Screen wake lock off.';}};
$('simToggle').onchange=()=>{
  sim=$('simToggle').checked;stopPlayback();$('simControls').hidden=!sim;lastSection=-1;lastElevKey='';
  if(sim){clearGps();fixReliable=false;updateSimulation();}
  else {
    for(const layer of [userMarker,accuracyCircle,snapMarker,association])if(layer&&map)map.removeLayer(layer);
    userMarker=accuracyCircle=snapMarker=association=null;lastFix=null;fixReliable=false;$('offRoute').textContent='—';render();warn('Real race restored. Waiting for fresh GPS.');if(state.gps)startGps();else $('gpsStatus').textContent='GPS stopped';
  }
};
$('simDistance').oninput=updateSimulation;$('simOffset').oninput=updateSimulation;
$('simPlay').onclick=()=>{if(simInterval)return stopPlayback();if(simKm>=COURSE_KM){$('simDistance').value=0;updateSimulation();}$('simPlay').textContent='Pause';simInterval=setInterval(()=>{if(document.hidden)return;$('simDistance').value=Math.min(COURSE_KM,simKm+.1);updateSimulation();if(simKm>=COURSE_KM)stopPlayback();},1000);};
window.addEventListener('online',()=>{tileFailed=false;updateTiles();});window.addEventListener('offline',updateTiles);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){requestWake();updateTiming();if(!sim&&state.gps)startGps();}else{fixReliable=false;persist();}});
window.addEventListener('pageshow',e=>{if(e.persisted&&!sim&&state.gps)startGps();});
async function installOffline() {
  if(!('serviceWorker' in navigator)||!window.isSecureContext){$('offlineStatus').textContent='Offline installation needs HTTPS (or localhost).';return;}
  let timeout;
  try {
    const reg=await navigator.serviceWorker.register('./service-worker.js');
    // register() may succeed even when precaching later fails. Don't leave readiness pending forever.
    const failed=new Promise((_,reject)=>{
      timeout=setTimeout(()=>reject(new Error('Offline installation timed out')),20000);
      const installing=reg.installing;
      if(installing)installing.addEventListener('statechange',()=>{if(installing.state==='redundant')reject(new Error('Offline installation failed'));});
    });
    await Promise.race([navigator.serviceWorker.ready,failed]);
    const update=()=>{if(reg.waiting)$('offlineStatus').textContent='Update downloaded. Close all app windows, then reopen before race day.';};
    reg.addEventListener('updatefound',()=>reg.installing?.addEventListener('statechange',update));
    $('offlineStatus').textContent=storageOK?'Core app saved for offline use. Test an offline reopen on this device.':'Core app cached, but race state storage is unavailable.';
    if(!navigator.serviceWorker.controller)$('offlineStatus').textContent+=' Reopen once to finish setup.';
    update();
  } catch {$('offlineStatus').textContent='Offline installation failed. Reconnect and reload before race day.';}
  finally{clearTimeout(timeout);}
}
initMap();render();installOffline();
if(state.mode==='manual')warn('Restored MANUAL MODE. GPS AUTO resumes matching in your selected section.');
if(state.gps)startGps();else $('gpsStatus').textContent='GPS stopped';
requestWake();
setInterval(()=>{
  if(document.hidden)return;
  if(!sim&&state.gps&&lastFix&&Date.now()-lastFix.timestamp>20000) {
    if(fixReliable){fixReliable=false;render();}
    $('gpsStatus').textContent='GPS stale · '+Math.floor((Date.now()-lastFix.timestamp)/1000)+' s since fix';
    warn('GPS signal lost — last position held. Use manual KM controls if needed.');
  }
  updateTiming();
},1000);
