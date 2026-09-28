import React, { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

import type { Citation } from '../types';

interface MarkdownProps {
  content: string;
  citations?: Citation[];
}

const balanceMarkdown = (content: string): string => {
  // A naive but effective way to close unclosed code blocks during streaming
  const codeBlockCount = (content.match(/```/g) || []).length;
  if (codeBlockCount % 2 !== 0) {
    return content + '\n```';
  }
  return content;
};

const processCitations = (content: string, citations?: Citation[]): string => {
  if (!citations || citations.length === 0) return content;
  let processed = content;
  citations.forEach((c, index) => {
    const regex = new RegExp(`\\[${c.id}\\]`, 'g');
    // Using simple HTML string replacement since DOMPurify will allow basic styling and spans
    const badgeHtml = `<sup class="cursor-pointer group relative inline-block text-blue-600 bg-blue-100 rounded px-1 mx-1 text-xs font-bold">[${index + 1}]<span class="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-2 bg-gray-800 text-white text-xs rounded w-64 z-10 shadow-lg font-normal leading-tight text-left"><strong>${c.title}</strong><br/>${c.content}</span></sup>`;
    processed = processed.replace(regex, badgeHtml);
  });
  return processed;
};

export const Markdown: React.FC<MarkdownProps> = ({ content, citations }) => {
  const html = useMemo(() => {
    const balanced = balanceMarkdown(content);
    const withCitations = processCitations(balanced, citations);
    // Parse markdown synchronously
    const rawHtml = marked.parse(withCitations, { async: false }) as string;
    // Sanitize to prevent XSS. We need to allow some classes/tags for our tooltips.
    return DOMPurify.sanitize(rawHtml, { 
      ADD_TAGS: ['sup'], 
      ADD_ATTR: ['class'] 
    });
  }, [content, citations]);

  return (
    <div 
      className="prose prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: html }} 
    />
  );
};
