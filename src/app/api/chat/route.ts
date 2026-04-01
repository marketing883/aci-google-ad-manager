import { NextRequest } from 'next/server';
import { CampaignHarness, detectWorkflow } from '@/lib/agents/harness';
import { createAdminClient } from '@/lib/supabase-server';

// Allow longer execution for agent pipelines
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const { message, resumeStage, pipelineContext } = await request.json();

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
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

    // Create SSE stream
    const encoder = new TextEncoder();
    const harness = new CampaignHarness();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Determine workflow
          const workflow = resumeStage ? 'pipeline' : detectWorkflow(message);
          const generator = workflow === 'pipeline'
            ? harness.runPipeline(message, chatHistory, resumeStage, pipelineContext)
            : harness.runStandalone(message, chatHistory);

          let fullResponse = '';

          for await (const event of generator) {
            // Send event to client
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

            // Accumulate text for storage
            if (event.type === 'thinking' && event.content) {
              fullResponse += event.content + '\n';
            }
            if (event.type === 'tool_done' && event.summary) {
              fullResponse += `[${event.tool}] ${event.summary}\n`;
            }
            if (event.type === 'message' && event.content) {
              fullResponse += event.content + '\n';
            }
          }

          // Store assistant response
          if (fullResponse.trim()) {
            await supabase.from('chat_messages').insert({
              role: 'assistant',
              content: fullResponse.trim(),
            });
          }
        } catch (error) {
          const errorEvent = {
            type: 'error',
            content: error instanceof Error ? error.message : 'Pipeline failed',
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
        } finally {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Chat failed',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
