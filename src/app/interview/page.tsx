'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle, Info, Mic, Loader2, Volume2, Camera } from 'lucide-react';
import { checkMicrophoneAccess, createRecognitionController, microphoneErrorMessage } from '@/lib/speech-recognition';
import { createVoiceCapture } from '@/lib/audio-recording';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

// Map companies to avatar colors
const COMPANY_COLORS: Record<string, string> = {
  "Google": "linear-gradient(45deg, #4285F4, #EA4335, #FBBC05, #34A853)",
  "Meta": "radial-gradient(circle at 30% 30%, #0668E1, #004BFF, #001A88)",
  "Amazon": "radial-gradient(circle at 30% 30%, #FF9900, #232F3E, #131A22)",
  "Apple": "radial-gradient(circle at 30% 30%, #A3AAAE, #555555, #111111)",
  "Netflix": "radial-gradient(circle at 30% 30%, #E50914, #B20710, #221F1F)",
  "Microsoft": "linear-gradient(45deg, #F25022, #7FBA00, #00A4EF, #FFB900)",
  "Stripe": "radial-gradient(circle at 30% 30%, #635BFF, #00D4FF, #0A2540)"
};

function InterviewContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const role = searchParams.get('role') || 'Software Engineer';
  const level = searchParams.get('level') || 'Mid-Level';
  const company = searchParams.get('company') || 'General (No specific company)';

  const avatarBackground = COMPANY_COLORS[company] || "radial-gradient(circle at 30% 30%, var(--accent-tertiary), var(--accent-primary), #3b0764)";

  const [setupPhase, setSetupPhase] = useState<'instructions' | 'interview'>('instructions');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  
  // Audio state
  const [accumulatedTranscript, setAccumulatedTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState('');
  const [microphoneError, setMicrophoneError] = useState('');
  const [microphoneAccess, setMicrophoneAccess] = useState<'unknown' | 'checking' | 'allowed' | 'blocked'>('unknown');
  const [isStarting, setIsStarting] = useState(false);
  const [usesServerSpeech, setUsesServerSpeech] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [evaluation, setEvaluation] = useState<string | null>(null);

  // Vision State
  const [visionAnalysis, setVisionAnalysis] = useState<string>('');

  const recognitionRef = useRef<any>(null);
  const recognitionControllerRef = useRef<ReturnType<typeof createRecognitionController> | null>(null);
  const sessionEndedRef = useRef(false);
  const permissionCheckRef = useRef(false);
  const mountedRef = useRef(true);
  const serverSpeechRef = useRef(false);
  const captureRef = useRef<ReturnType<typeof createVoiceCapture> | null>(null);
  const capturePendingRef = useRef(false);
  const captureGenerationRef = useRef(0);
  const transcriptionRef = useRef<AbortController | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const silenceTimerRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Webcam Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visionTimerRef = useRef<any>(null);

  // Voice Selection State
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');

  // Refs for state
  const isSpeakingRef = useRef(isSpeaking);
  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);
  
  const isProcessingRef = useRef(isProcessing);
  useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);
  
  const isEvaluatingRef = useRef(isEvaluating);
  useEffect(() => { isEvaluatingRef.current = isEvaluating; }, [isEvaluating]);

  const accumulatedTranscriptRef = useRef(accumulatedTranscript);
  useEffect(() => { accumulatedTranscriptRef.current = accumulatedTranscript; }, [accumulatedTranscript]);
  
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const setupPhaseRef = useRef(setupPhase);
  useEffect(() => { setupPhaseRef.current = setupPhase; }, [setupPhase]);

  const stopListening = () => {
    clearTimeout(silenceTimerRef.current);
    recognitionControllerRef.current?.stop();
    captureGenerationRef.current++;
    capturePendingRef.current = false;
    captureRef.current?.cancel();
    captureRef.current = null;
    transcriptionRef.current?.abort();
    transcriptionRef.current = null;
    setIsTranscribing(false);
    setIsListening(false);
  };

  const canCapture = () => mountedRef.current && setupPhaseRef.current === 'interview' && !sessionEndedRef.current &&
    !isSpeakingRef.current && !isProcessingRef.current && !isEvaluatingRef.current;

  const unlockAudio = () => {
    const Context = window.AudioContext || (window as any).webkitAudioContext;
    if (!Context) return;
    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') audioContextRef.current = new Context();
      // Resume during a user gesture, including in browsers with strict autoplay rules.
      void audioContextRef.current?.resume().catch(() => {});
    } catch {}
  };

  const closeAudio = () => {
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  };

  const submitAudio = async (blob: Blob, generation: number) => {
    captureRef.current = null;
    if (!canCapture() || generation !== captureGenerationRef.current) return;
    setIsListening(false);
    if (!blob.size) { setMicrophoneError('No audio was captured. Please retry the microphone.'); return; }
    const controller = new AbortController();
    transcriptionRef.current = controller;
    setIsTranscribing(true);
    const timer = setTimeout(() => controller.abort(), 55000);
    try {
      const form = new FormData();
      const extension = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm';
      form.append('audio', blob, `answer.${extension}`);
      const response = await fetch('/api/transcribe', { method: 'POST', body: form, signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Transcription failed. Please retry the microphone.');
      if (!canCapture() || generation !== captureGenerationRef.current || controller.signal.aborted) return;
      if (typeof data.text !== 'string' || !data.text.trim()) throw new Error('No speech was detected. Please retry the microphone.');
      // The upload has completed; sending the answer may now stop listening safely.
      transcriptionRef.current = null;
      setIsTranscribing(false);
      setMicrophoneError('');
      await handleSendResponse(data.text.trim());
    } catch (err) {
      if (canCapture() && generation === captureGenerationRef.current) {
        setMicrophoneError(controller.signal.aborted ? 'Transcription timed out. Please retry the microphone.' : (err as Error).message);
      }
    } finally {
      clearTimeout(timer);
      if (transcriptionRef.current === controller) {
        transcriptionRef.current = null;
        if (mountedRef.current) setIsTranscribing(false);
      }
    }
  };

  const startAudioCapture = async () => {
    if (!canCapture() || capturePendingRef.current || captureRef.current || transcriptionRef.current) return;
    const Context = window.AudioContext || (window as any).webkitAudioContext;
    if (typeof MediaRecorder === 'undefined' || !Context || !navigator.mediaDevices?.getUserMedia) {
      setMicrophoneError('This browser cannot capture interview audio. Please use a current Chrome, Edge, Brave, Firefox, or Safari browser.');
      return;
    }
    const generation = ++captureGenerationRef.current;
    capturePendingRef.current = true;
    const timer = setTimeout(() => {
      if (generation !== captureGenerationRef.current) return;
      captureGenerationRef.current++;
      capturePendingRef.current = false;
      if (mountedRef.current) setMicrophoneError(microphoneErrorMessage({ name: 'TimeoutError' }));
    }, 15000);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (!canCapture() || generation !== captureGenerationRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      clearTimeout(timer);
      capturePendingRef.current = false;
      captureRef.current = createVoiceCapture(stream, MediaRecorder, Context, {
        onComplete: blob => { void submitAudio(blob, generation); },
        onError: message => {
          if (generation !== captureGenerationRef.current || !mountedRef.current) return;
          captureRef.current = null;
          setIsListening(false);
          setMicrophoneError(message);
        }
      }, audioContextRef.current || undefined);
      setMicrophoneAccess('allowed');
      setMicrophoneError('');
      setIsListening(true);
    } catch (err) {
      if (mountedRef.current && generation === captureGenerationRef.current) {
        setIsListening(false);
        setMicrophoneError(microphoneErrorMessage(err as { name?: string }));
      }
    } finally {
      clearTimeout(timer);
      if (generation === captureGenerationRef.current) capturePendingRef.current = false;
    }
  };

  const startListening = () => {
    if (serverSpeechRef.current) void startAudioCapture();
    else recognitionControllerRef.current?.start();
  };

  const enableServerSpeech = () => {
    stopListening();
    serverSpeechRef.current = true;
    setUsesServerSpeech(true);
    setMicrophoneError('');
    accumulatedTranscriptRef.current = '';
    setAccumulatedTranscript('');
    setInterimTranscript('');
    startListening();
  };

  const verifyMicrophone = async () => {
    if (permissionCheckRef.current) return false;
    permissionCheckRef.current = true;
    setMicrophoneError('');
    setMicrophoneAccess('checking');
    try {
      if (!recognitionRef.current && typeof MediaRecorder === 'undefined') {
        throw new Error('speech-unsupported');
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('capture-unsupported');
      }
      await checkMicrophoneAccess(navigator.mediaDevices);
      if (!mountedRef.current) return false;
      setMicrophoneAccess('allowed');
      return true;
    } catch (err) {
      if (!mountedRef.current) return false;
      setMicrophoneAccess('blocked');
      setMicrophoneError((err as Error).message === 'speech-unsupported'
        ? 'This browser does not support speech recognition. Open this page in Chrome or Edge.'
        : microphoneErrorMessage(err as { name?: string }));
      return false;
    } finally {
      permissionCheckRef.current = false;
    }
  };

  const retryMicrophone = async () => {
    unlockAudio();
    if (await verifyMicrophone()) startListening();
  };

  // Auto-scroll
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(() => scrollToBottom(), [messages, accumulatedTranscript, interimTranscript]);

  // Load voices for manual selection
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
      setAvailableVoices(voices);
      
      if (voices.length > 0 && !selectedVoiceURI) {
        const preferredVoice = 
          voices.find(v => v.name.includes('Natural') && v.lang.startsWith('en')) ||
          voices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) || 
          voices.find(v => v.name.includes('Microsoft') && v.lang.startsWith('en')) ||
          voices[0];
        if (preferredVoice) {
          setSelectedVoiceURI(preferredVoice.voiceURI);
        }
      }
    };
    loadVoices();
    if (typeof window !== 'undefined' && speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, [selectedVoiceURI]);

  // Start Webcam and Anti-Cheat when entering interview phase
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && setupPhase === 'interview' && !isEvaluatingRef.current) {
        sessionEndedRef.current = true;
        isEvaluatingRef.current = true;
        setEvaluation("CHEATING DETECTED: You switched tabs or minimized the window. The interview has been terminated.\n\nVerdict: Not Hired.");
        setIsEvaluating(true);
        clearTimeout(silenceTimerRef.current);
        stopListening();
        closeAudio();
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
        setIsListening(false);
      }
    };

    if (setupPhase === 'interview') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch(err => console.error("Webcam error:", err));
    }
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (videoRef.current && videoRef.current.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      }
    };
  }, [setupPhase]);

  // Initialize Speech Recognition
  useEffect(() => {
    mountedRef.current = true;
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognitionControllerRef.current = createRecognitionController(recognition, {
          canListen: () => !serverSpeechRef.current && setupPhaseRef.current === 'interview' && !sessionEndedRef.current &&
            !isSpeakingRef.current && !isProcessingRef.current && !isEvaluatingRef.current,
          onListeningChange: listening => { if (!serverSpeechRef.current) setIsListening(listening); },
          onError: (message, code) => {
            if (code !== 'audio-capture' && typeof MediaRecorder !== 'undefined') enableServerSpeech();
            else setMicrophoneError(message);
          },
          onRecovered: () => { if (!serverSpeechRef.current) setMicrophoneError(''); }
        });

        recognition.onresult = (event: any) => {
          if (serverSpeechRef.current || sessionEndedRef.current || isSpeakingRef.current || isProcessingRef.current || isEvaluatingRef.current) return;
          let currentInterim = '';
          let newFinalChunks = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              newFinalChunks += event.results[i][0].transcript + ' ';
            } else {
              currentInterim += event.results[i][0].transcript;
            }
          }

          if (newFinalChunks) {
            accumulatedTranscriptRef.current += newFinalChunks;
            setAccumulatedTranscript(accumulatedTranscriptRef.current);
          }
          setInterimTranscript(currentInterim);

          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            const fullText = (accumulatedTranscriptRef.current + ' ' + currentInterim).trim();
            if (fullText.length > 5 && !isSpeakingRef.current && !isEvaluatingRef.current && !isProcessingRef.current) {
              handleSendResponse(fullText);
            }
          }, 2500);
        };

        recognitionRef.current = recognition;
      } else {
        if (typeof MediaRecorder !== 'undefined') {
          serverSpeechRef.current = true;
          setUsesServerSpeech(true);
        } else setMicrophoneError("This browser cannot record audio. Open this page in a current browser.");
      }
    }
    
    return () => {
      mountedRef.current = false;
      captureGenerationRef.current++;
      capturePendingRef.current = false;
      captureRef.current?.cancel();
      captureRef.current = null;
      transcriptionRef.current?.abort();
      transcriptionRef.current = null;
      closeAudio();
      clearTimeout(silenceTimerRef.current);
      recognitionControllerRef.current?.dispose();
      recognitionControllerRef.current = null;
      recognitionRef.current = null;
    };
  }, []);

  const startInterview = async () => {
    if (permissionCheckRef.current) return;
    unlockAudio();
    setIsStarting(true);
    if (!await verifyMicrophone()) { setIsStarting(false); return; }
    sessionEndedRef.current = false;
    setupPhaseRef.current = 'interview';
    setSetupPhase('interview');
    setIsStarting(false);
    // Listen only after the AI introduction finishes playing.
    await fetchResponse([]);
  };

  const speak = async (text: string, isComplete?: boolean) => {
    if (typeof window !== 'undefined') window.speechSynthesis.cancel();
    isSpeakingRef.current = true;
    stopListening();
    setIsSpeaking(true);

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      
      if (!res.ok) throw new Error("Free TTS API Failed");
      
      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      
      audio.playbackRate = 1.15;
      
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        if (isComplete) {
          endAndEvaluate();
        } else startListening();
      };
      
      await audio.play();
    } catch (e) {
      console.error("Free Audio failed, falling back to browser TTS", e);
      fallbackSpeak(text, isComplete);
    }
  };

  const fallbackSpeak = (text: string, isComplete?: boolean) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel(); 
      const utterance = new SpeechSynthesisUtterance(text);
      
      if (selectedVoiceURI) {
        const voice = availableVoices.find(v => v.voiceURI === selectedVoiceURI);
        if (voice) utterance.voice = voice;
      }

      utterance.rate = 1.15;
      utterance.pitch = 1.0;

      utterance.onstart = () => {
        isSpeakingRef.current = true;
        setIsSpeaking(true);
        stopListening();
      };
      
      utterance.onend = () => {
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        if (isComplete) {
          endAndEvaluate();
        } else startListening();
      };

      utterance.onerror = () => {
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        if (isComplete) endAndEvaluate();
        else startListening();
      };
      
      window.speechSynthesis.speak(utterance);
    }
  };

  const fetchResponse = async (history: Message[], action?: 'evaluate') => {
    isProcessingRef.current = true;
    stopListening();
    setIsProcessing(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, role, level, company, action })
      });

      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      if (sessionEndedRef.current && action !== 'evaluate') return;

      let aiReply = data.reply.trim();
      
      let isComplete = false;
      if (aiReply.includes('[INTERVIEW_COMPLETE]')) {
        isComplete = true;
        aiReply = aiReply.replace('[INTERVIEW_COMPLETE]', '').trim();
      }
      
      if (action === 'evaluate') {
        setEvaluation(aiReply);
        setIsEvaluating(false);
        setIsProcessing(false);
        stopListening();
        return;
      }
      
      setMessages(prev => [...prev, { role: 'assistant', content: aiReply }]);
      isProcessingRef.current = false;
      setIsProcessing(false);
      speak(aiReply, isComplete);
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  };

  const handleSendResponse = async (text: string) => {
    clearTimeout(silenceTimerRef.current);
    
    const newMessages: Message[] = [...messagesRef.current, { role: 'user', content: text }];
    setMessages(newMessages); // Show clean text in UI
    
    setAccumulatedTranscript('');
    accumulatedTranscriptRef.current = '';
    setInterimTranscript('');
    
    stopListening();

    await fetchResponse(newMessages);
  };

  const endAndEvaluate = async () => {
    sessionEndedRef.current = true;
    closeAudio();
    isEvaluatingRef.current = true;
    setIsEvaluating(true);
    clearTimeout(silenceTimerRef.current);
    clearInterval(visionTimerRef.current);
    
    stopListening();
    window.speechSynthesis.cancel();
    
    setIsSpeaking(false);
    setIsListening(false);
    
    setEvaluation("Evaluating your performance...");
    await fetchResponse(messagesRef.current, 'evaluate'); // use current ref
  };

  if (setupPhase === 'instructions') {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div className="glass-panel" style={{ maxWidth: '600px', width: '100%', textAlign: 'center', animation: 'slideIn 0.5s ease-out' }}>
          <div style={{ background: 'rgba(239, 68, 68, 0.2)', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <Camera size={30} color="#ef4444" />
          </div>
          <h2 className="title" style={{ fontSize: '2.2rem', marginBottom: '16px' }}>Anti-Cheat Active</h2>
          <div style={{ color: 'var(--text-secondary)', lineHeight: '1.7', fontSize: '1.1rem', marginBottom: '40px', textAlign: 'left' }}>
            <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <li><strong>Camera Preview:</strong> Your webcam preview is shown during the interview. Automated vision monitoring is not enabled.</li>
              <li><strong>Do Not Switch Tabs:</strong> If you switch tabs, minimize the window, or leave this page, the interview will immediately terminate and you will fail.</li>
              <li><strong>Speak naturally:</strong> The AI will listen and automatically reply when you pause.</li>
              <li><strong>Audio transcription:</strong> If your browser speech service is unavailable, your spoken answers are automatically sent to Groq for transcription after you pause. Keep each answer under two minutes.</li>
              <li><strong>Permissions:</strong> We will request microphone and camera access on the next step.</li>
            </ul>
          </div>
          {microphoneError && <p role="alert" style={{ color: '#fbbf24', marginBottom: '20px' }}>{microphoneError}</p>}
          {isStarting && <p role="status" style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>Allow microphone access in the browser permission prompt.</p>}
          <button onClick={startInterview} disabled={isStarting} className="btn-primary" style={{ width: '100%', padding: '16px', fontSize: '1.1rem' }}>
            <Mic size={20} /> {isStarting ? 'Checking microphone...' : 'I Understand, Start Interview'}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '30px 20px' }}>
      
      <div className="glass-panel" style={{ width: '100%', maxWidth: '1000px', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', borderRadius: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: '800', background: 'linear-gradient(to right, #fff, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {company !== 'General (No specific company)' ? `${company} ` : ''}{role}
          </h2>
          <p style={{ color: 'var(--accent-primary)', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', fontSize: '0.75rem' }}>
            {level} Interview
          </p>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Volume2 size={18} color="var(--text-secondary)" />
          <select 
            className="input-field"
            style={{ margin: 0, padding: '8px 12px', fontSize: '0.8rem', background: 'rgba(0,0,0,0.5)', width: 'auto', maxWidth: '200px' }}
            value={selectedVoiceURI}
            onChange={(e) => setSelectedVoiceURI(e.target.value)}
          >
            {availableVoices.map(v => (
              <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>
            ))}
          </select>
          <button onClick={() => { sessionEndedRef.current = true; stopListening(); window.speechSynthesis.cancel(); router.push('/'); }} className="btn-danger" style={{ padding: '8px 16px', fontSize: '0.9rem', marginLeft: '12px' }}>
            Quit
          </button>
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: '1000px', marginBottom: '20px', color: 'var(--text-secondary)' }}>
        <p role="status">
          {microphoneAccess === 'allowed' ? 'Microphone access allowed' : microphoneAccess === 'checking' ? 'Checking microphone access...' : 'Microphone access needs checking'}
          {microphoneAccess === 'allowed' && (microphoneError ? ' — Speech recognition needs attention' :
            isTranscribing ? ' — Transcribing your answer' : isListening ? ' — Listening' : evaluation ? ' — Interview ended' :
            error ? ' — Interview paused' : ' — Listening paused while the interviewer speaks or processes')}
        </p>
        {usesServerSpeech && !evaluation && <p style={{ marginTop: '8px', fontSize: '0.85rem' }}>Automatic audio transcription is active. Speak normally and pause to send your answer.</p>}
        {microphoneError && <div role="alert" style={{ marginTop: '12px', color: '#fbbf24' }}>
          <p>{microphoneError}</p>
          <button onClick={retryMicrophone} disabled={microphoneAccess === 'checking' || isSpeaking || isProcessing || isTranscribing || isEvaluating || !!evaluation || !!error} className="btn-primary" style={{ marginTop: '12px' }}>
            Retry microphone
          </button>
        </div>}
      </div>

      {error ? (
        <div className="glass-panel" style={{ borderColor: '#ef4444', textAlign: 'center', maxWidth: '500px' }}>
          <p style={{ color: '#ef4444', marginBottom: '24px', fontSize: '1.1rem' }}>{error}</p>
          <button onClick={() => window.location.reload()} className="btn-primary" style={{ width: '100%' }}>Refresh</button>
        </div>
      ) : evaluation ? (
        <div className="glass-panel" style={{ width: '100%', maxWidth: '900px', animation: 'slideIn 0.5s ease-out', padding: '40px' }}>
          <h2 className="title" style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: '40px' }}>Final Verdict</h2>
          <div style={{ background: 'rgba(0,0,0,0.4)', padding: '30px', borderRadius: '20px', lineHeight: '1.8', fontSize: '1.1rem', whiteSpace: 'pre-wrap', border: '1px solid var(--glass-border)' }}>
            {evaluation}
          </div>
          <button onClick={() => { window.speechSynthesis.cancel(); router.push('/'); }} className="btn-primary" style={{ width: '100%', marginTop: '32px' }}>
            Back to Home
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', width: '100%', maxWidth: '1000px', gap: '30px', height: '70vh' }}>
          
          {/* Left Side: Avatar & Status */}
          <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', position: 'relative' }}>
            
            {/* Webcam Preview PIP */}
            <div style={{ position: 'absolute', top: '20px', left: '20px', width: '120px', height: '90px', borderRadius: '12px', overflow: 'hidden', border: '2px solid rgba(139, 92, 246, 0.4)' }}>
              <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <canvas ref={canvasRef} width="320" height="240" style={{ display: 'none' }} />
              <div style={{ position: 'absolute', bottom: '5px', left: '5px', background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.6rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span className="pulse-dot" style={{ width: '6px', height: '6px' }}></span> Camera Preview
              </div>
            </div>

            <div className={`orb-container ${isSpeaking ? 'speaking' : ''}`}>
              <div className="orb-ring-1"></div>
              <div className="orb-ring-2"></div>
              {/* Dynamic Company Avatar Orb */}
              <div className="voice-orb" style={{ background: avatarBackground }}></div>
            </div>
            
            <div style={{ marginTop: '20px', fontSize: '1.1rem', color: isListening ? '#10b981' : 'var(--accent-secondary)', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isSpeaking ? (
                <>AI is speaking...</>
              ) : isProcessing ? (
                <>Processing <Loader2 className="spinner" size={18} /></>
              ) : isTranscribing ? (
                <>Transcribing <Loader2 className="spinner" size={18} /></>
              ) : isListening ? (
                <><span className="pulse-dot"></span> Listening...</>
              ) : (
                <>Waiting...</>
              )}
            </div>

            <button 
              onClick={endAndEvaluate} 
              className="btn-danger" 
              style={{ marginTop: 'auto', width: '100%', background: 'transparent', border: '1px solid #ef4444' }}
              disabled={isEvaluating}
            >
              End Interview & Evaluate
            </button>
          </div>

          {/* Right Side: Chat Interface */}
          <div className="glass-panel" style={{ flex: 1.5, display: 'flex', flexDirection: 'column', padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)' }}>
              <h3 style={{ fontSize: '1rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Live Transcript</h3>
            </div>
            
            <div className="chat-container" style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
              {messages.map((m, i) => (
                <div key={i} className={`chat-bubble ${m.role === 'assistant' ? 'ai' : 'user'}`}>
                  <strong style={{ display: 'block', marginBottom: '8px', fontSize: '0.75rem', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '1px' }}>
                    {m.role === 'assistant' ? 'AI Interviewer' : 'You'}
                  </strong>
                  {m.content.replace(/\[SYSTEM NOTE:.*?\]/g, '') /* Hide system notes from UI */}
                </div>
              ))}
              
              {/* Live Audio Transcript */}
              {(accumulatedTranscript || interimTranscript) && (
                <div className="chat-bubble user" style={{ opacity: 0.8, border: '1px dashed rgba(59, 130, 246, 0.5)' }}>
                  <strong style={{ display: 'block', marginBottom: '8px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', color: '#60a5fa' }}>
                    You (Speaking...)
                  </strong>
                  {accumulatedTranscript} <i>{interimTranscript}</i>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>
          
        </div>
      )}
    </main>
  );
}

export default function InterviewPage() {
  return (
    <Suspense fallback={<main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="title">Loading Interview...</div></main>}>
      <InterviewContent />
    </Suspense>
  );
}
