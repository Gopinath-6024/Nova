import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  inverted?: boolean;
}

const CODE_KEYWORDS = new Set([
  'import',
  'export',
  'from',
  'default',
  'const',
  'let',
  'var',
  'function',
  'return',
  'if',
  'else',
  'for',
  'while',
  'switch',
  'case',
  'break',
  'continue',
  'try',
  'catch',
  'finally',
  'throw',
  'async',
  'await',
  'class',
  'interface',
  'type',
  'extends',
  'implements',
  'new',
  'true',
  'false',
  'null',
  'undefined',
  'def',
  'None',
  'True',
  'False',
  'self',
  'elif',
  'pass',
  'with',
  'as',
  'in',
  'not',
  'and',
  'or',
  'public',
  'private',
  'protected',
  'static',
  'void',
  'fn',
  'mut',
  'pub',
  'struct',
  'enum',
  'SELECT',
  'FROM',
  'WHERE',
  'INSERT',
  'UPDATE',
  'DELETE',
  'JOIN',
  'CREATE',
  'TABLE',
]);

function highlightCodeLine(line: string, lineIndex: number): React.ReactNode {
  const tokenRegex =
    /(\/\/.*$|#.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b)/g;

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let partIdx = 0;

  while ((match = tokenRegex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(line.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${lineIndex}-${partIdx++}`;

    if (token.startsWith('//') || token.startsWith('#')) {
      nodes.push(
        <span key={key} className="text-slate-400 italic">
          {token}
        </span>
      );
    } else if (
      token.startsWith('"') ||
      token.startsWith("'") ||
      token.startsWith('`')
    ) {
      nodes.push(
        <span key={key} className="text-emerald-300">
          {token}
        </span>
      );
    } else if (/^\d/.test(token)) {
      nodes.push(
        <span key={key} className="text-amber-300">
          {token}
        </span>
      );
    } else if (CODE_KEYWORDS.has(token)) {
      nodes.push(
        <span key={key} className="text-violet-300 font-semibold">
          {token}
        </span>
      );
    } else {
      nodes.push(token);
    }
    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < line.length) {
    nodes.push(line.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : ' ';
}

const CodeBlock: React.FC<{ code: string; language: string }> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const lines = code.replace(/\n$/, '').split('\n');

  return (
    <div className="my-2.5 overflow-hidden rounded-xl border border-violet-400/20 bg-[#0B0815] text-slate-100">
      <div className="flex items-center justify-between border-b border-white/10 bg-[#130D24] px-3 py-1.5 text-[11px]">
        <span className="font-mono uppercase tracking-wider text-violet-300">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-300" />
              <span className="text-emerald-300">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed font-mono">
        <code>
          {lines.map((ln, idx) => (
            <div key={idx} className="min-h-[1.25em]">
              {highlightCodeLine(ln, idx)}
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
};

function renderInlineMarkdown(text: string, inverted?: boolean): React.ReactNode[] {
  const pattern =
    /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*\n]+\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;

  const result: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `inl-${idx++}`;

    if (token.startsWith('`') && token.endsWith('`')) {
      result.push(
        <code
          key={key}
          className={`rounded px-1.5 py-0.5 font-mono text-[0.86em] ${
            inverted
              ? 'bg-white/20 text-white'
              : 'bg-violet-500/15 text-violet-800 dark:text-violet-200'
          }`}
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (
      (token.startsWith('**') && token.endsWith('**')) ||
      (token.startsWith('__') && token.endsWith('__'))
    ) {
      result.push(
        <strong key={key} className="font-semibold">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('~~') && token.endsWith('~~')) {
      result.push(
        <del key={key} className="opacity-75">
          {token.slice(2, -2)}
        </del>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      result.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith('[')) {
      const label = match[2];
      const href = match[3];
      result.push(
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={`underline ${
            inverted
              ? 'text-white decoration-white/60'
              : 'text-violet-700 dark:text-violet-300 decoration-violet-400/50'
          }`}
        >
          {label}
        </a>
      );
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex));
  }

  return result;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, inverted }) => {
  // Split out fenced code blocks first cleanly
  const segments: Array<{ kind: 'text' | 'code'; content: string; lang?: string }> = [];
  const fenceRegex = /```([A-Za-z0-9_+-]*)\n([\s\S]*?)```/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(content)) !== null) {
    if (match.index > lastIdx) {
      segments.push({ kind: 'text', content: content.slice(lastIdx, match.index) });
    }
    segments.push({
      kind: 'code',
      lang: match[1] || 'code',
      content: match[2],
    });
    lastIdx = fenceRegex.lastIndex;
  }
  if (lastIdx < content.length) {
    segments.push({ kind: 'text', content: content.slice(lastIdx) });
  }

  const renderTextBlock = (blockText: string, segIdx: number) => {
    const lines = blockText.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
      const raw = lines[i];
      const line = raw.trimEnd();

      if (!line.trim()) {
        i++;
        continue;
      }

      // Headings
      const headingMatch = /^(#{1,3})\s+(.+)$/.exec(line);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = headingMatch[2];
        const cls =
          level === 1
            ? 'text-base font-bold mt-3 mb-1.5'
            : level === 2
            ? 'text-sm font-bold mt-2.5 mb-1'
            : 'text-xs font-bold uppercase tracking-wide mt-2 mb-1 opacity-90';
        elements.push(
          <div key={`h-${segIdx}-${i}`} className={cls}>
            {renderInlineMarkdown(text, inverted)}
          </div>
        );
        i++;
        continue;
      }

      // Horizontal Rule
      if (/^[-*_]{3,}$/.test(line.trim())) {
        elements.push(
          <hr
            key={`hr-${segIdx}-${i}`}
            className="my-2.5 border-slate-300/60 dark:border-white/10"
          />
        );
        i++;
        continue;
      }

      // Blockquote
      if (line.trimStart().startsWith('> ')) {
        const quoteLines: string[] = [];
        while (i < lines.length && lines[i].trimStart().startsWith('> ')) {
          quoteLines.push(lines[i].trimStart().slice(2));
          i++;
        }
        elements.push(
          <blockquote
            key={`bq-${segIdx}-${i}`}
            className="my-2 border-l-2 border-violet-400 pl-3 text-xs opacity-90 italic space-y-1"
          >
            {quoteLines.map((ql, qi) => (
              <div key={qi}>{renderInlineMarkdown(ql, inverted)}</div>
            ))}
          </blockquote>
        );
        continue;
      }

      // Table (simple GFM pipe table)
      if (
        line.includes('|') &&
        i + 1 < lines.length &&
        /^\s*\|?[\s:-]+\|/.test(lines[i + 1])
      ) {
        const parseRow = (rowLine: string) =>
          rowLine
            .trim()
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map((cell) => cell.trim());

        const headers = parseRow(line);
        i += 2; // skip header & separator
        const rows: string[][] = [];
        while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
          rows.push(parseRow(lines[i]));
          i++;
        }

        elements.push(
          <div key={`tbl-${segIdx}-${i}`} className="my-2.5 overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 dark:bg-white/5">
                <tr>
                  {headers.map((h, hi) => (
                    <th key={hi} className="px-3 py-2 font-semibold border-b border-slate-200 dark:border-white/10">
                      {renderInlineMarkdown(h, inverted)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri} className="border-b border-slate-100 dark:border-white/5 last:border-0">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-1.5">
                        {renderInlineMarkdown(cell, inverted)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }

      // Unordered list
      if (/^\s*[-*•]\s+/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*[-*•]\s+/, ''));
          i++;
        }
        elements.push(
          <ul key={`ul-${segIdx}-${i}`} className="my-1.5 list-disc pl-5 space-y-1">
            {items.map((it, li) => (
              <li key={li}>{renderInlineMarkdown(it, inverted)}</li>
            ))}
          </ul>
        );
        continue;
      }

      // Ordered list
      if (/^\s*\d+[.)]\s+/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
          i++;
        }
        elements.push(
          <ol key={`ol-${segIdx}-${i}`} className="my-1.5 list-decimal pl-5 space-y-1">
            {items.map((it, li) => (
              <li key={li}>{renderInlineMarkdown(it, inverted)}</li>
            ))}
          </ol>
        );
        continue;
      }

      // Standard paragraph
      const paraLines: string[] = [line];
      i++;
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !/^(#{1,3}\s|[-*_]{3,}$|> |\s*[-*•]\s+|\s*\d+[.)]\s+)/.test(lines[i])
      ) {
        paraLines.push(lines[i]);
        i++;
      }

      elements.push(
        <p key={`p-${segIdx}-${i}`} className="my-1.5 first:mt-0 last:mb-0 leading-relaxed whitespace-pre-wrap">
          {renderInlineMarkdown(paraLines.join('\n'), inverted)}
        </p>
      );
    }

    return elements;
  };

  return (
    <div className="space-y-1 break-words">
      {segments.map((seg, idx) =>
        seg.kind === 'code' ? (
          <CodeBlock key={idx} code={seg.content} language={seg.lang ?? 'code'} />
        ) : (
          <React.Fragment key={idx}>{renderTextBlock(seg.content, idx)}</React.Fragment>
        )
      )}
    </div>
  );
};
