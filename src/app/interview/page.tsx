'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle, Info, Mic, Loader2, Volume2, Camera } from 'lucide-react';

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

export default function InterviewPage() {
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
  
  // Audio state
  const [accumulatedTranscript, setAccumulatedTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState('');
  const [evaluation, setEvaluation] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);

  // Vision State
  const [visionAnalysis, setVisionAnalysis] = useState<string>('');

  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Webcam Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visionTimerRef = useRef<any>(null);

  // Voice Selection State
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');

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
        setEvaluation("CHEATING DETECTED: You switched tabs or minimized the window. The interview has been terminated.\n\nVerdict: Not Hired.");
        setIsEvaluating(true);
        clearTimeout(silenceTimerRef.current);
        if (recognitionRef.current) recognitionRef.current.stop();
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
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => setIsListening(true);

        recognition.onresult = (event: any) => {
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
            setAccumulatedTranscript(prev => prev + newFinalChunks);
          }
          setInterimTranscript(currentInterim);

          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            triggerSendFromSilence();
          }, 2500);
        };

        recognition.onerror = (event: any) => {
          setIsListening(false);
          if (event.error !== 'no-speech') {
            setError(`Microphone error: ${event.error}`);
          }
        };

        recognition.onend = () => {
          setIsListening(false);
          if (!isSpeakingRef.current && !isEvaluatingRef.current) {
            try { recognition.start(); } catch(e) {}
          }
        };

        recognitionRef.current = recognition;
      } else {
        setError("Your browser doesn't support speech recognition. Please use Chrome or Edge.");
      }
    }
    
    return () => {
      clearTimeout(silenceTimerRef.current);
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, []);

  const isSpeakingRef = useRef(isSpeaking);
  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);
  
  const isEvaluatingRef = useRef(isEvaluating);
  useEffect(() => { isEvaluatingRef.current = isEvaluating; }, [isEvaluating]);

  const accumulatedTranscriptRef = useRef(accumulatedTranscript);
  useEffect(() => { accumulatedTranscriptRef.current = accumulatedTranscript; }, [accumulatedTranscript]);
  
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const triggerSendFromSilence = () => {
    const fullText = accumulatedTranscriptRef.current.trim();
    if (fullText.length > 0 && !isSpeakingRef.current && !isEvaluatingRef.current) {
      handleSendResponse(fullText);
    }
  };

  const startInterview = async () => {
    try { recognitionRef.current?.start(); } catch(e) {}
    setSetupPhase('interview');
    await fetchResponse([]);
  };

  const speak = async (text: string, isComplete?: boolean) => {
    if (typeof window !== 'undefined') window.speechSynthesis.cancel();
    if (recognitionRef.current) recognitionRef.current.stop();
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
      
      // Speed up the AI voice slightly for a faster pace
      audio.playbackRate = 1.15;
      
      audio.onended = () => {
        setIsSpeaking(false);
        if (isComplete) {
          endAndEvaluate();
        } else if (recognitionRef.current && !isEvaluatingRef.current) {
          try { recognitionRef.current.start(); } catch(e) {}
        }
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

      utterance.rate = 1.15; // Faster pace
      utterance.pitch = 1.0;

      utterance.onstart = () => {
        setIsSpeaking(true);
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }
      };
      
      utterance.onend = () => {
        setIsSpeaking(false);
        if (isComplete) {
          endAndEvaluate();
        } else if (recognitionRef.current && !isEvaluatingRef.current) {
          try { recognitionRef.current.start(); } catch(e) {}
        }
      };
      
      window.speechSynthesis.speak(utterance);
    }
  };

  const fetchResponse = async (history: Message[], action?: 'evaluate') => {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, role, level, company, action })
      });

      const data = await res.json();
      if (data.error) { setError(data.error); return; }

      let aiReply = data.reply.trim();
      
      // Handle Auto-End Logic smoothly
      let isComplete = false;
      if (aiReply.includes('[INTERVIEW_COMPLETE]')) {
        isComplete = true;
        aiReply = aiReply.replace('[INTERVIEW_COMPLETE]', '').trim();
      }
      
      if (action === 'evaluate') {
        setEvaluation(aiReply);
        speak(aiReply);
      } else {
        if (!isEvaluatingRef.current) {
          setMessages([...history, { role: 'assistant', content: aiReply }]);
          speak(aiReply, isComplete);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    }
  };

  const handleSendResponse = async (text: string) => {
    clearTimeout(silenceTimerRef.current);
    
    const newMessages: Message[] = [...messagesRef.current, { role: 'user', content: text }];
    setMessages(newMessages); // Show clean text in UI
    
    setAccumulatedTranscript('');
    setInterimTranscript('');
    
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    await fetchResponse(newMessages);
  };

  const endAndEvaluate = async () => {
    setIsEvaluating(true);
    clearTimeout(silenceTimerRef.current);
    clearInterval(visionTimerRef.current);
    
    if (recognitionRef.current) recognitionRef.current.stop();
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
              <li><strong>Proctored Environment:</strong> The AI Vision model will actively scan your webcam to ensure you are not using phones, gadgets, or looking at other screens.</li>
              <li><strong>Do Not Switch Tabs:</strong> If you switch tabs, minimize the window, or leave this page, the interview will immediately terminate and you will fail.</li>
              <li><strong>Speak naturally:</strong> The AI will listen and automatically reply when you pause.</li>
              <li><strong>Permissions:</strong> We will request microphone and camera access on the next step.</li>
            </ul>
          </div>
          <button onClick={startInterview} className="btn-primary" style={{ width: '100%', padding: '16px', fontSize: '1.1rem' }}>
            <Mic size={20} /> I Understand, Start Interview
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
          <button onClick={() => { window.speechSynthesis.cancel(); router.push('/'); }} className="btn-danger" style={{ padding: '8px 16px', fontSize: '0.9rem', marginLeft: '12px' }}>
            Quit
          </button>
        </div>
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
                <span className="pulse-dot" style={{ width: '6px', height: '6px' }}></span> Vision Active
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
              ) : isListening ? (
                <><span className="pulse-dot"></span> Listening...</>
              ) : (
                <>Processing <Loader2 className="spinner" size={18} /></>
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
