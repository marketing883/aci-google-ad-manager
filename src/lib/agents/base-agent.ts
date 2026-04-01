import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { createAdminClient } from '../supabase-server';
import { createLogger } from '../utils/logger';
import { withRetry } from '../utils/retry';
import { extractJSON } from '../utils/json-parser';
import { CONFIG } from '../config';

// ============================================================
// BaseAdsAgent — Abstract base for all AI agents
// Adapted from business-model/engine/src/agents/base/base-agent.ts
// ============================================================

export interface AgentConfig {
  name: string;
  tier: 'strategy' | 'fast';
  temperature?: number;
  maxTokens?: number;
}

interface AgentCallOptions {
  system: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

export abstract class BaseAdsAgent {
  protected config: AgentConfig;
  protected logger;
  private anthropic: Anthropic;
  private openai: OpenAI;
  private supabase = createAdminClient();

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

  /**
   * Call Anthropic API with structured JSON output and Zod validation
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
   * Call with 4-layer model fallback
   * Anthropic Strategy → Anthropic Fast → OpenAI GPT-4o → OpenAI GPT-4o-mini
   */
  private async callWithFallback(options: AgentCallOptions): Promise<string> {
    const modelConfig = CONFIG.models[this.config.tier];
    const maxTokens = options.maxTokens || this.config.maxTokens || modelConfig.maxTokens;
    const temperature = options.temperature ?? this.config.temperature ?? modelConfig.temperature;

    // Layer 1: Primary Anthropic model
    try {
      return await this.callAnthropic(
        modelConfig.model,
        options.system,
        options.prompt,
        maxTokens,
        temperature,
      );
    } catch (error) {
      this.logger.warn(`Primary model failed: ${modelConfig.model}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Layers 2-4: Fallback chain
    for (const fallback of CONFIG.models.fallbacks) {
      try {
        if (fallback.provider === 'anthropic') {
          return await this.callAnthropic(
            fallback.model,
            options.system,
            options.prompt,
            maxTokens,
            temperature,
          );
        } else {
          return await this.callOpenAI(
            fallback.model,
            options.system,
            options.prompt,
            maxTokens,
            temperature,
          );
        }
      } catch (error) {
        this.logger.warn(`Fallback failed: ${fallback.model}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    throw new Error('All model fallbacks exhausted');
  }

  private async callAnthropic(
    model: string,
    system: string,
    prompt: string,
    maxTokens: number,
    temperature: number,
  ): Promise<string> {
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
    const endTimer = this.logger.startTimer(`openai:${model}`);

    const response = await withRetry(
      () =>
        this.openai.chat.completions.create({
          model,
          max_tokens: maxTokens,
          temperature,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt },
          ],
        }),
      { maxAttempts: 2 },
    );

    const durationMs = endTimer();
    const text = response.choices[0]?.message?.content || '';

    await this.logCall(model, prompt, text, durationMs, {
      input: response.usage?.prompt_tokens || 0,
      output: response.usage?.completion_tokens || 0,
    });

    return text;
  }

  /**
   * Log agent call to Supabase
   */
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

  /**
   * Log an error to Supabase
   */
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
}
