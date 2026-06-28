/**
 * Keyword → emoji guesser. Each rule maps a pattern to an *ordered list* of
 * candidate emojis: the first is the default, the rest are distinct alternatives
 * used to avoid two habits ending up with the same icon (collision avoidance).
 *
 * Candidates within a rule (and across related rules like yoga/meditation) are
 * chosen to be visually distinct so each habit reads as its own thing.
 */
const RULES: [RegExp, string[]][] = [
  [/\byoga\b/i, ["🧘", "🤸", "🙆"]],
  [/medit|mindful/i, ["🪷", "🧠", "😌", "🕉️"]],
  [/breath|breathing/i, ["🌬️", "😮‍💨"]],
  [/violin/i, ["🎻"]],
  [/piano|keyboard/i, ["🎹"]],
  [/guitar/i, ["🎸"]],
  [/sing|vocal|choir/i, ["🎤"]],
  [/drum/i, ["🥁"]],
  [/music|instrument/i, ["🎵", "🎶"]],
  [/run|jog|sprint|marathon/i, ["🏃", "👟"]],
  [/walk|steps/i, ["🚶", "🥾"]],
  [/gym|workout|exercise|lift|weight|strength/i, ["🏋️", "💪"]],
  [/push.?up|pull.?up|sit.?up|\bcore\b|\babs\b/i, ["💪"]],
  [/stretch|mobility/i, ["🤸"]],
  [/bike|cycl|spin/i, ["🚴"]],
  [/swim/i, ["🏊"]],
  [/read|book/i, ["📚", "📖"]],
  [/write|journal|diary|blog/i, ["✍️", "📓", "🖊️"]],
  [/study|learn|class|course|homework|revise/i, ["📖", "🎓"]],
  [/language|spanish|french|german|duolingo|vocab/i, ["🗣️", "🌐"]],
  [/code|program|leetcode|\bdev\b/i, ["💻", "👨‍💻"]],
  [/draw|paint|sketch|\bart\b/i, ["🎨", "🖌️"]],
  [/photo/i, ["📷"]],
  [/water|hydrate|drink water/i, ["💧", "🚰"]],
  [/sleep|bed|rest/i, ["😴", "🛌", "🌙"]],
  [/wake|morning|early rise/i, ["🌅", "⏰"]],
  [/cook|meal prep|recipe/i, ["🍳", "🥘"]],
  [/eat|diet|nutrition|veg|fruit|healthy/i, ["🥗", "🍎"]],
  [/clean|tidy|chore|laundry|dishes/i, ["🧹", "🧼"]],
  [/pray|church|bible|worship|faith/i, ["🙏", "⛪"]],
  [/vitamin|pill|\bmed\b|supplement/i, ["💊"]],
  [/teeth|floss|brush|dental/i, ["🦷", "🪥"]],
  [/skin|skincare|moistur/i, ["🧴"]],
  [/garden|plant/i, ["🌱", "🪴"]],
  [/\bdog\b/i, ["🐕"]],
  [/\bcat\b/i, ["🐈"]],
  [/money|budget|save|saving|finance|invest|expense/i, ["💰", "🪙"]],
  [/call|phone|family|friend|connect/i, ["📞", "☎️"]],
  [/grateful|gratitude|thanks/i, ["🙏", "🌻"]],
  [/smoke|quit|nicotine/i, ["🚭"]],
  [/focus|deep work|productiv/i, ["🎯", "⏱️"]],
];

/** Generic, distinct fallbacks for titles no rule matches. */
const GENERIC = ["✨", "⭐", "🔥", "🌟", "🎯", "🟣", "🔵", "🟢", "🟡", "🟠"];

function candidates(title: string): string[] {
  const rule = RULES.find(([re]) => re.test(title));
  return rule ? rule[1] : [];
}

/** Curated emoji for a habit title, or "" if nothing matches. */
export function matchEmoji(title: string): string {
  return candidates(title)[0] ?? "";
}

/** Curated emoji, falling back to a generic sparkle for unknown titles. */
export function guessEmoji(title: string): string {
  return matchEmoji(title) || GENERIC[0];
}

/**
 * Pick an emoji for a habit that is distinct from those already in use. Tries
 * the title's candidates in order, then generic fallbacks, so no two habits
 * collide. Returns "" only if there's no match and all generics are taken.
 */
export function assignEmoji(title: string, taken: Iterable<string> = []): string {
  const used = new Set(taken);
  const pool = candidates(title);
  const free = pool.find((e) => !used.has(e));
  if (free) return free;
  if (pool.length > 0) {
    // Known habit but all its candidates are taken — fall back to a free generic.
    const g = GENERIC.find((e) => !used.has(e));
    return g ?? pool[0];
  }
  // Unknown habit — pick a free generic so it's still distinct.
  return GENERIC.find((e) => !used.has(e)) ?? "";
}
