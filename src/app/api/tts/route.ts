import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    if (!text) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }

    // Use Amazon Polly Neural Voice ("Joanna") via StreamElements Free Proxy
    // StreamElements TTS does not have a strict 200 char limit like Google, it easily handles sentences
    const voice = 'Joanna'; // Highly realistic female neural voice
    const url = `https://api.streamelements.com/kappa/v2/speech?voice=${voice}&text=${encodeURIComponent(text.trim())}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });

    if (!response.ok) {
      return NextResponse.json({ error: `StreamElements TTS Failed: ${response.status}` }, { status: 500 });
    }

    const arrayBuffer = await response.arrayBuffer();
    const finalBuffer = Buffer.from(arrayBuffer);

    return new NextResponse(finalBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': finalBuffer.length.toString()
      }
    });

  } catch (error: any) {
    console.error("Free Polly TTS Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
