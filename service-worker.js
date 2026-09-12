'use strict';
// Bump the version whenever a bundled asset changes. Updates wait for old clients to close.
const CACHE='race-day-v2.2';
const ASSETS=['./','./index.html','./styles.css','./course-data.js','./race-core.js','./app.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./vendor/leaflet.js','./vendor/leaflet.css','./README.md'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const names=await caches.keys();
  await Promise.all(names.filter(name=>name.startsWith('race-day-')&&name!==CACHE).map(name=>caches.delete(name)));
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  // No tile precaching or custom tile cache. The provider's ordinary HTTP cache applies.
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  const scope=new URL(self.registration.scope);
  if(!ASSETS.some(asset=>new URL(asset,scope).pathname===url.pathname)&&request.mode!=='navigate')return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const cached=await cache.match(request,{ignoreSearch:true});
    if(cached)return cached;
    try{return await fetch(request);}catch {
      if(request.mode==='navigate')return await cache.match('./index.html');
      return new Response('Offline asset unavailable',{status:503});
    }
  })());
});
