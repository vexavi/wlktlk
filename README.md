# ESL Walkie-Talkie — GitHub-only single-file build

This version is designed for GitHub Pages and keeps the entire app in `index.html`.
There are no CDN or backend dependencies.

## Pairing

1. Student A enters a name and chooses **Create a radio**.
2. Student B scans Student A's invitation QR.
3. Student B enters a name and chooses **Join radio**.
4. Student B stays on **Show this answer QR back**.
5. Student A chooses **Scan answer QR** and scans Student B's QR.
6. Both devices enter the radio screen when WebRTC connects.

## Push-to-talk / audio fix

This build fixes two issues from the previous version:

- Releasing the TALK button now always sends a `tx: false` release message. Previously, browser pointer events could accidentally be interpreted as the internal `silent` flag, leaving the other device stuck on **Channel busy**.
- While TALK is held, a small heartbeat is sent. If a release message is ever missed, the other device automatically clears the busy state after roughly two seconds without a heartbeat.
- Incoming audio now retries playback automatically. If the browser blocks WebRTC autoplay, an **Enable sound** button appears. Tap it once to allow incoming audio.

## GitHub Pages

Upload at least:

- `index.html`
- `.nojekyll` (optional but recommended)

Then enable GitHub Pages from the repository root.

## Testing

Use two separate devices. Both should grant microphone permission.

After connecting:

1. On both devices, tap **Enable sound** if it appears.
2. Student A holds TALK and speaks.
3. Student B should see `Student A is talking…` and hear Student A.
4. Student A releases TALK.
5. Student B's busy indicator should disappear immediately.
6. Student B should then be able to hold TALK and reply.

Headphones are recommended to avoid speaker/microphone feedback.
