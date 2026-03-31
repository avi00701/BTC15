"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function shortWallet(addr) {
  if (!addr) return "Unknown";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function formatTime(date) {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-IN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getRankBadge(i) {
  if (i === 0) return "🥇";
  if (i === 1) return "🥈";
  if (i === 2) return "🥉";
  return `#${i + 1}`;
}

function getWinRateColor(rate) {
  if (rate >= 70) return "#22c55e";
  if (rate >= 50) return "#eab308";
  return "#ef4444";
}

// ─── Table Component ──────────────────────────────────────────────────────────
function LeaderboardTable({ data, loading }) {
  if (loading) {
    return (
      <div className="table-skeleton">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="skeleton-row" style={{ animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-icon">📊</span>
        <p>No data yet — waiting for next cron run</p>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table className="leaderboard-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Profile</th>
            <th>Wins</th>
            <th>Trades</th>
            <th>Win %</th>
            <th>Last Active</th>
          </tr>
        </thead>
        <tbody>
          {data.map((user, i) => (
            <tr key={user.wallet} className={`table-row ${i < 3 ? "top-three" : ""}`}>
              <td className="rank-cell">{getRankBadge(i)}</td>
              <td className="wallet-cell">
                <a
                  href={`https://polymarket.com/profile/${user.wallet}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="wallet-link"
                >
                  {shortWallet(user.wallet)}
                  <span className="ext-icon">↗</span>
                </a>
              </td>
              <td className="wins-cell">
                <span className="wins-badge">{user.wins}</span>
              </td>
              <td className="trades-cell">{user.total_trades}</td>
              <td className="winrate-cell">
                <span
                  className="winrate-badge"
                  style={{ color: getWinRateColor(user.win_rate) }}
                >
                  {(user.win_rate || 0).toFixed(1)}%
                </span>
              </td>
              <td className="time-cell">{formatTime(user.last_updated)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Home() {
  const [data24h, setData24h] = useState([]);
  const [dataOverall, setDataOverall] = useState([]);
  const [loading24h, setLoading24h] = useState(true);
  const [loadingOverall, setLoadingOverall] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [activeTab, setActiveTab] = useState("24h");

  const fetchAll = useCallback(async () => {
    setLoading24h(true);
    setLoadingOverall(true);

    const [r24h, rOverall] = await Promise.all([
      fetch("/api/leaderboard-24h").then((r) => r.json()).catch(() => []),
      fetch("/api/leaderboard-overall").then((r) => r.json()).catch(() => []),
    ]);

    setData24h(Array.isArray(r24h) ? r24h : []);
    setDataOverall(Array.isArray(rOverall) ? rOverall : []);
    setLoading24h(false);
    setLoadingOverall(false);
    setLastRefresh(new Date());
  }, []);

  useEffect(() => {
    fetchAll();
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchAll, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          font-family: 'Inter', sans-serif;
          background: #08090a;
          color: #e8eaed;
          min-height: 100vh;
        }

        /* ── Layout ── */
        .page-wrapper {
          max-width: 1100px;
          margin: 0 auto;
          padding: 40px 20px 80px;
        }

        /* ── Header ── */
        .header {
          text-align: center;
          margin-bottom: 40px;
        }
        .header-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #f59e0b;
          background: rgba(245,158,11,0.1);
          padding: 6px 14px;
          border-radius: 20px;
          border: 1px solid rgba(245,158,11,0.25);
          margin-bottom: 18px;
        }
        .live-dot {
          width: 7px;
          height: 7px;
          background: #22c55e;
          border-radius: 50%;
          animation: pulse 1.5s ease-in-out infinite;
        }
        @keyframes pulse {
          0%,100% { opacity:1; transform:scale(1); }
          50% { opacity:0.4; transform:scale(1.4); }
        }
        .header h1 {
          font-size: clamp(28px, 5vw, 44px);
          font-weight: 800;
          background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 40%, #fff 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          line-height: 1.15;
          margin-bottom: 12px;
        }
        .header-sub {
          font-size: 15px;
          color: #6b7280;
          max-width: 420px;
          margin: 0 auto;
          line-height: 1.5;
        }

        /* ── Stats bar ── */
        .stats-bar {
          display: flex;
          justify-content: center;
          gap: 24px;
          flex-wrap: wrap;
          margin-bottom: 36px;
        }
        .stat-chip {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          padding: 10px 18px;
          font-size: 13px;
        }
        .stat-chip .label { color: #6b7280; }
        .stat-chip .value { font-weight: 700; color: #f59e0b; }

        /* ── Tabs ── */
        .tabs {
          display: flex;
          gap: 4px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px;
          padding: 4px;
          margin-bottom: 28px;
          width: fit-content;
        }
        .tab-btn {
          padding: 10px 24px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          transition: all 0.2s ease;
          color: #6b7280;
          background: transparent;
        }
        .tab-btn.active {
          background: linear-gradient(135deg, #d97706, #f59e0b);
          color: #08090a;
        }
        .tab-btn:hover:not(.active) {
          color: #e8eaed;
          background: rgba(255,255,255,0.06);
        }

        /* ── Section title ── */
        .section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
          flex-wrap: wrap;
          gap: 12px;
        }
        .section-title {
          font-size: 20px;
          font-weight: 700;
          color: #f3f4f6;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .section-badge {
          font-size: 11px;
          font-weight: 600;
          padding: 3px 10px;
          border-radius: 20px;
          background: rgba(245,158,11,0.15);
          color: #f59e0b;
          border: 1px solid rgba(245,158,11,0.2);
        }
        .refresh-info {
          font-size: 12px;
          color: #4b5563;
        }

        /* ── Refresh button ── */
        .refresh-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.04);
          color: #9ca3af;
          cursor: pointer;
          font-size: 13px;
          font-family: 'Inter', sans-serif;
          transition: all 0.2s;
        }
        .refresh-btn:hover {
          background: rgba(255,255,255,0.08);
          color: #e8eaed;
        }

        /* ── Table ── */
        .table-wrapper {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 16px;
          overflow: hidden;
        }
        .leaderboard-table {
          width: 100%;
          border-collapse: collapse;
        }
        .leaderboard-table thead tr {
          background: rgba(255,255,255,0.04);
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }
        .leaderboard-table th {
          padding: 14px 18px;
          text-align: left;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #6b7280;
        }
        .table-row {
          border-bottom: 1px solid rgba(255,255,255,0.04);
          transition: background 0.15s;
        }
        .table-row:last-child { border-bottom: none; }
        .table-row:hover { background: rgba(255,255,255,0.03); }
        .table-row.top-three { background: rgba(245,158,11,0.03); }
        .table-row.top-three:hover { background: rgba(245,158,11,0.06); }
        .leaderboard-table td {
          padding: 14px 18px;
          font-size: 14px;
          color: #d1d5db;
        }
        .rank-cell {
          font-size: 16px;
          font-weight: 700;
          width: 60px;
          color: #f3f4f6 !important;
        }
        .wallet-link {
          color: #93c5fd;
          text-decoration: none;
          font-weight: 500;
          font-family: 'Courier New', monospace;
          font-size: 13px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          transition: color 0.15s;
        }
        .wallet-link:hover { color: #60a5fa; }
        .ext-icon { font-size: 10px; opacity: 0.6; }
        .wins-badge {
          display: inline-block;
          background: rgba(34,197,94,0.15);
          color: #4ade80;
          font-weight: 700;
          padding: 2px 10px;
          border-radius: 20px;
          font-size: 13px;
          border: 1px solid rgba(34,197,94,0.2);
        }
        .winrate-badge { font-weight: 700; font-size: 14px; }
        .time-cell { font-size: 12px; color: #6b7280 !important; }

        /* ── Skeleton ── */
        .table-skeleton {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 16px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .skeleton-row {
          height: 48px;
          background: rgba(255,255,255,0.05);
          border-radius: 8px;
          animation: shimmer 1.4s ease-in-out infinite;
        }
        @keyframes shimmer {
          0%,100% { opacity: 0.5; }
          50% { opacity: 1; }
        }

        /* ── Empty state ── */
        .empty-state {
          text-align: center;
          padding: 60px 20px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 16px;
        }
        .empty-icon { font-size: 40px; display: block; margin-bottom: 12px; }
        .empty-state p { color: #6b7280; font-size: 14px; }

        /* ── Responsive ── */
        @media (max-width: 640px) {
          .leaderboard-table th:nth-child(6),
          .leaderboard-table td:nth-child(6) { display: none; }
          .leaderboard-table th:nth-child(4),
          .leaderboard-table td:nth-child(4) { display: none; }
        }
      `}</style>

      <div className="page-wrapper">
        {/* Header */}
        <div className="header">
          <div className="header-eyebrow">
            <span className="live-dot" />
            BTC 15-Min Markets
          </div>
          <h1>🏆 Polymarket Leaderboard</h1>
          <p className="header-sub">
            Track the top traders across BTC 15-minute prediction markets — updated every 15 minutes.
          </p>
        </div>

        {/* Stats bar */}
        <div className="stats-bar">
          <div className="stat-chip">
            <span className="label">24h Traders</span>
            <span className="value">{data24h.length}</span>
          </div>
          <div className="stat-chip">
            <span className="label">All-time Traders</span>
            <span className="value">{dataOverall.length}</span>
          </div>
          <div className="stat-chip">
            <span className="label">Top Win Rate (24h)</span>
            <span className="value">
              {data24h.length > 0 ? `${(data24h[0]?.win_rate || 0).toFixed(1)}%` : "—"}
            </span>
          </div>
          <div className="stat-chip">
            <span className="label">Last Refresh</span>
            <span className="value">
              {lastRefresh ? lastRefresh.toLocaleTimeString() : "Loading..."}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs">
          <button
            className={`tab-btn ${activeTab === "24h" ? "active" : ""}`}
            onClick={() => setActiveTab("24h")}
          >
            🔥 Last 24h
          </button>
          <button
            className={`tab-btn ${activeTab === "overall" ? "active" : ""}`}
            onClick={() => setActiveTab("overall")}
          >
            🏆 All-Time
          </button>
        </div>

        {/* 24h Leaderboard */}
        {activeTab === "24h" && (
          <>
            <div className="section-header">
              <div className="section-title">
                🔥 Top 50 — Last 24 Hours
                <span className="section-badge">LIVE</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {lastRefresh && (
                  <span className="refresh-info">
                    Updated {lastRefresh.toLocaleTimeString()}
                  </span>
                )}
                <button className="refresh-btn" onClick={fetchAll}>
                  ↻ Refresh
                </button>
              </div>
            </div>
            <LeaderboardTable data={data24h} loading={loading24h} />
          </>
        )}

        {/* Overall Leaderboard */}
        {activeTab === "overall" && (
          <>
            <div className="section-header">
              <div className="section-title">
                🏆 Overall Top 100 — All-Time
                <span className="section-badge">ALL TIME</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {lastRefresh && (
                  <span className="refresh-info">
                    Updated {lastRefresh.toLocaleTimeString()}
                  </span>
                )}
                <button className="refresh-btn" onClick={fetchAll}>
                  ↻ Refresh
                </button>
              </div>
            </div>
            <LeaderboardTable data={dataOverall} loading={loadingOverall} />
          </>
        )}
      </div>
    </>
  );
}
