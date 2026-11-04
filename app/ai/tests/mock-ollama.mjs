/**
 * A tiny Ollama-shaped mock server for deterministic failure-path tests:
 * timeout, missing model, 500, invalid JSON and a 400 "invalid request".
 *
 * It is registered as an `ollama` provider, because that is the only type the
 * SSRF guard allows to point at a loopback address.
 */
import http from 'node:http';

export function createMockOllama() {
  const state = { mode: 'ok', hits: 0 };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const send = (status, payload, type = 'application/json') => {
      res.writeHead(status, { 'Content-Type': type });
      res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
    };

    if (url.pathname === '/api/version') {
      return send(200, { version: '0.0.0-mock' });
    }
    if (url.pathname === '/api/tags') {
      return send(200, {
        models: [
          { name: 'mock-fast:1b', model: 'mock-fast:1b', size: 1000, details: { parameter_size: '1B', quantization_level: 'Q4', family: 'mock' } }
        ]
      });
    }
    if (url.pathname === '/api/chat') {
      state.hits += 1;
      const mode = state.mode;
      if (mode === 'slow') {
        setTimeout(() => send(200, { model: 'mock-slow', message: { role: 'assistant', content: 'too late' }, done: true }), 5000);
        return;
      }
      if (mode === 'missing') {
        return send(404, { error: 'model "ghost:1b" not found, try pulling it first' });
      }
      if (mode === 'error500') {
        return send(500, { error: 'mock upstream exploded' });
      }
      if (mode === 'badjson') {
        return send(200, 'not-json-at-all', 'text/plain');
      }
      if (mode === 'invalid') {
        return send(400, { error: 'invalid request: messages must be an array' });
      }
      return send(200, {
        model: 'mock-fast:1b',
        message: { role: 'assistant', content: 'MOCK OK' },
        done: true,
        done_reason: 'stop',
        prompt_eval_count: 7,
        eval_count: 3
      });
    }
    return send(404, { error: 'not found' });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        port,
        state,
        setMode: (m) => {
          state.mode = m;
        },
        close: () => new Promise((r) => server.close(r))
      });
    });
  });
}
