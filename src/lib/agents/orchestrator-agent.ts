import { BaseAdsAgent } from './base-agent';
import {
  userIntentSchema, executionPlanSchema,
  campaignBlueprintSchema, adCopyVariantsSchema, researchOutputSchema,
  type UserIntent, type ExecutionPlan,
} from '@/schemas/agent-output';
import { CONFIG } from '../config';
import { researchAgent } from './research-agent';
import { campaignBuilderAgent } from './campaign-builder-agent';
import { copywriterAgent } from './copywriter-agent';
import { qaSentinel } from './qa-sentinel';
import { approvalEngine } from '../approval-engine';
import type { ChatMessage } from '@/types';

// ============================================================
// OrchestratorAgent — The master coordinator
// Model: Opus (highest reasoning) with o3 fallback
// Flow: Ask → Plan → Refine (unlimited) → Execute
// ============================================================

const SYSTEM_PROMPT = `You are the master orchestrator for an AI-powered Google Ads management system. You coordinate specialized agents to research, build, and optimize Google Ads campaigns.

## Your Role
1. UNDERSTAND: Parse user instructions to determine intent
2. ASK: Ask clarifying questions when information is missing
3. PLAN: Present a clear execution plan before doing anything
4. REFINE: Accept unlimited refinements until the user confirms
5. EXECUTE: Coordinate specialized agents to carry out the plan

## Available Agents
- **ResearchAgent**: Deep keyword research + competitor intelligence (DataForSEO, Google Ads Keyword Planner, web search, LinkedIn hiring signals)
- **CampaignBuilderAgent**: Builds complete campaign structures (all types: Search, Display, PMax, Video, Demand Gen)
- **CopywriterAgent**: Writes ad copy (headlines ≤30 chars, descriptions ≤90 chars) + sources images from Unsplash + builds tracking URLs
- **QASentinel**: Validates all outputs for budget safety, character limits, keyword conflicts

## Conversation Rules
- Always ask clarifying questions before planning if key info is missing
- When presenting a plan, suggest competitors to research (based on the business description)
- Understand ANY affirmative confirmation to execute: "go", "proceed", "yes", "do it", "continue", etc.
- Never execute without user confirmation
- Be concise but thorough
- When an error occurs, explain it clearly and suggest next steps

## Key Information to Gather
- Business/product description
- Target audience
- Budget (daily)
- Geographic targets
- Competitor domains to track
- Landing page URLs
- Campaign goals (awareness, leads, sales)

Respond in natural conversational language, not JSON (unless specifically asked for structured output).`;

export type OrchestratorState = 'idle' | 'asking_questions' | 'presenting_plan' | 'refining' | 'executing' | 'done';

interface OrchestratorResponse {
  message: string;
  state: OrchestratorState;
  intent?: UserIntent;
  plan?: ExecutionPlan;
  approval_ids?: string[];
  error?: string;
}

export class OrchestratorAgent extends BaseAdsAgent {
  constructor() {
    super({
      name: 'OrchestratorAgent',
      tier: 'orchestrator',
    });
  }

