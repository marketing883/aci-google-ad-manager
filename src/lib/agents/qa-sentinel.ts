import { createAdminClient } from '../supabase-server';
import { createLogger } from '../utils/logger';
import { CONFIG } from '../config';
import type { QAError } from './base-agent';
import type { CampaignBlueprint, AdCopyVariants, ResearchOutput } from '@/schemas/agent-output';

const logger = createLogger('QASentinel');

// ============================================================
// QA Sentinel — Rules-based quality gate for all agent outputs
// No AI — deterministic, fast, no hallucination risk
// All thresholds configurable via settings table
// ============================================================

interface QAResult {
  passed: boolean;
  errors: QAError[];
  warnings: QAError[];
}

interface QASettings {
  qa_warn_budget_daily_micros: number;
  qa_block_budget_daily_micros: number;
  qa_max_keyword_bid_micros: number;
  qa_max_retry_rounds: number;
}

const DEFAULT_SETTINGS: QASettings = {
  qa_warn_budget_daily_micros: 500_000_000, // $500/day
  qa_block_budget_daily_micros: 2_000_000_000, // $2000/day
  qa_max_keyword_bid_micros: 50_000_000, // $50
  qa_max_retry_rounds: 2,
};

export class QASentinel {
  private supabase = createAdminClient();
  private settingsCache: QASettings | null = null;

