import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { setupMarketData } from "./src/services/marketData";
import { setupTradingEngine } from "./src/services/tradingEngine";
import { setupRoutes } from "./src/api/routes";

async function startServer() {
  const app = express();
  const PORT = 3000;
  const server = createServer(app);

  // Initialize WebSocket Server for frontend updates
  const wss = new WebSocketServer({ server });

  // Middleware to parse JSON
  app.use(express.json());

  // Setup API Routes
  setupRoutes(app);

  // Start Background Services
  console.log("Starting Market Data Service...");
  setupMarketData(wss);
  
  console.log("Starting Trading Engine...");
  setupTradingEngine(wss);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    try {
      const vite = await createViteServer({
        server: { 
          middlewareMode: true, 
          hmr: process.env.DISABLE_HMR === 'true' ? false : { server } 
        },
        appType: "spa",
      });
      app.use(vite.middlewares);
      console.log("Vite middleware initialized");
    } catch (e) {
      console.error("Failed to initialize Vite middleware", e);
    }
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