  /**
   * Main entry point — process a user message in context of chat history
   */
  async processMessage(
    message: string,
    chatHistory: ChatMessage[],
    currentState: OrchestratorState = 'idle',
    currentPlan?: ExecutionPlan,
    currentIntent?: UserIntent,
  ): Promise<OrchestratorResponse> {
    this.logger.info(`Processing message (state: ${currentState})`, { message: message.slice(0, 100) });

    try {
      // Check if user is confirming execution
      if (
        (currentState === 'presenting_plan' || currentState === 'refining') &&
        currentPlan &&
        this.isConfirmation(message)
      ) {
        return this.executePlan(currentPlan, currentIntent!);
      }

      // Check if user is refining a plan
      if (
        (currentState === 'presenting_plan' || currentState === 'refining') &&
        currentPlan &&
        !this.isConfirmation(message)
      ) {
        return this.refinePlan(message, currentPlan, currentIntent!, chatHistory);
      }

      // If we're in asking_questions state, user is answering — extract answers and generate plan
      if (currentState === 'asking_questions' && currentIntent) {
        // Use a dedicated answer-extraction prompt instead of re-parsing as new intent
        const mergedIntent = await this.extractAnswersIntoIntent(currentIntent, message);
        return this.generatePlan(mergedIntent, chatHistory);
      }

      // Parse intent from new message
      const intent = await this.parseIntent(message, chatHistory);

      // If critical info is missing, ask questions first
      if (intent.follow_up_questions && intent.follow_up_questions.length > 0 && intent.confidence < 0.8) {
        return this.askQuestions(intent);
      }

      // Enough info — generate plan directly
      return this.generatePlan(intent, chatHistory);
    } catch (error) {
      this.logger.error('Orchestrator error', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        message: `I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}. Could you try rephrasing your request?`,
        state: 'idle',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Parse user intent from message
   */
  private async parseIntent(message: string, chatHistory: ChatMessage[]): Promise<UserIntent> {
    const recentHistory = chatHistory
      .slice(-10)
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    const intentParsingPrompt = `You are a JSON-only intent parser for a Google Ads management system. You MUST respond with ONLY a valid JSON object — no explanations, no markdown, no text before or after the JSON.

Valid intent values: "research_keywords", "build_campaign", "optimize_campaigns", "generate_ad_copy", "check_performance", "modify_campaign", "pause_resume", "general_question", "unknown"

JSON schema:
{
  "intent": "<one of the valid intents above>",
  "entities": {
    "business_description": "<string or null>",
    "target_audience": "<string or null>",
    "campaign_id": "<string or null>",
    "campaign_name": "<string or null>",
    "keywords": ["<keyword1>", "<keyword2>"],
    "budget": <number or null>,
    "geo_targets": ["<location1>"],
    "competitor_domains": ["<domain1>"],
    "landing_page_url": "<string or null>"
  },
  "follow_up_questions": ["<question1>", "<question2>"],
  "confidence": <0.0 to 1.0>
}

Rules:
- If user wants to create/build/launch a campaign → intent = "build_campaign"
- If user wants keyword research or competitor analysis → intent = "research_keywords"
- If info is missing (no budget, no audience, no geo), add follow_up_questions and set confidence low
- Extract ALL mentioned entities from the message`;

    const prompt = `## Recent Conversation
${recentHistory || 'No previous conversation'}

## Latest User Message
${message}

Respond with ONLY the JSON object. No other text.`;

    try {
      return await this.callStructured<UserIntent>(
        { system: intentParsingPrompt, prompt },
        userIntentSchema,
      );
    } catch (parseError) {
      // Fallback: construct intent manually if JSON parsing fails
      this.logger.warn('Intent parsing failed, using fallback', {
        error: parseError instanceof Error ? parseError.message : String(parseError),
      });

      const lowerMsg = message.toLowerCase();
      let intent: string = 'general_question';
      if (lowerMsg.includes('campaign') || lowerMsg.includes('create') || lowerMsg.includes('build') || lowerMsg.includes('launch')) {
        intent = 'build_campaign';
      } else if (lowerMsg.includes('keyword') || lowerMsg.includes('research') || lowerMsg.includes('competitor')) {
        intent = 'research_keywords';
      } else if (lowerMsg.includes('optimize') || lowerMsg.includes('improve')) {
        intent = 'optimize_campaigns';
      } else if (lowerMsg.includes('ad copy') || lowerMsg.includes('write ads') || lowerMsg.includes('headlines')) {
        intent = 'generate_ad_copy';
      } else if (lowerMsg.includes('performance') || lowerMsg.includes('metrics') || lowerMsg.includes('stats')) {
        intent = 'check_performance';
      }

      return {
        intent: intent as UserIntent['intent'],
        entities: {
          business_description: message,
        },
        follow_up_questions: [
          'What is your daily budget for this campaign?',
          'Who is your target audience?',
          'What geographic locations should we target?',
          'Do you have a landing page URL?',
        ],
        confidence: 0.4,
      };
    }
  }

  /**
   * Ask clarifying questions
   */
  private askQuestions(intent: UserIntent): OrchestratorResponse {
    const questions = intent.follow_up_questions || [];
    // Use double newlines for markdown paragraph breaks
    const questionList = questions.map((q, i) => `**${i + 1}.** ${q}`).join('\n\n');

    return {
      message: `Before I proceed, I need a few details:\n\n${questionList}\n\nPlease answer these so I can build the best plan for you.`,
      state: 'asking_questions',
      intent,
    };
  }

  /**
   * Generate execution plan
   */
  private async generatePlan(intent: UserIntent, chatHistory: ChatMessage[]): Promise<OrchestratorResponse> {
    const prompt = `## User Intent
${JSON.stringify(intent, null, 2)}

## Instructions
Create a detailed execution plan for this request. Include:
1. A clear summary of what you'll do
2. Step-by-step plan with which agents will be used
3. Suggest competitors to research (based on the business description, if applicable)
4. Estimate the budget range if not specified
5. List anything you still need from the user

Be specific about what each step will produce.

Return JSON matching the executionPlan schema.`;

    const plan = await this.callStructured<ExecutionPlan>(
      { system: SYSTEM_PROMPT, prompt },
      executionPlanSchema,
    );

    // Format plan as readable message
    const planMessage = this.formatPlanMessage(plan);

    return {
      message: planMessage,
      state: 'presenting_plan',
      intent,
      plan,
    };
  }

  /**
   * Refine plan based on user feedback
   */
  private async refinePlan(
    feedback: string,
    currentPlan: ExecutionPlan,
    intent: UserIntent,
    chatHistory: ChatMessage[],
  ): Promise<OrchestratorResponse> {
    const prompt = `## Current Plan
${JSON.stringify(currentPlan, null, 2)}

## User's Intent
${JSON.stringify(intent, null, 2)}

## User's Feedback / Refinement Request
${feedback}

## Instructions
Refine the execution plan based on the user's feedback. Keep what works, change what they asked to change. Return the updated plan as JSON matching the executionPlan schema.`;

    const refinedPlan = await this.callStructured<ExecutionPlan>(
      { system: SYSTEM_PROMPT, prompt },
      executionPlanSchema,
    );

    const planMessage = this.formatPlanMessage(refinedPlan);

    return {
      message: `Updated plan based on your feedback:\n\n${planMessage}`,
      state: 'refining',
      intent,
      plan: refinedPlan,
    };
  }

  /**
   * Execute the approved plan
   */
  private async executePlan(plan: ExecutionPlan, intent: UserIntent): Promise<OrchestratorResponse> {
    this.logger.info('Executing approved plan', { steps: plan.steps.length });

    const approvalIds: string[] = [];
    let statusMessages: string[] = ['Executing your plan...\n'];

    try {
      // Merge plan's suggested competitors with user-provided ones
      const allCompetitorDomains = [
        ...(intent.entities.competitor_domains || []),
        ...(plan.suggested_competitors?.map((c) => c.domain) || []),
      ].filter((v, i, a) => a.indexOf(v) === i); // deduplicate

      // Execute steps sequentially
      let researchResult = null;
      let campaignBlueprint = null;

      for (const step of plan.steps) {
        statusMessages.push(`**Step: ${step.action}**`);

        try {
          switch (step.agent) {
            case 'ResearchAgent': {
              researchResult = await researchAgent.research({
                business_description: intent.entities.business_description || '',
                seed_keywords: intent.entities.keywords,
                competitor_domains: allCompetitorDomains,
                target_audience: intent.entities.target_audience,
              });

              // Validate through QA
              const qaResult = await qaSentinel.validateResearchOutput(researchResult);
              if (!qaResult.passed) {
                researchResult = await researchAgent.handleQAFeedback(
                  qaResult.errors,
                  researchResult,
                  researchOutputSchema,
                );
              }

              statusMessages.push(`  Found ${researchResult.keywords.length} keywords, analyzed ${researchResult.competitor_deep_analysis?.length || 0} competitors`);
              break;
            }

            case 'CampaignBuilderAgent': {
              if (!researchResult) {
                statusMessages.push('  Skipped — no research data available');
                break;
              }

              const { output, qaResult, retries } = await qaSentinel.validateAndRetry(
                () => campaignBuilderAgent.buildCampaign({
                  research: researchResult!,
                  instructions: intent.entities.business_description || '',
                  business_description: intent.entities.business_description || '',
                  target_audience: intent.entities.target_audience,
                  budget_daily_dollars: intent.entities.budget,
                  landing_page_url: intent.entities.landing_page_url,
                  geo_targets: intent.entities.geo_targets?.map((g) => ({ country: g })),
                  language_targets: ['en'],
                }),
                (errors, original) => campaignBuilderAgent.handleQAFeedback(
                  errors, original, campaignBlueprintSchema,
                ),
                (output) => qaSentinel.validateCampaignBlueprint(output),
              );

              campaignBlueprint = output;

              if (!qaResult.passed) {
                statusMessages.push(`  Campaign built but has ${qaResult.errors.length} QA issues after ${retries} fix attempts. Sending for your review.`);
              } else {
                statusMessages.push(`  Built "${output.campaign.name}" with ${output.ad_groups.length} ad groups (QA passed${retries > 0 ? ` after ${retries} fixes` : ''})`);
              }

              const approval = await approvalEngine.enqueue({
                action_type: 'create_campaign',
                entity_type: 'campaign',
                payload: output as unknown as Record<string, unknown>,
                ai_reasoning: output.reasoning,
                confidence_score: qaResult.passed ? 0.9 : 0.6,
                priority: 'normal',
                agent_name: 'CampaignBuilderAgent',
              });
              approvalIds.push(approval.id);
              break;
            }

            case 'CopywriterAgent': {
              if (!campaignBlueprint) {
                statusMessages.push('  Skipped — no campaign to write copy for');
                break;
              }

              let totalVariants = 0;
              for (const ag of campaignBlueprint.ad_groups) {
                const { output: copyOutput } = await qaSentinel.validateAndRetry(
                  () => copywriterAgent.generateCopy({
                    campaign_name: campaignBlueprint!.campaign.name,
                    ad_group_theme: ag.name,
                    business_description: intent.entities.business_description || '',
                    target_audience: intent.entities.target_audience,
                    landing_page_url: intent.entities.landing_page_url,
                    keywords: ag.keywords.map((k) => k.text),
                    campaign_type: campaignBlueprint!.campaign.campaign_type,
                  }),
                  (errors, original) => copywriterAgent.handleQAFeedback(
                    errors, original, adCopyVariantsSchema,
                  ),
                  (output) => qaSentinel.validateAdCopyVariants(output),
                );

                totalVariants += copyOutput.variants.length;
              }

              statusMessages.push(`  Generated ${totalVariants} ad copy variants across ${campaignBlueprint.ad_groups.length} ad groups`);
              break;
            }

            default:
              statusMessages.push(`  Agent "${step.agent}" — will be available in a future update`);
          }
        } catch (stepError) {
          statusMessages.push(`  Error in ${step.agent}: ${stepError instanceof Error ? stepError.message : 'Unknown error'}. Continuing with next step.`);
          this.logger.error(`Step failed: ${step.agent}`, { error: stepError instanceof Error ? stepError.message : String(stepError) });
        }
      }

      const summary = approvalIds.length > 0
        ? `\n\nI've created ${approvalIds.length} item(s) in your **approval queue**. Review and approve them when ready — nothing goes live until you say so.`
        : '';

      return {
        message: statusMessages.join('\n') + summary,
        state: 'done',
        intent,
        plan,
        approval_ids: approvalIds,
      };
    } catch (error) {
      return {
        message: `Execution error: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPartial progress:\n${statusMessages.join('\n')}`,
        state: 'done',
        intent,
        plan,
        approval_ids: approvalIds,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ---- Helpers ----

  /**
   * Extract answers from user message and merge into existing intent.
   * Uses a dedicated prompt that focuses on extracting entity values,
   * not re-classifying intent.
   */
  private async extractAnswersIntoIntent(
    originalIntent: UserIntent,
    answersMessage: string,
  ): Promise<UserIntent> {
    const extractionPrompt = `You are extracting structured data from a user's answers. You MUST respond with ONLY a valid JSON object — no other text.

The user was previously asked questions about their Google Ads campaign. Here is what we already know:
${JSON.stringify(originalIntent.entities, null, 2)}

The user's answers:
${answersMessage}

Extract any new information from the answers and return a JSON object with ONLY the fields that have values. Valid fields:
- "business_description": string
- "target_audience": string
- "budget": number (daily budget in dollars, just the number)
- "geo_targets": ["location1", "location2"]
- "landing_page_url": string (primary URL)
- "competitor_domains": ["domain1.com"]
- "keywords": ["keyword1", "keyword2"]
- "campaign_name": string

Return ONLY the JSON with fields that have values. Example: {"budget": 50, "target_audience": "CTOs in Fortune 1000", "geo_targets": ["USA"], "landing_page_url": "https://example.com/page"}`;

    try {
      const response = await this.callRaw({
        system: 'You are a JSON data extractor. Respond with ONLY valid JSON. No explanations.',
        prompt: extractionPrompt,
      });

      const { extractJSON } = await import('../utils/json-parser');
      const extracted = extractJSON<Record<string, unknown>>(response);

      if (extracted) {
        return {
          ...originalIntent,
          entities: {
            ...originalIntent.entities,
            ...(extracted.business_description && { business_description: String(extracted.business_description) }),
            ...(extracted.target_audience && { target_audience: String(extracted.target_audience) }),
            ...(extracted.budget && { budget: Number(extracted.budget) }),
            ...(extracted.geo_targets && { geo_targets: extracted.geo_targets as string[] }),
            ...(extracted.landing_page_url && { landing_page_url: String(extracted.landing_page_url) }),
            ...(extracted.competitor_domains && { competitor_domains: extracted.competitor_domains as string[] }),
            ...(extracted.keywords && { keywords: extracted.keywords as string[] }),
            ...(extracted.campaign_name && { campaign_name: String(extracted.campaign_name) }),
          },
          follow_up_questions: [],
          confidence: 0.9,
        };
      }
    } catch (error) {
      this.logger.warn('Answer extraction failed, using raw merge', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Fallback: just append the raw message to business_description
    return {
      ...originalIntent,
      entities: {
        ...originalIntent.entities,
        business_description: `${originalIntent.entities.business_description || ''}\n\nAdditional details: ${answersMessage}`,
      },
      follow_up_questions: [],
      confidence: 0.7,
    };
  }

  private isConfirmation(message: string): boolean {
    return CONFIG.agents.confirmationPattern.test(message.trim());
  }

  private formatPlanMessage(plan: ExecutionPlan): string {
    let msg = `**Plan:** ${plan.summary}\n\n**Steps:**\n`;
    plan.steps.forEach((step, i) => {
      msg += `${i + 1}. **${step.agent}** — ${step.action}\n`;
    });

    if (plan.suggested_competitors?.length) {
      msg += `\n**Competitors I'll analyze:**\n`;
      plan.suggested_competitors.forEach((c) => {
        msg += `- ${c.domain} (${c.reason})\n`;
      });
    }

    if (plan.estimated_budget_range) {
      const min = plan.estimated_budget_range.min_daily_micros / 1_000_000;
      const max = plan.estimated_budget_range.max_daily_micros / 1_000_000;
      msg += `\n**Suggested budget:** $${min.toFixed(0)}-$${max.toFixed(0)}/day (${plan.estimated_budget_range.reasoning})\n`;
    }

    if (plan.needs_user_input?.length) {
      msg += `\n**Still need from you:**\n`;
      plan.needs_user_input.forEach((item) => {
        msg += `- ${item}\n`;
      });
    }

    msg += `\nSay **"go"**, **"proceed"**, or **"yes"** to execute, or tell me what to change.`;

    return msg;
  }
}

// Singleton
export const orchestratorAgent = new OrchestratorAgent();
