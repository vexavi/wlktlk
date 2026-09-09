# ESL Walkie-Talkie (GitHub Pages only)

A two-person, push-to-talk classroom walkie-talkie that runs as a static GitHub Pages site.

## What it does

- Two students pair directly with WebRTC.
- No Firebase, Supabase, Cloudflare, database, signaling server, or account system.
- The WebRTC offer/answer is compressed into a QR code or manual pairing code.
- Audio travels directly between the two devices.
- Microphone audio is not recorded by the app.
- Push-to-talk keeps the microphone track disabled except while the TALK button is held.
- Uses no external CDN at runtime. The QR generator is vendored in `vendor/`.

## Important limitation

This intentionally sets `iceServers: []`. That means it is designed for devices that can reach each other directly, especially devices on the same local network.

It may fail when:

- the school Wi-Fi has client/AP isolation enabled;
- firewalls block peer-to-peer WebRTC traffic;
- devices are on different networks;
- a network requires TURN relay service.

There is no GitHub-only way around those network restrictions because GitHub Pages cannot run a signaling or TURN server.

## Pairing flow

1. Student A opens the site, enters a name, and taps **Create a radio**.
2. Student A allows microphone access and gets an invitation QR.
3. Student B scans the invitation QR.
   - In browsers with `BarcodeDetector`, use **Scan partner QR** inside the app.
   - Student B can also scan the invitation using the phone's normal camera because there is no existing peer connection to preserve yet.
   - Manual pairing code is always available.
4. Student B enters a name, taps **Join radio**, and gets an answer QR.
5. Student A MUST keep the original creator page open and use **Scan answer QR** there. If QR scanning is unsupported, Student A can paste Student B's manual answer code.
6. When connected, hold the large TALK button to transmit. On desktop, Space also works.

## Deploy to GitHub Pages

1. Create a new GitHub repository, for example `esl-walkie-talkie`.
2. Upload everything in this folder to the repository root.
3. In GitHub, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select your main branch and `/ (root)`, then save.
6. Open the GitHub Pages URL on both devices.
7. Allow microphone/camera permissions when prompted.

GitHub Pages provides HTTPS, which browsers require for microphone and camera access.

## Browser notes

- WebRTC and microphone access are widely supported in modern browsers.
- In-app QR scanning uses the browser `BarcodeDetector` API. If it is unavailable, use the manual pairing code.
- The app uses `CompressionStream`/`DecompressionStream` when available so WebRTC connection data fits more easily into a QR code.

## Files

- `index.html` — interface
- `style.css` — responsive classroom-friendly styling
- `app.js` — WebRTC, pairing, QR scanning, and push-to-talk logic
- `vendor/qrcode-local.js` — local QR generator bundle
- `vendor/qrcode-terminal-LICENSE` — upstream license text for the vendored QR code implementation

## Classroom testing checklist

Before using this with students, test two devices on the exact school Wi-Fi:

- invitation QR is generated;
- Student B can join;
- Student A can scan or paste the answer;
- connection shows **Connected**;
- A can talk to B;
- B can talk to A;
- releasing TALK immediately mutes the outgoing microphone;
- disconnect stops microphone access.

If pairing succeeds but the connection never becomes Connected, the school network is probably blocking direct client-to-client traffic.
