import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { createAdminClient } from '../supabase-server';
import { createLogger } from '../utils/logger';
import { CONFIG } from '../config';
import { waitForCapacity, recordRequest } from '../rate-limit';
import { executeTool, getToolsForStage, getToolsByGroups, TOOL_DEFINITIONS, type PipelineStage } from './tools';
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
  gather: `You are an expert Google Ads campaign manager. You are HIGHLY AUTONOMOUS.
${FORMAT_RULES}
Your job is to confirm what you know and proceed — NOT to ask a bunch of questions.

RULES:
- If the user gave you a business/service description → you have enough to start
- If budget is missing → assume $50/day (mention this assumption)
- If location is missing → assume United States (mention this assumption)
- If landing page is missing → you'll use placeholder URLs and note this
- If the user says "you decide" for anything → MAKE THE DECISION yourself based on best practices
- ONLY use ask_user_questions if you literally have NO IDEA what the user wants to advertise
- Maximum 1 round of questions, maximum 2 questions per round
- When in doubt, PROCEED with reasonable defaults rather than asking

Respond with a brief summary of what you'll do and the assumptions you're making, then move on.`,

  research: `You are a Google Ads research analyst performing comprehensive keyword and competitive research.
${FORMAT_RULES}
## Step 1: Get Company Context

FIRST call \`get_company_context\` to learn about the company — services, competitors, differentiators, brand terms. Use this to guide your research:
- If **competitors are listed** → research THEM specifically as conquest targets
- If **competitors are empty** → you MUST discover them from SERP results via analyze_competitors
- If **services are listed** → use service names as seed keywords
- If **brand terms exist** → note them for brand defense in strategy stage

## Step 2: Research Keywords

Research across ALL 5 keyword categories:
1. **Core product terms** — what the product/service IS
2. **Category terms** — the broader market category
3. **Problem/solution terms** — what buyers search when they have a problem
4. **Comparison terms** — what buyers search when evaluating (vs, alternative, best)
5. **Competitor brand terms** — competitor names as keywords

Call \`research_keywords\` with 3-5 seed keywords covering categories 1-3.

## Step 3: Competitor Analysis

Call \`analyze_competitors\` with the same seed keywords. This identifies competitors from SERP and generates conquest keyword suggestions.

If the company profile had no competitors, this step is CRITICAL — it discovers them.

## What to Present

Present ALL findings:
- **Top keywords by volume** with CPC and competition level
- **Competitor names** with brand names (from profile AND/OR SERP discovery)
- **Conquest keywords** generated from competitor analysis
- **People Also Ask** questions
- **Google Ads bid estimates**

Do NOT summarize or filter heavily — the strategy stage needs this data.`,

  strategy: `You are a senior Google Ads strategist. Synthesize the research into a high-performance campaign structure.
${FORMAT_RULES}
## Required Ad Group Structure

Create EXACTLY 4-6 ad groups. NO MORE THAN 6. Cover these themes:

1. **Core Product** — direct product/service keywords (highest intent, highest bids)
2. **Category** — broader category terms (moderate intent, moderate bids)
3. **Competitor/Conquest** — competitor brand name keywords (REQUIRED if competitors were found). Lower bids (50-70% of core CPC).
4. **Long-tail/FAQ** — question-based and specific queries from People Also Ask. Lower bids.

You may add 1-2 more groups ONLY if clearly distinct themes exist (e.g., Migration, Pricing). Never exceed 6 total.

## Match Type Strategy (MUST follow)

| Keyword Intent | Match Type Distribution |
|---------------|----------------------|
| High-intent (buy, demo, pricing) | 50% Exact, 30% Phrase, 20% Broad |
| Medium-intent (comparison, vs) | 40% Exact, 40% Phrase, 20% Broad |
| Exploratory (what is, how to) | 20% Phrase, 80% Broad |
| Conquest (competitor names) | 60% Exact, 40% Phrase |

Each ad group should have **10-15 keywords**. Max 15.

## Negative Keywords (MUST include both levels)

**Campaign-level negatives** (apply to ALL ad groups):
- Jobs/careers: "jobs", "careers", "hiring", "salary", "interview"
- Free/DIY: "free", "open source", "tutorial", "course", "training", "certification"
- Irrelevant: "reddit", "github", "stackoverflow", "wiki"

**Per-group negatives** (prevent overlap between groups):
- Core group: add competitor brand names as negatives (handled by Conquest group)
- Category group: add core product name as negative (handled by Core group)
- Conquest group: add generic terms as negatives (only competitor queries)

## Landing Page Matching

Each ad group MUST have a landing page rationale:
- Core/Category → main product or service page
- Conquest → comparison or "alternative to" page (if available), otherwise main product page
- Long-tail/FAQ → blog, resources, or relevant content page

## Present Your Strategy As:

**Campaign Overview** (table: Field | Value — type, bidding, budget, locations)

**Ad Group Plan:**
| Ad Group | Theme | Keywords (count) | Match Types | Est. CPC Range | Landing Page |
|----------|-------|-----------------|-------------|----------------|--------------|

**Campaign-Level Negative Keywords** (list)

**Per-Group Negative Keywords** (table: Ad Group | Negatives)

**Budget Allocation** (how budget should distribute across groups)`,

  build: `You are building a Google Ads campaign in the database. Follow the approved strategy EXACTLY.
${FORMAT_RULES}
## CRITICAL: Build Systematically

You MUST follow this exact order. Do NOT skip steps or lose track.

**Step 1:** \`create_campaign\` — one call, get the campaign_id.

**Step 2:** Create ALL ad groups (one \`create_ad_group\` call per group). Include 10-15 keywords and 3-5 negative keywords per group. Save each ad_group_id.

**Step 3:** Create ads — exactly 2 \`create_ad\` calls per ad group. Use the ad_group_ids from Step 2.
IMPORTANT: Each headline must be ≤30 characters. Each description must be ≤90 characters.
COUNT CHARACTERS CAREFULLY before sending. If a headline is close to 30, shorten it.
If create_ad is rejected, rewrite the copy shorter and retry immediately.

**Step 4:** \`build_tracking_urls\` — one per ad group.

## Ad Copy Rules

- Headlines: STRICTLY ≤30 characters including spaces. Count before sending.
- Descriptions: STRICTLY ≤90 characters including spaces.
- 3-15 headlines per ad, 2-4 descriptions per ad
- No duplicates across ads in the same group
- Include keywords in headlines, CTAs in descriptions
- Conquest ads: "Better Than X", "X Alternative" patterns
- Core ads: Emphasize USPs and differentiators

## After Building

Present a summary table:
| Ad Group | Keywords | Ads | Landing Page |`,

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

  standalone: `You are an expert Google Ads strategist and AI campaign manager. You are HIGHLY AUTONOMOUS — act, don't ask.
${FORMAT_RULES}
## CRITICAL RULES:
- NEVER fabricate or guess entity IDs. All IDs are UUIDs like "781400a5-xxxx-xxxx-xxxx-xxxxxxxxxxxx".
- If you need to modify a campaign, ad group, or ad → call \`validate_campaign\` FIRST to get the real IDs, then use those exact IDs.
- If you don't have a campaign ID, use \`get_campaign_performance\` or ask the user.
- NEVER output a text plan instead of using tools. USE THE TOOLS to make changes.
- When the user asks you to do something, DO IT using your tools. Don't ask for confirmation.
- When the user says "you decide" or "your call" → make the best decision based on best practices
- Only ask questions if you literally cannot proceed without the answer
- Be decisive. Say "I'll do X" not "Would you like me to do X?"

Formatting:
**Performance data** → Tables with metrics columns
**Campaign info** → Field | Value tables, bullet lists for keywords
**URLs/tracking** → Table: Ad Group | Landing Page | Full URL with UTM
**Comparisons** → Before | After tables
**Recommendations** → Numbered list with bold action + brief reasoning
**Keyword research** → Table: Keyword | Volume | Competition | CPC | Relevance

Be specific with numbers. Never give vague answers.`,
};

