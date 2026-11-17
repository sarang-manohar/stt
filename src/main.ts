import './style.css';
import { Capacitor } from '@capacitor/core';
import { serializeTranscript, shareTranscript } from './exportTranscript';
import { appendActivity, createActivityLogger } from './activityLog';
import { AudioRecorder } from './audioRecorder';
import { TranscriptionQueue, type ModelSetting, type TranscriptionResult } from './transcriptionQueue';
import { TranscriptDocument } from './transcriptDocument';
import { renderTranscript } from './transcriptView';
import { device, native, monitorConnectivity, offlineTranscribe } from './deviceServices';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = element('status');
const panel = element('transcript');
const notice = element('notice');
const record = element<HTMLButtonElement>('record');
const pause = element<HTMLButtonElement>('pause');
const stop = element<HTMLButtonElement>('stop');
const log = createActivityLogger({
  sessionId: crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join(''),
  endpoint: import.meta.env.VITE_ACTIVITY_LOG_URL?.trim(),
  write: entry => {
    console.info('[dictation]', JSON.stringify(entry));
    appendActivity(element('activity-log'), entry);
  },
});
const clear = element<HTMLButtonElement>('clear');
const copy = element<HTMLButtonElement>('copy');
const share = element<HTMLButtonElement>('share-transcript');
let exporting = false;
const settingsDialog = element<HTMLDialogElement>('settings-dialog');
element('open-settings').addEventListener('click', () => settingsDialog.showModal());
const activityTrail = element<HTMLDetailsElement>('activity-trail');
document.addEventListener('pointerdown', event => {
  if (event.target instanceof Node && !activityTrail.contains(event.target)) activityTrail.open = false;
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && activityTrail.open) {
    const focusInside = activityTrail.contains(document.activeElement);
    activityTrail.open = false;
    if (focusInside) element('activity-title').focus();
  }
});
const documentTranscript = new TranscriptDocument();
let detectedLanguage: string | undefined;
let resolved: TranscriptionResult | undefined;
const dialog = element<HTMLDialogElement>('key-dialog');
const keyInput = element<HTMLInputElement>('api-key');
const settings = element<HTMLButtonElement>('key-settings');
const envKey = import.meta.env.VITE_GROQ_API_KEY?.trim() || '';
let savedKey = '';
try { savedKey = localStorage.getItem('groq-api-key') || ''; } catch { /* Storage may be disabled. */ }
const languageSelect = element<HTMLSelectElement>('language');
const modelSelect = element<HTMLSelectElement>('model');
// Validate stored values against the available options; storage may be unavailable.
for (const select of [languageSelect, modelSelect]) {
  try {
    const saved = localStorage.getItem(`transcription-${select.id}`);
    if (saved && Array.from(select.options).some(option => option.value === saved)) select.value = saved;
  } catch { /* Use defaults when storage is disabled. */ }
}
const updateTranscriptLanguage = () => {
  panel.lang = languageSelect.value === 'auto' ? detectedLanguage ?? 'und' : languageSelect.value === 'en' ? 'en' : 'hi';
};
updateTranscriptLanguage();
let contextStart = 0;
let recording = false;
let transitioning = false;
let startedAt = 0;
let paused = false;
let elapsedMs = 0;
let online = native ? false : navigator.onLine;
let networkKnown = !native;
let notesLoaded = false;
let modelReady = false;
let saving = 0;
let saveFailed = false;
let saveChain = Promise.resolve();
document.querySelector('header')?.classList.toggle('native', native);
const getKey = () => envKey || savedKey;
function persistNotes(): void {
  const snapshot = documentTranscript.toJSON();
  saving++;
  saveChain = saveChain.then(async () => {
    if (native) await device.saveNotes({ document: snapshot });
    else localStorage.setItem('dictation-notes', JSON.stringify(snapshot));
    saveFailed = false;
  }).catch(() => {
    saveFailed = true;
    notice.textContent = 'Local save failed. Keep this app open and export your notes.';
  }).finally(() => { saving--; render(); });
}
const queue = new TranscriptionQueue({
  getKey,
  isOnline: () => online,
  transcribeOffline: offlineTranscribe,
  getTranscript: () => documentTranscript.text.slice(contextStart),
  getLanguage: () => languageSelect.value,
  getModel: () => modelSelect.value as ModelSetting,
  merge: (text, chunk, result) => {
    const nearBottom = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 80;
    documentTranscript.append(text, chunk.timestamp);
    persistNotes();
    resolved = result;
    if (text.trim() && result.language) detectedLanguage = result.language;
    updateTranscriptLanguage();
    renderTranscript(panel, documentTranscript.toJSON());
    if (nearBottom) panel.scrollTop = panel.scrollHeight;
  },
  onState: () => render(),
  onActivity: log,
});
const recorder = new AudioRecorder(chunk => queue.enqueue(chunk), () => {
  notice.textContent = 'Microphone disconnected. Recording stopped; captured audio is still queued.';
  log({ event: 'recording.interrupted', level: 'error', message: 'Microphone disconnected; recording stopped.' });
  if (recording) void stopRecording();
});
function render(): void {
  const state = queue.snapshot;
  let label = transitioning ? 'Please wait…' : 'Ready';
  if (recording) {
    const seconds = Math.floor((elapsedMs + (paused ? 0 : Date.now() - startedAt)) / 1000);
    label = `${paused ? 'Paused' : 'Recording'} ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  } else if (state.size) label = `Transcribing (Queue: ${state.size})`;
  if (state.phase === 'retrying') label += ` · Retry in ${Math.max(0, Math.ceil(((state.retryAt ?? 0) - Date.now()) / 1000))}s`;
  if (state.phase === 'paused') label = recording ? `${label} · Queue paused` : 'Queue paused';
  if (!notesLoaded || !networkKnown) label = 'Loading…';
  else if (saving && label === 'Ready') label = 'Saving…';
  status.textContent = label;
  const connectivity = element('connectivity');
  connectivity.textContent = networkKnown ? online ? 'Online Mode' : 'Offline Mode' : 'Checking network…';
  connectivity.classList.toggle('offline', !online);
  element<HTMLButtonElement>('download-model').disabled = !networkKnown || !online || recording;
  for (const content of panel.querySelectorAll<HTMLElement>('.transcript-text')) {
    content.contentEditable = String(notesLoaded && !recording && !transitioning && !state.size);
    content.title = 'Edit transcript text; changes are saved when focus leaves.';
  }
  status.classList.toggle('active', recording && !paused);
  status.classList.toggle('paused', recording && paused);
  if (state.phase === 'paused') notice.textContent = state.error || 'Queue paused.';
  element('recovery').hidden = state.phase !== 'paused';
  settings.hidden = Boolean(envKey);
  const busy = recording || transitioning || state.size > 0;
  languageSelect.disabled = modelSelect.disabled = busy;
  clear.disabled = busy || !documentTranscript.hasEntries;
  copy.disabled = !documentTranscript.hasEntries;
  share.disabled = exporting || busy || !documentTranscript.hasEntries;
  const detection = element('detection');
  detection.hidden = !resolved;
  detection.textContent = resolved
    ? `${languageSelect.value === 'auto' ? `Detected ${detectedLanguage === 'hi' ? 'Hindi' : detectedLanguage === 'en' ? 'English' : 'unknown'} · ` : ''}${resolved.model === 'whisper-tiny-local' ? `tiny · on-device · ${resolved.backend === 'vulkan' ? 'Vulkan' : 'CPU'}` : resolved.model === 'whisper-large-v3' ? 'v3' : 'v3-turbo'}` : '';
  record.hidden = recording;
  record.disabled = transitioning || !notesLoaded || !networkKnown;
  record.classList.toggle('recording', recording);
  pause.hidden = stop.hidden = !recording;
  pause.disabled = stop.disabled = transitioning;
  pause.textContent = paused ? '▶ Continue' : 'Ⅱ Pause';
  pause.setAttribute('aria-label', paused ? 'Continue recording' : 'Pause recording');
  pause.setAttribute('aria-pressed', String(paused));
}
async function stopRecording(): Promise<void> {
  transitioning = true;
  recording = false;
  paused = false;
  render();
  try {
    await recorder.stop();
    log({ event: 'recording.stopped', message: 'Recording stopped. Remaining audio will finish transcribing.' });
  }
  catch {
    notice.textContent = 'Could not fully close the audio device. Reload before recording again.';
    log({ event: 'recording.error', level: 'error', message: 'Could not close the audio device.' });
  }
  finally { transitioning = false; render(); }
}
record.addEventListener('click', async () => {
  if (recording || transitioning) return;
  if (!online && !modelReady) {
    notice.textContent = native ? 'Download the offline model in Settings while online before dictating offline.' : 'Offline transcription requires the Android app.';
    settingsDialog.showModal(); return;
  }
  if (online && !getKey()) { dialog.showModal(); return; }
  notice.textContent = '';
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    notice.textContent = 'Microphone access requires HTTPS (or localhost).';
    log({ event: 'recording.error', level: 'error', message: notice.textContent });
    return;
  }
  transitioning = true;
  render();
  try {
    if (!queue.snapshot.size) {
      queue.resetDetection();
      detectedLanguage = undefined;
      resolved = undefined;
      updateTranscriptLanguage();
    }
    await recorder.start();
    startedAt = Date.now();
    elapsedMs = 0;
    paused = false;
    recording = true;
    log({ event: 'recording.started', message: 'Recording started.', details: { model: modelSelect.value, language: languageSelect.value } });
  } catch (error) {
    notice.textContent = error instanceof Error ? `Microphone: ${error.message}` : 'Could not start microphone.';
    log({ event: 'recording.error', level: 'error', message: 'Could not start microphone.', details: { errorType: error instanceof Error ? error.name : 'unknown' } });
  } finally { transitioning = false; render(); }
});
stop.addEventListener('click', () => { if (recording && !transitioning) void stopRecording(); });
pause.addEventListener('click', async () => {
  if (!recording || transitioning) return;
  transitioning = true;
  const resuming = paused;
  if (!resuming) {
    elapsedMs += Date.now() - startedAt;
    paused = true;
  }
  render();
  try {
    // Close/flush at pause so no paused audio or overlap crosses the gap.
    // Continue opens a fresh capture window without resetting queue/context.
    if (resuming) {
      await recorder.start();
      startedAt = Date.now();
      paused = false;
    } else await recorder.stop();
    log({ event: resuming ? 'recording.resumed' : 'recording.paused', message: resuming ? 'Recording continued.' : 'Recording paused. Queued audio continues transcribing.' });
  } catch {
    notice.textContent = resuming ? 'Could not continue microphone. Try Continue again or Stop.' : 'Could not pause microphone safely. Recording stopped.';
    log({ event: 'recording.error', level: 'error', message: notice.textContent });
    if (!resuming) { recording = false; paused = false; }
  } finally { transitioning = false; render(); }
});
copy.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(serializeTranscript(documentTranscript.toJSON())); notice.textContent = 'Copied.'; }
  catch { notice.textContent = 'Copy unavailable. Use Share to export timestamped JSON.'; }
});
async function withExport(action: () => Promise<void>): Promise<void> {
  if (exporting) return;
  exporting = true;
  notice.textContent = '';
  render();
  try { await action(); }
  catch { notice.textContent = 'Sharing was cancelled or unavailable. Your transcript is still here; try again or use Copy.'; }
  finally { exporting = false; render(); }
}
share.addEventListener('click', () => void withExport(async () => {
  await shareTranscript(documentTranscript.toJSON());
}));
clear.addEventListener('click', () => {
  documentTranscript.clear();
  persistNotes();
  detectedLanguage = undefined;
  resolved = undefined;
  updateTranscriptLanguage();
  contextStart = 0;
  renderTranscript(panel, documentTranscript.toJSON());
  notice.textContent = '';
  render();
});
for (const select of [languageSelect, modelSelect]) {
  select.addEventListener('change', () => {
    // Keep displayed text, but do not bias a new language session with prior text.
    if (select === languageSelect) {
      contextStart = documentTranscript.text.length;
      detectedLanguage = undefined;
      resolved = undefined;
      queue.resetDetection();
      updateTranscriptLanguage();
    }
    log({ event: `settings.${select.id}_selected`, message: `${select === languageSelect ? 'Language' : 'Model'} selected: ${select.selectedOptions[0].text}.`,
      details: { model: modelSelect.value, language: languageSelect.value } });
    try { localStorage.setItem(`transcription-${select.id}`, select.value); }
    catch { notice.textContent = 'Preference is available for this tab, but browser storage is disabled.'; }
    render();
  });
}
element('retry').addEventListener('click', () => { notice.textContent = ''; queue.resume(); });
settings.addEventListener('click', () => { if (!envKey) dialog.showModal(); });
element('cancel-key').addEventListener('click', () => dialog.close());
element('key-form').addEventListener('submit', event => {
  event.preventDefault();
  savedKey = keyInput.value.trim();
  if (!savedKey) return;
  try { localStorage.setItem('groq-api-key', savedKey); }
  catch { notice.textContent = 'Key is available for this tab, but browser storage is disabled.'; }
  keyInput.value = '';
  dialog.close();
  queue.resume();
});
panel.addEventListener('focusout', event => {
  const content = event.target;
  if (!(content instanceof HTMLElement) || !content.matches('.transcript-text')) return;
  const timestamp = content.parentElement?.dataset.timestamp;
  if (timestamp && documentTranscript.toJSON()[timestamp] !== content.textContent) {
    documentTranscript.edit(timestamp, content.textContent ?? '');
    persistNotes(); render();
  }
});
element('device-settings').hidden = !native;
element('download-model').addEventListener('click', async () => {
  const button = element<HTMLButtonElement>('download-model');
  const cancelButton = element<HTMLButtonElement>('cancel-model-download');
  const progress = element<HTMLProgressElement>('model-download-progress');
  const status = element('offline-model-status');
  let progressListener: Awaited<ReturnType<typeof device.addListener>> | undefined;
  let downloadError: string | undefined;
  button.hidden = true;
  cancelButton.hidden = false;
  cancelButton.disabled = false;
  progress.hidden = false;
  progress.value = 0;
  status.textContent = 'Starting model download…';
  try {
    progressListener = await device.addListener('modelDownloadProgress', ({ bytesReceived, totalBytes }) => {
      if (!Number.isSafeInteger(bytesReceived) || !Number.isSafeInteger(totalBytes)
          || bytesReceived < 0 || totalBytes <= 0 || bytesReceived > totalBytes) return;
      progress.value = (bytesReceived / totalBytes) * 100;
      const receivedMb = (bytesReceived / 1048576).toFixed(1);
      const totalMb = (totalBytes / 1048576).toFixed(1);
      status.textContent = `Downloading and verifying model… ${Math.floor(progress.value)}% (${receivedMb} / ${totalMb} MB)`;
    });
    await device.downloadModel(); modelReady = true;
    status.textContent = 'Offline Whisper ready · multilingual tiny q5_1 · Vulkan preferred, CPU fallback';
    queue.resume();
  } catch (error) {
    downloadError = error instanceof Error ? error.message : 'Download failed; retry while online.';
    status.textContent = downloadError;
  } finally {
    try {
      await progressListener?.remove();
    } catch (error) {
      const cleanupError = error instanceof Error ? error.message : 'unknown error';
      status.textContent = `${downloadError ? `${downloadError} ` : ''}Could not remove model progress listener: ${cleanupError}`;
    }
    progress.hidden = true;
    cancelButton.hidden = true;
    cancelButton.disabled = false;
    button.hidden = false;
    render();
  }
});
element<HTMLButtonElement>('cancel-model-download').addEventListener('click', async () => {
  const button = element<HTMLButtonElement>('cancel-model-download');
  button.disabled = true;
  element('offline-model-status').textContent = 'Cancelling model download…';
  try {
    const result = await device.cancelModelDownload();
    if (!result.cancelled) element('offline-model-status').textContent = 'Model installation is finishing…';
  } catch (error) {
    element('offline-model-status').textContent = error instanceof Error ? error.message : 'Could not cancel model download.';
    button.disabled = false;
  }
});
async function initializeDevice(): Promise<void> {
  try {
    await monitorConnectivity(value => {
      const changed = networkKnown && online !== value;
      online = value; networkKnown = true;
      if (changed && queue.snapshot.phase === 'paused') queue.resume();
      render();
    });
    if (native) {
      const saved = await device.loadNotes();
      if (saved.document) documentTranscript.restore(saved.document);
      modelReady = (await device.modelStatus()).ready;
      element('offline-model-status').textContent = modelReady ? 'Offline Whisper ready · multilingual tiny q5_1 · Vulkan preferred, CPU fallback' : 'Model not installed. Download once before going offline.';
    } else {
      const saved = localStorage.getItem('dictation-notes');
      if (saved) documentTranscript.restore(JSON.parse(saved));
    }
    notesLoaded = true;
    renderTranscript(panel, documentTranscript.toJSON());
  } catch {
    notice.textContent = 'Could not initialize saved notes or network status. Reload to avoid overwriting existing notes.';
  }
  render();
}
void initializeDevice();
window.addEventListener('beforeunload', event => {
  if (recording || transitioning || queue.snapshot.size || saving) event.preventDefault();
});
log({ event: 'settings.loaded', message: `Settings loaded · ${modelSelect.selectedOptions[0].text} · ${languageSelect.selectedOptions[0].text}.`,
  details: { model: modelSelect.value, language: languageSelect.value } });
setInterval(render, 250);
render();
// Native assets are bundled with each APK; a worker could serve stale app code.
if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      notice.textContent = 'Offline app shell unavailable. You can still dictate while online.';
    });
  });
}
