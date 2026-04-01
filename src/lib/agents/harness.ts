import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '../supabase-server';
import { createLogger } from '../utils/logger';
import { CONFIG } from '../config';
import { waitForCapacity, recordRequest } from '../rate-limit';
import { executeTool, getToolsForStage, type PipelineStage } from './tools';
import type { ChatMessage } from '@/types';

const logger = createLogger('Harness');

// ============================================================
// Campaign Harness — Hybrid Pipeline + AI Tools
//
// Deterministic pipeline controls the stages.
// AI (Opus) does the intelligent work at each stage via tool_use.
// ============================================================

export interface HarnessEvent {
  type: 'stage' | 'thinking' | 'tool_start' | 'tool_done' | 'question' | 'strategy'
    | 'campaign_ready' | 'message' | 'done' | 'error';
  stage?: string;
  content?: string;
  tool?: string;
  summary?: string;
  questions?: string[];
  context?: string;
  data?: unknown;
  campaign_id?: string;
  approval_ids?: string[];
}

interface PipelineContext {
  userMessage: string;
  chatHistory: ChatMessage[];
  // Accumulated across stages
  gatherAnswers: string;
  researchData: string;
  strategyDecision: string;
  campaignId: string | null;
  approvalIds: string[];
}

// Stage-specific system prompts
const STAGE_PROMPTS: Record<PipelineStage, string> = {
  gather: `You are an expert Google Ads campaign manager gathering requirements from the user.

Analyze the user's request and the conversation history. Identify what information you ALREADY have and what you STILL NEED.

If you have enough info to proceed (budget, target audience, location, and a landing page or at least a business description), respond with a brief confirmation of what you know and say you'll proceed to research.

If critical info is missing, use the ask_user_questions tool to ask 2-3 GROUPED questions. Only ask what you cannot reasonably infer. Be smart — if they mention "Fortune 1000 in USA", you already have audience and location.

NEVER ask questions you can infer answers to. Be concise and professional.`,

  research: `You are a Google Ads research analyst. Use your tools to research keywords and analyze competitors.

You have the following tools available:
- research_keywords: Research seed keywords for volume, competition, CPC
- analyze_competitors: Analyze competitor SERP presence

Based on the business description and target audience, generate relevant seed keywords and research them. Also identify and analyze key competitors in the space.

Be thorough but efficient. Research 3-5 seed keyword groups. Summarize findings concisely after each tool call.`,

  strategy: `You are a senior Google Ads strategist. Based on the research data provided, synthesize a campaign strategy.

Decide:
1. Campaign type (Search is typical for lead gen)
2. Bidding strategy (based on goals and data)
3. Budget allocation rationale
4. Ad group themes (how to organize keywords)
5. Target locations and languages
6. Recommended negative keywords

Present your strategy as a clear, concise plan. Be specific with numbers.
The user will confirm or request changes before you build.`,

  build: `You are building a Google Ads campaign. Use the tools to create the campaign structure in the database.

Follow this order:
1. create_campaign — with the agreed strategy parameters
2. create_ad_group — for each theme, with relevant keywords
3. create_ad — for each ad group, with compelling headlines (≤30 chars!) and descriptions (≤90 chars!)
4. build_tracking_urls — for each landing page

CRITICAL AD COPY RULES:
- Headlines: MAXIMUM 30 characters (count carefully!)
- Descriptions: MAXIMUM 90 characters (count carefully!)
- Count spaces as characters
- No duplicates across ads
- Include keywords in headlines
- Include strong CTAs

After building, provide a summary of what was created.`,

  present: `You have finished building the campaign. Use validate_campaign to run QA checks, then present a summary of the complete campaign to the user.

Include: campaign name, budget, bidding strategy, number of ad groups, total keywords, total ads, and any QA warnings.

Tell the user they can edit via the campaign editor or ask you to make changes in chat.`,

  edit: `The user wants to edit the campaign. Use the available tools to make the requested changes. After each change, confirm what was updated.`,

  approve: `The user wants to approve the campaign. Use validate_campaign first to ensure everything passes QA, then use submit_for_approval to add it to the approval queue.`,

  standalone: `You are a Google Ads management assistant. Use any available tools to help the user with their request — research, build campaigns, check performance, etc.`,
};

export class CampaignHarness {
  private anthropic: Anthropic;
  private supabase = createAdminClient();
  private model: string;

  constructor() {
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.model = CONFIG.models.orchestrator.model;
  }

  // ============================================================
  // Main Pipeline — Campaign Creation Flow
  // ============================================================

