import OpenAI from 'openai';
import { createLogger } from './utils/logger';

const logger = createLogger('LLMVisibility');

// ============================================================
// LLM Visibility Checker
// Asks GPT-4o-mini category questions and checks if the brand
// is mentioned in the response. Directional signal, not precise.
// ============================================================

export interface LlmVisibilityResult {
  keyword: string;
  question: string;
  mentioned: boolean;
  position: number | null;  // 1st, 2nd, 3rd in list (null if not mentioned)
  context: 'positive' | 'neutral' | 'negative' | null;
  competitors_mentioned: string[];
}

/**
 * Convert a keyword into a natural category question.
 * "dynamics 365 consulting" → "What are the best Dynamics 365 consulting firms?"
 * "databricks migration" → "Which companies offer the best Databricks migration services?"
 */
function keywordToQuestion(keyword: string): string {
  const kw = keyword.toLowerCase().trim();

  // Common patterns
  if (kw.includes('consulting') || kw.includes('consultant')) {
    return `What are the best ${keyword} firms?`;
  }
  if (kw.includes('implementation') || kw.includes('migration')) {
    return `Which companies offer the best ${keyword} services?`;
  }
  if (kw.includes('partner') || kw.includes('provider')) {
    return `Who are the top ${keyword}s?`;
  }
  if (kw.includes('platform') || kw.includes('tool') || kw.includes('software')) {
    return `What are the best ${keyword} options available?`;
  }
  if (kw.includes('services') || kw.includes('solutions')) {
    return `Which companies provide the best ${keyword}?`;
  }

  // Default
  return `What are the best companies or solutions for ${keyword}?`;
}

/**
 * Parse an LLM response to check if a brand is mentioned.
 * Returns position in list (1st, 2nd, etc.) and context.
 */
function parseBrandMention(
  response: string,
  brandName: string,
  domain: string,
): { mentioned: boolean; position: number | null; context: 'positive' | 'neutral' | 'negative' | null } {
  const text = response.toLowerCase();
  const brand = brandName.toLowerCase();
  const domainBase = domain.replace(/^www\./, '').split('.')[0].toLowerCase();

  // Check for brand name or domain mention
  const mentioned = text.includes(brand) || text.includes(domainBase);

  if (!mentioned) {
    return { mentioned: false, position: null, context: null };
  }

  // Try to determine position in a numbered or bulleted list
  let position: number | null = null;
  const lines = response.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    if (line.includes(brand) || line.includes(domainBase)) {
      // Check for numbered list pattern (1. , 2. , etc.)
      const numMatch = line.match(/^[\s]*(\d+)[.)]/);
      if (numMatch) {
        position = parseInt(numMatch[1]);
      } else {
        // Count how many list items came before this one
        let count = 0;
        for (let j = 0; j <= i; j++) {
          if (lines[j].match(/^[\s]*[\d\-\*\•]/)) count++;
        }
        if (count > 0) position = count;
      }
      break;
    }
  }

  // Simple context detection
  const mentionIndex = text.indexOf(brand) !== -1 ? text.indexOf(brand) : text.indexOf(domainBase);
  const surroundingText = text.slice(Math.max(0, mentionIndex - 100), mentionIndex + brandName.length + 100);

  let context: 'positive' | 'neutral' | 'negative' = 'neutral';
  const positiveWords = ['leading', 'top', 'best', 'excellent', 'recommended', 'trusted', 'expert', 'premier', 'renowned', 'well-known', 'reputable', 'strong'];
  const negativeWords = ['limited', 'lacks', 'weak', 'poor', 'issues', 'concerns', 'drawback', 'downside'];

  if (positiveWords.some((w) => surroundingText.includes(w))) {
    context = 'positive';
  } else if (negativeWords.some((w) => surroundingText.includes(w))) {
    context = 'negative';
  }

  return { mentioned, position, context };
}

/**
 * Extract competitor names mentioned in the LLM response.
 * Looks for company names in numbered lists and bold text.
 */
function extractCompetitorsMentioned(response: string, brandName: string): string[] {
  const competitors: string[] = [];
  const lines = response.split('\n');
  const brand = brandName.toLowerCase();

  for (const line of lines) {
    // Match patterns: "1. **CompanyName**" or "- CompanyName:" or "1. CompanyName -"
    const patterns = [
      /\*\*([^*]+)\*\*/g,           // **Bold text**
      /^\s*\d+[.)]\s+([A-Z][^\s:–-]+(?:\s+[A-Z][^\s:–-]+)*)/g,  // Numbered list items starting with capital
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const name = match[1].trim();
        if (
          name.length >= 2 &&
          name.length <= 50 &&
          !name.toLowerCase().includes(brand) &&
          !competitors.includes(name)
        ) {
          competitors.push(name);
        }
      }
    }
  }

  return competitors.slice(0, 10); // Cap at 10
}

/**
 * Check LLM visibility for a brand across multiple keywords.
 * Asks GPT-4o-mini category questions and parses for brand mentions.
 *
 * Cost: ~$0.01 per keyword (GPT-4o-mini pricing)
 */
export async function checkLlmVisibility(
  brandName: string,
  domain: string,
  keywords: string[],
): Promise<LlmVisibilityResult[]> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const capped = keywords.slice(0, 10);

  // Run all LLM checks in parallel for speed
  const promises = capped.map(async (keyword): Promise<LlmVisibilityResult> => {
    const question = keywordToQuestion(keyword);

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 500,
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant. Answer the question by listing specific companies, products, or solutions. Be specific with names. Do not make up companies.',
          },
          { role: 'user', content: question },
        ],
      });

      const text = response.choices[0]?.message?.content || '';
      const mention = parseBrandMention(text, brandName, domain);
      const competitors = extractCompetitorsMentioned(text, brandName);

      logger.info(`LLM check: "${keyword}" → ${mention.mentioned ? `Mentioned (#${mention.position})` : 'Not mentioned'}`, {
        competitors: competitors.length,
      });

      return {
        keyword, question,
        mentioned: mention.mentioned,
        position: mention.position,
        context: mention.context,
        competitors_mentioned: competitors,
      };
    } catch (error) {
      logger.error(`LLM check failed for "${keyword}"`, { error: (error as Error).message });
      return {
        keyword, question,
        mentioned: false, position: null, context: null,
        competitors_mentioned: [],
      };
    }
  });

  return Promise.all(promises);
}
