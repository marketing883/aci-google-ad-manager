import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { createAdminClient } from '../supabase-server';
import { createLogger } from '../utils/logger';
import { withRetry } from '../utils/retry';
import { extractJSON } from '../utils/json-parser';
import { CONFIG, estimateTokens } from '../config';
import { waitForCapacity, recordRequest } from '../rate-limit';

// ============================================================
// BaseAdsAgent — Abstract base for all AI agents
// Supports: orchestrator (Opus), strategy (Sonnet), fast (Haiku) tiers
// Includes: QA feedback loop, rate limiting, token budget tracking
// ============================================================

export interface AgentConfig {
  name: string;
  tier: 'orchestrator' | 'strategy' | 'fast';
  temperature?: number;
  maxTokens?: number;
}

export interface AgentCallOptions {
  system: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface QAError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
  suggestion?: string;
}

export abstract class BaseAdsAgent {
  protected config: AgentConfig;
  protected logger;
  private anthropic: Anthropic;
  private openai: OpenAI;
  protected supabase = createAdminClient();

  constructor(config: AgentConfig) {
    this.config = config;
    this.logger = createLogger(config.name);

    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  // ============================================================
  // Core LLM Call Methods
  // ============================================================

  /**
   * Call with structured JSON output and Zod validation
   */
  protected async callStructured<T>(
    options: AgentCallOptions,
    schema: { parse: (data: unknown) => T },
  ): Promise<T> {
    const response = await this.callWithFallback(options);
    const parsed = extractJSON<unknown>(response);

    if (parsed === null) {
      throw new Error('Failed to extract JSON from LLM response');
    }

    return schema.parse(parsed);
  }

  /**
   * Call with raw text response
   */
  protected async callRaw(options: AgentCallOptions): Promise<string> {
    return this.callWithFallback(options);
  }

  /**
   * Call with model fallback chain (tier-specific)
   */
  private async callWithFallback(options: AgentCallOptions): Promise<string> {
    const modelConfig = CONFIG.models[this.config.tier];
    const maxTokens = options.maxTokens || this.config.maxTokens || modelConfig.maxTokens;
    const temperature = options.temperature ?? this.config.temperature ?? modelConfig.temperature;

    // Layer 1: Primary model
    try {
      if (modelConfig.provider === 'anthropic') {
        return await this.callAnthropic(modelConfig.model, options.system, options.prompt, maxTokens, temperature);
      } else {
        return await this.callOpenAI(modelConfig.model, options.system, options.prompt, maxTokens, temperature);
      }
    } catch (error) {
      this.logger.warn(`Primary model failed: ${modelConfig.model}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Fallback layers
    const fallbacks = modelConfig.fallbacks;
    for (const fallback of fallbacks) {
      try {
        if (fallback.provider === 'anthropic') {
          return await this.callAnthropic(fallback.model, options.system, options.prompt, maxTokens, temperature);
        } else {
          return await this.callOpenAI(fallback.model, options.system, options.prompt, maxTokens, temperature);
        }
      } catch (error) {
        this.logger.warn(`Fallback failed: ${fallback.model}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    throw new Error(`All model fallbacks exhausted for ${this.config.name}`);
  }

  private async callAnthropic(
    model: string,
    system: string,
    prompt: string,
    maxTokens: number,
    temperature: number,
  ): Promise<string> {
    // Rate limit check
    const estimatedInputTokens = estimateTokens(system + prompt);
    await waitForCapacity('anthropic', estimatedInputTokens);

    const endTimer = this.logger.startTimer(`anthropic:${model}`);

    const response = await withRetry(
      () =>
        this.anthropic.messages.create({
          model,
          max_tokens: maxTokens,
          temperature,
          system,
          messages: [{ role: 'user', content: prompt }],
        }),
      { maxAttempts: 2 },
    );

    const durationMs = endTimer();
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    // Track rate limit usage
    recordRequest('anthropic', response.usage.input_tokens);

    // Log to agent_logs
    await this.logCall(model, prompt, text, durationMs, {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    });

    return text;
  }

  private async callOpenAI(
    model: string,
    system: string,
    prompt: string,
    maxTokens: number,
    temperature: number,
  ): Promise<string> {
    // Rate limit check
    const estimatedInputTokens = estimateTokens(system + prompt);
    await waitForCapacity('openai', estimatedInputTokens);

    const endTimer = this.logger.startTimer(`openai:${model}`);

    // OpenAI reasoning models (o1, o3, o4-mini, etc.) don't support temperature or system messages
    const REASONING_MODELS = ['o1', 'o1-mini', 'o1-preview', 'o3', 'o3-mini', 'o4-mini'];
    const isReasoningModel = REASONING_MODELS.some((rm) => model === rm || model.startsWith(`${rm}-`));

    const response = await withRetry(
      () =>
        this.openai.chat.completions.create({
          model,
          max_tokens: isReasoningModel ? undefined : maxTokens,
          ...(isReasoningModel ? {} : { temperature }),
          messages: isReasoningModel
            ? [{ role: 'user', content: `${system}\n\n${prompt}` }]
            : [
                { role: 'system', content: system },
                { role: 'user', content: prompt },
              ],
        }),
      { maxAttempts: 2 },
    );

    const durationMs = endTimer();
    const text = response.choices[0]?.message?.content || '';

    recordRequest('openai', response.usage?.prompt_tokens || 0);

    await this.logCall(model, prompt, text, durationMs, {
      input: response.usage?.prompt_tokens || 0,
      output: response.usage?.completion_tokens || 0,
    });

    return text;
  }

  // ============================================================
  // QA Feedback Loop — Fix errors from QASentinel
  // ============================================================

  /**
   * Handle QA feedback by fixing errors in the output.
   * Each agent should override fix() with domain-specific logic.
   */
  async handleQAFeedback<T>(
    errors: QAError[],
    originalOutput: T,
    schema: { parse: (data: unknown) => T },
  ): Promise<T> {
    const errorSummary = errors
      .map((e) => `- [${e.severity}] ${e.field}: ${e.message}${e.suggestion ? ` (Suggestion: ${e.suggestion})` : ''}`)
      .join('\n');

    this.logger.info(`Fixing ${errors.length} QA errors`, { errors: errorSummary });

    const fixPrompt = `You previously generated output that failed quality checks. Here are the specific errors:

${errorSummary}

Here is your original output:
${JSON.stringify(originalOutput, null, 2)}

Fix ONLY the issues listed above. Preserve everything else exactly as-is. Return the corrected output as valid JSON.`;

    return this.callStructured<T>(
      {
        system: this.getFixSystemPrompt(),
        prompt: fixPrompt,
      },
      schema,
    );
  }

  /**
   * Override in subclasses for domain-specific fix instructions
   */
  protected getFixSystemPrompt(): string {
    return `You are a Google Ads expert fixing quality check errors. You must fix ONLY the specific errors listed and preserve everything else. Return valid JSON matching the exact same schema as the original output.`;
  }

  // ============================================================
  // Logging
  // ============================================================

  private async logCall(
    model: string,
    input: string,
    output: string,
    durationMs: number,
    tokens: { input: number; output: number },
  ): Promise<void> {
    try {
      await this.supabase.from('agent_logs').insert({
        agent_name: this.config.name,
        action: 'llm_call',
        input_summary: input.slice(0, 500),
        output_summary: output.slice(0, 500),
        model_used: model,
        tokens_used: tokens,
        duration_ms: durationMs,
        status: 'success',
      });
    } catch (error) {
      this.logger.error('Failed to log agent call', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  protected async logError(action: string, error: Error): Promise<void> {
    try {
      await this.supabase.from('agent_logs').insert({
        agent_name: this.config.name,
        action,
        status: 'error',
        error_message: error.message,
      });
    } catch {
      this.logger.error('Failed to log error');
    }
  }

  protected async logAction(action: string, summary: string): Promise<void> {
    try {
      await this.supabase.from('agent_logs').insert({
        agent_name: this.config.name,
        action,
        output_summary: summary.slice(0, 500),
        status: 'success',
      });
    } catch {
      // non-critical
    }
  }
}
