# Half Marathon Race Day Assistant

Personal iPhone race aid for 27 September 2026. Static website; no build step, account, backend, telemetry or upload of your GPS location. Street tiles are requested from OpenStreetMap when enabled, which reveals the viewed map area to that provider.

## Course data — read before race day

The original 21 pacing entries, notes, 414 route coordinates, cumulative distances, 85 elevation samples and 21 kilometre markers are unchanged in `course-data.js`.

**The supplied geometry and elevation end at exactly 21.000 km, not 21.100 km.** No finish geometry has been invented or stretched. GPS course progress cannot exceed 21.00 km with this data. At the 21 km sign, use **+ KM** to show FINAL 100 m / ALL IN and follow the marked race course. The final section's 0.10 km remaining is an estimate, not a GPS countdown. Simulation can reach 21.10 km, but the plotted position remains at the last supplied coordinate and no elevation is invented.

The supplied pacing plan totals **1:57:20 at 21 km**. Extending its existing final 5:10/km pace over 100 m gives **1:57:51**, approximately the requested 1:57:50. The old calculation incorrectly stopped adding time at 21 km. This arithmetic is fixed without changing any pacing entries. The elevation profile is sampled every 250 m; it cannot show every small rise or an exact hill crest. The displayed minimum vertical span is 20 m, with metres and kilometre axes.

## Run locally

With Node.js installed, run `node serve.cjs` in this folder, then open **http://localhost:8765**. Localhost supports browser geolocation and service workers on the same computer. A phone opening a computer's plain HTTP LAN address does not get the same secure-context exception; use the HTTPS deployment for iPhone testing.

## Deploy over HTTPS with GitHub Pages

1. Sign in to GitHub and create a new **public repository**, for example `half-marathon-race-day`. Public means the course and strategy can be read by anyone. Do not upload credentials or private files.
2. Choose **Add file → Upload files**. Upload `index.html`, `styles.css`, `app.js`, `race-core.js`, `course-data.js`, `manifest.webmanifest`, `service-worker.js`, `icon-192.png`, `icon-512.png`, `README.md`, and the complete `vendor` folder. Preserve that folder's name and contents. Commit to `main`. No npm install or compilation is needed. Alternatively push this folder with Git; tests and documentation may also be published.
3. Open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, branch **main**, folder **/(root)**, then **Save**.
4. Wait for the Pages deployment to succeed. Open the exact HTTPS URL shown there, normally `https://YOUR-USERNAME.github.io/half-marathon-race-day/`.
5. Ensure **Enforce HTTPS** is enabled when available. Test that the URL loads the map, strategy and Settings panel.
6. In Settings, wait for **Core app saved for offline use**, then close and reopen. Test an offline reopen before relying on it.

GitHub's current [publishing-source instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) describe these branch settings. This folder has been prepared for deployment; it has not been published to your account.

For future updates, change the `CACHE` version in `service-worker.js` whenever a bundled file changes, upload the complete changed files, and open the app online. An update waits for all old app windows/tabs to close so it does not replace code mid-race. Close the Home Screen app and any Safari tabs for the site, reopen online, then verify offline again. Avoid deployments on race morning.

## Install on iPhone

1. Update iOS before testing. Open the deployed **HTTPS** address in Safari.
2. Allow location access. If asked, enable **Precise Location**.
3. Tap Safari's **Share** button → **Add to Home Screen** (it may be under More). Name it Race Day and tap **Add**. If shown, leave **Open as Web App** enabled.
4. Open the new Home Screen icon. Allow location again if prompted: the installed app can have separate permissions/storage from your Safari tab.
5. In the installed app's Settings, wait for offline readiness. Close and reopen the installed app once, then perform the airplane-mode test below.

Do not assume installing from Safari has prepared the installed app's separate storage. Verify from the icon you will actually use.

Apple's [Home Screen installation guide](https://support.apple.com/en-kw/guide/iphone/iphea86e5236/ios) and [Location Services guide](https://support.apple.com/en-gb/guide/iphone/iph3dd5f9be/ios) cover these device controls.

