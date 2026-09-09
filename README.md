# ESL Walkie-Talkie — GitHub-only audio-meter build

This version is designed for GitHub Pages and keeps the entire app in `index.html`.
There are no CDN or backend dependencies.

## Pairing

1. Student A enters a name and chooses **Create a radio**.
2. Student B scans Student A's invitation QR.
3. Student B enters a name and chooses **Join radio**.
4. Student B stays on **Show this answer QR back**.
5. Student A chooses **Scan answer QR** and scans Student B's QR.
6. Both devices enter the radio screen when WebRTC connects.

## Audio meters

The radio screen now has two live meters:

- **Your microphone** — shows the microphone input captured by that device even when TALK is not being held. This does not broadcast the audio.
- **Incoming audio** — shows audio actually arriving from the partner over WebRTC.

The selected microphone name is also shown under the local meter when the browser provides it.

### How to diagnose a silent PC microphone

- If **Your microphone** does not move when you speak, the problem is local to the PC: browser microphone permission, Windows microphone privacy settings, the wrong input device, a muted hardware microphone, or very low input gain.
- If **Your microphone** moves but the partner's **Incoming audio** meter does not move while TALK is held, the problem is in WebRTC transmission.
- If both meters move but you cannot hear sound, the problem is audio playback/output. Tap **Enable sound**, verify the output device and volume, and check that the browser tab is not muted.

The microphone meter uses a separate local capture track. Push-to-talk uses a cloned track, so the meter can remain active without transmitting your voice.

## Push-to-talk safeguards

- Releasing TALK always sends a `tx: false` release message.
- A transmit heartbeat prevents the other device from getting permanently stuck on **Channel busy** if a release message is missed.
- Incoming audio retries playback automatically. If the browser blocks WebRTC autoplay, use **Enable sound**.

## GitHub Pages

Upload:

- `index.html`
- `.nojekyll` (optional but recommended)

Then enable GitHub Pages from the repository root.

## Testing

Use two separate devices and allow microphone access on both.

1. Connect the devices.
2. Speak normally without holding TALK. **Your microphone** should already react.
3. Hold TALK and speak. The other device's **Incoming audio** meter should react.
4. Release TALK. The busy indicator should clear immediately.
5. Reverse directions and repeat.

Headphones are recommended to avoid speaker/microphone feedback.
