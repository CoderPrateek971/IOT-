import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import net from 'net';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'telemetry-bridge',
      configureServer(server) {
        let wokwiSocket = null;
        let isWokwiConnected = false;
        let latestTelemetry = null;
        let lastHeartbeat = 0;
        let serialBuffer = '';
        const sseClients = new Set();

        function broadcast(data) {
          const payload = `data: ${JSON.stringify(data)}\n\n`;
          for (const client of sseClients) {
            try {
              client.write(payload);
            } catch (e) {
              sseClients.delete(client);
            }
          }
        }

        const HEARTBEAT_TIMEOUT = 10000; // 10s generous timeout to avoid false breaks during actuator cycles

        function tryConnectWokwi() {
          if (wokwiSocket) return;

          const client = net.createConnection({ port: 4000, host: '127.0.0.1' });

          client.on('connect', () => {
            wokwiSocket = client;
            isWokwiConnected = true;
            lastHeartbeat = Date.now();
            console.log('[Wokwi Bridge] Connected to Wokwi Simulator UART on port 4000');
            if (latestTelemetry) {
              broadcast({ connected: true, telemetry: latestTelemetry });
            }
          });

          client.on('data', (chunk) => {
            lastHeartbeat = Date.now();
            isWokwiConnected = true;
            serialBuffer += chunk.toString();

            // Extract all [IOT_DATA]{...} packets reliably
            let match;
            const regex = /\[IOT_DATA\]\s*(\{.*?\})/g;
            let foundTelemetry = false;

            while ((match = regex.exec(serialBuffer)) !== null) {
              try {
                latestTelemetry = JSON.parse(match[1]);
                foundTelemetry = true;
              } catch (e) {}
            }

            if (foundTelemetry && latestTelemetry) {
              lastHeartbeat = Date.now();
              broadcast({ connected: true, telemetry: latestTelemetry });
            }

            // Keep buffer manageable
            if (serialBuffer.length > 8192) {
              serialBuffer = serialBuffer.slice(-2048);
            }
          });

          client.on('error', () => {
            if (isWokwiConnected) {
              isWokwiConnected = false;
              latestTelemetry = null;
              broadcast({ connected: false, telemetry: null });
            }
            try { client.destroy(); } catch (e) {}
            wokwiSocket = null;
          });

          client.on('close', () => {
            if (isWokwiConnected) {
              isWokwiConnected = false;
              latestTelemetry = null;
              broadcast({ connected: false, telemetry: null });
            }
            wokwiSocket = null;
          });
        }

        // Check/reconnect every 1 second
        setInterval(() => {
          if (!isWokwiConnected) {
            tryConnectWokwi();
          } else if (Date.now() - lastHeartbeat > HEARTBEAT_TIMEOUT) {
            // Heartbeat timed out (simulation paused or stopped in VS Code)
            isWokwiConnected = false;
            latestTelemetry = null;
            if (wokwiSocket) {
              try { wokwiSocket.destroy(); } catch (e) {}
              wokwiSocket = null;
            }
            broadcast({ connected: false, telemetry: null });
          }
        }, 1000);

        // SSE endpoint for zero-latency, real-time push to dashboard
        server.middlewares.use('/api/telemetry-stream', (req, res) => {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          });

          const isFresh = (Date.now() - lastHeartbeat < HEARTBEAT_TIMEOUT) && latestTelemetry !== null;
          res.write(`data: ${JSON.stringify({ connected: isFresh, telemetry: isFresh ? latestTelemetry : null })}\n\n`);
          sseClients.add(res);

          req.on('close', () => {
            sseClients.delete(res);
          });
        });

        // REST polling endpoint & command dispatcher
        server.middlewares.use('/api/telemetry', (req, res) => {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

          if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
          }

          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
              try {
                const parsed = JSON.parse(body);
                latestTelemetry = parsed;
                lastHeartbeat = Date.now();
                isWokwiConnected = true;
                broadcast({ connected: true, telemetry: latestTelemetry });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok' }));
              } catch (e) {
                res.writeHead(400); res.end();
              }
            });
          } else {
            // GET: Return current connection status & telemetry
            const isFresh = (Date.now() - lastHeartbeat < HEARTBEAT_TIMEOUT) && latestTelemetry !== null;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              connected: isFresh,
              telemetry: isFresh ? latestTelemetry : null
            }));
          }
        });

        // Command dispatcher endpoint to send commands into Wokwi serial port
        server.middlewares.use('/api/command', (req, res) => {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

          if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
          }

          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
              try {
                const { command } = JSON.parse(body);
                if (wokwiSocket && !wokwiSocket.destroyed) {
                  wokwiSocket.write(command + '\n');
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: true, command }));
                } else {
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: false, error: 'Wokwi not connected' }));
                }
              } catch (e) {
                res.writeHead(400); res.end();
              }
            });
          }
        });

      }
    }
  ],
  server: {
    port: 3000,
    host: true,
  },
});
