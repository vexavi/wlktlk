# ESL Walkie-Talkie — Compact QR Edition

A two-person, push-to-talk classroom walkie-talkie that runs as a static GitHub Pages site.

## What's new in this version

The original pairing QR could become too large because it stored a JSON WebRTC description and depended on the browser's built-in compression support.

This version uses a much smaller **Compact V2** format:

- stores only the WebRTC offer/answer SDP in the QR;
- removes names and peer IDs from the QR (they are exchanged after connection);
- normalizes SDP line endings before compression;
- compresses with bundled **raw DEFLATE at level 9**;
- uses a small shared SDP dictionary for better compression;
- Base64URL-encodes the compressed bytes;
- bundles `pako` locally, so it does not depend on `CompressionStream` support;
- first tries a normal-camera-friendly URL QR;
- automatically falls back to an even smaller in-app-only QR if the URL form is too large.

The backup code is now intended for **copy/paste only**, not for students to type manually.

## Easier second-QR flow

The answer QR can also be scanned with the device's normal camera.

If that opens the GitHub Pages app in a new tab, the new tab passes the answer back to the original creator tab through `BroadcastChannel` and a same-origin `localStorage` fallback. The student can then return to the original tab and the connection should continue automatically.

This helps on devices where the browser does not expose the `BarcodeDetector` QR-scanning API.

## What it does

- Two students pair directly with WebRTC.
- No Firebase, Supabase, Cloudflare, database, signaling server, or account system.
- Audio travels directly between the two devices.
- Microphone audio is not recorded by the app.
- Push-to-talk keeps the microphone track disabled except while the TALK button is held.
- Uses no external CDN at runtime. QR generation and compression libraries are vendored in `vendor/`.

## Important limitation

This intentionally sets `iceServers: []`. It is designed primarily for two devices on the same local network.

It may fail when:

- the school Wi-Fi has client/AP isolation enabled;
- firewalls block peer-to-peer WebRTC traffic;
- devices are on different networks;
- a network requires a TURN relay service.

There is no GitHub-Pages-only way around those network restrictions because GitHub Pages cannot run a signaling or TURN server.

## Pairing flow

1. Open the GitHub Pages app on both devices.
2. Student A enters a name and taps **Create a radio**.
3. Student A allows microphone access and gets an invitation QR.
4. Student B scans the QR either:
   - with **Scan partner QR** inside the app; or
   - with the device's normal camera if the QR is in URL mode.
5. Student B enters a name and taps **Join radio**.
6. Student B gets the answer QR.
7. Student A scans it either:
   - with **Scan answer QR** in the original creator tab; or
   - with the normal camera. If a new app tab opens, that tab passes the answer to the original creator tab automatically.
8. Return to the original creator tab if necessary.
9. When connected, hold the large TALK button to transmit. On desktop, Space also works.

## Deploy to GitHub Pages

1. Create a GitHub repository, for example `esl-walkie-talkie`.
2. Upload everything in this folder to the repository root.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select your main branch and `/ (root)`, then save.
6. Open the GitHub Pages URL on both devices.
7. Allow microphone/camera permissions when prompted.

## Files

- `index.html` — interface
- `style.css` — responsive classroom-friendly styling
- `app.js` — WebRTC, Compact V2 pairing, QR scanning, cross-tab answer handoff, and push-to-talk logic
- `vendor/qrcode-local.js` — local QR generator bundle
- `vendor/qrcode-terminal-LICENSE` — QR generator upstream license
- `vendor/pako.min.js` — local DEFLATE compressor/decompressor
- `vendor/pako-LICENSE` — pako upstream license

## Classroom test checklist

Before using this with students, test two devices on the exact school Wi-Fi:

- invitation QR is generated without the "too large" warning;
- Student B can read the invitation QR;
- Student B can create an answer QR;
- Student A can return the answer through the in-app scanner or normal-camera cross-tab flow;
- connection shows **Connected**;
- A can talk to B;
- B can talk to A;
- releasing TALK immediately mutes the outgoing microphone;
- disconnect stops microphone access.

If pairing succeeds but the connection never becomes **Connected**, the school network is probably blocking direct client-to-client traffic. That is a separate limitation from QR size.
