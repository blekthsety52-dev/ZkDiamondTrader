import { WebSocketServer, WebSocket } from "ws";
import { marketState } from "./marketData";
import { RSI, SMA } from "technicalindicators";
import { v4 as uuidv4 } from "uuid";
import { diamondProxy } from "./diamondProxy";

// Mock Database for Trades
export const tradeHistory: any[] = [];
export const activePositions: any[] = [];

// Trading Configuration
const CONFIG = {
  rsiPeriod: 14,
  smaPeriod: 20,
  buyThreshold: 30, // RSI oversold
  sellThreshold: 70, // RSI overbought
  stopLossPct: 0.02, // 2%
  takeProfitPct: 0.05, // 5%
};

// Price History Buffer for Indicators
const priceBuffer: { btc: number[]; eth: number[] } = { btc: [], eth: [] };

export function setupTradingEngine(wss: WebSocketServer) {
  // Run trading logic loop every 1 second
  setInterval(() => {
    runStrategy("BTC", marketState.btc.price, wss);
    runStrategy("ETH", marketState.eth.price, wss);
  }, 1000);
}

function runStrategy(symbol: string, currentPrice: number, wss: WebSocketServer) {
  if (currentPrice === 0) return;

  const buffer = symbol === "BTC" ? priceBuffer.btc : priceBuffer.eth;
  buffer.push(currentPrice);
  if (buffer.length > 100) buffer.shift();

  // Need enough data for indicators
  if (buffer.length < CONFIG.smaPeriod) return;

  // Calculate Indicators
  const rsiValues = RSI.calculate({ values: buffer, period: CONFIG.rsiPeriod });
  const smaValues = SMA.calculate({ values: buffer, period: CONFIG.smaPeriod });

  const currentRSI = rsiValues[rsiValues.length - 1];
  const currentSMA = smaValues[smaValues.length - 1];

  // AI/ML Confidence Score (Simulated)
  const aiConfidence = calculateAIConfidence(currentRSI, currentPrice, currentSMA);

  // Check for Exits (Stop Loss / Take Profit)
  checkExits(symbol, currentPrice, wss);

  // Check for Entries
  if (aiConfidence > 0.8 && currentRSI < CONFIG.buyThreshold) {
    executeTrade(symbol, "BUY", currentPrice, aiConfidence, wss);
  } else if (aiConfidence > 0.8 && currentRSI > CONFIG.sellThreshold) {
    executeTrade(symbol, "SELL", currentPrice, aiConfidence, wss);
  }

  // Broadcast System Status
  broadcastSystemStatus(wss, symbol, currentRSI, aiConfidence);
}

function calculateAIConfidence(rsi: number, price: number, sma: number): number {
  // Simulated Logic: Higher confidence if RSI is extreme and price is far from SMA
  let confidence = 0.5;
  
  if (rsi < 20 || rsi > 80) confidence += 0.3;
  else if (rsi < 30 || rsi > 70) confidence += 0.1;

  const deviation = Math.abs((price - sma) / sma);
  if (deviation > 0.01) confidence += 0.1;

  return Math.min(confidence, 0.99);
}

async function executeTrade(symbol: string, side: "BUY" | "SELL", price: number, confidence: number, wss: WebSocketServer) {
  // Check if we already have a position
  const existingPosition = activePositions.find(p => p.symbol === symbol);
  if (existingPosition) {
    if (existingPosition.side === "BUY" && side === "SELL") {
      closePosition(existingPosition, price, "Signal Flip", wss);
    }
    else if (existingPosition.side === "SELL" && side === "BUY") {
      closePosition(existingPosition, price, "Signal Flip", wss);
    }
    return;
  }

  // Use Diamond Proxy to Execute Trade
  try {
    // Simulate calling the TradingFacet via the Proxy
    // In a real contract: proxy.fallback(selector, args)
    const result = await diamondProxy.fallback("executeTrade", { symbol, side, price, size: 0.1 });
    console.log(`[TradingEngine] Diamond Proxy Tx: ${result.txHash}`);

    const trade = {
      id: uuidv4(),
      symbol,
      side,
      entryPrice: price,
      size: 0.1,
      timestamp: Date.now(),
      confidence,
      status: "OPEN",
      txHash: result.txHash // Store the "on-chain" tx hash
    };

    activePositions.push(trade);
    broadcastTradeUpdate(wss, trade, "OPEN");
  } catch (e) {
    console.error("Trade execution failed via Diamond Proxy", e);
  }
}

function checkExits(symbol: string, currentPrice: number, wss: WebSocketServer) {
  const positionIndex = activePositions.findIndex(p => p.symbol === symbol);
  if (positionIndex === -1) return;

  const position = activePositions[positionIndex];
  let closeReason = null;

  if (position.side === "BUY") {
    if (currentPrice <= position.entryPrice * (1 - CONFIG.stopLossPct)) closeReason = "Stop Loss";
    else if (currentPrice >= position.entryPrice * (1 + CONFIG.takeProfitPct)) closeReason = "Take Profit";
  } else {
    if (currentPrice >= position.entryPrice * (1 + CONFIG.stopLossPct)) closeReason = "Stop Loss";
    else if (currentPrice <= position.entryPrice * (1 - CONFIG.takeProfitPct)) closeReason = "Take Profit";
  }

  if (closeReason) {
    closePosition(position, currentPrice, closeReason, wss);
  }
}

async function closePosition(position: any, exitPrice: number, reason: string, wss: WebSocketServer) {
  try {
    // Use Diamond Proxy to Close Position
    const result = await diamondProxy.fallback("closePosition", { id: position.id, exitPrice });
    
    const pnl = position.side === "BUY" 
      ? (exitPrice - position.entryPrice) * position.size
      : (position.entryPrice - exitPrice) * position.size;

    const closedTrade = {
      ...position,
      exitPrice,
      exitTimestamp: Date.now(),
      pnl,
      reason,
      status: "CLOSED",
      closeTxHash: result.txHash
    };

    tradeHistory.unshift(closedTrade);
    if (tradeHistory.length > 50) tradeHistory.pop();

    const idx = activePositions.findIndex(p => p.id === position.id);
    if (idx !== -1) activePositions.splice(idx, 1);

    broadcastTradeUpdate(wss, closedTrade, "CLOSED");
  } catch (e) {
    console.error("Close position failed via Diamond Proxy", e);
  }
}

function broadcastTradeUpdate(wss: WebSocketServer, trade: any, type: string) {
  const payload = JSON.stringify({
    type: "TRADE_UPDATE",
    data: { trade, type }
  });
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(payload);
  });
}

function broadcastSystemStatus(wss: WebSocketServer, symbol: string, rsi: number, confidence: number) {
   const payload = JSON.stringify({
    type: "SYSTEM_STATUS",
    data: { symbol, rsi, confidence }
  });
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(payload);
  });
}
