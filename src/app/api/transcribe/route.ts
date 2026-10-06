import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { validateAudio } from '@/lib/audio-recording';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!process.env.GROQ_API_KEY) return NextResponse.json({ error: 'Transcription is not configured.' }, { status: 503 });
  try {
    const audio = (await req.formData()).get('audio');
    if (!audio || typeof audio === 'string') return NextResponse.json({ error: 'An audio recording is required.' }, { status: 400 });
    const invalid = validateAudio(audio);
    if (invalid) return NextResponse.json({ error: invalid.error }, { status: invalid.status });
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY, timeout: 45000, maxRetries: 0 });
    const result = await groq.audio.transcriptions.create({
      file: audio, model: process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo',
      language: 'en', response_format: 'json', temperature: 0
    });
    const text = result.text?.trim();
    if (!text) return NextResponse.json({ error: 'No speech was detected. Please retry the microphone.' }, { status: 422 });
    return NextResponse.json({ text });
  } catch (error) {
    const status = error instanceof Groq.APIError ? (error.status === 429 ? 429 : 502) : 400;
    return NextResponse.json({ error: status === 429 ? 'Transcription is busy. Please retry shortly.' : 'Could not transcribe your answer. Please retry the microphone.' }, { status });
  }
}
