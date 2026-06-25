/**
 * Workers AI auto-tagging. Suggests 1-3 concise tags for a todo.
 * Degrades silently — the app works fine if AI is unavailable or quota is hit.
 */

interface AiTextResult {
  response?: string;
}

const PROMPT = (title: string, notes?: string) =>
  `You are a concise task categorizer. Return 1-3 short, lowercase tags for this task.
Task: "${title}"${notes ? `\nNotes: "${notes}"` : ""}
Rules: only common categories like work, finance, health, errand, home, shopping, personal, travel, learning, family, fitness. No explanation, no punctuation — just comma-separated tags.`;

export async function suggestTags(
  ai: Ai,
  title: string,
  notes?: string,
): Promise<string[]> {
  try {
    const result = (await ai.run("@cf/zai-org/glm-4.7-flash", {
      messages: [{ role: "user", content: PROMPT(title, notes) }],
      max_tokens: 24,
    })) as AiTextResult;

    const text = result.response ?? "";
    return text
      .split(",")
      .map((t) => t.trim().toLowerCase().replace(/[^a-z]/g, ""))
      .filter((t) => t.length > 1 && t.length < 20)
      .slice(0, 3);
  } catch (e) {
    console.warn("AI tag suggestion failed:", e);
    return [];
  }
}