## GPS and manual fallback

Open the app outdoors; GPS starts automatically unless you previously stopped it. **GPS ±XX m · matched**, **GPS AUTO**, a blue dot with accuracy circle, and changing course distance indicate an accepted fix. The blue dot is the raw GPS location; the small outlined dot and dashed connector associate it with the course. A circle roughly covering nearby streets means weak precision. Grey numbered markers are kilometre *end* signs; KM 1 means the section from 0 to 1 km.

At home, being far from this course should produce **POSSIBLY OFF ROUTE**, not fabricated progress. The route remains visible. A good real GPS match requires being on the supplied route. Accuracy over 65 m is rejected for automatic progress. A fix older than 20 seconds is stale. Ahead/behind is withheld when the course position is not trusted.

The course revisits several locations. Matching uses distance to each segment, previous progress, time between fixes, a generous maximum forward speed, a bounded backward allowance, and heading when moving. A small 3 m dead band reduces jitter. It permits backward movement. Without history at an overlapping section, it asks you to choose a kilometre; it will not guess between early and late race sections. After a long gap or a rejected impossible jump, use manual selection to re-anchor.

If GPS fails:

1. Use **− KM / + KM** to select the section you are running. At the 6 km sign select **KM 7**. **MANUAL MODE** is explicit; position, terrain cursor and plan time are approximate from the section start.
2. Continue using the displayed pace and tactical instruction. GPS callbacks cannot override your manual selection. The timer still runs.
3. When ready, press **GPS AUTO**. This searches within the section you selected for a fresh GPS match. If the selected section was wrong, correct it manually and retry.
4. **RECENTER** only restores map following; it does not silently exit manual mode. Panning, pinching or zooming pauses follow. The map stays north-up, with the runner below centre during follow. It does not rotate.
5. For denied permission, check **Settings → Privacy & Security → Location Services**, and the Safari Websites/installed web app entry where available; enable access while using and Precise Location. Site-level Safari location permissions may also need changing. Return and press **Retry GPS**.

## Timer and simulation

Press **START RACE** as you cross the start line. It stores the wall-clock start timestamp and anchors course progress at the start. **Ahead 00:23** means 23 seconds faster than planned at the matched position; **Behind 00:31** means 31 seconds slower. Tactical instructions remain authoritative. The timer continues through reloads and time spent in another app. It is not an official race clock; changing the phone clock can affect elapsed time.

**RESET RACE** is inside Settings and asks for confirmation. It clears race start and progress while preserving preferences. There is no automatic timer reset or inferred GPS finish; at the finish, use your watch/official timing for the result, then reset deliberately when finished with the aid.

Under **Settings & simulation → Enable simulation**, slide from 0 to 21.1 km or press **Play course** (100 m per second). Set a positive offset to test Behind and a negative offset to test Ahead. Verify every strategy, highlight, elevation cursor and plan time. Simulation pauses GPS and cannot start or reset the real timer. Exit simulation to restore real progress; a fresh GPS fix is required. Simulation is deliberately not persisted and a reload returns to the real race.

## Offline and battery behaviour

All strategy, course, elevation, UI and Leaflet code are local and precached. There is no CDN dependency. Core installation fails visibly if an asset cannot be cached. OpenStreetMap street tiles are optional: when offline or a tile fails, the app uses a gridded route-only map. It still shows the route, highlighted section, GPS and accuracy. Turn **Street map when online** off to save tile requests or test the fallback. No bulk tile download or custom tile cache is implemented. If even Leaflet fails to load, a simple local SVG route diagram remains, with strategy/timer/manual functionality.

Offline storage can be removed by iOS or by clearing website data, and the first install needs internet. Readiness is not a substitute for an offline reopen test on the actual phone. GPS can work without mobile data but may take longer to acquire. Keep Location Services enabled when testing airplane mode.

