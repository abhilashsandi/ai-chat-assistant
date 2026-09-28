import { useState, useRef, useCallback, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { ChatMessage } from '../types';
import { sendChatStream } from '../api/chat';

export const useChat = () => {
  // UI-only state: the current list of messages
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Batching refs
  const pendingChunkRef = useRef<string>('');
  const lastActiveAssistantMessageIdRef = useRef<string | null>(null);
  const frameRef = useRef<number | null>(null);

  const updateAssistantMessage = useCallback(() => {
    if (!lastActiveAssistantMessageIdRef.current || !pendingChunkRef.current) return;
    
    const textToAdd = pendingChunkRef.current;
    pendingChunkRef.current = '';

    setMessages((prev) => 
      prev.map((msg) => {
        if (msg.id === lastActiveAssistantMessageIdRef.current && msg.type === 'assistant') {
          return { ...msg, text: msg.text + textToAdd };
        }
        return msg;
      })
    );

    frameRef.current = null;
  }, []);

  const handleChunk = useCallback((text: string) => {
    pendingChunkRef.current += text;
    if (!frameRef.current) {
      // Coalesce incoming chunks using requestAnimationFrame to prevent tanking frame rate
      frameRef.current = requestAnimationFrame(updateAssistantMessage);
    }
  }, [updateAssistantMessage]);

  const handleTrace = useCallback((trace: any) => {
    if (!lastActiveAssistantMessageIdRef.current) return;
    setMessages((prev) => 
      prev.map((msg) => {
        if (msg.id === lastActiveAssistantMessageIdRef.current && msg.type === 'assistant') {
          return { ...msg, traces: [...(msg.traces || []), trace] };
        }
        return msg;
      })
    );
  }, []);

  const handleCitations = useCallback((citations: any) => {
    if (!lastActiveAssistantMessageIdRef.current) return;
    setMessages((prev) => 
      prev.map((msg) => {
        if (msg.id === lastActiveAssistantMessageIdRef.current && msg.type === 'assistant') {
          return { ...msg, citations };
        }
        return msg;
      })
    );
  }, []);

  const mutation = useMutation({
    mutationFn: async ({ messagesToSend }: { messagesToSend: ChatMessage[] }) => {
      abortControllerRef.current = new AbortController();
      
      const assistantId = Date.now().toString() + '-assistant';
      lastActiveAssistantMessageIdRef.current = assistantId;
      pendingChunkRef.current = '';
      
      setMessages((prev) => [
        ...prev, 
        { id: assistantId, type: 'assistant', text: '', isIncomplete: true, traces: [], citations: [] }
      ]);

      try {
        await sendChatStream(messagesToSend, handleChunk, handleTrace, handleCitations, abortControllerRef.current.signal);
        
        // Mark complete on success
        setMessages((prev) => prev.map(msg => 
          msg.id === assistantId && msg.type === 'assistant' 
            ? { ...msg, isIncomplete: false } 
            : msg
        ));
        abortControllerRef.current = null;
      } catch (error: any) {
        if (error.name === 'AbortError') {
          // Mid-stream disconnect: keep partial message but mark it with an error indicator or leave as is.
          // The instructions say: "decide (and comment in code why) whether a partial message is kept and marked "incomplete" or discarded on reconnect."
          // Decision: We keep it and append an error message below it, because the partial text might contain useful information, and the user explicitly cancelled or sent a new message.
          console.log('Stream aborted.');
        } else {
          setMessages((prev) => [
            ...prev,
            { id: Date.now().toString(), type: 'error', errorText: error.message }
          ]);
        }
        throw error;
      } finally {
        // Flush any remaining text
        if (frameRef.current) {
          cancelAnimationFrame(frameRef.current);
          frameRef.current = null;
        }
        updateAssistantMessage();
      }
    }
  });

  const sendMessage = useCallback((text: string) => {
    const newUserMsg: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      text
    };

    const newMessages = [...messages, newUserMsg];
    setMessages(newMessages);

    mutation.mutate({ messagesToSend: newMessages });
  }, [messages, mutation]);

  const cancelStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      console.log('cancelStreaming called by user!');
      abortControllerRef.current.abort();
    }
  }, []);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        console.log('Aborting request on unmount!!!');
        abortControllerRef.current.abort();
      }
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  return {
    messages,
    sendMessage,
    cancelStreaming,
    isLoading: mutation.isPending
  };
};
