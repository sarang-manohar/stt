import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';

const readRows = async page => page.locator('#transcript .transcript-entry').evaluateAll(rows =>
  Object.fromEntries(rows.map(row => [row.dataset.timestamp, row.querySelector('.transcript-text').textContent])));
const downloadJSON = async page => {
  await page.evaluate(() => Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }));
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const file = await event;
  assert.equal(file.suggestedFilename(), 'transcript.json');
  return JSON.parse(await readFile(await file.path(), 'utf8'));
};

// Run against the production build; all Groq traffic is mocked, never billed.
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { stdio: 'pipe' });
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch('http://127.0.0.1:4173')).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
  for (const fallback of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, permissions: ['microphone', 'clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    if (fallback) await page.addInitScript(() => {
      Object.defineProperty(AudioContext.prototype, 'audioWorklet', { get: () => undefined });
    });
    let requests = 0;
    let inFlight = 0;
    const language = fallback ? 'hi' : 'hinglish';
    const model = fallback ? 'whisper-large-v3-turbo' : 'whisper-large-v3';
    await page.route('https://api.groq.com/**', async route => {
      assert.equal(inFlight++, 0, 'transcription uploads must be sequential');
      requests++;
      const body = route.request().postDataBuffer();
      assert.ok(body.includes(Buffer.from('RIFF')));
      const newSession = requests > (fallback ? 1 : 2);
      const expectedModel = newSession
        ? (fallback && requests === 3 ? 'whisper-large-v3' : 'whisper-large-v3-turbo') : model;
      assert.ok(body.includes(Buffer.from(`name="model"\r\n\r\n${expectedModel}\r\n`)));
      assert.ok(body.includes(Buffer.from('name="response_format"\r\n\r\nverbose_json\r\n')));
      assert.equal(body.includes(Buffer.from('name="language"\r\n\r\nhi\r\n')), !newSession);
      if (newSession) assert.ok(!body.includes(Buffer.from('name="language"')));
      if (requests === 1 || newSession) assert.ok(!body.includes(Buffer.from('name="prompt"')));
      await new Promise(resolve => setTimeout(resolve, 400));
      inFlight--;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
        text: newSession && fallback ? 'आज अच्छी बारिश हुई। <img src=x onerror=alert(1)>' : requests === 1 ? 'Hello bright red roses.' : 'bright red roses grow here.',
        ...(newSession ? { language: fallback ? 'hindi' : 'english' } : {}),
      }) });
    });
    await page.goto('http://127.0.0.1:4173');
    await page.evaluate(() => navigator.serviceWorker.ready);
    assert.equal(await page.locator('#language').inputValue(), 'auto');
    assert.equal(await page.locator('#transcript').getAttribute('lang'), 'und');
    assert.ok(await page.locator('#language').isHidden());
    assert.ok(await page.locator('#model').isHidden());
    assert.equal(await page.locator('#save-transcript').count(), 0);
    assert.ok(await page.locator('#share-transcript').isDisabled());
    // Cold-load workspace fills the screen, with settings pinned top-right.
    for (const viewport of [{ width: 393, height: 852 }, { width: 320, height: 720 }, { width: 852, height: 393 }]) {
      await page.setViewportSize(viewport);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight));
      const workspace = await page.locator('.transcript-panel').boundingBox();
      const header = await page.locator('header').boundingBox();
      const gear = await page.locator('#open-settings').boundingBox();
      assert.ok(workspace.height > viewport.height * .5, 'workspace should occupy most of the launch screen');
      assert.ok(Math.abs(gear.x + gear.width - header.x - header.width) < 1, 'settings must align with the header right edge');
      assert.ok(Math.abs(gear.y - header.y) < 1, 'settings must stay at the top of the header');
      assert.ok(await page.locator('#activity-log').isHidden());
      await page.locator('#activity-title').tap();
      assert.ok(await page.locator('#activity-log').isVisible());
      await page.locator('#activity-log').tap();
      assert.ok(await page.locator('#activity-log').isVisible(), 'inside taps should not collapse the trail');
      await page.locator('.brand').tap();
      assert.ok(await page.locator('#activity-log').isHidden());
    }
    await page.setViewportSize({ width: 393, height: 852 });
    await page.locator('#activity-title').focus();
    await page.keyboard.press('Enter');
    assert.ok(await page.locator('#activity-log').isVisible());
    await page.keyboard.press('Escape');
    assert.ok(await page.locator('#activity-log').isHidden());
    await page.locator('#activity-title').tap();
    await page.locator('#activity-title').tap();
    assert.ok(await page.locator('#activity-log').isHidden(), 'summary toggles closed too');
    assert.equal(await page.locator('.intro, .brand-caption, #record-label').count(), 0);
    await page.getByRole('button', { name: 'Transcription settings', exact: true }).click();
    await page.locator('#language').selectOption(language);
    await page.locator('#model').selectOption(model);
    assert.equal(await page.locator('#transcript').getAttribute('lang'), 'hi');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    assert.ok(await page.locator('#settings-dialog').isHidden());
    await page.reload();
    assert.equal(await page.locator('#language').inputValue(), language);
    assert.equal(await page.locator('#model').inputValue(), model);
    await page.getByRole('button', { name: 'Start recording' }).click();
    // With no env key, exercise the optional fallback dialog too.
    if (await page.locator('#key-dialog').isVisible()) {
      await page.locator('#api-key').fill('mock-browser-key');
      await page.getByRole('button', { name: 'Save key' }).click();
      await page.getByRole('button', { name: 'Start recording' }).click();
    }
    await page.waitForFunction(() => document.querySelector('#record')?.classList.contains('recording'));
    assert.ok(await page.locator('#language').isDisabled());
    assert.ok(await page.locator('#model').isDisabled());
    assert.equal(await page.locator('#save-transcript').count(), 0);
    assert.ok(await page.locator('#share-transcript').isDisabled());
    await page.getByRole('button', { name: 'Transcription settings', exact: true }).click();
    assert.ok(await page.locator('#language').isVisible());
    assert.ok(await page.locator('#language').isDisabled());
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.waitForTimeout(fallback ? 1200 : 11000);
    await page.getByRole('button', { name: 'Stop recording' }).click();
    await page.waitForFunction(() => !document.querySelector('#record')?.disabled && document.querySelector('#status')?.textContent === 'Ready');
    assert.ok(await page.locator('#language').isEnabled());
    assert.ok(await page.locator('#model').isEnabled());
    assert.equal(requests, fallback ? 1 : 2);
    const expectedRows = fallback
      ? { '00:00': 'Hello bright red roses.' }
      : { '00:00': 'Hello bright red roses.', '00:08': 'grow here.' };
    assert.deepEqual(await readRows(page), expectedRows);
    assert.deepEqual(await page.locator('.transcript-time').allTextContents(), Object.keys(expectedRows));
    await page.getByRole('button', { name: 'Copy', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#notice')?.textContent === 'Copied.');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), JSON.stringify(expectedRows, null, 2));
    assert.deepEqual(await downloadJSON(page), expectedRows);
    assert.equal(await page.locator('#download-json').count(), 0);
    // Share falls back to download above; browsers with Web Share use the chooser.
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'share', { configurable: true, value: async data => {
        document.body.dataset.sharedText = data.text;
      } });
    });
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    assert.equal(await page.locator('body').getAttribute('data-shared-text'), JSON.stringify(expectedRows, null, 2));
    // Auto detects from audio metadata, selects a model, and isolates prompt context.
    await page.getByRole('button', { name: 'Transcription settings', exact: true }).click();
    await page.locator('#language').selectOption('auto');
    await page.locator('#model').selectOption('auto');
    await page.keyboard.press('Escape');
    assert.ok(await page.locator('#settings-dialog').isHidden());
    assert.ok(await page.locator('#open-settings').evaluate(button => button === document.activeElement));
    assert.equal(await page.locator('#transcript').getAttribute('lang'), 'und');
    assert.ok((await page.locator('#transcript').textContent()).length > 0);
    await page.getByRole('button', { name: 'Start recording' }).click();
    await page.waitForFunction(() => document.querySelector('#record')?.classList.contains('recording'));
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Stop recording' }).click();
    await page.waitForFunction(() => !document.querySelector('#record')?.disabled && document.querySelector('#status')?.textContent === 'Ready');
    assert.equal(requests, 3);
    assert.equal(await page.locator('#transcript').getAttribute('lang'), fallback ? 'hi' : 'en');
    assert.equal(await page.locator('#detection').textContent(), fallback ? 'Detected Hindi · v3' : 'Detected English · v3-turbo');
    assert.deepEqual(await readRows(page), await downloadJSON(page));
    await page.getByRole('button', { name: 'Copy', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#notice')?.textContent === 'Copied.');
    assert.deepEqual(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())), await readRows(page));
    assert.equal(await page.locator('#transcript img').count(), 0, 'transcription text must not be interpreted as HTML');
    if (fallback) {
      assert.equal(await page.locator('.transcript-text').last().textContent(), 'आज अच्छी बारिश हुई। <img src=x onerror=alert(1)>');
    } else {
      assert.equal(await page.locator('.transcript-text').last().textContent(), '');
      assert.equal(await page.locator('.transcript-text').last().getAttribute('aria-label'), 'No new text: silence or repeated overlap');
    }
    await page.setViewportSize({ width: 320, height: 720 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    assert.equal(await page.locator('#transcript').textContent(), '');
    assert.ok(await page.locator('#copy').isDisabled());
    assert.equal(await page.locator('#save-transcript').count(), 0);
    assert.ok(await page.locator('#share-transcript').isDisabled());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    // Pause flushes the tail and releases the mic; Continue starts a new window.
    let pauseRequests = 0;
    await page.route('https://api.groq.com/**', async route => {
      pauseRequests++;
      if (pauseRequests === 1) return route.fulfill({ status: 503, body: '' });
      if (pauseRequests === 2) return route.fulfill({ status: 401, body: '' });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ text: `Segment ${pauseRequests}.`, language: 'english' }) });
    });
    await page.getByRole('button', { name: 'Start recording' }).click();
    await page.getByRole('button', { name: 'Pause recording' }).waitFor();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Pause recording' }).click();
    await page.waitForFunction(() => document.querySelector('#pause')?.textContent.includes('Continue') && !document.querySelector('#pause')?.disabled);
    assert.ok(await page.locator('#record').isHidden());
    assert.ok(await page.locator('#language').isDisabled());
    await page.getByRole('button', { name: 'Retry queue' }).waitFor();
    const pausedStatus = await page.locator('#status').textContent();
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('#status').textContent(), pausedStatus, 'paused duration must not advance');
    assert.equal(pauseRequests, 2, 'paused microphone must not enqueue new audio');
    const trail = await page.locator('#activity-log').textContent();
    assert.match(trail, /Transcription starting/);
    assert.match(trail, /503/);
    assert.match(trail, /Retry 1 scheduled/);
    assert.match(trail, /401/);
    assert.match(trail, /Recording paused/);
    assert.ok(await page.locator('#activity-log time').first().getAttribute('datetime'));
    await page.getByRole('button', { name: 'Retry queue' }).click();
    await page.waitForFunction(() => document.querySelector('#recovery')?.hidden);
    await page.getByRole('button', { name: 'Continue recording' }).click();
    await page.getByRole('button', { name: 'Pause recording' }).waitFor();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Stop recording' }).click();
    await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'Ready');
    assert.equal(pauseRequests, 4);
    assert.ok(await page.getByRole('button', { name: 'Start recording' }).isVisible());
    // Stop also works directly from a paused capture, with no duplicate tail.
    await page.getByRole('button', { name: 'Start recording' }).click();
    await page.getByRole('button', { name: 'Pause recording' }).click();
    await page.getByRole('button', { name: 'Stop recording' }).click();
    await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'Ready');
    assert.equal(pauseRequests, 4);
    await page.reload();
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    assert.equal(await page.locator('#language').inputValue(), 'auto');
    assert.equal(await page.locator('#model').inputValue(), 'auto');
    assert.equal(await page.locator('#transcript').getAttribute('lang'), 'und');
    await context.setOffline(true);
    await page.reload();
    await page.locator('#record').waitFor();
    assert.deepEqual(errors, []);
    console.log(`PASS: ${fallback ? 'ScriptProcessor fallback' : 'AudioWorklet windows + overlap'}, timestamped UI/JSON parity, safe text, mobile UI, copy/clear, offline shell`);
    await context.close();
  }
} finally {
  await browser?.close();
  server.kill();
}
