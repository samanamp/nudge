/**
 * Workers AI auto-tagging. Suggests 1-3 concise tags for a todo.
 * Degrades silently — the app works fine if AI is unavailable or quota is hit.
 */

interface AiTextResult {
  response?: string;
}

export async function suggestTags(
  ai: Ai,
  title: string,
  notes?: string,
): Promise<string[]> {
  try {
    const result = (await ai.run("@cf/meta/llama-3.2-1b-instruct", {
      messages: [
        {
          role: "system",
          content:
            "You are a task tagger. Reply with ONLY 1-3 comma-separated tags from this list — nothing else: errand, health, finance, work, home, shopping, personal, travel, family, fitness.",
        },
        {
          role: "user",
          content: `Tag this task: "${title}"${notes ? ` (${notes})` : ""}`,
        },
      ],
      max_tokens: 20,
    })) as AiTextResult;

    const VALID = new Set(["errand", "health", "finance", "work", "home", "shopping", "personal", "travel", "family", "fitness"]);
    const text = result.response ?? "";
    return text
      .split(",")
      .map((t) => t.trim().toLowerCase().replace(/[^a-z]/g, ""))
      .filter((t) => VALID.has(t))
      .slice(0, 3);
  } catch (e) {
    console.warn("AI tag suggestion failed:", e);
    return [];
  }
}

/**
 * Suggest a single emoji that represents a habit (e.g. "Meditation" → 🧘).
 * Returns "" if AI is unavailable or no emoji could be extracted.
 */
export async function suggestEmoji(ai: Ai, title: string, notes?: string): Promise<string> {
  try {
    const result = (await ai.run("@cf/meta/llama-3.2-1b-instruct", {
      messages: [
        {
          role: "system",
          content:
            "You pick the single best emoji to represent a habit. Reply with ONLY one emoji character and nothing else.",
        },
        { role: "user", content: `Habit: "${title}"${notes ? ` (${notes})` : ""}` },
      ],
      max_tokens: 8,
    })) as AiTextResult;
    const match = (result.response ?? "").match(/\p{Extended_Pictographic}/u);
    return match ? match[0] : "";
  } catch (e) {
    console.warn("AI emoji suggestion failed:", e);
    return "";
  }
}
