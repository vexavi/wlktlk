(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const views = ['homeView', 'incomingView', 'pairView', 'radioView'];
  const els = Object.fromEntries([
    'homeView','incomingView','pairView','radioView','nameInput','createBtn','scanOfferBtn','pasteOfferBtn',
    'incomingName','joinNameInput','acceptOfferBtn','incomingBackBtn','pairEyebrow','pairTitle','pairStatus',
    'qrWrap','qrCanvas','qrHint','pairCode','copyCodeBtn','creatorActions','joinerActions','scanAnswerBtn',
    'pasteAnswerBtn','resetPairBtn','partnerName','connectionBadge','remoteTalk','remoteTalkName','pttBtn',
    'radioMessage','disconnectBtn','modal','modalTitle','closeModalBtn','scannerPanel','scannerVideo','scannerMessage',
    'pastePanel','manualCodeInput','applyManualBtn','modalError','remoteAudio'
  ].map(id => [id, $(id)]));

  let pc = null;
  let localStream = null;
  let localTrack = null;
  let controlChannel = null;
  let role = null;
  let peerId = randomId();
  let myName = '';
  let partnerName = 'Partner';
  let pendingOffer = null;
  let currentPairCode = '';
  let scannerStream = null;
  let scannerLoop = 0;
  let scannerPurpose = null;
  let localTx = false;
  let remoteTx = false;
  let connected = false;
  const pairBridge = 'BroadcastChannel' in window ? new BroadcastChannel('esl-radio-pair-v2') : null;

  const savedName = localStorage.getItem('eslRadioName');
  if (savedName) {
    els.nameInput.value = savedName;
    els.joinNameInput.value = savedName;
  }

  function randomId() {
    if (crypto.randomUUID) return crypto.randomUUID().slice(0, 8);
    return Math.random().toString(36).slice(2, 10);
  }

  function showView(id) {
    views.forEach(v => els[v].classList.toggle('hidden', v !== id));
  }

  function cleanName(value) {
    return (value || '').trim().slice(0, 20) || 'Student';
  }

  function saveName(name) {
    localStorage.setItem('eslRadioName', name);
    els.nameInput.value = name;
    els.joinNameInput.value = name;
  }

  function setPairStatus(text, active = false) {
    els.pairStatus.lastChild.textContent = ` ${text}`;
    els.pairStatus.querySelector('span').style.background = active ? '#227a55' : '#d89000';
  }

  function setRadioMessage(text) {
    els.radioMessage.textContent = text;
  }

  function bytesToBase64Url(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function base64UrlToBytes(text) {
    let b64 = text.replace(/-/g, '+').replace(/_/g, '/');
    b64 += '='.repeat((4 - b64.length % 4) % 4);
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  // Compact V2 pairing format.
  // QR contains only: R2O/R2A + raw-DEFLATE(SDP). Names/IDs are exchanged
  // after the WebRTC data channel opens, so they do not consume QR space.
  const SDP_DICTIONARY_TEXT = [
    'v=0\\n','o=- ','s=-\\n','t=0 0\\n','a=group:BUNDLE ','a=msid-semantic: WMS\\n',
    'm=audio ','c=IN IP4 0.0.0.0\\n','a=rtcp:9 IN IP4 0.0.0.0\\n','a=ice-ufrag:',
    'a=ice-pwd:','a=ice-options:trickle\\n','a=fingerprint:sha-256 ','a=setup:',
    'a=mid:','a=sendrecv\\n','a=rtcp-mux\\n','a=rtpmap:111 opus/48000/2\\n',
    'a=fmtp:111 minptime=10;useinbandfec=1\\n','a=ssrc:','a=candidate:',
    ' typ host ',' generation 0',' network-cost ',' network-id ',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel\\n','a=sctp-port:5000\\n',
    'a=max-message-size:262144\\n'
  ].join('');
  const SDP_DICTIONARY = new TextEncoder().encode(SDP_DICTIONARY_TEXT.replace(/\\n/g, '\n'));

  function requirePako() {
    if (!window.pako?.deflateRaw || !window.pako?.inflateRaw) {
      throw new Error('The local QR compressor did not load. Refresh the page and try again.');
    }
    return window.pako;
  }

  function normalizeSdpForQr(sdp) {
    // SDP normally uses CRLF. Store LF in the QR and restore CRLF on decode.
    return String(sdp || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  function restoreSdpFromQr(sdp) {
    return String(sdp || '').replace(/\r?\n/g, '\r\n');
  }

  function encodeCompactDescription(kind, desc) {
    const pako = requirePako();
    const typeCode = kind === 'offer' ? 'O' : 'A';
    const normalized = normalizeSdpForQr(desc?.sdp || '');
    if (!normalized) throw new Error('WebRTC did not create a connection description.');
    const bytes = pako.deflateRaw(normalized, {
      level: 9,
      memLevel: 9,
      dictionary: SDP_DICTIONARY
    });
    return `R2${typeCode}.${bytesToBase64Url(bytes)}`;
  }

  function decodeCompactDescription(code) {
    const match = /^R2([OA])\.([A-Za-z0-9_-]+)$/.exec(code);
    if (!match) return null;
    const pako = requirePako();
    const bytes = base64UrlToBytes(match[2]);
    let sdp;
    try {
      sdp = pako.inflateRaw(bytes, { to: 'string', dictionary: SDP_DICTIONARY });
    } catch (_) {
      throw new Error('This QR could not be unpacked. Make sure both devices are using the newest version of the app.');
    }
    const kind = match[1] === 'O' ? 'offer' : 'answer';
    return {
      v: 2,
      kind,
      desc: { type: kind, sdp: restoreSdpFromQr(sdp) }
    };
  }

  // Legacy V1 decoder. Keeping this means an old QR can still be read after
  // the app is updated, although all new QRs use the much smaller V2 format.
  async function decompressLegacyString(code) {
    const dot = code.indexOf('.');
    if (dot < 0) throw new Error('This pairing code is not recognized.');
    const mode = code.slice(0, dot);
    const bytes = base64UrlToBytes(code.slice(dot + 1));
    if (mode === 'g') {
      if ('DecompressionStream' in window) {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        return await new Response(stream).text();
      }
      if (window.pako?.ungzip) return window.pako.ungzip(bytes, { to: 'string' });
      throw new Error('This browser cannot unpack the older pairing code.');
    }
    if (mode === 'p') return new TextDecoder().decode(bytes);
    throw new Error('Unknown pairing-code format.');
  }

  async function encodePayload(payload) {
    return encodeCompactDescription(payload.kind, payload.desc);
  }

  async function decodePayload(codeOrUrl) {
    let code = (codeOrUrl || '').trim();
    if (!code) throw new Error('No pairing code found.');
    try {
      const url = new URL(code);
      const hash = url.hash.slice(1);
      code = new URLSearchParams(hash).get('p') || hash || code;
    } catch (_) {
      if (code.startsWith('#')) code = code.slice(1);
      if (code.startsWith('p=')) code = new URLSearchParams(code).get('p') || code;
    }

    const compact = decodeCompactDescription(code);
    if (compact) return { payload: compact, code };

    const payload = JSON.parse(await decompressLegacyString(code));
    if (payload.v !== 1 || !payload.kind || !payload.desc) {
      throw new Error('This is not a valid ESL Walkie-Talkie pairing code.');
    }
    return { payload, code };
  }

  function basePageUrl() {
    return location.href.split('#')[0].split('?')[0];
  }

  function renderQR(text) {
    const canvas = els.qrCanvas;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    try {
      const matrix = window.LocalQR.makeMatrix(text, 'L');
      const quiet = 4;
      const count = matrix.length + quiet * 2;
      const scale = Math.max(1, Math.floor(canvas.width / count));
      const drawSize = count * scale;
      const offset = Math.floor((canvas.width - drawSize) / 2);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#111';
      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix.length; c++) {
          if (matrix[r][c]) {
            ctx.fillRect(offset + (c + quiet) * scale, offset + (r + quiet) * scale, scale, scale);
          }
        }
      }
      els.qrWrap.classList.remove('hidden');
      return true;
    } catch (err) {
      console.warn('QR generation failed:', err);
      els.qrWrap.classList.add('hidden');
      els.qrHint.textContent = 'The compressed QR is still too dense for this device. Use the backup copy/paste code below.';
      return false;
    }
  }

  function renderPairingQR(code) {
    // Prefer a URL QR so the device's normal camera can open the app. If the
    // extra URL characters push a very large SDP over the QR limit, fall back
    // automatically to the smaller in-app-only payload QR.
    const urlText = `${basePageUrl()}#${code}`;
    if (renderQR(urlText)) return { mode: 'url', text: urlText };
    if (renderQR(code)) {
      els.qrHint.textContent = 'Compact QR ready. Scan it with the in-app scanner.';
      return { mode: 'compact', text: code };
    }
    return { mode: 'none', text: code };
  }

  async function acquireMicrophone() {
    if (localStream) return localStream;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not support microphone access.');
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false
    });
    localTrack = localStream.getAudioTracks()[0];
    localTrack.enabled = false;
    return localStream;
  }

  function createPeerConnection() {
    if (pc) pc.close();
    pc = new RTCPeerConnection({
      iceServers: [],
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    });

    pc.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      els.remoteAudio.srcObject = stream;
      els.remoteAudio.play().catch(() => setRadioMessage('Tap the screen once if you cannot hear your partner.'));
    };

    pc.onconnectionstatechange = updateConnectionState;
    pc.oniceconnectionstatechange = updateConnectionState;
    pc.ondatachannel = (event) => setupControlChannel(event.channel);
    return pc;
  }

  function addLocalAudio() {
    const sender = pc.addTrack(localTrack, localStream);
    const transceiver = pc.getTransceivers().find(t => t.sender === sender);
    try {
      const caps = RTCRtpReceiver.getCapabilities?.('audio');
      const opus = caps?.codecs?.filter(c => /opus/i.test(c.mimeType)) || [];
      if (opus.length && transceiver?.setCodecPreferences) transceiver.setCodecPreferences(opus);
    } catch (_) {}
  }

  function setupControlChannel(channel) {
    controlChannel = channel;
    controlChannel.onopen = () => {
      connected = true;
      showRadio();
      sendControl({ type: 'hello', name: myName, id: peerId });
    };
    controlChannel.onclose = () => {
      connected = false;
      stopTalking();
      els.pttBtn.disabled = true;
      setRadioMessage('Radio disconnected.');
    };
    controlChannel.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleControlMessage(msg);
      } catch (_) {}
    };
  }

  function handleControlMessage(msg) {
    if (msg.type === 'hello') {
      if (msg.name) partnerName = msg.name;
      els.partnerName.textContent = partnerName;
      els.remoteTalkName.textContent = partnerName;
      return;
    }
    if (msg.type === 'tx') {
      if (msg.active && localTx) {
        const remoteWins = String(msg.id || '') < String(peerId);
        if (remoteWins) stopTalking(true);
        else return;
      }
      remoteTx = !!msg.active;
      els.remoteTalk.classList.toggle('hidden', !remoteTx);
      els.pttBtn.classList.toggle('busy', remoteTx);
      if (msg.name) els.remoteTalkName.textContent = msg.name;
      if (remoteTx) setRadioMessage('Channel busy — listen to your partner.');
      else if (!localTx) setRadioMessage('Ready. Hold the button to talk.');
    }
  }

  function sendControl(obj) {
    if (controlChannel?.readyState === 'open') controlChannel.send(JSON.stringify(obj));
  }

  function updateConnectionState() {
    if (!pc) return;
    const state = pc.connectionState || pc.iceConnectionState;
    if (['connected', 'completed'].includes(state)) {
      els.connectionBadge.textContent = 'Connected';
      els.connectionBadge.classList.add('connected');
      if (controlChannel?.readyState === 'open') {
        connected = true;
        els.pttBtn.disabled = false;
        setRadioMessage('Ready. Hold the button to talk.');
      }
    } else if (state === 'failed') {
      els.connectionBadge.textContent = 'Connection failed';
      els.connectionBadge.classList.remove('connected');
      els.pttBtn.disabled = true;
      setRadioMessage('Could not connect. Check that both devices are on the same Wi-Fi and that client isolation is not blocking peer-to-peer traffic.');
    } else if (state === 'disconnected') {
      els.connectionBadge.textContent = 'Disconnected';
      els.connectionBadge.classList.remove('connected');
      els.pttBtn.disabled = true;
      setRadioMessage('Connection lost.');
    } else {
      els.connectionBadge.textContent = 'Connecting…';
      els.connectionBadge.classList.remove('connected');
    }
  }

  function waitForIceComplete(timeoutMs = 5000) {
    return new Promise(resolve => {
      if (!pc || pc.iceGatheringState === 'complete') return resolve();
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        pc?.removeEventListener('icegatheringstatechange', onChange);
        clearTimeout(timer);
        resolve();
      };
      const onChange = () => { if (pc?.iceGatheringState === 'complete') finish(); };
      const timer = setTimeout(finish, timeoutMs);
      pc.addEventListener('icegatheringstatechange', onChange);
    });
  }

  async function makeOffer() {
    myName = cleanName(els.nameInput.value);
    saveName(myName);
    role = 'creator';
    showView('pairView');
    els.pairEyebrow.textContent = 'Step 1 of 2';
    els.pairTitle.textContent = 'Show this QR to your partner';
    els.qrHint.textContent = 'Scan with the walkie-talkie app or your device camera. The QR uses the new compact format.';
    els.creatorActions.classList.remove('hidden');
    els.joinerActions.classList.add('hidden');
    setPairStatus('Making QR');

    try {
      await acquireMicrophone();
      createPeerConnection();
      addLocalAudio();
      setupControlChannel(pc.createDataChannel('control', { ordered: true }));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceComplete();
      const payload = { v: 1, kind: 'offer', name: myName, id: peerId, desc: pc.localDescription };
      currentPairCode = await encodePayload(payload);
      els.pairCode.value = currentPairCode;
      renderPairingQR(currentPairCode);
      setPairStatus('Waiting for answer');
    } catch (err) {
      showErrorOnPair(err);
    }
  }

  async function prepareIncoming(raw) {
    try {
      const { payload } = await decodePayload(raw);
      if (payload.kind !== 'offer') throw new Error('That QR is not a radio invitation.');
      pendingOffer = payload;
      partnerName = payload.name || 'Partner';
      els.incomingName.textContent = partnerName;
      const saved = localStorage.getItem('eslRadioName');
      if (saved) els.joinNameInput.value = saved;
      showView('incomingView');
    } catch (err) {
      throw err;
    }
  }

  async function acceptOffer() {
    if (!pendingOffer) return;
    myName = cleanName(els.joinNameInput.value);
    saveName(myName);
    role = 'joiner';
    showView('pairView');
    els.pairEyebrow.textContent = 'Step 2 of 2';
    els.pairTitle.textContent = 'Show this answer QR back';
    els.qrHint.textContent = `${partnerName} can scan this in the app or with the normal camera. If a new tab opens, it will pass the answer back automatically.`;
    els.creatorActions.classList.add('hidden');
    els.joinerActions.classList.remove('hidden');
    setPairStatus('Making answer');

    try {
      await acquireMicrophone();
      createPeerConnection();
      addLocalAudio();
      await pc.setRemoteDescription(pendingOffer.desc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitForIceComplete();
      const payload = { v: 1, kind: 'answer', name: myName, id: peerId, desc: pc.localDescription };
      currentPairCode = await encodePayload(payload);
      els.pairCode.value = currentPairCode;
      renderPairingQR(currentPairCode);
      setPairStatus('Waiting to connect');
      showRadioWhenPossible();
    } catch (err) {
      showErrorOnPair(err);
    }
  }

  async function applyAnswer(raw) {
    const { payload } = await decodePayload(raw);
    if (payload.kind !== 'answer') throw new Error('That QR is not an answer code.');
    if (!pc || role !== 'creator') throw new Error('Create a radio first, then scan the answer without closing that page.');
    partnerName = payload.name || 'Partner';
    await pc.setRemoteDescription(payload.desc);
    closeModal();
    setPairStatus('Connecting', true);
    showRadioWhenPossible();
  }

  function showRadioWhenPossible() {
    showRadio();
    updateConnectionState();
  }

  function showRadio() {
    showView('radioView');
    els.partnerName.textContent = partnerName;
    els.remoteTalkName.textContent = partnerName;
    els.pttBtn.disabled = !(connected || controlChannel?.readyState === 'open');
    if (controlChannel?.readyState === 'open') {
      connected = true;
      els.connectionBadge.textContent = 'Connected';
      els.connectionBadge.classList.add('connected');
      els.pttBtn.disabled = false;
      setRadioMessage('Ready. Hold the button to talk.');
    }
  }

  function startTalking() {
    if (!connected || !localTrack || els.pttBtn.disabled) return;
    if (remoteTx) {
      setRadioMessage('Channel busy — wait for your partner to finish.');
      return;
    }
    localTx = true;
    localTrack.enabled = true;
    els.remoteAudio.muted = true;
    els.pttBtn.classList.add('transmitting');
    els.pttBtn.querySelector('.ptt-main').textContent = 'TRANSMITTING';
    els.pttBtn.querySelector('.ptt-sub').textContent = 'release to stop';
    setRadioMessage('You are talking…');
    sendControl({ type: 'tx', active: true, id: peerId, name: myName });
  }

  function stopTalking(silent = false) {
    if (!localTx) return;
    localTx = false;
    if (localTrack) localTrack.enabled = false;
    els.remoteAudio.muted = false;
    els.pttBtn.classList.remove('transmitting');
    els.pttBtn.querySelector('.ptt-main').textContent = 'HOLD TO TALK';
    els.pttBtn.querySelector('.ptt-sub').textContent = 'press and hold';
    if (!silent) sendControl({ type: 'tx', active: false, id: peerId, name: myName });
    setRadioMessage(remoteTx ? 'Channel busy — listen to your partner.' : 'Ready. Hold the button to talk.');
  }

  function disconnect() {
    stopTalking();
    stopScanner();
    try { controlChannel?.close(); } catch (_) {}
    try { pc?.close(); } catch (_) {}
    localStream?.getTracks().forEach(t => t.stop());
    pc = null;
    localStream = null;
    localTrack = null;
    controlChannel = null;
    role = null;
    pendingOffer = null;
    currentPairCode = '';
    localTx = false;
    remoteTx = false;
    connected = false;
    peerId = randomId();
    els.remoteAudio.srcObject = null;
    els.remoteTalk.classList.add('hidden');
    els.connectionBadge.classList.remove('connected');
    showView('homeView');
    history.replaceState(null, '', basePageUrl());
  }

  function showErrorOnPair(err) {
    console.error(err);
    setPairStatus('Error');
    els.qrWrap.classList.add('hidden');
    els.qrHint.textContent = err?.message || String(err);
  }

  function openPasteModal(purpose) {
    scannerPurpose = purpose;
    els.modalTitle.textContent = purpose === 'answer' ? 'Paste answer backup' : 'Paste backup code';
    els.scannerPanel.classList.add('hidden');
    els.pastePanel.classList.remove('hidden');
    els.modalError.classList.add('hidden');
    els.manualCodeInput.value = '';
    els.modal.classList.remove('hidden');
    setTimeout(() => els.manualCodeInput.focus(), 50);
  }

  async function openScanner(purpose) {
    scannerPurpose = purpose;
    els.modalTitle.textContent = purpose === 'answer' ? 'Scan answer QR' : 'Scan partner QR';
    els.pastePanel.classList.add('hidden');
    els.scannerPanel.classList.remove('hidden');
    els.modalError.classList.add('hidden');
    els.modal.classList.remove('hidden');

    if (!('BarcodeDetector' in window)) {
      els.scannerPanel.classList.add('hidden');
      els.pastePanel.classList.remove('hidden');
      showModalError('This browser does not provide built-in QR scanning. Use the backup copy/paste option, or scan the QR with your device\'s normal camera.');
      return;
    }

    try {
      const formats = await BarcodeDetector.getSupportedFormats();
      if (!formats.includes('qr_code')) throw new Error('QR scanning is not supported in this browser.');
      scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      els.scannerVideo.srcObject = scannerStream;
      await els.scannerVideo.play();
      const detector = new BarcodeDetector({ formats: ['qr_code'] });
      const loop = async () => {
        if (!scannerStream) return;
        try {
          const codes = await detector.detect(els.scannerVideo);
          if (codes.length) {
            const raw = codes[0].rawValue;
            stopScanner();
            await handleScannedValue(raw);
            return;
          }
        } catch (_) {}
        scannerLoop = requestAnimationFrame(loop);
      };
      scannerLoop = requestAnimationFrame(loop);
    } catch (err) {
      els.scannerPanel.classList.add('hidden');
      els.pastePanel.classList.remove('hidden');
      showModalError(`${err.message} Use the backup copy/paste option instead.`);
    }
  }

  async function handleScannedValue(raw) {
    try {
      if (scannerPurpose === 'answer') await applyAnswer(raw);
      else {
        await prepareIncoming(raw);
        closeModal();
      }
    } catch (err) {
      showModalError(err.message || String(err));
      els.modal.classList.remove('hidden');
      els.scannerPanel.classList.add('hidden');
      els.pastePanel.classList.remove('hidden');
      els.manualCodeInput.value = '';
    }
  }

  function showModalError(message) {
    els.modalError.textContent = message;
    els.modalError.classList.remove('hidden');
  }

  function stopScanner() {
    if (scannerLoop) cancelAnimationFrame(scannerLoop);
    scannerLoop = 0;
    scannerStream?.getTracks().forEach(t => t.stop());
    scannerStream = null;
    els.scannerVideo.srcObject = null;
  }

  function closeModal() {
    stopScanner();
    els.modal.classList.add('hidden');
    els.modalError.classList.add('hidden');
  }

  async function receiveBridgedAnswer(raw) {
    if (!raw || role !== 'creator' || !pc || pc.remoteDescription?.type === 'answer') return;
    try {
      await applyAnswer(raw);
    } catch (err) {
      console.warn('Could not apply bridged answer:', err);
    }
  }

  pairBridge?.addEventListener('message', (event) => {
    if (event.data?.type === 'answer' && event.data?.code) receiveBridgedAnswer(event.data.code);
  });

  window.addEventListener('storage', (event) => {
    if (event.key !== 'eslRadioAnswerBridge' || !event.newValue) return;
    try {
      const data = JSON.parse(event.newValue);
      if (data?.code) receiveBridgedAnswer(data.code);
    } catch (_) {}
  });

  els.createBtn.addEventListener('click', makeOffer);
  els.scanOfferBtn.addEventListener('click', () => openScanner('offer'));
  els.pasteOfferBtn.addEventListener('click', () => openPasteModal('offer'));
  els.acceptOfferBtn.addEventListener('click', acceptOffer);
  els.incomingBackBtn.addEventListener('click', () => { pendingOffer = null; showView('homeView'); });
  els.scanAnswerBtn.addEventListener('click', () => openScanner('answer'));
  els.pasteAnswerBtn.addEventListener('click', () => openPasteModal('answer'));
  els.resetPairBtn.addEventListener('click', disconnect);
  els.disconnectBtn.addEventListener('click', disconnect);
  els.closeModalBtn.addEventListener('click', closeModal);
  els.modal.addEventListener('click', (e) => { if (e.target === els.modal) closeModal(); });

  els.copyCodeBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(currentPairCode);
      els.copyCodeBtn.textContent = 'Copied!';
      setTimeout(() => els.copyCodeBtn.textContent = 'Copy code', 1200);
    } catch (_) {
      els.pairCode.focus();
      els.pairCode.select();
    }
  });

  els.applyManualBtn.addEventListener('click', async () => {
    const raw = els.manualCodeInput.value.trim();
    try {
      if (scannerPurpose === 'answer') await applyAnswer(raw);
      else {
        await prepareIncoming(raw);
        closeModal();
      }
    } catch (err) {
      showModalError(err.message || String(err));
    }
  });

  const pressEvents = ['pointerdown'];
  pressEvents.forEach(ev => els.pttBtn.addEventListener(ev, (e) => { e.preventDefault(); els.pttBtn.setPointerCapture?.(e.pointerId); startTalking(); }));
  ['pointerup','pointercancel','lostpointercapture','pointerleave'].forEach(ev => els.pttBtn.addEventListener(ev, stopTalking));
  window.addEventListener('blur', stopTalking);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopTalking(); });

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) {
      e.preventDefault();
      startTalking();
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      stopTalking();
    }
  });

  window.addEventListener('beforeunload', () => {
    if (localTrack) localTrack.enabled = false;
    localStream?.getTracks().forEach(t => t.stop());
  });

  async function handleHashPairing() {
    const hash = location.hash.slice(1);
    if (!hash) return;
    const code = new URLSearchParams(hash).get('p') || hash;
    try {
      const { payload } = await decodePayload(code);
      if (payload.kind === 'offer') {
        await prepareIncoming(code);
      } else {
        // A normal phone camera opens answer QRs in a new tab. Pass that answer
        // to the creator tab on the same GitHub Pages origin so students do not
        // need BarcodeDetector or a giant manual code.
        pairBridge?.postMessage({ type: 'answer', code });
        try {
          localStorage.setItem('eslRadioAnswerBridge', JSON.stringify({ code, at: Date.now() }));
        } catch (_) {}
        showView('homeView');
        const message = document.createElement('div');
        message.className = 'info-box';
        message.innerHTML = '<strong>Answer sent!</strong><br>Go back to the original walkie-talkie tab. It should connect automatically.';
        els.homeView.appendChild(message);
      }
    } catch (err) {
      console.warn(err);
    }
  }


  if (!window.RTCPeerConnection) {
    els.createBtn.disabled = true;
    els.scanOfferBtn.disabled = true;
    const warning = document.createElement('div');
    warning.className = 'error-box';
    warning.textContent = 'This browser does not support WebRTC.';
    els.homeView.appendChild(warning);
  } else {
    handleHashPairing();
  }
})();
