import type { ReactNode } from "react";

/**
 * A small Markdown renderer for `markdown` fields.
 *
 * It builds React elements, not an HTML string. That is the whole reason it exists rather
 * than a dependency: there is no `dangerouslySetInnerHTML` anywhere in it, so there is no
 * sanitiser to get right and no way for stored text to become markup. Link hrefs are the
 * one place a value reaches an attribute, and those are checked against a protocol list.
 *
 * What it supports, and nothing else: headings, paragraphs, bulleted and numbered lists,
 * blockquotes, fenced and inline code, bold, italic, links, and `---`. Tables, footnotes,
 * images and raw HTML are not rendered — they appear as the text you typed. If you need
 * more than this, this file is yours: replace it with a parser you like.
 */

/** `javascript:` in a link is the one way text here could become an action. */
const SAFE_PROTOCOL = /^(https?:|mailto:|tel:|\/|#)/i;

/** Inline: **bold**, *italic*, `code`, [text](href). Leftmost match wins, then recurse. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let index = 0;

  while (rest.length > 0) {
    const match = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`([^`]+?)`)|(\[([^\]]*)\]\(([^)\s]+)\))/.exec(rest);
    if (!match) {
      out.push(rest);
      break;
    }
    if (match.index > 0) out.push(rest.slice(0, match.index));
    const key = `${keyPrefix}-${index++}`;

    if (match[2] !== undefined) out.push(<strong key={key}>{inline(match[2], key)}</strong>);
    else if (match[4] !== undefined) out.push(<em key={key}>{inline(match[4], key)}</em>);
    else if (match[6] !== undefined)
      out.push(
        <code key={key} className="bg-muted rounded px-1 py-0.5 font-mono text-[0.9em]">
          {match[6]}
        </code>,
      );
    else if (match[9] !== undefined) {
      const href = match[9];
      const label = match[8] || href;
      out.push(
        SAFE_PROTOCOL.test(href) ? (
          <a key={key} href={href} className="underline underline-offset-2" rel="noreferrer noopener" target="_blank">
            {label}
          </a>
        ) : (
          // Not a link: shown as the text it is, so nothing is silently dropped either.
          <span key={key}>{match[7]}</span>
        ),
      );
    }
    rest = rest.slice(match.index + match[0]!.length);
  }
  return out;
}

const HEADINGS = { 1: "text-xl font-semibold", 2: "text-lg font-semibold", 3: "text-base font-semibold" } as const;

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let at = 0;

  const flush = () => {
    if (paragraph.length === 0) return;
    blocks.push(<p key={`p-${blocks.length}`}>{inline(paragraph.join(" "), `p-${blocks.length}`)}</p>);
    paragraph = [];
  };

  while (at < lines.length) {
    const line = lines[at]!;

    if (line.trim() === "") {
      flush();
      at += 1;
      continue;
    }

    // ``` fenced code: taken literally to the closing fence, or to the end.
    if (/^\s*```/.test(line)) {
      flush();
      const body: string[] = [];
      at += 1;
      while (at < lines.length && !/^\s*```/.test(lines[at]!)) body.push(lines[at++]!);
      at += 1;
      blocks.push(
        <pre key={`pre-${blocks.length}`} className="bg-muted overflow-x-auto rounded-md p-3 font-mono text-sm">
          <code>{body.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const level = heading[1]!.length as 1 | 2 | 3;
      const Tag = (["h1", "h2", "h3"] as const)[level - 1]!;
      blocks.push(
        <Tag key={`h-${blocks.length}`} className={HEADINGS[level]}>
          {inline(heading[2]!, `h-${blocks.length}`)}
        </Tag>,
      );
      at += 1;
      continue;
    }

    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flush();
      blocks.push(<hr key={`hr-${blocks.length}`} className="border-border" />);
      at += 1;
      continue;
    }

    const bullet = /^\s*[-*+]\s+/;
    const numbered = /^\s*\d+[.)]\s+/;
    if (bullet.test(line) || numbered.test(line)) {
      flush();
      const ordered = numbered.test(line);
      const pattern = ordered ? numbered : bullet;
      const items: string[] = [];
      while (at < lines.length && pattern.test(lines[at]!)) items.push(lines[at++]!.replace(pattern, ""));
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={`l-${blocks.length}`} className={ordered ? "list-decimal pl-5" : "list-disc pl-5"}>
          {items.map((item, index) => (
            <li key={index}>{inline(item, `l-${blocks.length}-${index}`)}</li>
          ))}
        </List>,
      );
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      flush();
      const quoted: string[] = [];
      while (at < lines.length && /^\s*>\s?/.test(lines[at]!)) quoted.push(lines[at++]!.replace(/^\s*>\s?/, ""));
      blocks.push(
        <blockquote key={`q-${blocks.length}`} className="text-muted-foreground border-l-2 pl-3 italic">
          {inline(quoted.join(" "), `q-${blocks.length}`)}
        </blockquote>,
      );
      continue;
    }

    paragraph.push(line.trim());
    at += 1;
  }
  flush();

  if (blocks.length === 0) return <p className="text-muted-foreground text-sm">Nothing to preview.</p>;
  return <div className="flex flex-col gap-3 text-sm leading-relaxed [&_a]:text-primary">{blocks}</div>;
}
