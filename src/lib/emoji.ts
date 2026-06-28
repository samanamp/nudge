/**
 * Keyword → emoji guesser. Used as an instant display fallback so a habit looks
 * good immediately, even before the AI-suggested icon (stored on the habit)
 * comes back from the server.
 */
const MAP: [RegExp, string][] = [
  [/\byoga\b/i, "🧘‍♀️"],
  [/medit|mindful|breath/i, "🧘"],
  [/violin/i, "🎻"],
  [/piano|keyboard/i, "🎹"],
  [/guitar/i, "🎸"],
  [/sing|vocal|choir/i, "🎤"],
  [/drum/i, "🥁"],
  [/music|instrument/i, "🎵"],
  [/run|jog|sprint|marathon/i, "🏃"],
  [/walk|steps/i, "🚶"],
  [/gym|workout|exercise|lift|weight|strength/i, "🏋️"],
  [/push.?up|pull.?up|sit.?up|\bcore\b|\babs\b/i, "💪"],
  [/stretch|mobility/i, "🤸"],
  [/bike|cycl|spin/i, "🚴"],
  [/swim/i, "🏊"],
  [/read|book/i, "📚"],
  [/write|journal|diary|blog/i, "✍️"],
  [/study|learn|class|course|homework|revise/i, "📖"],
  [/language|spanish|french|german|duolingo|vocab/i, "🗣️"],
  [/code|program|leetcode|\bdev\b/i, "💻"],
  [/draw|paint|sketch|\bart\b/i, "🎨"],
  [/photo/i, "📷"],
  [/water|hydrate|drink water/i, "💧"],
  [/sleep|bed|rest/i, "😴"],
  [/wake|morning|early rise/i, "🌅"],
  [/cook|meal prep|recipe/i, "🍳"],
  [/eat|diet|nutrition|veg|fruit|healthy/i, "🥗"],
  [/clean|tidy|chore|laundry|dishes/i, "🧹"],
  [/pray|church|bible|worship|faith/i, "🙏"],
  [/vitamin|pill|\bmed\b|supplement/i, "💊"],
  [/teeth|floss|brush|dental/i, "🦷"],
  [/skin|skincare|moistur/i, "🧴"],
  [/garden|plant/i, "🌱"],
  [/\bdog\b/i, "🐕"],
  [/\bcat\b/i, "🐈"],
  [/money|budget|save|saving|finance|invest|expense/i, "💰"],
  [/call|phone|family|friend|connect/i, "📞"],
  [/grateful|gratitude|thanks/i, "🙏"],
  [/smoke|quit|nicotine/i, "🚭"],
  [/focus|deep work|productiv/i, "🎯"],
];

/** Curated emoji for a habit title, or "" if nothing matches. */
export function matchEmoji(title: string): string {
  for (const [re, e] of MAP) if (re.test(title)) return e;
  return "";
}

/** Curated emoji, falling back to a generic sparkle for unknown titles. */
export function guessEmoji(title: string): string {
  return matchEmoji(title) || "✨";
}
