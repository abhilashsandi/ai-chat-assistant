import type { ChatMessage } from '../types';

export const sendChatStream = async (
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  onTrace: (trace: any) => void,
  onCitations: (citations: any) => void,
  abortSignal: AbortSignal
): Promise<void> => {
  const response = await fetch('http://localhost:3001/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages }),
    signal: abortSignal,
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    
    // Process Server-Sent Events from buffer
    let lineEnd = buffer.indexOf('\n\n');
    while (lineEnd !== -1) {
      const chunk = buffer.slice(0, lineEnd);
      buffer = buffer.slice(lineEnd + 2);

      if (chunk.startsWith('data: ')) {
        const data = chunk.slice(6);
        if (data === '[DONE]') {
          return;
        }

        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            throw new Error(parsed.error);
          }
          if (parsed.type === 'trace') {
            onTrace({ id: Date.now().toString(), action: parsed.action, timestamp: Date.now() });
          } else if (parsed.type === 'citations') {
            onCitations(parsed.citations);
          } else if (parsed.text) {
            onChunk(parsed.text);
          }
        } catch (e) {
          console.error("Failed to parse SSE data", e);
        }
      }
      lineEnd = buffer.indexOf('\n\n');
    }
  }
};
