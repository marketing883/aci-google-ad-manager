import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

/**
 * POST /api/ai/suggest-content
 *
 * Ayn's focused content-generation endpoint. Used by the AiSuggestDialog on
 * Portfolio detail to draft headlines, descriptions, keywords, or negative
 * keywords without the user having to navigate to the full chat UI.
 *
 * Body:
 *   {
 *     type: "headline" | "description" | "keyword" | "negative_keyword",
 *     context: string,          // campaign/ad group context the AI should know
 *     existing: string[],       // items the AI should NOT duplicate
 *     prompt?: string,          // freeform user guidance ("benefit-focused", etc.)
 *     count?: number,           // how many suggestions to return. default 5
 *   }
 *
 * Returns:
 *   { suggestions: Array<{ text: string; rationale?: string }> }
 *
 * The model is asked to return strict JSON. If parsing fails, we return an
 * empty list rather than crashing the dialog.
 */

type SuggestType = 'headline' | 'description' | 'keyword' | 'negative_keyword';
type SuggestMode = 'add' | 'rewrite';

interface SuggestBody {
  type: SuggestType;
  mode?: SuggestMode;
  /** Required when mode === 'rewrite' — the text being rewritten. */
  current?: string;
  context?: string;
  existing?: string[];
  prompt?: string;
  count?: number;
}

interface Suggestion {
  text: string;
  rationale?: string;
}

const TYPE_RULES: Record<SuggestType, { rules: string; maxLength: number }> = {
  headline: {
    rules: [
      'Each headline must be a Google Responsive Search Ad headline.',
      'Maximum 30 characters per headline — strictly enforced.',
      'Lead with a concrete benefit, number, or proof point.',
      'Vary the structure across suggestions — mix questions, imperatives, and value props.',
      'No emojis. No ALL CAPS except for common acronyms (e.g. AI, SEO, B2B).',
    ].join(' '),
    maxLength: 30,
  },
  description: {
    rules: [
      'Each description must be a Google RSA description line.',
      'Maximum 90 characters per description — strictly enforced.',
      'Each must end with a clear call-to-action verb phrase.',
      'Tie the offer to a specific differentiator or outcome.',
      'Avoid vague marketing-speak like "world-class" or "innovative solutions".',
    ].join(' '),
    maxLength: 90,
  },
  keyword: {
    rules: [
      'Each keyword is a Google Ads search keyword (not a phrase or sentence).',
      'Mix bottom-funnel commercial intent with targeted long-tail variants.',
      'Do NOT include match-type symbols like [] or "" — the UI adds those.',
      'Avoid brand terms of competitors unless explicitly requested.',
      'Keep each keyword under 10 words.',
    ].join(' '),
    maxLength: 80,
  },
  negative_keyword: {
    rules: [
      'Each negative keyword blocks irrelevant traffic.',
      'Focus on common time-wasters: jobs, careers, free, tutorial, training, certification, salary, reviews.',
      'Include low-intent terms and research-only modifiers.',
      'Keep each term under 5 words.',
    ].join(' '),
    maxLength: 80,
  },
};

