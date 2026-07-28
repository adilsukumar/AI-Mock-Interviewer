import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { messages, role, level, company, action } = await req.json();

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        { error: 'Groq API key not configured.' },
        { status: 500 }
      );
    }

    const isCompanySpecific = company && company !== 'General (No specific company)';
    const companyContext = isCompanySpecific 
      ? `You are an interviewer from ${company}. You must explicitly evaluate the candidate against ${company}'s known core values (e.g. Amazon's Leadership Principles, Google's Googley-ness, Meta's Move Fast, etc.) and ask questions that are notoriously typical for ${company} interviews.` 
      : '';

    let systemPrompt = `You are a highly empathetic, expert, and professional human interviewer conducting a mock interview for a ${level} ${role} position. ${companyContext}
You are speaking verbally to the candidate. Keep your responses conversational, and completely natural, exactly as a human interviewer would speak. 

CRITICAL RULES:
1. BE CONCISE: You MUST keep your responses strictly under 3 sentences and less than 40 words. Do NOT ramble.
2. ACKNOWLEDGE: When the user answers your previous question, you MUST first acknowledge their answer naturally with a brief compliment or empathetic remark.
3. PROGRESS: After acknowledging their answer, naturally transition into asking ONE single follow-up question. NEVER ask multiple questions at once.
4. AUTO-END: If you have successfully asked 4 to 5 questions and you feel you have enough information, you MUST completely stop the interview. To do this, speak a polite closing sentence (e.g. "It was great talking to you today, we will be in touch!"), and then append the EXACT phrase "[INTERVIEW_COMPLETE]" at the very end of your message.
5. INTRO: If this is the very first message of the interview, welcome them warmly, and ask them to briefly introduce themselves.`;

    if (action === 'evaluate') {
      systemPrompt = `You are an expert interviewer evaluating a candidate for a ${level} ${role} position. ${isCompanySpecific ? `Evaluate them specifically for ${company}.` : ''} The interview has just concluded.
Based on the conversation history provided, evaluate the candidate's performance. 
GENEROUS EVALUATION RULE: Give them a clear, final verdict: "Hired" or "Not Hired". Be generous! As long as they provided thoughtful, relevant, and reasonable answers, give them a "Hired" verdict. Only give "Not Hired" if their answers were completely terrible, completely empty, or they were caught cheating.
Provide a brief, highly constructive summary of their strengths and areas for improvement. Keep it conversational and encouraging. Speak in natural paragraphs.`;
    }

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m: any) => ({
        role: m.role,
        content: m.content
      }))
    ];

    const chatCompletion = await groq.chat.completions.create({
      messages: apiMessages,
      model: 'llama-3.3-70b-versatile',
      temperature: 0.6,
      max_tokens: 400,
    });

    const reply = chatCompletion.choices[0]?.message?.content || 'Sorry, I missed that. Could you repeat?';

    return NextResponse.json({ reply });
  } catch (error: any) {
    console.error('Chat API Error:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred during the interview.' },
      { status: 500 }
    );
  }
}
