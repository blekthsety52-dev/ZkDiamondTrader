import { useEffect, useState, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Activity, TrendingUp, TrendingDown, Shield, Cpu, Zap, DollarSign, Clock } from 'lucide-react';
import { format } from 'date-fns';

// Types
interface MarketData {
  btc: { price: number; time: number };
  eth: { price: number; time: number };
}

interface Trade {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  entryPrice: number;
  exitPrice?: number;
  size: number;
  pnl?: number;
  timestamp: number;
  status: "OPEN" | "CLOSED";
  confidence: number;
  reason?: string;
}

interface SystemStatus {
  symbol: string;
  rsi: number;
  confidence: number;
}

export default function Dashboard() {
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [priceHistory, setPriceHistory] = useState<any[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [positions, setPositions] = useState<Trade[]>([]);
  const [status, setStatus] = useState<Record<string, SystemStatus>>({});
  const [stats, setStats] = useState({ totalTrades: 0, winRate: 0, totalPnL: 0 });
  const [connectionStatus, setConnectionStatus] = useState("Connecting...");

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Initial Fetch
    fetch('/api/trades').then(res => res.json()).then(setTrades);
    fetch('/api/positions').then(res => res.json()).then(setPositions);
    fetch('/api/stats').then(res => res.json()).then(setStats);

    // WebSocket Setup
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setConnectionStatus("Connected");
    ws.onclose = () => setConnectionStatus("Disconnected");
    ws.onerror = () => setConnectionStatus("Error");

    ws.onmessage = (event) => {
      const { type, data } = JSON.parse(event.data);

      if (type === "MARKET_UPDATE") {
        setMarketData(data);
        setPriceHistory(prev => {
          const newPoint = {
            time: format(new Date(data.btc.time), 'HH:mm:ss'),
            btc: data.btc.price,
            eth: data.eth.price
          };
          const newHistory = [...prev, newPoint];
          if (newHistory.length > 50) newHistory.shift();
          return newHistory;
        });
      } else if (type === "TRADE_UPDATE") {
        const { trade, type: updateType } = data;
        if (updateType === "OPEN") {
          setPositions(prev => [...prev, trade]);
        } else if (updateType === "CLOSED") {
          setPositions(prev => prev.filter(p => p.id !== trade.id));
          setTrades(prev => [trade, ...prev]);
          // Refresh stats
          fetch('/api/stats').then(res => res.json()).then(setStats);
        }
      } else if (type === "SYSTEM_STATUS") {
        setStatus(prev => ({ ...prev, [data.symbol]: data }));
      }
    };

    return () => ws.close();
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-orange-500/30">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#0a0a0a]/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg font-semibold tracking-tight">ZkDiamond<span className="text-white/40 font-normal">Trader</span></h1>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
              <div className={`w-2 h-2 rounded-full ${connectionStatus === "Connected" ? "bg-emerald-500" : "bg-red-500"}`} />
              <span className="text-white/60">{connectionStatus}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        
        {/* Top Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard 
            label="Total PnL" 
            value={`$${stats.totalPnL.toFixed(2)}`} 
            icon={<DollarSign className="w-4 h-4" />}
            trend={stats.totalPnL >= 0 ? 'up' : 'down'}
          />
          <StatCard 
            label="Win Rate" 
            value={`${(stats.winRate * 100).toFixed(1)}%`} 
            icon={<Activity className="w-4 h-4" />}
          />
          <StatCard 
            label="Active Positions" 
            value={positions.length.toString()} 
            icon={<Zap className="w-4 h-4" />}
          />
          <StatCard 
            label="AI Confidence (BTC)" 
            value={`${((status['BTC']?.confidence || 0) * 100).toFixed(0)}%`} 
            icon={<Cpu className="w-4 h-4" />}
            subValue={`RSI: ${status['BTC']?.rsi.toFixed(1) || '--'}`}
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Chart Section */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-[#111] border border-white/10 rounded-xl p-6 h-[400px]">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-sm font-medium text-white/80 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-orange-500" />
                  Real-time Market Data (BTC/USDT)
                </h2>
                <div className="font-mono text-xl text-white">
                  ${marketData?.btc.price.toLocaleString() || '---'}
                </div>
              </div>
              <ResponsiveContainer width="100%" height="85%">
                <LineChart data={priceHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis dataKey="time" stroke="#666" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis domain={['auto', 'auto']} stroke="#666" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#000', border: '1px solid #333', borderRadius: '8px' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Line type="monotone" dataKey="btc" stroke="#f97316" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#f97316' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Active Positions */}
            <div className="bg-[#111] border border-white/10 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-sm font-medium text-white/80">Active Positions</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-white/5 text-white/40 font-mono text-xs uppercase">
                    <tr>
                      <th className="px-6 py-3">Symbol</th>
                      <th className="px-6 py-3">Side</th>
                      <th className="px-6 py-3">Entry</th>
                      <th className="px-6 py-3">Current</th>
                      <th className="px-6 py-3">PnL</th>
                      <th className="px-6 py-3">Confidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {positions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-white/30 italic">
                          No active positions. AI is scanning...
                        </td>
                      </tr>
                    ) : (
                      positions.map(pos => {
                        const currentPrice = pos.symbol === 'BTC' ? marketData?.btc.price : marketData?.eth.price;
                        const pnl = currentPrice ? (pos.side === 'BUY' ? currentPrice - pos.entryPrice : pos.entryPrice - currentPrice) * pos.size : 0;
                        return (
                          <tr key={pos.id} className="hover:bg-white/5 transition-colors">
                            <td className="px-6 py-4 font-medium">{pos.symbol}</td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded text-xs font-bold ${pos.side === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                {pos.side}
                              </span>
                            </td>
                            <td className="px-6 py-4 font-mono text-white/60">${pos.entryPrice.toFixed(2)}</td>
                            <td className="px-6 py-4 font-mono">${currentPrice?.toFixed(2)}</td>
                            <td className={`px-6 py-4 font-mono ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                  <div className="h-full bg-orange-500" style={{ width: `${pos.confidence * 100}%` }} />
                                </div>
                                <span className="text-xs text-white/40">{(pos.confidence * 100).toFixed(0)}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Sidebar - Trade Log */}
          <div className="bg-[#111] border border-white/10 rounded-xl flex flex-col h-[800px]">
            <div className="px-6 py-4 border-b border-white/10">
              <h3 className="text-sm font-medium text-white/80">Trade History</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {trades.map(trade => (
                <div key={trade.id} className="p-3 rounded-lg bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">{trade.symbol}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${trade.side === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                        {trade.side}
                      </span>
                    </div>
                    <span className="text-xs text-white/40 font-mono">
                      {format(new Date(trade.timestamp), 'HH:mm:ss')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-white/60 mb-2">
                    <span>Entry: ${trade.entryPrice.toFixed(0)}</span>
                    <span>Exit: ${trade.exitPrice?.toFixed(0)}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-white/5">
                    <span className="text-[10px] text-white/30 uppercase tracking-wider">{trade.reason}</span>
                    <div className="text-right">
                      <div className={`font-mono font-medium ${trade.pnl! >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {trade.pnl! >= 0 ? '+' : ''}{trade.pnl?.toFixed(2)}
                      </div>
                      {/* @ts-ignore */}
                      {trade.txHash && (
                        <div className="text-[9px] text-white/20 font-mono mt-0.5">
                          Tx: {trade.txHash.substring(0, 8)}...
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {trades.length === 0 && (
                <div className="text-center text-white/30 text-sm py-8">
                  No completed trades yet.
                </div>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, icon, subValue, trend }: any) {
  return (
    <div className="bg-[#111] border border-white/10 rounded-xl p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-white/50 uppercase tracking-wider">{label}</span>
        <div className="text-white/20">{icon}</div>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-light tracking-tight text-white">{value}</span>
        {subValue && <span className="text-xs text-white/40 mb-1">{subValue}</span>}
      </div>
      {trend && (
        <div className={`text-xs mt-2 flex items-center gap-1 ${trend === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
          {trend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          <span>{trend === 'up' ? 'Profitable' : 'Loss'}</span>
        </div>
      )}
    </div>
  );
}
