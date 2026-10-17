"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** GitHub issue text. Raw HTML is not rendered (react-markdown escapes it by default). */
export function Markdown({ children }: { children: string }) {
  // SWE-bench problem statements contain HTML comments from issue templates; drop them.
  const cleaned = children.replace(/<!--[\s\S]*?-->/g, "").replace(/\r\n/g, "\n");
  return (
    <div className="prose-issue">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: c }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {c}
            </a>
          ),
          img: ({ src, alt }) => (
            <a href={typeof src === "string" ? src : undefined} target="_blank" rel="noreferrer noopener">
              [image: {alt || "attachment"}]
            </a>
          ),
        }}
      >
        {cleaned}
      </ReactMarkdown>
    </div>
  );
}
