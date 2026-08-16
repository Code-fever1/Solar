# Voltix — Project Guide for AI Agents

## Expo

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Server Details

- **Azure VM IP**: `104.43.56.204`
- **SSH key**: `~/Documents/vm1_key_0322.pem` (i.e. `/home/alijah/Documents/vm1_key_0322.pem`)
- **SSH user**: `azureuser`
- **SSH command**: `ssh -i ~/Documents/vm1_key_0322.pem azureuser@104.43.56.204`
- **SCP command**: `scp -i ~/Documents/vm1_key_0322.pem <local> azureuser@104.43.56.204:~/`
- **Backend port**: `3001`
- **Backend process manager**: PM2 — process name `backend_api`
- **Backend main file**: `~/backend_api.js` (on server)
- **Backend modules** (all `require()`-ed from `backend_api.js`):
  - `~/unified_solar_routes.js` — solar engine (TOMZN, inverter, dashboard, meters)
  - `~/tuya_routes.js` — Tuya device routes
- **MongoDB**: `mongodb://localhost:27017`, database `ont_monitor`
- **PM2 commands**:
  - Restart: `pm2 restart backend_api`
  - Logs: `pm2 logs backend_api --lines 20 --nostream`
  - Status: `pm2 status`

## Deploying Backend Changes

```bash
# 1. Syntax check locally
cd /home/alijah/Documents/PROJECTS/Solar/backend && node -c <file>.js

# 2. Upload to server
scp -i ~/Documents/vm1_key_0322.pem -o StrictHostKeyChecking=no \
  /home/alijah/Documents/PROJECTS/Solar/backend/<file>.js azureuser@104.43.56.204:~/

# 3. Syntax check on server + restart
ssh -i ~/Documents/vm1_key_0322.pem azureuser@104.43.56.204 \
  'node -c ~/<file>.js && pm2 restart backend_api && sleep 4 && pm2 logs backend_api --lines 5 --nostream'
```

Files to deploy (depending on what changed):
- `backend_api.js` — main server entry
- `unified_solar_routes.js` — solar/TOMZN/inverter logic
- `tuya_routes.js` — Tuya device routes

## API Endpoints

### Solar Engine (unified_solar_routes.js)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/solar/dashboard` | GET | Full dashboard (meters, energy, forecasts) |
| `/api/solar/live` | GET | Lightweight live data (tomznLive + inverter only, ~200 bytes) |
| `/api/solar/dashboard/sync` | GET | Delta sync — `?since=<dataVersion>`, returns `{changed:false}` if nothing changed |
| `/api/solar/refresh` | POST | Force-refresh TOMZN + inverter + weather, returns full dashboard |
| `/api/solar/refresh/tomzn` | POST | Force-refresh TOMZN only |
| `/api/solar/refresh/inverter` | POST | Force-refresh inverter only |
| `/api/solar/changeover` | POST | Switch active meter |
| `/api/solar/manual-readings` | POST | Submit manual meter reading |
| `/api/solar/manual-readings/:id` | PATCH | Edit manual reading |
| `/api/solar/manual-readings/:id` | DELETE | Delete manual reading |
| `/api/solar/baselines` | POST | Set meter baseline |
| `/api/solar/tomzn/history` | GET | TOMZN historical data |
| `/api/solar/flow-history` | GET | 24h flow history for chart |

## Frontend Polling Architecture

| Interval | Endpoint | Payload | Purpose |
|----------|----------|---------|---------|
| 5s | `/api/solar/live` | ~200 bytes | Hero section (tomznLive + inverter) |
| 30s | `/api/solar/dashboard/sync?since=N` | 551 bytes (no change) or ~50KB (changed) | Full dashboard delta |
| 60s | `/api/solar/flow-history` | varies | Chart data |

- Backend device poll is presence-based: **3s while the app (or overlay) is watching**, **30s when nobody is connected**. Presence = SSE `/live/stream` clients, or any `/live` / `/dashboard/sync` in the last 45s. App open immediately bumps the loop to 3s. After the last client leaves, it drops back to 30s. Backend never stops.
- Hero is **push, not pull**: backend only SSE-broadcasts when TOMZN/inverter/UPS/weather actually changes. The app keeps the SSE open (even when idle) and paints the hero on those events. No 3s/5s live HTTP timer while the app is open.
- On app open / foreground: `fetchLive(false)` first (cached live payload, ~100ms) so hero + Solar Only/UPS tag paint immediately, then `fetchLive(true)` + dashboard sync + flow history in the background
- `dataVersion` tracking: backend increments on every data mutation, frontend sends its version, backend returns `{changed:false}` if match
- Inverter offline requires 4 consecutive poll failures (~20s). A single timeout/hang-up keeps the last good snapshot. UPS only when inverter is actually offline (not mode B / not producing)
- TOMZN `energyKwh=0` is treated as offline garbage, never as a real counter. Last known positive kWh is recovered from DB on restart so today's usage cannot become 0 or ~200

## Build Configuration

### Android Build
- **JAVA_HOME**: `/usr/lib/jvm/java-17-openjdk-amd64`
- **Build command**: `cd android && JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 ./gradlew :app:assembleRelease`
- **APK output**: `android/app/build/outputs/apk/release/app-release.apk`
- **Architectures**: `arm64-v8a` only (modern phones)
- **JVM args**: `-Xmx4096m -XX:MaxMetaspaceSize=1g`
- **Lint**: Disabled in release builds (`checkReleaseBuilds false, abortOnError false`)

### ADB Install
- **Device**: Samsung SM-S908E (WiFi ADB, transport ID varies)
- **Command**: `adb -t <transport_id> install -r android/app/build/outputs/apk/release/app-release.apk`
- **List devices**: `adb devices -l` (use transport_id from output)

## Key Files

### Frontend
| File | Purpose |
|------|---------|
| `src/app/_layout.tsx` | Root layout — wraps EnergyProvider, SceneThemeProvider |
| `src/context/EnergyContext.tsx` | Main data context — polling, fetching, offline cache, pending ops |
| `src/components/LiveEnergyScene.tsx` | Hero section — solar/grid/home energy flow visualization |
| `src/components/NewDashboard.tsx` | Scrollable dashboard — cards, charts, status |
| `src/utils/offline-dashboard.ts` | Offline estimation logic |

### Backend
| File | Purpose |
|------|---------|
| `backend/backend_api.js` | Main Express server entry — registers all route modules |
| `backend/unified_solar_routes.js` | Solar engine — TOMZN, inverter, meters, dashboard, delta sync |
| `backend/tuya_routes.js` | Tuya device API routes |

### Config
| File | Purpose |
|------|---------|
| `app.json` | Expo config — version codes, plugins |
| `android/gradle.properties` | JVM memory, architectures, build flags |
| `android/app/build.gradle` | Android build config — lint, signing, minify |

## TOMZN Offline Detection

- Backend fingerprints TOMZN readings (`energyKwh|powerW|voltageV|currentA`)
- After 10 consecutive identical readings → marks `isOnline: false`
- Also trusts Tuya's `online_state: false` directly
- Stale tracker seeded from DB on restart (maintains state across reboots)
- Frontend: `gridUnavailable` flag hides grid V/W/A text and lines when offline
- Status card shows "Offline" in red (`#EF4C4C`)

## App Versioning

- `expo.version`: `1.0.0` — app version string
- `android.versionCode`: `15` — integer, increment for each APK release (currently 15)
- To release new APK: bump `versionCode` in `app.json` and `android/app/build.gradle`, rebuild, install via ADB
