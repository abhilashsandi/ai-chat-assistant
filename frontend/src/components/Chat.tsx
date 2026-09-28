import React, { useState } from 'react';
import { useChat } from '../hooks/useChat';
import { Markdown } from './Markdown';
import { ApprovalTasks } from './ApprovalTasks';

export const Chat: React.FC = () => {
  const { messages, sendMessage, cancelStreaming, isLoading } = useChat();
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput('');
  };

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto p-4">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">AI Chat Assistant</h1>
      </header>

      <div className="flex-1 overflow-y-auto border rounded p-4 mb-4 flex flex-col gap-4">
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`p-3 rounded-lg max-w-[85%] ${
              msg.type === 'user' ? 'bg-blue-100 self-end' : 
              msg.type === 'error' ? 'bg-red-100 self-center' :
              'bg-gray-100 self-start'
            }`}
          >
            {msg.type === 'user' && <div>{msg.text}</div>}
            {msg.type === 'assistant' && (
              <div className="flex flex-col gap-2">
                {msg.traces && msg.traces.length > 0 && (
                  <details className="text-xs text-gray-500 mb-2 border-b pb-2 cursor-pointer">
                    <summary className="font-semibold select-none hover:text-gray-700 transition-colors">
                      Agent Trace ({msg.traces.length} steps)
                    </summary>
                    <ul className="mt-2 pl-4 list-disc space-y-1">
                      {msg.traces.map(t => (
                        <li key={t.id}>[{new Date(t.timestamp).toLocaleTimeString()}] {t.action}</li>
                      ))}
                    </ul>
                  </details>
                )}
                <div>
                  <Markdown content={msg.text} citations={msg.citations} />
                  {msg.isIncomplete && <span className="inline-block w-2 h-4 bg-gray-500 animate-pulse ml-1" />}
                </div>
              </div>
            )}
            {msg.type === 'error' && <div className="text-red-700">{msg.errorText}</div>}
          </div>
        ))}
      </div>

      <ApprovalTasks />
      
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 border rounded p-2"
        />
        {isLoading ? (
          <button 
            type="button" 
            onClick={cancelStreaming}
            className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
          >
            Stop
          </button>
        ) : (
          <button 
            type="submit"
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Send
          </button>
        )}
      </form>
    </div>
  );
};
