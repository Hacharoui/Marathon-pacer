# Audit and validation — 12 September 2026

## Original project inspected and run

All six supplied files were inspected: index.html (including embedded data and runtime), manifest.webmanifest, service-worker.js, README.txt, and both PNG icons (visually and by dimensions). The prototype was served locally and opened in Edge/Chromium at 390 × 844 before replacing runtime/UI code. The baseline screenshot is `audit-before.png`.

The local environment blocked the external unpkg requests. Browser resource errors were followed by **L is not defined**, which stopped all application initialization. There was also a harmless missing favicon request. No initial horizontal overflow occurred at 390 px. This failure provided a direct test case for removing the CDN dependency.

## Findings and implemented changes

| Area | Finding | Result |
| --- | --- | --- |
| Course data | 414 coordinates and 414 cumulative distances end at 21,000 m; 85 elevation points end at 21 km | All original data preserved in course-data.js. UI/guide explicitly disclose missing final 100 m. |
| Distance validation | Haversine geometry sum 21,000.000000858 m; maximum difference against any stored segment 0.000953 m | Existing distances retained; no rescaling. All integer kilometre points exactly coincide with stored vertices. |
| Plan | All 21 paces match the handover. Cumulative total is 7,040 s at 21 km | Existing race entries and notes unchanged. Final 100 m at existing last pace yields 7,071 s / 1:57:51. |
| Timing | Calculation plateaued at 21 km; ahead/behind read rounded distance out of DOM; timer reset without confirmation and lost on reload | Pure full-precision calculation, words Ahead/Behind, timestamp persistence, deliberate confirmed reset. Comparison withheld for unreliable/manual GPS position. |
| GPS matching | Nearest segment alone could jump across repeated parts of course | Previous progress/time, bounded forward/backward movement, accuracy rejection, optional reliable heading penalty, 3 m dead band, 12 m backward section hysteresis. Shared initial sections require a manual anchor. |
| Map follow | Programmatic setView triggered zoomstart and disabled follow | Programmatic/user movement distinguished; manual drag/pinch/zoom pauses follow. RECENTER restores it, positions runner at ~66% map height. North-up; no rotation. |
| Manual mode | No clear mode indicator; GPS-derived distance mixed with manual strategy; recenter silently changed mode | Explicit MANUAL MODE with approximate section-start progress; GPS AUTO is a separate action and reseeds matching within that section. |
| Map styling | All numbered markers appeared equally prominent | Grey route/markers, vivid current section, secondary next section, active kilometre sign highlighted. |
| Elevation | No moving location cursor, tiny labels | Current + upcoming terrain, labelled metre/km axes, 20 m minimum elevation span, moving position cursor; sampled-data limitation disclosed. |
| Offline | CDN dependencies in atomic precache; errors swallowed; unbounded caching included tiles; no clean tile failure response | Local pinned Leaflet 1.9.4 plus license. Same-origin app-shell precache; visible install failure; ordinary HTTP tile cache only; route-only map and last-resort SVG diagram. |
| PWA | Core tags and standalone manifest existed, but no explicit scope/id or update/state recovery | Existing icons retained; manifest id/scope added; updates wait for old windows to close; saved race state; GPS resumes when visible. |
| Simulation | Absent | Settings-only 0–21.1 km slider, accelerated playback, ahead/behind offset. No overwrite of real timer/progress. |
| iPhone/battery | No wake lock, safe-area support existed, recurring expensive redraws | Feature-detected wake lock with refusal/release handling; safe areas retained; no map animation; strategy updates only at section changes; terrain redraw threshold; hidden rendering pauses. |

## Completed automated checks

Runtime: Node.js 25.4.0. Browser: installed Microsoft Edge (Chromium) 151.0.4129.101, driven headlessly with Playwright. These are desktop browser tests with mobile viewports/touch emulation, not physical iPhone or Safari tests.

`node --test tests/core.test.cjs` — **7 tests passed**:

- Original plan/data invariants, all cumulative splits, all 21 marker coordinates, Haversine segment validation.
- Every integer section boundary; expected time at 0, 21, 21.05 and 21.1 km; range clamping.
- Interpolated route-slice endpoints and no invented final geometry.
- Full 21 km on-course GPS replay every 5 m (4,201 fixes, ~3 m/s). Maximum error: 5.000 m at the course's small repeated geometry.
- Deterministic noisy replay every 10 m (2,101 fixes, about ±4 m coordinate noise, accuracy 15 m). Maximum error: 12.632 m; zero rejected fixes; no distant kilometre jumps.
- Rejection of poor accuracy, clearly off-course/invalid fixes and KM 6 → KM 17 jumps; acceptance of legitimate backward movement.
- Ambiguous initial shared section held; manual seeds match the intended branch.

`node tests/browser.cjs` — integration checks recorded in `tests/results/browser-results.json`:

- Network-blocked street tiles with local Leaflet; SVG fallback when Leaflet itself is blocked.
- Race timestamp and manual-mode persistence through reload; ignored GPS callbacks in manual mode; GPS AUTO re-anchoring.
- Automatic GPS kilometre transition, elevation cursor movement and backward boundary hysteresis.
- Poor GPS accuracy, impossible progression, off-route and denied-permission messages.
- Actual pointer drag pauses follow; recenter and subsequent GPS update retain follow; marker sits below map centre.
- Reset cancellation preserves state; confirmed reset clears it.
- All simulation sections, final remaining distance/plan time, +31 and −23 second comparisons, unchanged real stored state.
- 375, 390 and 430 px widths: DOM overflow check, instruction inside the first 844 px, visible buttons/summary at least 44 px high. Screenshots saved and visually inspected at all three widths.
- Service worker installed and controlling page; offline reload and new offline page preserve route, elevation, manual controls and timer. Separate subfolder hosting check verifies GitHub Pages-style relative paths and offline reopening.
- Clock advanced beyond 20 seconds without GPS; progress held and comparison withheld; a fresh accepted fix recovers.
- Blocked localStorage and refused wake lock leave manual controls and timer usable.
- Server deliberately returns 503 for a precache asset; offline-installation failure is shown while the online core UI remains functional.
- Zero uncaught JavaScript errors during the final integration run. Deliberately blocked network/resource requests are expected test failures and are not misreported as successful street-tile loads.

All local JavaScript files also passed `node --check`. No external libraries are needed for pure tests; Playwright and an installed browser are needed for the integration script.

## Remaining validation and limits

No physical iPhone was available. Precise GPS acquisition, actual route branch matching with real-world noise, Safari/PWA permission UX, OS storage eviction, real wake-lock persistence, background suspension and two-hour battery drain require the pre-race field checklist in README.md. Real street-tile rendering was not validated in this network-restricted environment; tile failure and route-only operation were explicitly tested. No GitHub deployment was performed.

No source GPX beyond the embedded arrays was supplied. The missing final 100 m cannot be recovered from these files. The 250 m elevation sampling and occasional long geometry segments also limit terrain/turn precision. This is a personal race aid; race signs and your tactical effort plan remain authoritative.
