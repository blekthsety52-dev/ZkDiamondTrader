import { WebSocket } from "ws";
import { WebSocketServer } from "ws";

// Store latest prices
export const marketState = {
  btc: { price: 0, time: 0 },
  eth: { price: 0, time: 0 },
  history: [] as { time: number; btc: number; eth: number }[]
};

const BINANCE_WS_URL = "wss://stream.binance.com:9443/ws/btcusdt@trade/ethusdt@trade";

export function setupMarketData(wss: WebSocketServer) {
  const ws = new WebSocket(BINANCE_WS_URL);

  ws.on("open", () => {
    console.log("Connected to Binance WebSocket");
  });

  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());
      const price = parseFloat(message.p);
      const time = message.T;
      const symbol = message.s;

      if (symbol === "BTCUSDT") {
        marketState.btc = { price, time };
      } else if (symbol === "ETHUSDT") {
        marketState.eth = { price, time };
      }

      // Keep a small history for the chart (last 100 points)
      if (marketState.btc.price > 0 && marketState.eth.price > 0) {
        // Only push if we have a new timestamp or significant change? 
        // For simplicity, just push every update but throttle in real app.
        // We'll throttle broadcast instead.
      }

      // Broadcast to frontend clients
      broadcastMarketData(wss);

    } catch (e) {
      console.error("Error parsing market data", e);
    }
  });

  ws.on("error", (err) => {
    console.error("Binance WS Error:", err);
  });

  ws.on("close", () => {
    console.log("Binance WS Closed. Reconnecting in 5s...");
    setTimeout(() => setupMarketData(wss), 5000);
  });
}

let lastBroadcast = 0;
function broadcastMarketData(wss: WebSocketServer) {
  const now = Date.now();
  if (now - lastBroadcast < 100) return; // Throttle to 100ms
  lastBroadcast = now;

  const payload = JSON.stringify({
    type: "MARKET_UPDATE",
    data: {
      btc: marketState.btc,
      eth: marketState.eth,
    }
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}
