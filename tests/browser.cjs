const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve.cjs');
const data=require('../course-data.js'),core=require('../race-core.js').create(data);
const out=path.join(__dirname,'results');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
 const results=[],errors=[];
 try {
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});
  // Block external resources: all normal tests must work with no CDN or street tile service.
  await context.route(/https:\/\/.*/,r=>r.abort());
  await context.addInitScript(()=>{
   let success,error,next=0;
   Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition(ok,bad){success=ok;error=bad;return ++next;},clearWatch(){success=null;error=null;}}});
   window.testFix=(coords)=>success?.({coords,timestamp:Date.now()});window.testGpsError=code=>error?.({code});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();await page.goto(url);await page.waitForFunction(()=>typeof core!=='undefined'&&document.querySelector('#elev path'));
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
  await page.waitForFunction(()=>document.querySelector('#mapStatus').textContent.includes('route only'));
  assert.equal(await page.locator('#kmTitle').innerText(),'KM 1');
  results.push('Local Leaflet loads; blocked street tiles switch to route-only map');
  async function fix(km,accuracy=8){const [latitude,longitude]=core.pointAt(km);await page.evaluate(coords=>window.testFix(coords),{latitude,longitude,accuracy,heading:null,speed:null});}
  await page.locator('#timerBtn').click();await fix(0);
  assert.match(await page.locator('#gpsStatus').innerText(),/matched/);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('race-day-state-v2')));assert.ok(saved.start);
  await page.reload();await fix(.01);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('race-day-state-v2')).start),saved.start);
  assert.equal(await page.locator('#timerBtn').innerText(),'RACE TIMER RUNNING');
  results.push('Start timestamp and race progress survive reload');
  await page.locator('#prevBtn').click();assert.match(await page.locator('#mode').innerText(),/MANUAL MODE/);
  await page.locator('#nextBtn').click();assert.equal(await page.locator('#kmTitle').innerText(),'KM 2');await fix(.02);assert.equal(await page.locator('#kmTitle').innerText(),'KM 2');
  await page.reload();assert.match(await page.locator('#mode').innerText(),/MANUAL MODE/);
  await page.locator('#autoBtn').click();await fix(1.05);assert.match(await page.locator('#mode').innerText(),/GPS AUTO/);assert.equal(await page.locator('#distance').innerText(),'1.05 km');
  results.push('Manual selection persists, ignores GPS updates, and re-anchors with GPS AUTO');
  const held=await page.locator('#distance').innerText();await page.waitForTimeout(10);await fix(17);assert.equal(await page.locator('#distance').innerText(),held);assert.match(await page.locator('#warning').innerText(),/held|uncertain/);
  await page.waitForTimeout(10);await fix(1.07,120);assert.equal(await page.locator('#distance').innerText(),held);assert.match(await page.locator('#warning').innerText(),/accuracy/);
  await page.waitForTimeout(10);await page.evaluate(()=>window.testFix({latitude:61,longitude:25,accuracy:8}));assert.match(await page.locator('#warning').innerText(),/POSSIBLY OFF ROUTE/);assert.equal(await page.locator('#distance').innerText(),held);
  await page.evaluate(()=>window.testGpsError(1));assert.match(await page.locator('#gpsStatus').innerText(),/permission denied/);
  results.push('Impossible jumps, poor accuracy, off-route and permission-denied states handled');
  // Seed just before a kilometre boundary to test real geolocation callback transitions.
  await page.evaluate(()=>{state.mode='auto';state.km=.99;state.match={meters:990,time:Date.now()};persist();});await page.reload();await fix(.995);assert.equal(await page.locator('#kmTitle').innerText(),'KM 1');
  const oldCursor=await page.locator('#elevCursor').getAttribute('x1');await page.waitForTimeout(10);await fix(1.005);assert.equal(await page.locator('#kmTitle').innerText(),'KM 2');assert.notEqual(await page.locator('#elevCursor').getAttribute('x1'),oldCursor);
  await page.waitForTimeout(10);await fix(.998);assert.equal(await page.locator('#kmTitle').innerText(),'KM 2');
  results.push('GPS kilometre transition, elevation cursor and boundary hysteresis');
  // A programmatic zoom must not disable follow. A real drag must disable it.
  await page.locator('#recenterBtn').click();assert.equal(await page.evaluate(()=>follow),true);
  const box=await page.locator('#map').boundingBox();await page.mouse.move(box.x+box.width*.55,box.y+box.height*.6);await page.mouse.down();await page.mouse.move(box.x+box.width*.7,box.y+box.height*.4,{steps:5});await page.mouse.up();assert.equal(await page.evaluate(()=>follow),false);
  await page.locator('#recenterBtn').click();await page.waitForTimeout(10);await fix(1.01);assert.equal(await page.evaluate(()=>follow),true);
  const yFraction=await page.evaluate(()=>map.latLngToContainerPoint(userMarker.getLatLng()).y/map.getSize().y);assert.ok(yFraction>.6&&yFraction<.72);
  results.push('Drag pauses follow; RECENTER restores follow with runner below centre');
  await page.locator('#settings').evaluate(e=>e.open=true);
  page.once('dialog',d=>d.dismiss());await page.locator('#resetBtn').click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('race-day-state-v2')).start),saved.start);
  results.push('Reset cancellation preserves active timer');
  const real=await page.evaluate(()=>localStorage.getItem('race-day-state-v2'));
  await page.locator('#simToggle').check();assert.match(await page.locator('#mode').innerText(),/SIMULATION/);
  async function simulate(km){await page.locator('#simDistance').evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},km);}
  for(let km=0;km<=21;km++){await simulate(km);assert.equal(await page.locator('#pace').innerText(),data.plan[Math.min(km,20)].pace);assert.equal(await page.locator('#kmTitle').innerText(),km===21?'FINAL 100 m':`KM ${km+1}`);assert.equal(await page.locator('#targetNow').innerText(),require('../race-core.js').clock(core.planned(km)));}
  await simulate(10);await page.locator('#simOffset').fill('31');assert.equal(await page.locator('#delta').innerText(),'Behind 00:31');await page.locator('#simOffset').fill('-23');assert.equal(await page.locator('#delta').innerText(),'Ahead 00:23');
  await simulate(21.1);assert.equal(await page.locator('#remain').innerText(),'0.00 km');assert.equal(await page.locator('#targetNow').innerText(),'1:57:51');assert.equal(await page.evaluate(()=>localStorage.getItem('race-day-state-v2')),real);
  await page.locator('#simToggle').uncheck();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('race-day-state-v2')).start),saved.start);
  results.push('All simulation splits, final 100 m, ahead/behind offsets and isolation');
  // Typical race view and all requested mobile widths; inspect actual DOM geometry too.
  await page.locator('#simToggle').check();await simulate(15.4);await page.locator('#settings').evaluate(e=>e.open=false);
  for(const width of [375,390,430]) {
   await page.setViewportSize({width,height:844});await page.evaluate(()=>scrollTo(0,0));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   const note=await page.locator('#note').boundingBox();assert.ok(note.y+note.height<844);
   const small=await page.locator('button:visible,summary:visible').evaluateAll(els=>els.filter(e=>e.getBoundingClientRect().height<44).map(e=>e.id));assert.deepEqual(small,[]);
   await page.screenshot({path:path.join(out,`race-${width}.png`),fullPage:true});
  }
  results.push('375, 390, 430 px: no horizontal overflow, instruction in first screen, controls >=44 px');
  await page.locator('#settings').evaluate(e=>e.open=true);await page.locator('#simToggle').uncheck();
  await context.setOffline(true);await page.reload();await page.waitForFunction(()=>document.querySelector('#elev path'));
  assert.ok(await page.locator('.leaflet-overlay-pane path').count()>0);assert.match(await page.locator('#mapStatus').innerText(),/route only/);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('race-day-state-v2')).start),saved.start);
  await page.locator('#prevBtn').click();assert.match(await page.locator('#mode').innerText(),/MANUAL MODE/);
  const next=await context.newPage();await next.goto(url);assert.ok(await next.locator('.leaflet-overlay-pane path').count()>0);await next.close();
  results.push('Service worker offline reload AND new page: course, elevation, manual controls and timer restored');
  await context.setOffline(false);await page.locator('#settings').evaluate(e=>e.open=true);page.once('dialog',d=>d.accept());await page.locator('#resetBtn').click();assert.equal(await page.locator('#timerBtn').innerText(),'START RACE');
  results.push('Confirmed RESET RACE clears timer and progress');
  await page.locator('#timerBtn').click();await fix(0);await page.clock.fastForward(22000);
  assert.match(await page.locator('#gpsStatus').innerText(),/stale/);assert.match(await page.locator('#delta').innerText(),/GPS needed/);assert.equal(await page.locator('#distance').innerText(),'0.00 km');
  await page.waitForTimeout(10);await fix(.01);assert.match(await page.locator('#gpsStatus').innerText(),/matched/);
  results.push('20-second GPS silence holds progress/comparison; fresh GPS recovers');
  // Startup without Leaflet must still present a route and working strategy.
  const fallback=await browser.newContext({serviceWorkers:'block'});await fallback.route('**/vendor/leaflet.js',r=>r.abort());await fallback.addInitScript(()=>Object.defineProperty(navigator,'geolocation',{value:{watchPosition(){return 1;},clearWatch(){}}}));const fp=await fallback.newPage();fp.on('pageerror',e=>errors.push(e.message));await fp.goto(url);assert.equal(await fp.locator('.mapFallback').count(),1);await fp.locator('#nextBtn').click();assert.equal(await fp.locator('#kmTitle').innerText(),'KM 2');await fallback.close();results.push('Leaflet failure: local SVG fallback and manual strategy remain functional');
  const resilience=await browser.newContext({serviceWorkers:'block'});await resilience.route(/https:\/\/.*/,r=>r.abort());
  await resilience.addInitScript(()=>{
   Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError');}});
   Object.defineProperty(navigator,'wakeLock',{value:{async request(){throw new DOMException('Refused','NotAllowedError');}}});
   Object.defineProperty(navigator,'geolocation',{value:{watchPosition(){return 1;},clearWatch(){}}});
  });
  const rp=await resilience.newPage();rp.on('pageerror',e=>errors.push(e.message));await rp.goto(url);await rp.locator('#nextBtn').click();assert.equal(await rp.locator('#kmTitle').innerText(),'KM 2');await rp.bringToFront();await rp.evaluate(()=>requestWake());assert.match(await rp.locator('#wakeStatus').textContent(),/unavailable or refused/);await rp.locator('#timerBtn').click();assert.equal(await rp.locator('#timerBtn').innerText(),'RACE TIMER RUNNING');await resilience.close();
  results.push('Blocked localStorage and refused wake lock do not break race controls');
  const brokenServer=createServer(),handler=brokenServer.listeners('request')[0];brokenServer.removeAllListeners('request');brokenServer.on('request',(req,res)=>{if(req.url==='/README.md'){res.writeHead(503);res.end('Test cache failure');}else handler(req,res);});await new Promise(resolve=>brokenServer.listen(0,'127.0.0.1',resolve));
  const bc=await browser.newContext();await bc.route(/https:\/\/.*/,r=>r.abort());const bp=await bc.newPage();bp.on('pageerror',e=>errors.push(e.message));
  try{await bp.goto(`http://127.0.0.1:${brokenServer.address().port}`);await bp.waitForFunction(()=>document.querySelector('#offlineStatus').textContent.includes('installation failed'));assert.ok(await bp.locator('#elev path').count()>0);}finally{await bc.close();brokenServer.close();}
  results.push('A failed precache asset produces visible offline-installation failure');
  const subServer=createServer(),subHandler=subServer.listeners('request')[0];subServer.removeAllListeners('request');subServer.on('request',(req,res)=>{if(!req.url.startsWith('/race/')){res.writeHead(404);res.end();return;}req.url=req.url.slice(5);subHandler(req,res);});await new Promise(resolve=>subServer.listen(0,'127.0.0.1',resolve));
  const sc=await browser.newContext();await sc.route(/https:\/\/.*/,r=>r.abort());const sp=await sc.newPage();sp.on('pageerror',e=>errors.push(e.message));
  try{await sp.goto(`http://127.0.0.1:${subServer.address().port}/race/`);await sp.evaluate(()=>navigator.serviceWorker.ready);await sp.waitForFunction(()=>navigator.serviceWorker.controller!==null);await sc.setOffline(true);await sp.reload();assert.equal(await sp.locator('#kmTitle').innerText(),'KM 1');assert.ok(await sp.locator('.leaflet-overlay-pane path').count()>0);}finally{await sc.close();subServer.close();}
  results.push('GitHub Pages-style /race/ subfolder: assets and service worker survive offline reload');
  assert.deepEqual(errors,[]);results.push('No uncaught JavaScript errors in integration run');
  fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({browser:await browser.version(),results,errors},null,2));console.log(results.map(x=>'PASS '+x).join('\n'));
 } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
