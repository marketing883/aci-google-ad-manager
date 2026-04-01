// ============================================================
// Safe JSON parser for LLM responses
// ============================================================

/**
 * Extracts JSON from an LLM response that might contain markdown code fences
 * or other surrounding text.
 */
export function extractJSON<T = unknown>(text: string): T | null {
  // Try direct parse first
  try {
    return JSON.parse(text) as T;
  } catch {
    // Continue to extraction attempts
  }

  // Try extracting from markdown code fence
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]) as T;
    } catch {
      // Continue
    }
  }

  // Try finding JSON object or array in the text
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]) as T;
    } catch {
      // Continue
    }
  }

  return null;
}

/**
 * Safe parse with Zod schema validation
 */
export function safeParseJSON<T>(
  text: string,
  schema: { parse: (data: unknown) => T },
): { success: true; data: T } | { success: false; error: string } {
  const parsed = extractJSON(text);
  if (parsed === null) {
    return { success: false, error: 'Failed to extract JSON from response' };
  }

  try {
    const validated = schema.parse(parsed);
    return { success: true, data: validated };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Schema validation failed',
    };
  }
}
