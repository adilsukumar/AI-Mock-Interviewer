type Recognition = {
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
};

export function speechErrorMessage(error: string): string {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Speech recognition is blocked by this browser or its speech service. Microphone permission can still be allowed. Try opening this page in Chrome or Edge, then retry the microphone.';
    case 'network':
      return 'The speech recognition service could not connect. Check your connection and retry the microphone.';
    case 'audio-capture':
      return 'Speech recognition could not capture audio. Check that your microphone is connected and available, then retry.';
    default:
      return `Speech recognition stopped (${error}). Retry the microphone.`;
  }
}

export function microphoneErrorMessage(error: { name?: string }): string {
  switch (error.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Microphone access was blocked. Allow the microphone for this page and in your device privacy settings, then try again.';
    case 'NotFoundError':
      return 'No microphone was found. Connect a microphone and try again.';
    case 'NotReadableError':
      return 'The microphone could not be opened. Check whether another application or your device settings are blocking it.';
    case 'TimeoutError':
      return 'The microphone request is still waiting for the browser. Check its permission prompt. If access is already allowed, open this page in Chrome or Edge and try again.';
    default:
      return 'Microphone access could not be checked. Use HTTPS or localhost in a supported browser and try again.';
  }
}

export async function checkMicrophoneAccess(mediaDevices: Pick<MediaDevices, 'getUserMedia'>, timeoutMs = 15000) {
  // Release capture even if the user answers the permission prompt after timeout.
  const capture = mediaDevices.getUserMedia({ audio: true }).then(stream => {
    stream.getTracks().forEach(track => track.stop());
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([capture, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('Permission request pending'), { name: 'TimeoutError' })), timeoutMs);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

export function createRecognitionController(recognition: Recognition, callbacks: {
  canListen(): boolean;
  onListeningChange(listening: boolean): void;
  onError(message: string, code?: string): void;
  onRecovered(): void;
}) {
  let wanted = false;
  let running = false;
  let starting = false;
  let stopping = false;
  let disposed = false;

  function start() {
    if (disposed || !callbacks.canListen()) return;
    wanted = true;
    // Wait for onend before restarting a recognizer that is still stopping.
    if (running || starting || stopping) return;
    starting = true;
    try {
      recognition.start();
    } catch (error) {
      starting = false;
      wanted = false;
      const code = (error as { name?: string }).name || 'start-failed';
      callbacks.onError(speechErrorMessage(code), code);
    }
  }

  function stop() {
    wanted = false;
    callbacks.onListeningChange(false);
    if ((running || starting) && !stopping) {
      stopping = true;
      try { recognition.stop(); } catch { stopping = false; running = false; starting = false; }
    }
  }

  recognition.onstart = () => {
    if (disposed) return;
    starting = false;
    running = true;
    if (!wanted || !callbacks.canListen()) { stop(); return; }
    callbacks.onRecovered();
    callbacks.onListeningChange(true);
  };
  recognition.onerror = event => {
    if (disposed) return;
    callbacks.onListeningChange(false);
    if (event.error === 'no-speech') return;
    if (event.error === 'aborted') {
      if (wanted) callbacks.onError(speechErrorMessage('aborted'));
      wanted = false;
      return;
    }
    wanted = false; // Fatal failures require an explicit retry, never a restart loop.
    callbacks.onError(speechErrorMessage(event.error), event.error);
  };
  recognition.onend = () => {
    if (disposed) return;
    running = false;
    starting = false;
    stopping = false;
    callbacks.onListeningChange(false);
    if (wanted && callbacks.canListen()) start();
  };

  return {
    start,
    stop,
    dispose() {
      disposed = true;
      wanted = false;
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onerror = null;
      try { recognition.abort(); } catch {}
    }
  };
}
