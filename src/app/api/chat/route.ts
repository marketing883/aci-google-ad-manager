import { NextRequest, NextResponse } from 'next/server';
import { orchestratorAgent, type OrchestratorState } from '@/lib/agents/orchestrator-agent';
import { createAdminClient } from '@/lib/supabase-server';
import type { ExecutionPlan, UserIntent } from '@/schemas/agent-output';

// Allow longer execution for agent pipelines
export const maxDuration = 120; // 2 minutes (Vercel Pro)

export async function POST(request: NextRequest) {
  try {
    const { message, state, plan, intent } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Load recent chat history
    const { data: history } = await supabase
      .from('chat_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    const chatHistory = (history || []).reverse();

    // Store user message
    await supabase.from('chat_messages').insert({
      role: 'user',
      content: message,
    });

    // Process through Orchestrator
    const response = await orchestratorAgent.processMessage(
      message,
      chatHistory,
      (state as OrchestratorState) || 'idle',
      plan as ExecutionPlan | undefined,
      intent as UserIntent | undefined,
    );

    // Store assistant response
    await supabase.from('chat_messages').insert({
      role: 'assistant',
      content: response.message,
      metadata: {
        state: response.state,
        has_plan: !!response.plan,
        approval_ids: response.approval_ids,
      },
      related_approval_ids: response.approval_ids || [],
    });

    return NextResponse.json({
      response: response.message,
      state: response.state,
      plan: response.plan,
      intent: response.intent,
      approval_ids: response.approval_ids || [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Chat failed' },
      { status: 500 },
    );
  }
}
