export const MAX_AUDIO_BYTES = 4_000_000;

export function validateAudio(file: { size: number; type: string }) {
  if (!file.size) return { status: 400, error: 'No audio was recorded. Please try again.' };
  if (file.size > MAX_AUDIO_BYTES) return { status: 413, error: 'The answer is too long. Please try a shorter answer.' };
  if (!/^audio\/(webm|mp4|ogg|wav|x-wav|mpeg|mp3|flac|m4a|x-m4a)(;|$)/i.test(file.type)) {
    return { status: 415, error: 'This browser produced an unsupported audio format.' };
  }
  return null;
}

export function createPauseDetector(silenceMs = 2500) {
  let speakingSince: number | null = null;
  let lastSpeech: number | null = null;
  let speechMs = 0;
  return (rms: number, now: number) => {
    if (rms >= 0.015) {
      if (speakingSince !== null) speechMs += Math.min(now - speakingSince, 200);
      speakingSince = now;
      lastSpeech = now;
    } else speakingSince = null;
    return speechMs >= 300 && lastSpeech !== null && now - lastSpeech >= silenceMs;
  };
}

// Silence detection preserves the automatic speak-and-pause interaction.
export function createVoiceCapture(stream: MediaStream, Recorder: typeof MediaRecorder, Context: typeof AudioContext, callbacks: {
  onComplete(blob: Blob): void;
  onError(message: string): void;
}, sharedContext?: AudioContext) {
  let recorder: MediaRecorder | undefined;
  let context: AudioContext | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let meter: ReturnType<typeof setInterval> | undefined;
  let limit: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;
  let finished = false;
  let released = false;
  let bytes = 0;
  const chunks: Blob[] = [];
  const release = () => {
    if (released) return;
    released = true;
    clearInterval(meter);
    clearTimeout(limit);
    stream.getTracks().forEach(track => track.stop());
    source?.disconnect();
    if (!sharedContext && context && context.state !== 'closed') void context.close().catch(() => {});
  };
  const stop = (discard = false) => {
    if (discard) cancelled = true;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    release();
  };
  const fail = (message: string) => {
    if (cancelled || finished) return;
    stop(true);
    callbacks.onError(message);
  };
  try {
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => Recorder.isTypeSupported(type));
    recorder = new Recorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 64000 });
    context = sharedContext || new Context();
    source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const paused = createPauseDetector();
    recorder.ondataavailable = event => {
      if (cancelled || finished) return;
      bytes += event.data.size;
      if (bytes > MAX_AUDIO_BYTES) fail('The answer is too long. Please retry with a shorter answer.');
      else if (event.data.size) chunks.push(event.data);
    };
    recorder.onerror = () => fail('Audio capture failed. Check your microphone and retry.');
    recorder.onstop = () => {
      release();
      if (finished) return;
      finished = true;
      if (!cancelled) callbacks.onComplete(new Blob(chunks, { type: recorder?.mimeType || chunks[0]?.type || 'audio/webm' }));
    };
    recorder.start(1000);
    meter = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
      if (paused(rms, Date.now())) stop();
    }, 100);
    limit = setTimeout(() => fail('The two-minute answer limit was reached. Retry with a shorter answer.'), 120000);
    void context.resume().then(() => {
      if (!cancelled && !finished && context?.state !== 'running') fail('Audio capture is paused by the browser. Click Retry microphone to continue.');
    }).catch(() => fail('Audio capture could not start. Click Retry microphone to continue.'));
    return { cancel: () => stop(true) };
  } catch (error) {
    stop(true);
    throw error;
  }
}