  /**
   * Load configurable thresholds from settings table
   */
  private async getSettings(): Promise<QASettings> {
    if (this.settingsCache) return this.settingsCache;

    try {
      const { data } = await this.supabase
        .from('settings')
        .select('key, value')
        .in('key', Object.keys(DEFAULT_SETTINGS));

      const settings = { ...DEFAULT_SETTINGS };
      for (const row of data || []) {
        if (row.key in settings) {
          (settings as Record<string, unknown>)[row.key] = typeof row.value === 'string'
            ? JSON.parse(row.value)
            : row.value;
        }
      }

      this.settingsCache = settings;
      return settings;
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  /**
   * Clear settings cache (call after settings update)
   */
  clearCache(): void {
    this.settingsCache = null;
  }

  // ============================================================
  // Main Validation Methods
  // ============================================================

  /**
   * Validate a campaign blueprint from CampaignBuilderAgent
   */
  async validateCampaignBlueprint(blueprint: CampaignBlueprint): Promise<QAResult> {
    const settings = await this.getSettings();
    const errors: QAError[] = [];
    const warnings: QAError[] = [];

    // ---- Budget Validation ----
    const budget = blueprint.campaign.budget_amount_micros;

    // Extra zero detection: if budget is >10x the block threshold, likely a mistake
    if (budget > settings.qa_block_budget_daily_micros * 10) {
      errors.push({
        field: 'campaign.budget_amount_micros',
        message: `Budget of $${(budget / 1_000_000).toLocaleString()}/day is extremely high. This is likely an extra zero error. Expected range: $10-$${(settings.qa_block_budget_daily_micros / 1_000_000).toLocaleString()}/day`,
        severity: 'error',
        suggestion: `Reduce to $${(budget / 10_000_000).toLocaleString()}/day (divided by 10)`,
      });
    } else if (budget > settings.qa_block_budget_daily_micros) {
      errors.push({
        field: 'campaign.budget_amount_micros',
        message: `Budget of $${(budget / 1_000_000).toLocaleString()}/day exceeds the hard limit of $${(settings.qa_block_budget_daily_micros / 1_000_000).toLocaleString()}/day`,
        severity: 'error',
        suggestion: `Reduce budget to $${(settings.qa_block_budget_daily_micros / 1_000_000).toLocaleString()}/day or below`,
      });
    } else if (budget > settings.qa_warn_budget_daily_micros) {
      warnings.push({
        field: 'campaign.budget_amount_micros',
        message: `Budget of $${(budget / 1_000_000).toLocaleString()}/day is above the warning threshold of $${(settings.qa_warn_budget_daily_micros / 1_000_000).toLocaleString()}/day`,
        severity: 'warning',
      });
    }

    if (budget <= 0) {
      errors.push({
        field: 'campaign.budget_amount_micros',
        message: 'Budget must be greater than $0',
        severity: 'error',
      });
    }

    // ---- Structural Validation ----
    if (blueprint.ad_groups.length === 0) {
      errors.push({
        field: 'ad_groups',
        message: 'Campaign must have at least 1 ad group',
        severity: 'error',
      });
    }

    if (blueprint.campaign.geo_targets.length === 0) {
      warnings.push({
        field: 'campaign.geo_targets',
        message: 'No geo targets specified — campaign will target all locations',
        severity: 'warning',
        suggestion: 'Add at least one geo target (e.g., country or region)',
      });
    }

    // ---- Ad Group Validation ----
    const allKeywords: Array<{ text: string; matchType: string; adGroup: string }> = [];

    for (let i = 0; i < blueprint.ad_groups.length; i++) {
      const ag = blueprint.ad_groups[i];
      const prefix = `ad_groups[${i}]`;

      if (ag.ads.length === 0) {
        errors.push({
          field: `${prefix}.ads`,
          message: `Ad group "${ag.name}" has no ads`,
          severity: 'error',
        });
      }

      if (ag.keywords.length === 0) {
        errors.push({
          field: `${prefix}.keywords`,
          message: `Ad group "${ag.name}" has no keywords`,
          severity: 'error',
        });
      }

      // Validate ads within ad group
      for (let j = 0; j < ag.ads.length; j++) {
        const ad = ag.ads[j];
        const adPrefix = `${prefix}.ads[${j}]`;

        this.validateAdCopy(ad, adPrefix, errors);
      }

      // Validate keywords
      for (let j = 0; j < ag.keywords.length; j++) {
        const kw = ag.keywords[j];
        const kwPrefix = `${prefix}.keywords[${j}]`;

        // Keyword bid check
        if (kw.cpc_bid_micros && kw.cpc_bid_micros > settings.qa_max_keyword_bid_micros) {
          errors.push({
            field: kwPrefix,
            message: `Keyword "${kw.text}" bid of $${(kw.cpc_bid_micros / 1_000_000).toFixed(2)} exceeds max of $${(settings.qa_max_keyword_bid_micros / 1_000_000).toFixed(2)}`,
            severity: 'error',
            suggestion: `Reduce bid to $${(settings.qa_max_keyword_bid_micros / 1_000_000).toFixed(2)} or below`,
          });
        }

        allKeywords.push({ text: kw.text.toLowerCase(), matchType: kw.match_type, adGroup: ag.name });
      }

      // Negative keyword conflict check within ad group
      if (ag.negative_keywords) {
        for (const negKw of ag.negative_keywords) {
          const conflict = ag.keywords.find((kw) => kw.text.toLowerCase() === negKw.toLowerCase());
          if (conflict) {
            errors.push({
              field: `${prefix}.negative_keywords`,
              message: `Negative keyword "${negKw}" conflicts with positive keyword "${conflict.text}" in ad group "${ag.name}"`,
              severity: 'error',
              suggestion: `Remove either the positive or negative keyword`,
            });
          }
        }
      }
    }

    // ---- Cross Ad Group Duplicate Keywords ----
    const kwMap = new Map<string, string[]>();
    for (const kw of allKeywords) {
      const key = `${kw.text}|${kw.matchType}`;
      if (!kwMap.has(key)) kwMap.set(key, []);
      kwMap.get(key)!.push(kw.adGroup);
    }

    for (const [key, adGroups] of kwMap) {
      if (adGroups.length > 1) {
        const [text, matchType] = key.split('|');
        warnings.push({
          field: 'keywords',
          message: `Duplicate keyword "${text}" (${matchType}) found in ad groups: ${adGroups.join(', ')}`,
          severity: 'warning',
          suggestion: 'Consider keeping this keyword in only one ad group for cleaner structure',
        });
      }
    }

    // ---- Campaign-level negative keyword conflicts ----
    if (blueprint.negative_keywords_campaign_level) {
      for (const negKw of blueprint.negative_keywords_campaign_level) {
        const conflict = allKeywords.find((kw) => kw.text === negKw.toLowerCase());
        if (conflict) {
          errors.push({
            field: 'negative_keywords_campaign_level',
            message: `Campaign-level negative keyword "${negKw}" conflicts with positive keyword in ad group "${conflict.adGroup}"`,
            severity: 'error',
          });
        }
      }
    }

    // ---- Match Type Distribution ----
    if (allKeywords.length > 5) {
      const matchTypes = new Set(allKeywords.map((kw) => kw.matchType));
      if (matchTypes.size === 1) {
        warnings.push({
          field: 'keywords',
          message: `All ${allKeywords.length} keywords use ${allKeywords[0].matchType} match type. Consider diversifying match types.`,
          severity: 'warning',
        });
      }
    }

    return {
      passed: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate ad copy from CopywriterAgent
   */
  async validateAdCopy(
    adCopy: { headlines: Array<{ text: string }>; descriptions: Array<{ text: string }>; final_urls?: string[]; path1?: string; path2?: string },
    fieldPrefix = 'ad',
    existingErrors?: QAError[],
  ): Promise<QAResult> {
    const errors = existingErrors || [];
    const warnings: QAError[] = [];

    // Headlines
    if (adCopy.headlines.length < 3) {
      errors.push({
        field: `${fieldPrefix}.headlines`,
        message: `Need at least 3 headlines, got ${adCopy.headlines.length}`,
        severity: 'error',
      });
    }

    const seenHeadlines = new Set<string>();
    for (let i = 0; i < adCopy.headlines.length; i++) {
      const h = adCopy.headlines[i];
      if (h.text.length > 30) {
        errors.push({
          field: `${fieldPrefix}.headlines[${i}]`,
          message: `Headline "${h.text}" is ${h.text.length} chars (max 30)`,
          severity: 'error',
          suggestion: `Shorten to: "${h.text.slice(0, 27)}..."`,
        });
      }
      if (seenHeadlines.has(h.text.toLowerCase())) {
        errors.push({
          field: `${fieldPrefix}.headlines[${i}]`,
          message: `Duplicate headline: "${h.text}"`,
          severity: 'error',
        });
      }
      seenHeadlines.add(h.text.toLowerCase());
    }

    // Descriptions
    if (adCopy.descriptions.length < 2) {
      errors.push({
        field: `${fieldPrefix}.descriptions`,
        message: `Need at least 2 descriptions, got ${adCopy.descriptions.length}`,
        severity: 'error',
      });
    }

    const seenDescs = new Set<string>();
    for (let i = 0; i < adCopy.descriptions.length; i++) {
      const d = adCopy.descriptions[i];
      if (d.text.length > 90) {
        errors.push({
          field: `${fieldPrefix}.descriptions[${i}]`,
          message: `Description "${d.text.slice(0, 40)}..." is ${d.text.length} chars (max 90)`,
          severity: 'error',
          suggestion: `Shorten to 90 characters`,
        });
      }
      if (seenDescs.has(d.text.toLowerCase())) {
        errors.push({
          field: `${fieldPrefix}.descriptions[${i}]`,
          message: `Duplicate description: "${d.text.slice(0, 40)}..."`,
          severity: 'error',
        });
      }
      seenDescs.add(d.text.toLowerCase());
    }

    // Paths
    if (adCopy.path1 && adCopy.path1.length > 15) {
      errors.push({
        field: `${fieldPrefix}.path1`,
        message: `Path1 "${adCopy.path1}" is ${adCopy.path1.length} chars (max 15)`,
        severity: 'error',
      });
    }
    if (adCopy.path2 && adCopy.path2.length > 15) {
      errors.push({
        field: `${fieldPrefix}.path2`,
        message: `Path2 "${adCopy.path2}" is ${adCopy.path2.length} chars (max 15)`,
        severity: 'error',
      });
    }

    // Final URLs
    if (adCopy.final_urls) {
      for (let i = 0; i < adCopy.final_urls.length; i++) {
        const url = adCopy.final_urls[i];
        if (!url || url.trim() === '') {
          errors.push({
            field: `${fieldPrefix}.final_urls[${i}]`,
            message: 'Final URL cannot be empty',
            severity: 'error',
          });
        } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
          errors.push({
            field: `${fieldPrefix}.final_urls[${i}]`,
            message: `Final URL "${url}" must start with http:// or https://`,
            severity: 'error',
          });
        }
      }
      if (adCopy.final_urls.length === 0) {
        errors.push({
          field: `${fieldPrefix}.final_urls`,
          message: 'At least one final URL is required',
          severity: 'error',
        });
      }
    }

    return {
      passed: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate ad copy variants output
   */
  async validateAdCopyVariants(output: AdCopyVariants): Promise<QAResult> {
    const allErrors: QAError[] = [];
    const allWarnings: QAError[] = [];

    for (let i = 0; i < output.variants.length; i++) {
      const variant = output.variants[i];
      const result = await this.validateAdCopy(variant, `variants[${i}]`);
      allErrors.push(...result.errors);
      allWarnings.push(...result.warnings);
    }

    return {
      passed: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings,
    };
  }

  /**
   * Validate research output (lighter checks)
   */
  async validateResearchOutput(output: ResearchOutput): Promise<QAResult> {
    const errors: QAError[] = [];
    const warnings: QAError[] = [];

    if (output.keywords.length === 0) {
      errors.push({
        field: 'keywords',
        message: 'Research returned no keywords',
        severity: 'error',
      });
    }

    // Check for unreasonably high bid suggestions
    const settings = await this.getSettings();
    for (let i = 0; i < output.keywords.length; i++) {
      const kw = output.keywords[i];
      if (kw.suggested_bid_micros && kw.suggested_bid_micros > settings.qa_max_keyword_bid_micros) {
        warnings.push({
          field: `keywords[${i}].suggested_bid_micros`,
          message: `Keyword "${kw.text}" has a suggested bid of $${(kw.suggested_bid_micros / 1_000_000).toFixed(2)} which exceeds the max threshold`,
          severity: 'warning',
        });
      }
    }

    return { passed: errors.length === 0, errors, warnings };
  }

  // ============================================================
  // QA Feedback Loop — Validate and auto-retry
  // ============================================================

  /**
   * Run an agent function, validate output, and retry if QA fails.
   * Max retries configurable via settings.
   */
  async validateAndRetry<T>(
    agentFn: () => Promise<T>,
    fixFn: (errors: QAError[], output: T) => Promise<T>,
    validateFn: (output: T) => Promise<QAResult>,
  ): Promise<{ output: T; qaResult: QAResult; retries: number }> {
    const settings = await this.getSettings();
    const maxRetries = settings.qa_max_retry_rounds;

    let output = await agentFn();
    let qaResult = await validateFn(output);
    let retries = 0;

    while (!qaResult.passed && retries < maxRetries) {
      retries++;
      logger.info(`QA retry ${retries}/${maxRetries}: ${qaResult.errors.length} errors to fix`);

      try {
        output = await fixFn(qaResult.errors, output);
        qaResult = await validateFn(output);
      } catch (error) {
        logger.error(`QA fix attempt ${retries} failed`, {
          error: error instanceof Error ? error.message : String(error),
        });
        break;
      }
    }

    if (!qaResult.passed) {
      logger.warn(`QA failed after ${retries} retries. Escalating to user.`, {
        errors: qaResult.errors.length,
      });
    }

    return { output, qaResult, retries };
  }
}

// Singleton
export const qaSentinel = new QASentinel();
