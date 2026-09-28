import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { setupCamunda } from './camunda/worker';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY is not set in the environment.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || 'dummy' });

// Initialize Camunda (don't await so it doesn't block server start if Camunda is down)
setupCamunda().catch(console.error);

import { Camunda8 } from '@camunda8/sdk';

const c8 = new Camunda8({
  ZEEBE_GRPC_ADDRESS: 'grpc://127.0.0.1:26500',
  ZEEBE_REST_ADDRESS: 'http://127.0.0.1:8080',
  CAMUNDA_AUTH_STRATEGY: 'NONE'
});
const zeebe = c8.getZeebeGrpcApiClient();

app.get('/api/tasks', async (req, res) => {
  try {
    // In Camunda 8.6+ user tasks are just Zeebe jobs of a specific type
    const jobs = await zeebe.activateJobs({
      type: 'io.camunda.zeebe:userTask',
      maxJobsToActivate: 50,
      timeout: 30000,
      worker: 'chat-ui'
    });
    
    res.json(jobs.map(j => ({
      userTaskKey: j.key,
      elementId: j.elementId,
      processInstanceKey: j.processInstanceKey
    })));
  } catch(e: any) {
    console.error('Tasklist Error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/tasks/:id/complete', async (req, res) => {
  try {
    await zeebe.completeJob({
      jobKey: req.params.id,
      variables: { approved: true }
    });
    res.json({ success: true });
  } catch(e: any) {
    console.error('Tasklist Error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/chat', async (req, res) => {
  console.log('--- Incoming POST /api/chat request ---');
  const abortController = new AbortController();
  let isFinished = false;

  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: "messages array is required" });
      return;
    }

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    console.log(`Calling interactions.create with model gemini-3.6-flash...`);
    const lastUserMessage = messages[messages.length - 1];
    const userQuery = lastUserMessage.text;

    // Fake retrieval step
    res.write(`data: ${JSON.stringify({ type: 'trace', action: 'Searching local knowledge base for relevant context...' })}\n\n`);
    await new Promise(r => setTimeout(r, 800)); // simulate latency
    
    const mockDocs = [
      { id: "doc1", title: "Refund Policy", content: "Refunds are allowed within 30 days of purchase with a receipt. Refunds over $50 require manager approval." },
      { id: "doc2", title: "Shipping Policy", content: "Standard shipping takes 3-5 business days. Expedited shipping is 1-2 days." },
      { id: "doc3", title: "AI Chat Features", content: "The new AI chat supports real-time streaming, citations, and human-in-the-loop workflows." }
    ];

    res.write(`data: ${JSON.stringify({ type: 'trace', action: 'Found 3 relevant policy documents.' })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'citations', citations: mockDocs })}\n\n`);

    const systemPrompt = `You are a helpful customer support agent.
Answer the user's question using the provided context documents if relevant.
When you reference information from a document, YOU MUST include a citation using the exact syntax: [docX] where X is the document ID (e.g., [doc1]). Do not use normal markdown links.

If the user asks you to execute a sensitive action like a refund, you MUST output a special XML tag at the very end of your response like this:
<EXECUTE_ACTION name="refund" amount="60" />
Replace "refund" and "60" with the appropriate action name and amount.

Context Documents:
${mockDocs.map(d => `ID: ${d.id}\nTitle: ${d.title}\nContent: ${d.content}\n`).join('\n')}`;

    // Format history for input since store is false
    const historyString = messages.map((c: any) => `${c.type === 'assistant' ? 'Assistant' : 'User'}: ${c.text}`).join('\n');
    const inputPrompt = `${systemPrompt}\n\nChat History:\n${historyString}\n\nAssistant:`;

    let isFinished = false;

    res.on('close', () => {
      if (!isFinished) {
        abortController.abort();
      }
    });

    const response = await ai.interactions.create(
      {
        model: 'gemini-3.6-flash',
        input: inputPrompt,
        stream: true,
        store: false
      },
      {
        fetchOptions: { signal: abortController.signal }
      }
    );

    let fullText = "";

    console.log(`Awaiting chunks...`);
    for await (const chunk of response) {
      if (chunk.event_type === 'step.delta' && chunk.delta?.text) {
        fullText += chunk.delta.text;
        res.write(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`);
      }
    }

    // Process XML action tag if present
    const actionMatch = fullText.match(/<EXECUTE_ACTION name="([^"]+)" amount="([^"]+)" \/>/);
    if (actionMatch) {
      const actionName = actionMatch[1];
      const amount = parseFloat(actionMatch[2]);
      res.write(`data: ${JSON.stringify({ type: 'trace', action: `Requested action: ${actionName} for $${amount}` })}\n\n`);
      
      try {
        const { Camunda8 } = await import('@camunda8/sdk');
        const zeebe = new Camunda8({
          ZEEBE_GRPC_ADDRESS: 'grpc://127.0.0.1:26500',
          ZEEBE_REST_ADDRESS: 'http://127.0.0.1:8080',
          CAMUNDA_AUTH_STRATEGY: 'NONE'
        }).getZeebeGrpcApiClient();
        
        await zeebe.createProcessInstance({
          bpmnProcessId: 'chat-action-approval',
          variables: {
            actionName: actionName,
            amount: amount
          }
        });
        res.write(`data: ${JSON.stringify({ type: 'trace', action: `Started workflow in Camunda 8` })}\n\n`);
        res.write(`data: ${JSON.stringify({ text: `\n\n*(Agent note: An approval workflow has been started for this action.)*` })}\n\n`);
      } catch (e: any) {
        console.error(e);
        res.write(`data: ${JSON.stringify({ type: 'trace', action: `Failed to start Camunda workflow: ${e.message}` })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    isFinished = true;
    res.end();
    console.log(`--- Finished sending response ---`);
  } catch (error: any) {
    console.log(`Caught error in route handler! Name: ${error.name}, Message: ${error.message}`);
    if (error.name === 'AbortError') {
      console.log('Client aborted the request');
      return;
    }
    console.error("Chat streaming error:", error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    isFinished = true;
    res.end();
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
