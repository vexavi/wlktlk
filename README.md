# ESL Walkie-Talkie — JST Classroom Lock

This version keeps the GitHub-only WebRTC walkie-talkie and adds a Japan-time classroom gate.

## Student access rules

- Timezone: **Japan Standard Time (Asia/Tokyo / UTC+9)**
- Monday–Friday: automatically open from **13:10 until 13:50 JST**
- Monday–Friday outside that window: locked unless a valid signed teacher override QR is scanned
- Saturday and Sunday: **hard locked all day**
- Teacher override QRs are rejected on weekends
- When normal access or an override expires during an active radio session, the app immediately disconnects WebRTC and stops microphone/audio tracks

The student page checks the HTTP `Date` header from its own GitHub Pages site and advances from that verified server time using a monotonic browser timer. If initial time verification fails, it fails closed and stays locked.

## Files to upload to GitHub Pages

Upload only:

- `index.html`
- `.nojekyll`
- `README.md` (optional)

Do **not** upload the separate teacher override HTML file supplied with this build.

## Teacher override tool

Keep `TEACHER-ONLY-DO-NOT-UPLOAD.html` on your own computer/phone. Open it locally in a current browser and choose an override duration or a specific JST end time. It creates a signed QR that students scan from the locked screen.

The teacher file contains a private signing key. The student page contains only the matching public verification key.

If the teacher file is ever posted publicly or shared with students, replace both the teacher tool and student `index.html` with a newly keyed build.

## Pairing

Once access is open:

1. Student A chooses **Create a radio**.
2. Student B scans Student A's invitation QR and chooses **Join radio**.
3. Student B shows the answer QR.
4. Student A scans the answer QR.
5. Both devices enter push-to-talk mode.

The project still uses direct WebRTC with no signaling backend.
