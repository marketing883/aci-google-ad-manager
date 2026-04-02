import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
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
// Per-stage model tiers: Opus for heavy reasoning, Sonnet for simple tasks.
// OpenAI fallback (GPT-4o / GPT-4o-mini) if Anthropic fails.
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
// Formatting instructions shared across all prompts
const FORMAT_RULES = `
## Response Formatting Rules (ALWAYS follow these)
- Use **markdown** for all responses — headers, bold, lists, tables
- When presenting data with multiple fields (keywords, campaigns, metrics, URLs), use **tables**
- When listing items, use **bullet points** or **numbered lists** — never inline comma-separated
- Keep paragraphs short (2-3 sentences max)
- Use **bold** for key metrics, names, and important values
- When showing before/after changes, use a table with Before | After columns
- When presenting a plan or strategy, use numbered steps with bold headers
- Be concise — no filler phrases like "I'd be happy to help" or "Let me explain"
- Start with the most important information first
`;

const STAGE_PROMPTS: Record<PipelineStage, string> = {
  gather: `You are an expert Google Ads campaign manager gathering requirements from the user.
${FORMAT_RULES}
Analyze the user's request and the conversation history. Identify what information you ALREADY have and what you STILL NEED.

If you have enough info to proceed (budget, target audience, location, and a landing page or at least a business description), respond with a brief confirmation of what you know and say you'll proceed to research.

If critical info is missing, use the ask_user_questions tool to ask 2-3 GROUPED questions. Only ask what you cannot reasonably infer. Be smart — if they mention "Fortune 1000 in USA", you already have audience and location.

NEVER ask questions you can infer answers to. Be concise and professional.`,

  research: `You are a Google Ads research analyst. Use your tools to research keywords and analyze competitors.
${FORMAT_RULES}
You have the following tools available:
- research_keywords: Research seed keywords for volume, competition, CPC
- analyze_competitors: Analyze competitor SERP presence

Based on the business description and target audience, generate relevant seed keywords and research them. Also identify and analyze key competitors in the space.

Be thorough but efficient. Research 3-5 seed keyword groups.

After research, present findings in tables:
- Keywords table: Keyword | Volume | Competition | CPC
- Competitors table: Domain | Position | Description`,

  strategy: `You are a senior Google Ads strategist. Based on the research data provided, synthesize a campaign strategy.
${FORMAT_RULES}
Present your strategy using this structure:

**Campaign Overview** (table: Field | Value)
- Campaign type, bidding strategy, daily budget, target locations

**Ad Group Plan** (table: Ad Group | Theme | Keywords Count | Target CPA)

**Keyword Strategy** (brief bullet points)

**Negative Keywords** (comma-separated list)

**Budget Rationale** (1-2 sentences)

The user will confirm or request changes before you build.`,

  build: `You are building a Google Ads campaign. Use the tools to create the campaign structure in the database.
${FORMAT_RULES}
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

After building, present a summary table:
| Component | Count | Details |
Then list each ad group with its keywords and ad copy.`,

  present: `You have finished building the campaign. Use validate_campaign to run QA checks, then present a summary.
${FORMAT_RULES}
Present as a structured summary:

**Campaign Summary** (table)
| Field | Value |
| --- | --- |
| Name | ... |
| Budget | ... |
| Bidding | ... |
| Ad Groups | ... |
| Total Keywords | ... |
| Total Ads | ... |
| QA Status | PASSED/FAILED |

Then list any QA warnings.

Tell the user they can ask you to make changes or go to the campaign detail page.`,

  edit: `The user wants to edit the campaign. Use the available tools to make the requested changes.
${FORMAT_RULES}
After each change, confirm with a brief table showing what was updated:
| Field | Before | After |`,

  approve: `The user wants to approve the campaign. Use validate_campaign first to ensure everything passes QA, then use submit_for_approval to add it to the approval queue.
${FORMAT_RULES}`,

  standalone: `You are an expert Google Ads strategist and AI campaign manager. Help the user with whatever they need — research, campaign management, performance analysis, competitor intelligence, reporting, optimization.
${FORMAT_RULES}
Additional formatting for specific tasks:

**Performance data** → Present in tables with metrics columns
**Campaign info** → Use Field | Value tables for settings, bullet lists for keywords
**URLs/tracking** → Present in a table: Ad Group | Landing Page | Full URL with UTM
**Comparisons** → Use Before | After tables
**Recommendations** → Numbered list with bold action + brief reasoning
**Keyword research** → Table: Keyword | Volume | Competition | CPC | Relevance

Always be specific with numbers and data. Never give vague answers when you can give precise ones.`,
};