export class CampaignHarness {
  private anthropic: Anthropic;
  private openai: OpenAI;
  private supabase = createAdminClient();
  private standaloneTools: Anthropic.Tool[] = [];
  private companyHeader: string = '';

  constructor() {
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  /** Load micro-header from company profile (~30 tokens, cached per harness run) */
  private async loadCompanyHeader(): Promise<void> {
    if (this.companyHeader) return; // already loaded
    try {
      const { data } = await this.supabase
        .from('settings')
        .select('value')
        .eq('key', 'company_profile')
        .single();
      if (data?.value) {
        const p = data.value as { company_name?: string; domain?: string; tagline?: string };
        if (p.company_name) {
          this.companyHeader = `\nCompany: ${p.company_name}${p.domain ? ` | ${p.domain}` : ''}${p.tagline ? ` | ${p.tagline}` : ''}`;
        }
      }
    } catch { /* no profile set — that's fine */ }
  }

  /** Layer 1: Haiku classifier — pick relevant tool groups (~$0.0001 per call) */
  private async classifyIntent(message: string): Promise<string[]> {
    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 200,
        temperature: 0,
        system: `Classify this message into tool groups. Return ONLY a JSON array.
Groups: campaign_create, campaign_read, campaign_edit, research, analytics, reports, interaction
Always include "interaction". If unclear, include multiple groups.
"create campaign" → ["campaign_create","research","interaction"]
"how are campaigns doing" → ["analytics","campaign_read","interaction"]
"delete ad group" → ["campaign_edit","interaction"]
"research keywords" → ["research","interaction"]
"send report" → ["reports","interaction"]
"optimize" → ["analytics","campaign_edit","interaction"]
unclear → ["analytics","campaign_read","interaction"]`,
        messages: [{ role: 'user', content: message }],
      });
      const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
      const match = text.match(/\[[\s\S]*?\]/);
      if (match) {
        const groups = JSON.parse(match[0]) as string[];
        if (Array.isArray(groups) && groups.length > 0) {
          if (!groups.includes('interaction')) groups.push('interaction');
          logger.info('Classified intent', { groups });
          return groups;
        }
      }
    } catch (e) {
      logger.warn('Classifier failed', { error: (e as Error).message });
    }
    return ['analytics', 'campaign_read', 'campaign_edit', 'interaction'];
  }

  /** Layer 2: Summarize tool result — no raw JSON dumps, but preserve research data */
  private summarizeResult(tool: string, result: string, data: unknown): string {
    // Research tools return structured markdown — pass through as-is
    if (tool === 'research_keywords' || tool === 'analyze_competitors') {
      return result;
    }
    if (!data) return result;
    const d = data as Record<string, unknown>;
    const idKey = Object.keys(d).find((k) => k.endsWith('_id'));
    if (idKey) return `${result} (${idKey}: ${d[idKey]})`;
    return result;
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
    await this.loadCompanyHeader();
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
    await this.loadCompanyHeader();
    // Classify intent to pick only relevant tools
    const groups = await this.classifyIntent(message);
    this.standaloneTools = getToolsByGroups(groups);
    logger.info(`Standalone: ${groups.join(', ')} → ${this.standaloneTools.length} tools (was 22)`);

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
    // Use classifier-selected tools for standalone, stage-specific for pipeline
    const tools = stage === 'standalone' && this.standaloneTools.length > 0
      ? this.standaloneTools
      : getToolsForStage(stage);
    const systemPrompt = STAGE_PROMPTS[stage] + this.companyHeader;
    const contextSummary = this.buildContextForStage(stage, ctx);

    // Get stage-specific model config
    const stageConfig = CONFIG.stageModels[stage] || CONFIG.stageModels.standalone;

    // Build messages
    const messages: Anthropic.MessageParam[] = [];

    // Include recent chat history
    // Layer 3: Only last 3 messages (server loads full history from DB for storage)
    for (const msg of ctx.chatHistory.slice(-3)) {
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

          // Capture structured research data for downstream stages
          if (stage === 'research' && (toolName === 'research_keywords' || toolName === 'analyze_competitors')) {
            ctx.researchData += '\n' + result;
          }

          // Layer 2: Summarize result — don't dump raw JSON into context
          const toolResultContent = this.summarizeResult(toolName, result, data);

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

      // Layer 3: Context compression — NEVER during build (needs all IDs), conservative elsewhere
      const compressionThreshold = stage === 'build' ? 999 : 8; // disable for build
      if (loopCount >= compressionThreshold && messages.length > 12) {
        const kept = [...messages.slice(0, 2), ...messages.slice(-6)];
        const compressed = messages.slice(2, -6);
        const summary = compressed.map((m) => {
          const content = typeof m.content === 'string' ? m.content : '[tool interaction]';
          return content.slice(0, 120);
        }).join(' | ');
        kept.splice(2, 0, { role: 'user' as const, content: `[Previous context: ${summary}]` });
        messages.length = 0;
        messages.push(...kept);
        logger.info(`Compressed context: ${compressed.length} messages → 1 summary`);
      }
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
