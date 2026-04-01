import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // TODO: Implement OrchestratorAgent
    // 1. Parse user intent
    // 2. Route to appropriate agent(s)
    // 3. Collect results and create approval items
    // 4. Store chat messages
    // 5. Return response

    return NextResponse.json({
      response: 'Chat API is not yet connected. Please configure your AI keys in Settings.',
      approval_ids: [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Chat failed' },
      { status: 500 },
    );
  }
}
