import type { Env } from "./index";

const REPO = "samanamp/nudge-backup";
const GH_API = "https://api.github.com";

function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function ghGet(pat: string, path: string) {
  const res = await fetch(`${GH_API}/repos/${REPO}/contents/${path}`, {
    headers: { Authorization: `Bearer ${pat}`, Accept: "application/vnd.github+json", "User-Agent": "nudge-backup" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`gh GET ${path} → ${res.status}`);
  return res.json<{ sha: string }>();
}

async function ghPut(pat: string, path: string, content: string, message: string) {
  const existing = await ghGet(pat, path);
  const body: Record<string, string> = { message, content: toBase64(content) };
  if (existing) body.sha = existing.sha;
  const res = await fetch(`${GH_API}/repos/${REPO}/contents/${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "nudge-backup",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`gh PUT ${path} → ${res.status}: ${err}`);
  }
}

function buildTasksMd(todos: Record<string, unknown>[], exportedAt: string): string {
  const open = todos.filter((t) => !t.completedAt && !t.deletedAt);
  const done = todos.filter((t) => t.completedAt && !t.deletedAt);
  const deleted = todos.filter((t) => t.deletedAt);

  const fmtDate = (ms: unknown) =>
    ms ? new Date(ms as number).toISOString().slice(0, 10) : "";

  const row = (t: Record<string, unknown>) => {
    const due = t.dueAt ? ` (due: ${fmtDate(t.dueAt)})` : "";
    return `- ${t.title}${due}  \`${t.id}\``;
  };

  const lines = [
    `# Nudge Backup`,
    ``,
    `Last updated: ${exportedAt}  |  ${todos.length} total, ${open.length} open`,
    ``,
  ];

  if (open.length) {
    lines.push(`## Open (${open.length})`, "");
    open.forEach((t) => lines.push(row(t)));
    lines.push("");
  }
  if (done.length) {
    lines.push(`## Completed (${done.length})`, "");
    done.forEach((t) => lines.push(`- [x] ${(t.title as string)}  \`${t.id}\``));
    lines.push("");
  }
  if (deleted.length) {
    lines.push(`## Deleted (${deleted.length})`, "");
    deleted.forEach((t) => lines.push(`- ~~${(t.title as string)}~~  \`${t.id}\``));
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Dump all D1 todos to nudge-backup on GitHub.
 * Called fire-and-forget after every successful push — never blocks the response.
 */
export async function backupToGitHub(env: Env): Promise<void> {
  if (!env.GITHUB_BACKUP_PAT) return;

  const rows = await env.DB.prepare(
    `SELECT t.data, u.email
     FROM todos t
     JOIN users u ON t.user_id = u.id`,
  ).all<{ data: string; email: string }>();

  const todos = (rows.results ?? []).map((r) => ({
    email: r.email,
    ...JSON.parse(r.data),
  }));

  const exportedAt = new Date().toISOString();
  const msg = `backup: ${todos.length} todos @ ${exportedAt}`;

  const todosJson = JSON.stringify(
    { schemaVersion: 1, exportedAt, count: todos.length, todos },
    null,
    2,
  );
  const metaJson = JSON.stringify(
    { schemaVersion: 1, exportedAt, count: todos.length },
    null,
    2,
  );
  const tasksMd = buildTasksMd(todos, exportedAt);

  // Sequential to avoid parallel SHA-fetch race.
  await ghPut(env.GITHUB_BACKUP_PAT, "data/todos.json", todosJson, msg);
  await ghPut(env.GITHUB_BACKUP_PAT, "data/meta.json", metaJson, msg);
  await ghPut(env.GITHUB_BACKUP_PAT, "TASKS.md", tasksMd, msg);

  console.log(`backup ok: ${todos.length} todos → ${REPO}`);
}
