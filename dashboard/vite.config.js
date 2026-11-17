import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import net from 'net';

// Member 4 owns the local Wokwi serial bridge, telemetry transport, stream endpoints, and commands.

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'telemetry-bridge',
      configureServer(server) {
        let wokwiSocket = null;
        let pendingSocket = null;
        let isWokwiConnected = false;
        let latestTelemetry = null;
        let latestTelemetryAt = 0;
        let chartHistory = [];
        let chartSessionStart = null;
        let chartLastBucket = 0;
        let latestChartPower = null;
        let serialBuffer = '';
        const sseClients = new Set();
        const CHART_SAMPLE_INTERVAL = 30 * 1000;
        const TELEMETRY_STALE_AFTER = 3 * 60 * 1000;

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

        function telemetryStatus(includeHistory = false) {
          const fresh = latestTelemetry !== null && Date.now() - latestTelemetryAt < TELEMETRY_STALE_AFTER;
          const status = {
            connected: fresh,
            telemetry: latestTelemetry,
            readingAt: latestTelemetryAt || null,
          };
          if (includeHistory) status.history = chartHistory;
          return status;
        }

        function recordTelemetry(telemetry) {
          latestTelemetry = telemetry;
          latestTelemetryAt = Date.now();
          const actual = Number(telemetry?.actualPower);
          const expected = Number(telemetry?.expectedPower);
          if (!Number.isFinite(actual) || !Number.isFinite(expected)) return;

          latestChartPower = { actual, expected };
          if (chartSessionStart === null) {
            chartSessionStart = latestTelemetryAt;
            chartLastBucket = 0;
            chartHistory = [{
              timestamp: chartSessionStart,
              time: new Date(chartSessionStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              bucket: 0,
              actual,
              expected,
            }];
          }
        }

        function addChartSamples() {
          if (chartSessionStart === null || latestChartPower === null) return false;
          if (Date.now() - latestTelemetryAt >= TELEMETRY_STALE_AFTER) return false;

          const currentBucket = Math.floor((Date.now() - chartSessionStart) / CHART_SAMPLE_INTERVAL);
          if (currentBucket <= chartLastBucket) return false;
          for (let bucket = chartLastBucket + 1; bucket <= currentBucket; bucket++) {
            const timestamp = chartSessionStart + bucket * CHART_SAMPLE_INTERVAL;
            chartHistory.push({
              timestamp,
              time: new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              bucket,
              ...latestChartPower,
            });
          }
          chartLastBucket = currentBucket;
          return true;
        }

        function tryConnectWokwi() {
          if (wokwiSocket || pendingSocket) return;

          const client = net.createConnection({ port: 4000, host: '127.0.0.1' });
          pendingSocket = client;
          client.setTimeout(5000);

          client.on('connect', () => {
            pendingSocket = null;
            wokwiSocket = client;
            isWokwiConnected = true;
            console.log('[Wokwi Bridge] Connected to Wokwi Simulator UART on port 4000');
            broadcast(telemetryStatus());
          });

          client.on('data', (chunk) => {
            isWokwiConnected = true;
            serialBuffer += chunk.toString();

            // Extract all [IOT_DATA]{...} packets reliably
            let match;
            const regex = /\[IOT_DATA\]\s*(\{.*?\})/g;
            let foundTelemetry = false;
            let consumed = 0;

            while ((match = regex.exec(serialBuffer)) !== null) {
              try {
                latestTelemetry = JSON.parse(match[1]);
                foundTelemetry = true;
                consumed = regex.lastIndex;
              } catch (e) {}
            }

            if (foundTelemetry && latestTelemetry) {
              recordTelemetry(latestTelemetry);
              broadcast(telemetryStatus());
            }

            // Drop packets already parsed while retaining a partial packet at the end.
            if (consumed > 0) serialBuffer = serialBuffer.slice(consumed);
            if (serialBuffer.length > 8192) {
              serialBuffer = '';
            }
          });

          client.on('error', () => {
            if (pendingSocket === client) pendingSocket = null;
            if (isWokwiConnected) {
              isWokwiConnected = false;
              broadcast(telemetryStatus());
            }
            try { client.destroy(); } catch (e) {}
            if (wokwiSocket === client) wokwiSocket = null;
          });

          client.on('close', () => {
            if (pendingSocket === client) pendingSocket = null;
            if (isWokwiConnected) {
              isWokwiConnected = false;
              broadcast(telemetryStatus());
            }
            if (wokwiSocket === client) wokwiSocket = null;
          });

          client.on('timeout', () => client.destroy());
        }

        // Check/reconnect every 1 second
        setInterval(() => {
          if (!isWokwiConnected) {
            tryConnectWokwi();
          }
          if (addChartSamples()) broadcast(telemetryStatus(true));
        }, 1000);

        // SSE endpoint for zero-latency, real-time push to dashboard
        server.middlewares.use('/api/telemetry-stream', (req, res) => {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          });

          res.write(`data: ${JSON.stringify(telemetryStatus(true))}\n\n`);
          sseClients.add(res);

          req.on('close', () => {
            sseClients.delete(res);
          });
        });

        server.middlewares.use('/api/chart-history', (req, res) => {
          res.setHeader('Cache-Control', 'no-store');
          res.writeHead(req.method === 'GET' ? 200 : 405, { 'Content-Type': 'application/json' });
          res.end(req.method === 'GET' ? JSON.stringify({ history: chartHistory }) : JSON.stringify({ error: 'Method not allowed' }));
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
                recordTelemetry(parsed);
                isWokwiConnected = true;
                broadcast(telemetryStatus());
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok' }));
              } catch (e) {
                res.writeHead(400); res.end();
              }
            });
          } else {
            // GET: Return current connection status & telemetry
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(telemetryStatus()));
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
                const requestedAngle = typeof command === 'string' ? /^angle:(\d{1,3})$/.exec(command) : null;
                const isAngleInRange = requestedAngle && Number(requestedAngle[1]) <= 180;
                if (!['clean', 'cool', 'angle'].includes(command) && !isAngleInRange) {
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: false, error: 'Unknown command' }));
                  return;
                }
                if (wokwiSocket && !wokwiSocket.destroyed) {
                  wokwiSocket.write(command + '\n');
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: true, command }));
                } else {
                  res.writeHead(503, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: false, error: 'Wokwi not connected' }));
                }
              } catch (e) {
                res.writeHead(400); res.end();
              }
            });
            return;
          }
          res.writeHead(405);
          res.end();
        });

      }
    }
  ],
  server: {
    port: 3000,
    host: true,
  },
});