  async *runPipeline(
    message: string,
    chatHistory: ChatMessage[],
    resumeStage?: PipelineStage,
    existingContext?: Partial<PipelineContext>,
  ): AsyncGenerator<HarnessEvent> {
    const ctx: PipelineContext = {
      userMessage: message,
      chatHistory,
      gatherAnswers: existingContext?.gatherAnswers || '',
      researchData: existingContext?.researchData || '',
      strategyDecision: existingContext?.strategyDecision || '',
      campaignId: existingContext?.campaignId || null,
      approvalIds: existingContext?.approvalIds || [],
    };

    const stages: PipelineStage[] = ['gather', 'research', 'strategy', 'build', 'present', 'approve'];
    const startIndex = resumeStage ? stages.indexOf(resumeStage) : 0;

    for (let i = startIndex; i < stages.length; i++) {
      const stage = stages[i];
      yield { type: 'stage', stage, content: this.stageLabel(stage) };

      try {
        for await (const event of this.runStage(stage, ctx)) {
          // If stage paused for user input, stop the pipeline
          if (event.type === 'question') {
            yield event;
            return; // Pipeline pauses — will resume when user responds
          }

          // If campaign was created, capture the ID
          if (event.type === 'campaign_ready' && event.campaign_id) {
            ctx.campaignId = event.campaign_id;
          }

          yield event;
        }
      } catch (error) {
        yield {
          type: 'error',
          content: `Error in ${stage}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
        // Continue to next stage despite errors
      }
    }

    yield { type: 'done', approval_ids: ctx.approvalIds };
  }

  // ============================================================
  // Standalone Workflows
  // ============================================================

  async *runStandalone(message: string, chatHistory: ChatMessage[]): AsyncGenerator<HarnessEvent> {
    yield { type: 'stage', stage: 'standalone', content: 'Processing your request...' };

    const ctx: PipelineContext = {
      userMessage: message,
      chatHistory,
      gatherAnswers: '',
      researchData: '',
      strategyDecision: '',
      campaignId: null,
      approvalIds: [],
    };

    for await (const event of this.runStage('standalone', ctx)) {
      yield event;
    }

    yield { type: 'done', approval_ids: ctx.approvalIds };
  }

  // ============================================================
  // Core: Run a single stage with AI + tools
  // ============================================================

  private async *runStage(
    stage: PipelineStage,
    ctx: PipelineContext,
  ): AsyncGenerator<HarnessEvent> {
    const tools = getToolsForStage(stage);
    const systemPrompt = STAGE_PROMPTS[stage];
    const contextSummary = this.buildContextForStage(stage, ctx);

    // Build messages
    const messages: Anthropic.MessageParam[] = [];

    // Include recent chat history
    for (const msg of ctx.chatHistory.slice(-10)) {
      messages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      });
    }

    // Add current message with accumulated context
    messages.push({
      role: 'user',
      content: `${contextSummary}\n\nUser's message: ${ctx.userMessage}`,
    });

    // Agentic loop — keep calling AI until it stops calling tools
    let loopCount = 0;
    const MAX_LOOPS = 20; // Safety limit

    while (loopCount < MAX_LOOPS) {
      loopCount++;

      // Rate limit
      await waitForCapacity('anthropic', 5000);

      // Use streaming to avoid timeout on long Opus calls
      const stream = this.anthropic.messages.stream({
        model: this.model,
        max_tokens: CONFIG.models.orchestrator.maxTokens,
        temperature: CONFIG.models.orchestrator.temperature,
        system: systemPrompt,
        messages,
        ...(tools.length > 0 ? { tools, tool_choice: { type: 'auto' as const } } : {}),
      });

      const response = await stream.finalMessage();

      recordRequest('anthropic', response.usage.input_tokens);

      // Log the call
      await this.logCall(stage, response.usage);

      // Process response blocks
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type === 'text' && block.text.trim()) {
          yield { type: 'thinking', content: block.text };

          // Capture text output for pipeline context
          if (stage === 'gather') ctx.gatherAnswers += '\n' + block.text;
          if (stage === 'research') ctx.researchData += '\n' + block.text;
          if (stage === 'strategy') {
            ctx.strategyDecision += '\n' + block.text;
            yield { type: 'strategy', data: block.text };
          }
        }

        if (block.type === 'tool_use') {
          const toolName = block.name;
          const toolInput = block.input as Record<string, unknown>;

          yield { type: 'tool_start', tool: toolName, summary: this.toolSummary(toolName, toolInput) };

          // Execute the tool
          const { result, data } = await executeTool(toolName, toolInput);

          // Handle special case: ask_user_questions pauses the pipeline
          if (result === 'PAUSE_FOR_USER') {
            yield {
              type: 'question',
              questions: (toolInput.questions as string[]) || [],
              context: toolInput.context as string,
            };
            return; // Pipeline pauses here
          }

          // Handle campaign creation — capture ID
          if (toolName === 'create_campaign' && data && (data as { campaign_id?: string }).campaign_id) {
            ctx.campaignId = (data as { campaign_id: string }).campaign_id;
            yield { type: 'campaign_ready', campaign_id: ctx.campaignId };
          }

          // Handle approval submission — capture ID
          if (toolName === 'submit_for_approval' && data && (data as { approval_id?: string }).approval_id) {
            ctx.approvalIds.push((data as { approval_id: string }).approval_id);
          }

          yield { type: 'tool_done', tool: toolName, summary: result };

          // Add tool result for next loop iteration
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          });
        }
      }

      // If no tools were called, stage is done
      if (response.stop_reason === 'end_turn' || toolResults.length === 0) {
        break;
      }

      // Add assistant response + tool results to messages for next loop
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
    }
  }

  // ============================================================
  // Helpers
  // ============================================================

  private buildContextForStage(stage: PipelineStage, ctx: PipelineContext): string {
    const parts = [];

    if (ctx.gatherAnswers && stage !== 'gather') {
      parts.push(`## Gathered Information\n${ctx.gatherAnswers}`);
    }
    if (ctx.researchData && !['gather', 'research'].includes(stage)) {
      parts.push(`## Research Results\n${ctx.researchData}`);
    }
    if (ctx.strategyDecision && !['gather', 'research', 'strategy'].includes(stage)) {
      parts.push(`## Approved Strategy\n${ctx.strategyDecision}`);
    }
    if (ctx.campaignId && ['present', 'edit', 'approve'].includes(stage)) {
      parts.push(`## Campaign ID: ${ctx.campaignId}`);
    }

    return parts.join('\n\n');
  }

  private stageLabel(stage: PipelineStage): string {
    const labels: Record<string, string> = {
      gather: 'Understanding your requirements...',
      research: 'Researching keywords & competitors...',
      strategy: 'Developing campaign strategy...',
      build: 'Building your campaign...',
      present: 'Validating & presenting campaign...',
      edit: 'Editing campaign...',
      approve: 'Submitting for approval...',
      standalone: 'Processing...',
    };
    return labels[stage] || stage;
  }

  private toolSummary(name: string, input: Record<string, unknown>): string {
    switch (name) {
      case 'research_keywords': return `Researching: ${(input.seed_keywords as string[])?.join(', ')}`;
      case 'analyze_competitors': return `Analyzing competitors for: ${(input.seed_keywords as string[])?.join(', ')}`;
      case 'create_campaign': return `Creating campaign: "${input.name}"`;
      case 'create_ad_group': return `Creating ad group: "${input.name}"`;
      case 'create_ad': return `Writing ad copy (${(input.headlines as unknown[])?.length} headlines)`;
      case 'build_tracking_urls': return `Building tracking URL for: ${input.base_url}`;
      case 'search_images': return `Searching images: "${input.query}"`;
      case 'validate_campaign': return 'Running QA validation...';
      case 'submit_for_approval': return 'Submitting to approval queue...';
      case 'get_campaign_performance': return `Fetching performance data...`;
      default: return name;
    }
  }

  private async logCall(
    stage: string,
    usage: { input_tokens: number; output_tokens: number },
  ): Promise<void> {
    try {
      await this.supabase.from('agent_logs').insert({
        agent_name: 'CampaignHarness',
        action: `stage:${stage}`,
        model_used: this.model,
        tokens_used: { input: usage.input_tokens, output: usage.output_tokens },
        status: 'success',
      });
    } catch { /* non-critical */ }
  }
}

// ============================================================
// Intent Detection — determine which workflow to run
// ============================================================

export function detectWorkflow(message: string): 'pipeline' | 'standalone' {
  const lower = message.toLowerCase();

  // Campaign creation triggers the full pipeline
  const pipelineKeywords = [
    'create a campaign', 'build a campaign', 'new campaign', 'launch a campaign',
    'set up a campaign', 'start a campaign', 'create campaign', 'build campaign',
  ];

  if (pipelineKeywords.some((kw) => lower.includes(kw))) {
    return 'pipeline';
  }

  // Everything else is standalone
  return 'standalone';
}
