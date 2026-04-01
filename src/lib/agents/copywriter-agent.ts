import { BaseAdsAgent } from './base-agent';
import { adCopyVariantsSchema, type AdCopyVariants } from '@/schemas/agent-output';
import { searchImages, type UnsplashImage } from '../unsplash';

// ============================================================
// CopywriterAgent — Ad copy + images + tracking URLs
// Model: Haiku (fast tier) for bulk copy generation
// ============================================================

const SYSTEM_PROMPT = `You are an expert Google Ads copywriter. You write high-converting ad copy that follows Google Ads best practices precisely.

## Hard Rules (NEVER violate)
- Headlines: MAXIMUM 30 characters each (including spaces). Count carefully.
- Descriptions: MAXIMUM 90 characters each (including spaces). Count carefully.
- Minimum 3 headlines, maximum 15 headlines per ad
- Minimum 2 descriptions, maximum 4 descriptions per ad
- No duplicate headlines or descriptions
- No excessive capitalization or punctuation (!!!, ALL CAPS)
- No misleading claims

## Best Practices
- Include the main keyword in at least 2 headlines
- Use numbers and specifics ("Save 40%", "24/7 Support")
- Include a clear CTA in at least one headline and one description
- Use emotional triggers: urgency, exclusivity, social proof, curiosity
- Pin the most important headline to position 1 if critical
- Vary themes across variants: benefit-focused, urgency, social-proof, feature-focused
- Match ad copy tone to the target audience (C-suite = professional, SMB = friendly)

## URL Best Practices
- Use UTM parameters for tracking: utm_source=google, utm_medium=cpc
- Include campaign name in utm_campaign
- Use ICP parameters to personalize landing pages (e.g., ?icp=cio)
- Keep display paths relevant and keyword-rich

## Character Counting Tips
- Count EVERY character including spaces
- "Cloud Migration" = 15 chars (with space)
- Use abbreviations if needed: "Mgmt" instead of "Management"
- Ampersand (&) saves 2 chars vs "and"

Respond with valid JSON matching the required schema. DOUBLE CHECK all character counts before responding.`;

export class CopywriterAgent extends BaseAdsAgent {
  constructor() {
    super({
      name: 'CopywriterAgent',
      tier: 'fast',
    });
  }

  /**
   * Generate ad copy variants with tracking URLs and image suggestions
   */
  async generateCopy(input: {
    campaign_name: string;
    ad_group_theme: string;
    business_description: string;
    target_audience?: string;
    landing_page_url?: string;
    persona?: string; // e.g., "cio", "cto", "vp_engineering"
    keywords?: string[];
    campaign_type?: string;
    url_template?: string; // user-defined URL template
    variant_count?: number;
  }): Promise<AdCopyVariants> {
    this.logger.info('Generating ad copy', { theme: input.ad_group_theme });

    // Generate copy
    const prompt = this.buildCopyPrompt(input);
    let output = await this.callStructured<AdCopyVariants>(
      { system: SYSTEM_PROMPT, prompt },
      adCopyVariantsSchema,
    );

    // Build tracking URLs
    if (input.landing_page_url) {
      output.tracking_urls = this.buildTrackingUrls(input);
    }

    // Search for relevant images (Display/Demand Gen campaigns)
    if (input.campaign_type === 'DISPLAY' || input.campaign_type === 'DEMAND_GEN' || !input.campaign_type) {
      const images = await this.findRelevantImages(input);
      if (images.length > 0) {
        output.suggested_images = images;
      }
    }

    await this.logAction('copy_generated', `${output.variants.length} variants for "${input.ad_group_theme}"`);

    return output;
  }

