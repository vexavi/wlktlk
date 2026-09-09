# ESL Walkie-Talkie

A self-contained, two-person push-to-talk WebRTC app for GitHub Pages.

## Pairing flow

1. Student A enters a name and presses **Create a radio**.
2. Student B scans Student A's invitation QR.
3. Student B enters a name and presses **Join radio**.
4. Student B stays on-screen with a large **Answer QR**.
5. Student A presses **Scan answer QR** and scans Student B's QR.
6. Once WebRTC connects, both devices automatically enter the radio screen.
7. Hold **HOLD TO TALK** to transmit.

## GitHub Pages

Upload `index.html`, `README.md`, and `.nojekyll` to the root of a repository, then enable GitHub Pages for that branch/root.

Everything required by the app is embedded in `index.html`; no CDN, signaling backend, Firebase, or Supabase is used.
