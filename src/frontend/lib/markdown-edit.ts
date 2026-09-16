export const markdownTools = [
  ["bold", "Bold"], ["italic", "Italic"], ["strike", "Strikethrough"],
  ["link", "Link"], ["heading", "Heading"], ["bullet", "Bullet list"],
  ["number", "Numbered list"], ["task", "Task list"], ["quote", "Quote"],
  ["code", "Inline code"], ["fence", "Code block"], ["rule", "Horizontal rule"],
] as const;

export type MarkdownTool = typeof markdownTools[number][0];

export type FileCompletion = { start: number; end: number; query: string; label?: string };

export function fileCompletion(text: string, start: number, end = start): FileCompletion | null {
  if (start !== end) return null;
  const before = text.slice(0, start);
  const match = /(?<!!)(\[(?:\\.|[^\[\]\\\n])*\])\(([^\n()]*)$/.exec(before);
  const wiki = /\[\[([^\[\]\n]*)$/.exec(before);
  const found = match ?? wiki;
  if (!found) return null;
  const query = match ? match[2] : found[1];
  if (/[:/\\#?=]|www\./i.test(query)) return null;
  const suffix = text.slice(start).split("\n")[0];
  if (suffix.includes(match ? ")" : "]]")) return null;
  const prefix = before.slice(0, found.index);
  if (/(?:^|[^\\])(?:\\\\)*\\$/.test(prefix) || /`/.test(prefix.slice(prefix.lastIndexOf("\n") + 1))) return null;
  return { start: found.index, end: start, query, ...(match ? { label: match[1].slice(1, -1) } : {}) };
}

export function escapeMarkdownLabel(label: string) {
  return label.replace(/[\r\n]+/g, " ").replace(/[\\`*_{}\[\]()<>!~|&]/g, "\\$&");
}

export function insertFileLink(text: string, start: number, end: number, workspaceId: string, resource: { id: string; name: string }, completion?: FileCompletion | null) {
  const segment = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  const label = completion?.label ?? escapeMarkdownLabel(text.slice(start, end) || resource.name);
  const link = `[${label}](/api/workspaces/${segment(workspaceId)}/files/${segment(resource.id)})`;
  const from = completion?.start ?? start;
  const to = completion?.end ?? end;
  return { text: text.slice(0, from) + link + text.slice(to), start: from + link.length, end: from + link.length };
}

export function filterFiles<T extends { workspace_id: string; project_id: string | null; type: string; name: string }>(resources: T[], workspaceId: string, projectId: string, query: string) {
  const needle = query.trim().normalize("NFKC").toLocaleLowerCase();
  return resources.filter(resource => resource.workspace_id === workspaceId && resource.type === "file" && (!projectId || resource.project_id === projectId) && resource.name.normalize("NFKC").toLocaleLowerCase().includes(needle));
}

export function editMarkdown(text: string, start: number, end: number, tool: MarkdownTool) {
  const selected = text.slice(start, end);
  let insert: string;
  let from = start;
  let to = end;
  let selectionStart: number;
  let selectionEnd: number;
  const markers = { bold: "**", italic: "*", strike: "~~", code: "`" };
  if (tool in markers) {
    const marker = markers[tool as keyof typeof markers];
    const value = selected || "text";
    const runs = value.match(/`+/g) ?? [];
    const codeMarker = "`".repeat(runs.reduce((length, run) => Math.max(length, run.length + 1), 1));
    const padded = value.includes("`") || (value.startsWith(" ") && value.endsWith(" ") && value.trim() !== "");
    const delimiter = tool === "code" ? codeMarker + (padded ? " " : "") : marker;
    const closing = tool === "code" ? (padded ? " " : "") + codeMarker : marker;
    insert = delimiter + value + closing;
    selectionStart = from + delimiter.length;
    selectionEnd = selectionStart + value.length;
  } else if (tool === "link") {
    insert = `[${selected || "link text"}](https://)`;
    selectionStart = from + insert.lastIndexOf("](https://)") + 2;
    selectionEnd = selectionStart + 8;
  } else {
    from = start === 0 ? 0 : text.lastIndexOf("\n", start - 1) + 1;
    const last = end > start && text[end - 1] === "\n" ? end - 1 : end;
    const next = text.indexOf("\n", last);
    to = next === -1 ? text.length : next;
    const value = text.slice(from, to);
    if (tool === "fence") {
      const runs = value.match(/`+/g) ?? [];
      const fence = "`".repeat(Math.max(3, ...runs.map(run => run.length + 1)));
      insert = `${fence}\n${value || "code"}\n${fence}`;
      selectionStart = from + fence.length + 1;
      selectionEnd = selectionStart + (value || "code").length;
    } else if (tool === "rule") {
      from = start;
      to = end;
      insert = `${from ? "\n\n" : ""}---\n\n`;
      selectionStart = selectionEnd = from + insert.length;
    } else {
      const prefix = (i: number) => tool === "heading" ? "## " : tool === "bullet" ? "- " : tool === "number" ? `${i + 1}. ` : tool === "task" ? "- [ ] " : "> ";
      insert = value.split("\n").map((line, i) => prefix(i) + line).join("\n");
      selectionStart = from + prefix(0).length;
      selectionEnd = from + insert.length;
    }
  }
  return { text: text.slice(0, from) + insert + text.slice(to), start: selectionStart, end: selectionEnd };
}