export class CampaignHarness {
  private anthropic: Anthropic;
  private openai: OpenAI;
  private supabase = createAdminClient();

  constructor() {
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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

    // Get stage-specific model config
    const stageConfig = CONFIG.stageModels[stage] || CONFIG.stageModels.standalone;

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

    // Agentic loop — per-stage loop limit
    let loopCount = 0;
    const MAX_LOOPS = stageConfig.maxLoops;

    while (loopCount < MAX_LOOPS) {
      loopCount++;

      let response: Anthropic.Message;

      // Try Anthropic first, fall back to OpenAI
      try {
        await waitForCapacity('anthropic', 5000);

        const stream = this.anthropic.messages.stream({
          model: stageConfig.model,
          max_tokens: stageConfig.maxTokens,
          temperature: 0.5,
          system: systemPrompt,
          messages,
          ...(tools.length > 0 ? { tools, tool_choice: { type: 'auto' as const } } : {}),
        });

        response = await stream.finalMessage();
        recordRequest('anthropic', response.usage.input_tokens);
      } catch (anthropicError) {
        logger.warn(`Anthropic failed for stage ${stage} (${stageConfig.model}), falling back to OpenAI (${stageConfig.fallback})`, {
          error: (anthropicError as Error).message,
        });

        // Fallback to OpenAI
        try {
          await waitForCapacity('openai', 5000);

          const openaiResponse = await this.openai.chat.completions.create({
            model: stageConfig.fallback,
            max_tokens: stageConfig.maxTokens,
            temperature: 0.5,
            messages: [
              { role: 'system', content: systemPrompt },
              ...messages.map((m) => ({
                role: m.role as 'user' | 'assistant',
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
              })),
            ],
            // OpenAI tool_use format is different — only use for non-tool stages
            ...(tools.length > 0 ? {
              tools: tools.map((t) => ({
                type: 'function' as const,
                function: {
                  name: t.name,
                  description: t.description || '',
                  parameters: t.input_schema as Record<string, unknown>,
                },
              })),
            } : {}),
          });

          recordRequest('openai', openaiResponse.usage?.prompt_tokens || 0);

          // Convert OpenAI response to Anthropic format for unified processing
          const content: Anthropic.ContentBlock[] = [];

          for (const choice of openaiResponse.choices) {
            if (choice.message.content) {
              content.push({ type: 'text', text: choice.message.content } as Anthropic.TextBlock);
            }
            if (choice.message.tool_calls) {
              for (const tc of choice.message.tool_calls) {
                content.push({
                  type: 'tool_use',
                  id: tc.id,
                  name: tc.function.name,
                  input: JSON.parse(tc.function.arguments || '{}'),
                } as Anthropic.ToolUseBlock);
              }
            }
          }

          response = {
            id: openaiResponse.id,
            type: 'message',
            role: 'assistant',
            content,
            model: stageConfig.fallback,
            stop_reason: openaiResponse.choices[0]?.finish_reason === 'tool_calls' ? 'tool_use' : 'end_turn',
            usage: {
              input_tokens: openaiResponse.usage?.prompt_tokens || 0,
              output_tokens: openaiResponse.usage?.completion_tokens || 0,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
              service_tier: 'default',
            },
          } as unknown as Anthropic.Message;

        } catch (openaiError) {
          logger.error(`Both Anthropic and OpenAI failed for stage ${stage}`, {
            anthropicError: (anthropicError as Error).message,
            openaiError: (openaiError as Error).message,
          });
          throw new Error(`AI unavailable: Anthropic (${(anthropicError as Error).message}) and OpenAI (${(openaiError as Error).message}) both failed`);
        }
      }

      // Log the call (model info for cost tracking)
      await this.logCall(stage, response.usage, response.model || stageConfig.model);

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

          // Add tool result for next loop iteration — include data so AI can reference IDs
          const toolResultContent = data
            ? `${result}\n\nData: ${JSON.stringify(data)}`
            : result;

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: toolResultContent,
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
    model?: string,
  ): Promise<void> {
    try {
      await this.supabase.from('agent_logs').insert({
        agent_name: 'CampaignHarness',
        action: `stage:${stage}`,
        model_used: model || 'unknown',
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
