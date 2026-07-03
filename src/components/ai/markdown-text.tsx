"use client";

import { MessagePartPrimitive } from "@assistant-ui/react";
import {
  MarkdownTextPrimitive,
  unstable_memoizeMarkdownComponents as memoizeMarkdownComponents,
  useIsMarkdownCodeBlock,
} from "@assistant-ui/react-markdown";
import { type ComponentProps, memo } from "react";
import remarkGfm from "remark-gfm";
import { CodeHeader } from "@/components/ai/code-block";
import { cn } from "@/lib/utils";

function InlineOrBlockCode({ className, ...props }: ComponentProps<"code">) {
  const isCodeBlock = useIsMarkdownCodeBlock();
  return (
    <code
      className={cn(
        !isCodeBlock && "rounded bg-muted px-1 py-0.5 font-mono text-xs",
        isCodeBlock && "font-mono text-xs",
        className
      )}
      {...props}
    />
  );
}

function BlockPre({ className, ...props }: ComponentProps<"pre">) {
  return (
    <pre
      className={cn(
        "overflow-x-auto rounded-t-none rounded-b-lg bg-foreground/95 p-3 text-background",
        className
      )}
      {...props}
    />
  );
}

const markdownComponents = memoizeMarkdownComponents({
  h1: ({ className, ...props }) => (
    <h1
      className={cn(
        "mt-4 mb-2 font-heading font-semibold text-lg first:mt-0",
        className
      )}
      {...props}
    />
  ),
  h2: ({ className, ...props }) => (
    <h2
      className={cn(
        "mt-4 mb-2 font-heading font-semibold text-base first:mt-0",
        className
      )}
      {...props}
    />
  ),
  h3: ({ className, ...props }) => (
    <h3
      className={cn(
        "mt-3 mb-1.5 font-heading font-semibold text-sm first:mt-0",
        className
      )}
      {...props}
    />
  ),
  h4: ({ className, ...props }) => (
    <h4
      className={cn("mt-3 mb-1.5 font-medium text-sm first:mt-0", className)}
      {...props}
    />
  ),
  p: ({ className, ...props }) => (
    <p
      className={cn("mt-2 mb-2 leading-relaxed first:mt-0", className)}
      {...props}
    />
  ),
  a: ({ className, ...props }) => (
    <a
      className={cn("text-blu underline underline-offset-2", className)}
      {...props}
    />
  ),
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn(
        "border-blu/30 border-l-2 pl-3 text-muted-foreground italic",
        className
      )}
      {...props}
    />
  ),
  ul: ({ className, ...props }) => (
    <ul
      className={cn("my-2 ml-4 list-disc [&>li]:mt-1", className)}
      {...props}
    />
  ),
  ol: ({ className, ...props }) => (
    <ol
      className={cn("my-2 ml-4 list-decimal [&>li]:mt-1", className)}
      {...props}
    />
  ),
  hr: ({ className, ...props }) => (
    <hr className={cn("my-3 border-border", className)} {...props} />
  ),
  table: ({ className, ...props }) => (
    <div className="my-2 overflow-x-auto">
      <table className={cn("w-full text-xs", className)} {...props} />
    </div>
  ),
  th: ({ className, ...props }) => (
    <th
      className={cn("border px-2 py-1 text-left font-medium", className)}
      {...props}
    />
  ),
  td: ({ className, ...props }) => (
    <td className={cn("border px-2 py-1", className)} {...props} />
  ),
  strong: ({ className, ...props }) => (
    <strong className={cn("font-semibold", className)} {...props} />
  ),
  code: InlineOrBlockCode,
  pre: BlockPre,
  CodeHeader,
});

const MarkdownTextImpl = () => (
  <>
    <MarkdownTextPrimitive
      className="text-sm leading-relaxed"
      components={markdownComponents}
      remarkPlugins={[remarkGfm]}
    />
    <MessagePartPrimitive.InProgress>
      <span
        aria-hidden
        className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-foreground/70 align-text-bottom"
      />
    </MessagePartPrimitive.InProgress>
  </>
);

export const MarkdownText = memo(MarkdownTextImpl);
