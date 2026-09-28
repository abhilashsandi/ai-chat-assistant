export type UserMessage = {
  id: string;
  type: 'user';
  text: string;
};

export type TraceStep = {
  id: string;
  action: string;
  timestamp: number;
};

export type Citation = {
  id: string; // The citation ID like "doc1"
  title: string;
  content: string;
};

export type Annotation = {
  id: string;
  type: 'citation';
  startOffset: number;
  endOffset: number;
  citationId: string;
};

export type AssistantMessage = {
  id: string;
  type: 'assistant';
  text: string;
  isIncomplete?: boolean;
  traces?: TraceStep[];
  citations?: Citation[]; // available documents
  annotations?: Annotation[]; // located in text
};

export type ToolMessage = {
  id: string;
  type: 'tool';
  toolName: string;
  toolInput: any;
  toolResult?: any;
};

export type ErrorMessage = {
  id: string;
  type: 'error';
  errorText: string;
};

export type ChatMessage = 
  | UserMessage 
  | AssistantMessage 
  | ToolMessage 
  | ErrorMessage;
