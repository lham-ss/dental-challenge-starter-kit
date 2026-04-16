# 🦷 DentalScan AI — Engineering Challenge

## 1. Product Discovery

Before writing a single line of code I visited [dentalscan.us](https://www.dentalscan.us/) and went through the actual scan flow as a patient would. A few things stood out immediately:

- The production product requests **5 specific angles** — front smile, left profile, right profile, upper teeth, and lower teeth. Each requires a different head pose and facial expression. This isn't just a "take 5 photos" problem; it's a **pose guidance** problem.
- The key user failure mode isn't "they forgot to take a photo" — it's **wrong angle / wrong expression captured silently**. A patient taps the button with their head tilted 20° and the scan goes through. That bad data then needs manual correction or a costly retake appointment.
- The chat feature on the results page exists because patients frequently have questions _immediately after_ seeing their results — "is that normal?", "what does that mean?" — and the current turn-around on email is too slow for that moment of anxiety.

These three observations directly shaped the implementation priorities.

---

## 2. What Was Built vs. the Original Starter

### Scan Capture Flow

The original starter had a button that captured a frame on click with zero guidance. The rebuilt flow:

| Layer | Starter | Built |
|---|---|---|
| **Face detection** | None | MediaPipe `FaceLandmarker` — 468 landmarks + blendshapes at 30fps in a `requestAnimationFrame` loop |
| **Guardrail states** | None | 9 states: `idle / detecting / centered / not_centered / too_close / tilt_left / tilt_right / turn_more / chin_up / chin_down` |
| **Color feedback** | None | Red (not ready) → Amber (partial) → Green (locked on) mapped to each guardrail state |
| **Auto-capture** | Manual tap | 3-second countdown once `guardrail === "centered"`, aborted immediately if pose breaks |
| **Per-step guidance** | None | SVG overlay shifts geometry per step (face shifted right for left-turn, chin ratios for teeth steps), instruction text animates in |
| **Prep screen** | None | 3-second "Next up" screen with animated countdown between steps |

### Why MediaPipe FaceLandmarker specifically?

I chose `FaceLandmarker` over the older `FaceMesh` because it provides:
1. **Blendshapes** — essential for detecting genuine smiles (step 1 requires `mouthSmileLeft + mouthSmileRight > 0.3`) and open-mouth detection (step 3/4 uses `pts[14].y - pts[13].y > 0.03`)
2. **3D-aware landmarks** — roll/yaw/pitch can be computed purely from landmark geometry. Yaw from nose-tip x-offset vs face centroid; pitch from nose position in the forehead→chin ratio; roll from the inter-eye angle.

This meant no server-side ML inference, no model hosting, and sub-100ms feedback on a mid-range device.

### Notification System

The trigger was placed in `POST /api/scan` — the scan route itself fires a non-blocking `prisma.notification.create()` via `void promise.catch()`. This means:
- The scan response isn't delayed by notification latency
- If notification creation fails, the scan is still saved (correct — a notification failure shouldn't roll back patient data)
- A separate `GET /api/notify?unread=true` allows a dashboard to poll for new items

One deliberate design decision: `userId` is set to `"system"` rather than the patient's ID. In production this would be the assigning dentist's ID, looked up from the scan's patient record. The current model doesn't have a `User` table, so `"system"` is an honest placeholder rather than a fake user ID.

### Messaging System

**Architecture decision — polling vs. WebSockets vs. SSE:**

For a low-traffic, session-scoped chat (one patient, one scan, one conversation), polling at 4s intervals is the pragmatic choice:
- No infrastructure change (no WebSocket server, no pub/sub)
- The user sees a reply within 4 seconds — acceptable for an async clinical conversation
- Polling stops costing anything when the tab is closed (unlike a persistent WS connection)

I'd use Server-Sent Events in production: lower overhead than polling, no bidirectional complexity of WebSockets, and Next.js supports SSE natively via `ReadableStream` responses.

**Optimistic updates:**

Messages appear instantly on send (`status: "pending"`, `opacity-60`). The `localId` → `serverId` handshake via the POST response's `messageId` prevents the poll from duplicating a message the client already shows. If the POST fails, the message stays visible in an error state with a retry button — the user never loses their text.

**Thread model:**

The `Thread` is keyed on `patientId` (the `scanId` is used as `patientId` in the current implementation — a reasonable simplification when there's no `User` table). In production, a thread would be keyed on `patientId + dentistId + scanId` to support multiple patients with the same dentist and multiple scans per patient.

---

went with MediaPipe's FaceLandmarker for this since it provides both 3D landmarks (for better guardrail logic for UX/UI instructions) 
and blendshape detection (for smile detection in step 1). The newer FaceMesh model only provides 2D landmarks and doesn't include 
blendshapes, which makes it harder to implement robust guardrails for the various head poses and expressions we want to detect in each step.

## 3. UX Decisions

### Results page layout

After the scan completes, navigating to a results page (rather than keeping everything in one scrollable component) makes sense because:
- The scanning UI is optimised for portrait / phone use
- The results + chat layout benefits from wider screens (grid + sidebar)
- It creates a natural "checkpoint" — the scan is done, here's what we got, now ask questions

The grid animates in with staggered delays (`animationDelay: i * 60ms`) so the images feel like they're arriving rather than snapping in all at once.

### Responsive layout

- **Mobile**: thumbnails row → results grid → chat stacked vertically
- **Desktop (`lg:`)**: thumbnails fixed on the left, chat fixed on the right, scan viewport centred

This mirrors how the production app seems to work — the scanning viewport is always the hero on mobile, while desktop can afford the ambient context of progress and communication.

---

## 4. What I'd Do With More Time

### High priority

- **Real authentication** — `patientId` is currently the `scanId`, which works for the demo but isn't suitable for production. A proper auth layer (NextAuth or Clerk) would associate scans with verified patients and route notifications to the correct dentist.
- **Image compression** — the captured frames are full-resolution JPEG data URLs stored as comma-joined strings in SQLite. This works for a demo but would hit limits quickly. In production: upload to S3/R2, store only the URL in the DB.
- **SSE for messaging** — replace the 4s poll with `text/event-stream` to push dentist replies the moment they're sent.

### Medium priority

- **Per-step quality scoring** — beyond "is the face centered?", we could score blur (variance of Laplacian), lighting (mean luminance), and angle accuracy, and surface that to the dentist in the results view so they can request a retake before the appointment.
- **Offline resilience** — if the API call to save the scan fails (network drop at step 5), the captured images are lost. A `useRef`-backed local queue with exponential retry would prevent that.

### Exploratory

- **Scan comparison view** — dentists reviewing follow-up scans want to compare the current front-view with the previous one side-by-side. The data model already supports this (multiple `Scan` records per patient once users are added).
- **MediaPipe on a worker thread** — moving the detection loop to a `Worker` with `OffscreenCanvas` would free the main thread entirely, making the UI smoother on lower-end devices.


-----------------------------
The starter kit had three focus areas: scan enhancement on the frontend, a notification system on the backend, and a full-stack messaging feature.

For scan enhancement, the original flow was just a tap-to-capture button with no guidance at all. I replaced that with a real-time face detection loop using MediaPipe's FaceLandmarker — 
running at 30 frames per second in the browser. 

An SVG overlay adapts to each of the five scan steps, shifting its geometry for left and right profile shots and widening the mouth guide for the teeth captures. 
The overlay changes colour — red, amber, green — based on nine guardrail states: things like "too close," "tilt right," or "turn more." 
Once the patient holds the correct pose for three seconds, the shot is captured automatically, with a countdown so they know what's coming.

For notifications, when the scan saves to the database, the POST handler fires a Prisma notification record non-blocking — it doesn't hold up the response. A separate notify endpoint supports both creating and querying notifications, with an unread filter for a dashboard.

For messaging, the results page shows the captured images alongside a real-time chat sidebar. Messages send optimistically — they appear instantly, then confirm in the background. 
A polling loop fetches new messages every four seconds, and a deduplication check by server ID prevents any message from appearing twice.

--------------------------

Detection loop — setGuardrailIfChanged

The rAF loop runs at 60fps but only calls setGuardrail (which triggers a React re-render) when the guardrail state actually changes. A useRef tracks the current value so every frame does a cheap reference comparison before touching React state. Without this, every frame would cause a re-render even when the state is already "not_centered".

Stale closure avoidance via refs

stepRef and onCaptureRef are kept in sync with useEffect, so the detection loop can read the latest step and capture callback without being a dependency of the rAF useEffect. This means the loop registers once and never re-registers mid-scan — no teardown/restart on every step change.

GPU-delegated inference

MediaPipe is initialised with delegate: "GPU" and runningMode: "VIDEO" — the video mode reuses internal state across frames rather than cold-starting each call, which is significantly faster than IMAGE mode.

handleCapture is useCallback-memoised so it's a stable reference — the face detection hook's onCaptureRef.current assignment doesn't fire unnecessarily.

Polling uses a single setInterval registered once (empty dependency array). It reads threadId from a ref to avoid re-registering the interval whenever threadId changes — re-registering would cause a gap in polling or duplicate intervals.

Optimistic messages + deduplication mean the UI never waits on the server for a re-render. The merge logic in setMessages checks seenServerIds before appending, so polling never causes a message to appear twice even if the POST and the poll race.

handleSend, dispatch, handleRetry, and handleKeyDown are all useCallback-memoised to prevent child re-renders on each keystroke.

