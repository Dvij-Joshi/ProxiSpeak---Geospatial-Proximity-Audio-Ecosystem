import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function manager() {
  const source = (await readFile(new URL('../src/services/webrtc.js', import.meta.url), 'utf8'))
    .replace("import { SERVER_URL } from '../config';", "const SERVER_URL = 'http://127.0.0.1:1';");
  const { webrtc } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  return webrtc;
}

test('peer negotiation operations serialize across await boundaries', async () => {
  const webrtc = await manager();
  webrtc.socket = { connected: true };
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const events = [];
  const first = webrtc._queueNegotiation('peer', async () => {
    events.push('remote-offer');
    await gate;
    events.push('local-answer');
  });
  const second = webrtc._queueNegotiation('peer', () => events.push('next-offer'));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, ['remote-offer']);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(events, ['remote-offer', 'local-answer', 'next-offer']);
  await webrtc._queueNegotiation('peer', () => { throw new Error('rejected operation'); }).catch(() => {});
  await webrtc._queueNegotiation('peer', () => events.push('recovered'));
  assert.equal(events.at(-1), 'recovered');
});

test('a microphone permission grant arriving after removal releases its track', async () => {
  const webrtc = await manager();
  let grant;
  webrtc._requestMicStream = () => new Promise(resolve => { grant = resolve; });
  let stopped = false;
  const opening = webrtc._acquireMicStream();
  webrtc.closeAll();
  grant({getTracks: () => [{stop: () => { stopped = true; }}]});
  await assert.rejects(opening,/Meeting ended/);
  assert.equal(stopped,true);
});
