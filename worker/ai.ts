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
 * Tries Workers AI (few-shot for the small model), then falls back to a keyword
 * map so a habit always gets a sensible emoji.
 */
export async function suggestEmoji(ai: Ai, title: string, notes?: string): Promise<string> {
  // Curated map first — distinct + reliable for common habits. The small model
  // tends to return the same generic emoji (e.g. 🧘 for both yoga & meditation).
  const curated = fallbackEmoji(title);
  if (curated) return curated;
  try {
    const result = (await ai.run("@cf/meta/llama-3.2-1b-instruct", {
      messages: [
        {
          role: "system",
          content:
            "You assign ONE emoji that best represents a habit. Reply with only the single emoji, nothing else. " +
            "Examples: Meditation→🧘, Running→🏃, Read a book→📚, Drink water→💧, Violin practice→🎻, " +
            "Workout→🏋️, Journal→✍️, Sleep early→😴, Stretch→🤸, Learn Spanish→🗣️.",
        },
        { role: "user", content: `${title}${notes ? ` (${notes})` : ""}→` },
      ],
      max_tokens: 8,
    })) as AiTextResult;
    const match = (result.response ?? "").match(/\p{Extended_Pictographic}/u);
    if (match) return match[0];
  } catch (e) {
    console.warn("AI emoji suggestion failed:", e);
  }
  return "✨";
}

/** Keyword → emoji match (kept in sync with src/lib/emoji.ts). "" if no match. */
function fallbackEmoji(title: string): string {
  const M: [RegExp, string][] = [
    [/\byoga\b/i, "🧘"], [/medit|mindful/i, "🪷"], [/breath/i, "🌬️"], [/violin/i, "🎻"],
    [/piano|keyboard/i, "🎹"], [/guitar/i, "🎸"], [/sing|vocal/i, "🎤"], [/music|instrument/i, "🎵"],
    [/run|jog|sprint/i, "🏃"], [/walk|steps/i, "🚶"], [/gym|workout|exercise|lift|weight|strength/i, "🏋️"],
    [/push.?up|pull.?up|\bcore\b|\babs\b/i, "💪"], [/stretch|mobility/i, "🤸"], [/bike|cycl/i, "🚴"],
    [/swim/i, "🏊"], [/read|book/i, "📚"], [/write|journal|diary/i, "✍️"], [/study|learn|class|course/i, "📖"],
    [/language|spanish|french|german|vocab/i, "🗣️"], [/code|program|\bdev\b/i, "💻"], [/draw|paint|sketch|art/i, "🎨"],
    [/water|hydrate/i, "💧"], [/sleep|bed|rest/i, "😴"], [/wake|morning/i, "🌅"], [/cook|meal|recipe/i, "🍳"],
    [/eat|diet|nutrition|veg|fruit|healthy/i, "🥗"], [/clean|tidy|chore|laundry/i, "🧹"], [/pray|church|bible|faith/i, "🙏"],
    [/vitamin|pill|\bmed\b|supplement/i, "💊"], [/teeth|floss|brush|dental/i, "🦷"], [/skin|skincare/i, "🧴"],
    [/garden|plant/i, "🌱"], [/\bdog\b/i, "🐕"], [/money|budget|save|finance|invest/i, "💰"],
    [/grateful|gratitude/i, "🙏"], [/smoke|quit|nicotine/i, "🚭"], [/focus|deep work|productiv/i, "🎯"],
  ];
  for (const [re, e] of M) if (re.test(title)) return e;
  return "";
}
