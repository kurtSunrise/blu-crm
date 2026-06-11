"use client";

import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import { memo } from "react";
import remarkGfm from "remark-gfm";

const MarkdownTextImpl = () => (
  <MarkdownTextPrimitive
    className="space-y-2 text-sm leading-relaxed [&_a]:text-blu [&_a]:underline [&_li]:ml-4 [&_ol]:list-decimal [&_strong]:font-semibold [&_table]:w-full [&_table]:text-xs [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc"
    remarkPlugins={[remarkGfm]}
  />
);

export const MarkdownText = memo(MarkdownTextImpl);
