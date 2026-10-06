const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/lib/audio-recording.ts');
const loaded = new Module(filename, module);
loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText, filename);
const { validateAudio, createPauseDetector, createVoiceCapture } = loaded.exports;

test('audio validation accepts browser MIME codecs and rejects empty, oversized or nonaudio files', () => {
  for (const type of ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/wav']) {
    assert.equal(validateAudio({ size: 5000, type }), null);
  }
  assert.equal(validateAudio({ size: 0, type: 'audio/webm' }).status, 400);
  assert.equal(validateAudio({ size: 4_000_001, type: 'audio/webm' }).status, 413);
  assert.equal(validateAudio({ size: 50, type: 'text/plain' }).status, 415);
});
test('silence and isolated clicks never send an answer; sustained speech sends only after the pause', () => {
  const detect = createPauseDetector();
  assert.equal(detect(0, 0), false);
  assert.equal(detect(0.08, 100), false);
  assert.equal(detect(0, 200), false);
  assert.equal(detect(0, 5000), false);
  for (let time = 5100; time <= 5500; time += 100) assert.equal(detect(0.04, time), false);
  assert.equal(detect(0, 7999), false);
  assert.equal(detect(0, 8000), true);
});
test('a pause inside an answer is reset by resumed speech', () => {
  const detect = createPauseDetector();
  for (let time = 0; time <= 500; time += 100) detect(0.04, time);
  assert.equal(detect(0, 2000), false);
  detect(0.04, 2100);
  assert.equal(detect(0, 3000), false);
  assert.equal(detect(0, 4600), true);
});

function fixture(shared = false) {
  let stopped = 0, closed = 0, disconnected = 0;
  const completed = [], errors = [];
  const stream = { getTracks: () => [{ stop() { stopped++; } }] };
  let recorder;
  class Recorder {
    static isTypeSupported(type) { return type === 'audio/mp4'; }
    constructor(_stream, options) { recorder = this; this.mimeType = options.mimeType; this.state = 'inactive'; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable({ data: new Blob(['answer'], { type: this.mimeType }) }); this.onstop(); }
  }
  class Context {
    state = 'running';
    createMediaStreamSource() { return { connect() {}, disconnect() { disconnected++; } }; }
    createAnalyser() { return { fftSize: 2048, getFloatTimeDomainData(array) { array.fill(0); } }; }
    async resume() {}
    async close() { this.state = 'closed'; closed++; }
  }
  const context = shared ? new Context() : undefined;
  const capture = createVoiceCapture(stream, Recorder, Context, { onComplete: blob => completed.push(blob), onError: message => errors.push(message) }, context);
  return { capture, recorder, completed, errors, counts: () => [stopped, closed, disconnected] };
}
test('completed recording preserves final audio chunk and releases every resource once', async () => {
  const f = fixture();
  f.recorder.stop();
  assert.equal(f.completed.length, 1);
  assert.equal(f.completed[0].type, 'audio/mp4');
  assert.equal(await f.completed[0].text(), 'answer');
  assert.deepEqual(f.counts(), [1, 1, 1]);
});
test('cancellation discards audio, prevents upload, and releases resources once', () => {
  const f = fixture();
  f.capture.cancel(); f.capture.cancel();
  assert.equal(f.completed.length, 0);
  assert.deepEqual(f.counts(), [1, 1, 1]);
});
test('recorder failure displays recovery without sending partial audio', () => {
  const f = fixture();
  f.recorder.onerror();
  assert.equal(f.completed.length, 0);
  assert.equal(f.errors.length, 1);
  assert.deepEqual(f.counts(), [1, 1, 1]);
});
test('construction failure also releases the microphone', () => {
  let stopped = 0;
  class BrokenRecorder { static isTypeSupported() { return true; } constructor() { throw new Error('unsupported'); } }
  assert.throws(() => createVoiceCapture({ getTracks: () => [{ stop() { stopped++; } }] }, BrokenRecorder, class {}, { onComplete() {}, onError() {} }), /unsupported/);
  assert.equal(stopped, 1);
});

test('capture disconnects its source but keeps a gesture-unlocked context usable for the next answer', () => {
  const f = fixture(true);
  f.capture.cancel();
  assert.deepEqual(f.counts(), [1, 0, 1]);
});
