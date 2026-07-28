import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { imageBase64 } = await req.json();

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ error: 'Groq API key not configured.' }, { status: 500 });
    }

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'You are an aggressive anti-cheat proctor for a high-stakes job interview. Analyze this webcam frame. Is the candidate looking at another screen? Are they using a phone or gadget? Are they missing from the frame entirely? If you see cheating, return a strict one-sentence WARNING (e.g. "WARNING: Candidate appears to be looking at a phone."). If they are just looking slightly away naturally, or looking at the camera, just return an empty string.' },
            { type: 'image_url', image_url: { url: imageBase64 } }
          ]
        }
      ],
      model: 'llama-3.2-90b-vision-preview',
      temperature: 0.2,
      max_tokens: 50,
    });

    const analysis = chatCompletion.choices[0]?.message?.content?.trim() || '';

    return NextResponse.json({ analysis: analysis.toLowerCase().includes('empty') ? '' : analysis });
  } catch (error: any) {
    console.error('Vision API Error:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred during vision analysis.' },
      { status: 500 }
    );
  }
}