const PLURAL: Record<SuggestType, string> = {
  headline: 'headlines',
  description: 'descriptions',
  keyword: 'keywords',
  negative_keyword: 'negative keywords',
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SuggestBody;
    const type = body.type;
    if (
      type !== 'headline' &&
      type !== 'description' &&
      type !== 'keyword' &&
      type !== 'negative_keyword'
    ) {
      return NextResponse.json(
        { error: 'Invalid type. Expected headline | description | keyword | negative_keyword.' },
        { status: 400 },
      );
    }

    const mode: SuggestMode = body.mode === 'rewrite' ? 'rewrite' : 'add';
    const count = Math.min(Math.max(body.count ?? (mode === 'rewrite' ? 4 : 5), 1), 12);
    const rules = TYPE_RULES[type];
    const plural = PLURAL[type];
    const context = (body.context ?? '').slice(0, 1500);
    const userPrompt = (body.prompt ?? '').slice(0, 500);
    const existing = Array.isArray(body.existing) ? body.existing.slice(0, 40) : [];
    const currentText = (body.current ?? '').slice(0, 500);

    if (mode === 'rewrite' && !currentText) {
      return NextResponse.json(
        { error: 'current is required in rewrite mode' },
        { status: 400 },
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY is not configured' },
        { status: 500 },
      );
    }
    const client = new Anthropic({ apiKey });

    const systemPrompt =
      mode === 'rewrite'
        ? [
            'You are Ayn, an AI marketing strategist inside the ACI Interactive platform.',
            `You are rewriting a single ${plural.slice(0, -1)} for a Google Search Ads campaign.`,
            rules.rules,
            `Return exactly ${count} distinct variations of the original that preserve its core intent but improve on it.`,
            'Each variation must meaningfully differ from the original AND from the other variations — not just synonyms.',
            'Return ONLY valid JSON in this exact shape:',
            '{"suggestions":[{"text":"...","rationale":"one-sentence how this improves on the original"}]}',
            'Do not include any prose before or after the JSON. Do not wrap in markdown code fences.',
          ].join('\n')
        : [
            'You are Ayn, an AI marketing strategist inside the ACI Interactive platform.',
            `You are drafting ${plural} for a Google Search Ads campaign.`,
            rules.rules,
            `Return exactly ${count} ${plural}. Each must be distinct and not a paraphrase of another.`,
            'Return ONLY valid JSON in this exact shape:',
            '{"suggestions":[{"text":"...","rationale":"one-sentence why this works"}]}',
            'Do not include any prose before or after the JSON. Do not wrap in markdown code fences.',
          ].join('\n');

    const userMessage =
      mode === 'rewrite'
        ? [
            `CONTEXT:\n${context || '(no campaign context provided)'}`,
            `\n\nORIGINAL ${plural.slice(0, -1).toUpperCase()}:\n"${currentText}"`,
            existing.length > 0
              ? `\n\nOTHER ${plural.toUpperCase()} IN THIS AD (for tone/style consistency — do not duplicate):\n${existing
                  .filter((e) => e !== currentText)
                  .map((e, i) => `${i + 1}. ${e}`)
                  .join('\n')}`
              : '',
            userPrompt ? `\n\nUSER DIRECTION:\n${userPrompt}` : '',
            `\n\nGenerate ${count} variations now.`,
          ].join('')
        : [
            `CONTEXT:\n${context || '(no campaign context provided)'}`,
            existing.length > 0
              ? `\n\nEXISTING ${plural.toUpperCase()} TO AVOID DUPLICATING:\n${existing
                  .map((e, i) => `${i + 1}. ${e}`)
                  .join('\n')}`
              : '',
            userPrompt ? `\n\nUSER DIRECTION:\n${userPrompt}` : '',
            `\n\nGenerate ${count} new ${plural} now.`,
          ].join('');

    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      temperature: 0.85,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    // Extract the text block
    const textBlock = response.content.find((c) => c.type === 'text');
    const raw = textBlock && 'text' in textBlock ? textBlock.text.trim() : '';

    // Parse JSON — strip possible code fences defensively
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    let suggestions: Suggestion[] = [];
    try {
      const parsed = JSON.parse(cleaned);
      if (parsed && Array.isArray(parsed.suggestions)) {
        suggestions = parsed.suggestions
          .filter(
            (s: unknown): s is { text: string; rationale?: string } =>
              !!s && typeof s === 'object' && 'text' in s && typeof (s as { text: unknown }).text === 'string',
          )
          .map((s: { text: string; rationale?: string }) => ({
            text: s.text.trim(),
            rationale: s.rationale?.trim(),
          }))
          .filter((s: Suggestion) => s.text.length > 0);
      }
    } catch {
      // Parsing failed — return empty so the dialog can show a graceful error
      suggestions = [];
    }

    return NextResponse.json({ suggestions });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to generate suggestions',
      },
      { status: 500 },
    );
  }
}