  /**
   * Build the copy generation prompt
   */
  private buildCopyPrompt(input: {
    campaign_name: string;
    ad_group_theme: string;
    business_description: string;
    target_audience?: string;
    landing_page_url?: string;
    persona?: string;
    keywords?: string[];
    variant_count?: number;
  }): string {
    return `## Ad Copy Brief

**Campaign:** ${input.campaign_name}
**Ad Group Theme:** ${input.ad_group_theme}
**Business:** ${input.business_description}
**Target Audience:** ${input.target_audience || 'General'}
**Target Persona:** ${input.persona || 'Not specified'}
**Landing Page:** ${input.landing_page_url || 'Not provided'}
**Keywords to incorporate:** ${input.keywords?.join(', ') || 'Use ad group theme'}

## Requirements
- Generate ${input.variant_count || 3} ad copy variants
- Each variant should have a different theme (benefit-focused, urgency, social-proof, etc.)
- Each variant needs 5-8 headlines (max 30 chars each) and 3-4 descriptions (max 90 chars each)
- CRITICAL: Double-check EVERY headline is ≤30 chars and EVERY description is ≤90 chars
- Include the main keyword in at least 2 headlines per variant

Return valid JSON with your variants and reasoning.`;
  }

  /**
   * Build tracking URLs with UTM + ICP parameters
   */
  private buildTrackingUrls(input: {
    campaign_name: string;
    landing_page_url?: string;
    persona?: string;
    url_template?: string;
  }): AdCopyVariants['tracking_urls'] {
    if (!input.landing_page_url) return [];

    const baseUrl = input.landing_page_url.split('?')[0]; // strip existing params
    const campaignSlug = input.campaign_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');

    const urls: AdCopyVariants['tracking_urls'] = [];

    // Standard UTM URL
    const utmParams = new URLSearchParams({
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: campaignSlug,
    });

    // Add ICP param if persona specified
    if (input.persona) {
      utmParams.set('icp', input.persona);
    }

    urls.push({
      base_url: baseUrl,
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: campaignSlug,
      icp_param: input.persona,
      full_url: `${baseUrl}?${utmParams.toString()}`,
    });

    // If user has a URL template, also generate from that
    if (input.url_template) {
      const templatedUrl = input.url_template
        .replace('{base_url}', baseUrl)
        .replace('{campaign_name}', campaignSlug)
        .replace('{persona}', input.persona || 'general');

      urls.push({
        base_url: baseUrl,
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: campaignSlug,
        icp_param: input.persona,
        full_url: templatedUrl,
      });
    }

    // Generate persona-specific URLs if no specific persona given
    if (!input.persona) {
      const commonPersonas = ['cio', 'cto', 'vp_engineering', 'director_it'];
      for (const persona of commonPersonas) {
        const personaParams = new URLSearchParams({
          utm_source: 'google',
          utm_medium: 'cpc',
          utm_campaign: campaignSlug,
          icp: persona,
        });
        urls.push({
          base_url: baseUrl,
          utm_source: 'google',
          utm_medium: 'cpc',
          utm_campaign: campaignSlug,
          icp_param: persona,
          full_url: `${baseUrl}?${personaParams.toString()}`,
        });
      }
    }

    return urls;
  }

  /**
   * Find relevant images from Unsplash
   */
  private async findRelevantImages(input: {
    ad_group_theme: string;
    business_description: string;
  }): Promise<NonNullable<AdCopyVariants['suggested_images']>> {
    try {
      // Build a focused search query from the theme
      const searchQuery = `${input.ad_group_theme} business professional`;
      const images = await searchImages(searchQuery, 5, 'landscape');

      return images.map((img: UnsplashImage) => ({
        unsplash_id: img.id,
        url: img.url,
        thumb_url: img.thumb_url,
        alt_text: img.alt_text,
        photographer: img.photographer,
        relevance_reasoning: `Matched for "${input.ad_group_theme}" — ${img.alt_text}`,
      }));
    } catch (error) {
      this.logger.warn('Unsplash image search failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * QA fix override — handle copy-specific errors
   */
  protected getFixSystemPrompt(): string {
    return `You are a Google Ads copywriter fixing quality errors. Common fixes:
- Headlines over 30 chars: Shorten while keeping the meaning. Use abbreviations, "&" instead of "and", remove filler words.
- Descriptions over 90 chars: Shorten while keeping the key message.
- Duplicate headlines/descriptions: Rewrite to be unique while maintaining the theme.
- Missing headlines/descriptions: Add more to meet minimums.
Fix ONLY the listed errors. Preserve everything else. Return valid JSON.`;
  }
}

// Singleton
export const copywriterAgent = new CopywriterAgent();