GPS uses one high-accuracy watch. Timing updates once per second; hidden-page rendering and simulation playback pause. Strategy/highlight rendering only changes on section transitions; elevation redraws after roughly 5 m movement. No continuous animation or rotation. Test battery drain on your own phone before the two-hour race.

## Screen awake and iOS limitations

**Keep screen awake** uses feature detection and handles permission/refusal/release. It reacquires when the app becomes visible. Check the status text rather than assuming it worked. Apple documents Home Screen Screen Wake Lock support starting with [iOS/iPadOS 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/).

iOS may still suspend GPS when the app is backgrounded or the screen is locked. A PWA cannot guarantee background tracking or defeat a manually locked screen. The timer recovers from its timestamp, but lost GPS samples cannot be reconstructed. For race day, test **Settings → Display & Brightness → Auto-Lock → Never** if available, turn off Low Power Mode if it prevents your intended awake behaviour, and restore normal settings afterwards. Device/organisation policies may restrict these options. Keep the app visible and check wake status after interruptions.

Apple documents the display controls in [Keep the iPhone display on longer](https://support.apple.com/en-ie/guide/iphone/iph7117338a8/ios).

## Pre-race test checklist

- [ ] Confirm this is the intended course; resolve the missing final 100 m with an authoritative GPX if you want mapped finish guidance. The supplied course has been preserved.
- [ ] Install the deployed HTTPS app on the actual iPhone; grant precise location from the Home Screen app.
- [ ] Run simulation across all 21 kilometres and final 100 m. Check climbs at KM 11, 14 and 16, and the final progression to ALL IN.
- [ ] Test offsets +31 and −23 seconds: Behind 00:31 and Ahead 00:23 at a mid-race position.
- [ ] Exit simulation. Outdoors on the actual route, verify GPS accuracy, blue dot, matched course distance and an automatic kilometre transition. At an overlap, select your true section then GPS AUTO.
- [ ] Pan/zoom, confirm follow pauses, then RECENTER and walk; it must follow again.
- [ ] Start a practice timer, reload and fully close/reopen; confirm elapsed time includes the gap. Cancel RESET RACE once and verify it keeps running, then confirm reset after practice.
- [ ] Test manual KM selection and return to GPS AUTO. Confirm the selected strategy does not change while in manual mode.
- [ ] **Offline test:** while online, wait for offline readiness in the installed app. Close it, enable airplane mode and disable Wi-Fi, then reopen from Home Screen. Confirm route, strategy and terrain render. Test simulation. With Location Services on, test GPS outdoors. Turn Street map off to explicitly test the route-only mode too.
- [ ] Reconnect, exit simulation and reset practice state. Check wake lock and measure battery use during a long outing. Real iOS field testing remains necessary; desktop emulation cannot validate radio, GPS or OS suspension behaviour.

## Race morning checklist

- [ ] Charge phone; confirm Location Services/Precise Location and intended screen-awake setting.
- [ ] Open the installed app online early; verify offline readiness, then leave this tested version alone.
- [ ] Ensure simulation is **off**. Clear any practice timer with the confirmed RESET RACE control.
- [ ] At the start, check GPS accuracy and location. If the start/finish overlap confuses initial matching, START RACE anchors the start; manual KM 1 → GPS AUTO is also available.
- [ ] Press START RACE at the line. Check elapsed time is increasing.
- [ ] Keep the app visible. Glance at KM, TARGET, ACTION and terrain. Follow effort instructions on climbs.
- [ ] If GPS becomes unreliable, use − KM / + KM against course signs. At 21 km, + KM shows the unmapped final 100 m.
- [ ] After the race, restore your normal Auto-Lock setting.

## Development tests

`node --test tests/core.test.cjs` runs pure calculation and GPS replay tests without packages. `node tests/browser.cjs` runs browser integration tests with Playwright installed (set `PLAYWRIGHT_MODULE` to its module path if not installed locally). `BROWSER_CHANNEL=msedge` can select installed Edge; otherwise the script uses Chromium. See `AUDIT.md` for actual results and remaining validation limits.
