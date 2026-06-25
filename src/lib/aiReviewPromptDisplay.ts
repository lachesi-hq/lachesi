const PROMPT_DISPLAY_MARKER = "[[lachesi:ai-review-prompt]]";

export interface ParsedReviewPromptDisplay {
  intro: string;
  prompt: string;
}

export function buildReviewPromptDisplayMessage(payload: string): string {
  return [
    "Run the standard AI review for this pull request.",
    "",
    PROMPT_DISPLAY_MARKER,
    payload.trim(),
  ].join("\n");
}

export function parseReviewPromptDisplayMessage(content: string): ParsedReviewPromptDisplay | null {
  const markerIndex = content.indexOf(PROMPT_DISPLAY_MARKER);
  if (markerIndex < 0) return null;

  const intro = content.slice(0, markerIndex).trim();
  const prompt = content.slice(markerIndex + PROMPT_DISPLAY_MARKER.length).trim();
  if (!prompt) return null;

  return {
    intro: intro || "Run the standard AI review for this pull request.",
    prompt,
  };
}
