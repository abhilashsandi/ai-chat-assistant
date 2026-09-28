# AI Chat Assistant - Architecture Overview

This project is a full-stack, real-time AI chat application built with React, Vite, Express, Google Gemini, and Camunda 8. It demonstrates enterprise-grade patterns for LLM integration, tool calling, real-time streaming, and human-in-the-loop workflows.

## Tech Stack

### Frontend
- **Framework:** React 19 + TypeScript + Vite
- **Styling:** Tailwind CSS (v4)
- **Data Fetching:** React Query (`@tanstack/react-query`)
- **Markdown Parsing:** Marked (with DOMPurify for XSS prevention)
- **Testing:** Vitest + React Testing Library + MSW

### Backend
- **Framework:** Node.js + Express + TypeScript
- **AI Integration:** `@google/genai` (Gemini 3.6 Flash)
- **Workflow Engine:** Camunda 8 (Zeebe + Operate + Tasklist)
- **Streaming:** Server-Sent Events (SSE)

## Architecture Details

### 1. Real-Time Streaming & Agent Traces
The application uses Server-Sent Events (SSE) to stream responses from the Gemini API directly to the frontend. Custom `trace` and `citations` events are interleaved with the standard `text` chunks to provide transparency into the agent's reasoning process.

**Flow:**
- User submits a prompt via the UI.
- The React `useChat` hook initiates a POST request using the native `fetch` API and reads from a `ReadableStream`.
- The Express backend simulates a retrieval step, emitting `trace` and `citations` SSE payloads.
- The backend then streams the Gemini response chunk-by-chunk using `ai.interactions.create(..., { stream: true })`.
- If the user clicks "Stop", the frontend calls `AbortController.abort()`, terminating the stream. The backend listens for the `res.on('close')` event and propagates the abort to the Google API, preventing socket leaks.

### 2. Citations & Markdown Rendering
The backend provides synthetic local retrieval documents (e.g., Refund Policy, Shipping Policy). Gemini is instructed to cite these documents using a custom bracket syntax (e.g., `[doc1]`).
- The frontend's `<Markdown />` component intercepts the raw text before passing it to `marked`.
- It replaces citations with interactive HTML `<sup>` elements wrapped in Tailwind `group` utilities to display tooltips on hover.
- `DOMPurify` ensures that all rendered HTML is strictly sanitized to prevent XSS vulnerabilities.

### 3. Human-in-the-Loop Workflow (Camunda 8)
When a user requests a sensitive action (e.g., "refund $120"), Gemini outputs an XML intent tag: `<EXECUTE_ACTION name="refund" amount="120" />`. 
The backend parses this tag from the completed stream and triggers a Camunda 8 BPMN workflow.

**Camunda Workflow (`chat-action-approval.bpmn`):**
1. **DMN Rule Task:** Evaluates `chat-action-decision.dmn`. The DMN table checks if the requested action is a refund and if the amount exceeds $50. If so, it sets `approvalRequired = true`.
2. **Exclusive Gateway:** Routes the process based on the `approvalRequired` variable.
3. **User Task (Approve Action):** If approval is required, the process pauses at a Zeebe User Task (`io.camunda.zeebe:userTask`).
4. **Service Task (Execute Action):** Once approved (or if no approval was needed), a backend Zeebe worker picks up the job and executes the final action.

**Frontend Integration:**
- The `<ApprovalTasks />` component polls the backend `/api/tasks` endpoint using React Query (`refetchInterval: 2000`).
- The backend uses the Camunda 8 JS SDK (`getZeebeGrpcApiClient().activateJobs()`) to query active user tasks securely.
- When an active task is found, the UI renders an "Approve Action" card.
- Clicking the button calls `/api/tasks/:id/complete`, which completes the Zeebe job, unblocking the BPMN workflow and allowing the backend worker to finish the execution.

## Local Development

### Requirements
- Node.js v24+
- Local Camunda 8 Run cluster (`http://localhost:8080`, `grpc://localhost:26500`)

### Running the App
1. Start the Camunda 8 cluster.
2. In the `backend` directory, run `npm run dev` to start the Express API and Zeebe workers.
3. In the `frontend` directory, run `npm run dev` to start the Vite development server.
4. Access the application at `http://localhost:5173`.

### Testing
Run `npm test` in the `frontend` directory to execute the Vitest suite. The tests use MSW to mock the SSE stream, network errors, and Camunda round-trips.
