import { Express } from "express";
import { tradeHistory, activePositions } from "../services/tradingEngine";

export function setupRoutes(app: Express) {
  app.get("/api/trades", (req, res) => {
    res.json(tradeHistory);
  });

  app.get("/api/positions", (req, res) => {
    res.json(activePositions);
  });

  app.get("/api/stats", (req, res) => {
    // Calculate simple stats
    const totalTrades = tradeHistory.length;
    const winningTrades = tradeHistory.filter(t => t.pnl > 0).length;
    const totalPnL = tradeHistory.reduce((acc, t) => acc + t.pnl, 0);
    
    res.json({
      totalTrades,
      winRate: totalTrades > 0 ? winningTrades / totalTrades : 0,
      totalPnL
    });
  });
}
