import { memo, useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock";
import { cn } from "./cn";
import { Mermaid } from "./Mermaid";

/** Resolves a relative link or image against the folder of the Markdown file (a `jig-file:` URL). */
function resolveRelative(href: string | undefined, baseUrl: string | undefined): string | undefined {
  if (!href || !baseUrl || /^([a-z][\w+.-]*:|#|\/\/)/i.test(href)) return href;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

function makeComponents(options: { baseUrl?: string; onLocalLink?: (url: string) => void }): Components {
  return {
    code({ className, children, ...rest }) {
      const lang = /language-([\w+#-]+)/.exec(className ?? "")?.[1];
      const text = String(children ?? "");
      if (!lang && !text.includes("\n"))
        return (
          <code className="rounded-sm bg-code px-1 py-px font-mono text-xs" {...rest}>
            {children}
          </code>
        );
      if (lang === "mermaid") return <Mermaid code={text.replace(/\n$/, "")} />;
      return <CodeBlock code={text.replace(/\n$/, "")} lang={lang} />;
    },
    pre: ({ children }) => <>{children}</>,
    a: ({ href, children }) => {
      const target = resolveRelative(href, options.baseUrl);
      const local = target?.startsWith("jig-file:") && options.onLocalLink;
      return (
        <a
          href={target}
          target="_blank"
          rel="noreferrer"
          className="text-accent hover:underline"
          onClick={
            local
              ? (e) => {
                  e.preventDefault();
                  if (target) options.onLocalLink?.(target);
                }
              : undefined
          }
        >
          {children}
        </a>
      );
    },
    img: ({ src, alt }) => (
      <img
        src={resolveRelative(typeof src === "string" ? src : undefined, options.baseUrl)}
        alt={alt ?? ""}
        className="max-w-full"
      />
    ),
    table: ({ children }) => (
      <div className="my-2 overflow-x-auto">
        <table className="border-collapse text-sm">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border border-line bg-surface px-2 py-1 text-left font-medium">{children}</th>
    ),
    td: ({ children }) => <td className="border border-line px-2 py-1">{children}</td>,
  };
}

const chatComponents = makeComponents({});

/**
 * Markdown as Claude writes it (GitHub-flavoured), with themed code blocks and Mermaid diagrams. For a
 * Markdown file, `baseUrl` (its folder) resolves relative images and links; `onLocalLink` gets links
 * to other files in that folder.
 */
export const Markdown = memo(function Markdown({
  text,
  className,
  baseUrl,
  onLocalLink,
}: {
  text: string;
  className?: string;
  baseUrl?: string;
  onLocalLink?: (url: string) => void;
}) {
  const components = useMemo(
    () => (baseUrl ? makeComponents({ baseUrl, onLocalLink }) : chatComponents),
    [baseUrl, onLocalLink],
  );
  return (
    <div className={cn("jig-markdown selectable text-sm leading-relaxed text-fg", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
