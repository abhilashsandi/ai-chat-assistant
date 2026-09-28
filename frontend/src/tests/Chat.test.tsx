import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import Chat from '../components/Chat';

const server = setupServer(
  http.get('http://localhost:3001/api/tasks', () => {
    return HttpResponse.json([]);
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } }
});

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    {children}
  </QueryClientProvider>
);

describe('Chat Component Integration', () => {
  it('handles streaming happy path with text and citations', async () => {
    server.use(
      http.post('http://localhost:3001/api/chat', async () => {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(
              `data: ${JSON.stringify({ text: "Hello! " })}\n\n`
            ));
            controller.enqueue(new TextEncoder().encode(
              `data: ${JSON.stringify({ type: 'trace', action: "Searching..." })}\n\n`
            ));
            controller.enqueue(new TextEncoder().encode(
              `data: ${JSON.stringify({ type: 'citations', citations: [{ id: 'doc1', title: 'Test Doc', content: 'Info' }] })}\n\n`
            ));
            controller.enqueue(new TextEncoder().encode(
              `data: ${JSON.stringify({ text: "Here is [doc1]" })}\n\n`
            ));
            controller.close();
          }
        });
        return new HttpResponse(stream, {
          headers: { 'Content-Type': 'text/event-stream' }
        });
      })
    );

    render(<Chat />, { wrapper: Wrapper });
    
    const input = screen.getByPlaceholderText('Type a message...');
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.click(screen.getByText('Send'));

    // The user's message should appear
    expect(await screen.findByText('Hello')).toBeInTheDocument();

    // Wait for the stream to finish and render the markdown
    await waitFor(() => {
      expect(screen.getByText(/Hello! Here is/)).toBeInTheDocument();
    });

    // Check if the citation rendered properly (sup tag)
    const citation = document.querySelector('sup');
    expect(citation).toBeInTheDocument();
    expect(citation?.textContent).toBe('1');
  });

  it('handles cancellation (stopping the stream)', async () => {
    let streamController: ReadableStreamDefaultController;
    server.use(
      http.post('http://localhost:3001/api/chat', () => {
        const stream = new ReadableStream({
          start(controller) {
            streamController = controller;
            controller.enqueue(new TextEncoder().encode(
              `data: ${JSON.stringify({ text: "Part 1 " })}\n\n`
            ));
          },
          cancel() {
            // Handled when abort is called
          }
        });
        return new HttpResponse(stream, { headers: { 'Content-Type': 'text/event-stream' } });
      })
    );

    render(<Chat />, { wrapper: Wrapper });
    fireEvent.change(screen.getByPlaceholderText('Type a message...'), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByText('Send'));

    // Wait for first chunk
    expect(await screen.findByText('Part 1')).toBeInTheDocument();

    // Click stop button
    fireEvent.click(screen.getByText('Stop'));
    
    // The button should immediately revert to "Send"
    expect(screen.getByText('Send')).toBeInTheDocument();
  });

  it('renders a network error mid-stream', async () => {
    server.use(
      http.post('http://localhost:3001/api/chat', () => {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ text: "Uh oh" })}\n\n`));
            setTimeout(() => {
              controller.error(new Error("Network disconnect"));
            }, 50);
          }
        });
        return new HttpResponse(stream, { headers: { 'Content-Type': 'text/event-stream' } });
      })
    );

    render(<Chat />, { wrapper: Wrapper });
    fireEvent.change(screen.getByPlaceholderText('Type a message...'), { target: { value: 'Crash' } });
    fireEvent.click(screen.getByText('Send'));

    expect(await screen.findByText('network error')).toBeInTheDocument();
  });

  it('handles the Camunda round-trip for user tasks', async () => {
    // 1. Initial state: no tasks
    // 2. Chat streams a task trigger
    // 3. /api/tasks returns a task
    // 4. Click complete -> /api/tasks/:id/complete
    
    let completeCalled = false;

    server.use(
      http.post('http://localhost:3001/api/chat', () => {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ text: "Triggering refund..." })}\n\n`));
            controller.close();
          }
        });
        return new HttpResponse(stream, { headers: { 'Content-Type': 'text/event-stream' } });
      }),
      http.get('http://localhost:3001/api/tasks', () => {
        return HttpResponse.json([
          { userTaskKey: '123', elementId: 'Task_Approve', processInstanceKey: '999' }
        ]);
      }),
      http.post('http://localhost:3001/api/tasks/123/complete', () => {
        completeCalled = true;
        return HttpResponse.json({ success: true });
      })
    );

    render(<Chat />, { wrapper: Wrapper });
    
    // The task should appear immediately since it's mocked in GET /api/tasks
    expect(await screen.findByText('Approve Action')).toBeInTheDocument();
    
    fireEvent.click(screen.getByText('Approve Action'));
    
    await waitFor(() => {
      expect(completeCalled).toBe(true);
    });
  });
});
