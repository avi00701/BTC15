"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function shortWallet(addr) {
  if (!addr) return "Unknown";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function formatTime(date) {
  if (!date) return "—";
  
  const now = new Date();
  const past = new Date(date);
  const diffMs = now - past;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffDays === 1) return "Yesterday";
  return `${diffDays} days ago`;
}

function getRankBadge(i) {
  if (i === 0) return "01";
  if (i === 1) return "02";
  if (i === 2) return "03";
  return (i + 1).toString().padStart(2, "0");
}

function getWinRateColor(rate) {
  if (rate >= 70) return "#10B981"; // Neon Green
  if (rate >= 50) return "#FFD700"; // Gold
  return "#EF4444"; // Red
}

// ─── HUD Components ───────────────────────────────────────────────────────────
function BracketBox({ children, className = "" }) {
  return (
    <div className={`bracket-box ${className}`}>
      <div className="corner tl" />
      <div className="corner tr" />
      <div className="corner bl" />
      <div className="corner br" />
      {children}
    </div>
  );
}

// ─── Table Component ──────────────────────────────────────────────────────────
function LeaderboardTable({ data, loading }) {
  if (loading) {
    return (
      <BracketBox className="table-wrapper">
        <div className="table-skeleton">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton-row" style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
      </BracketBox>
    );
  }

  if (!data || data.length === 0) {
    return (
      <BracketBox className="empty-state">
        <span className="empty-icon">SYS_WAIT</span>
        <p>AWAITING DATA FROM DATALINK // CRON CYCLE PENDING</p>
      </BracketBox>
    );
  }

  return (
    <BracketBox className="table-wrapper">
      <div className="table-scroll-area">
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Operator</th>
              <th>Wins</th>
              <th>Executions</th>
              <th>Win %</th>
              <th>Last Win</th>
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
    </BracketBox>
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
    const interval = setInterval(fetchAll, 5 * 60 * 1000); // 5 minutes
    return () => clearInterval(interval);
  }, [fetchAll]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        /* ── Scrollbars ── */
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        ::-webkit-scrollbar-track {
          background: #080808;
          border-left: 1px solid #1a1a1a;
          border-top: 1px solid #1a1a1a;
        }
        ::-webkit-scrollbar-thumb {
          background: #333333;
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #2D45D8;
        }

        body {
          font-family: 'Space Grotesk', monospace, sans-serif;
          background-color: #000000;
          /* The Technical Grid */
          background-image: 
            linear-gradient(#121212 1px, transparent 1px),
            linear-gradient(90deg, #121212 1px, transparent 1px);
          background-size: 32px 32px;
          background-attachment: fixed;
          color: #FFFFFF;
          min-height: 100vh;
          overflow-x: hidden;
          -webkit-font-smoothing: antialiased;
        }

        /* ── Layout ── */
        .page-wrapper {
          max-width: 1200px;
          margin: 0 auto;
          padding: 48px 24px 80px;
        }

        /* ── Header ── */
        .header {
          margin-bottom: 48px;
          text-align: left;
          position: relative;
        }
        
        .sys-status {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #10B981;
          margin-bottom: 16px;
          padding: 8px 16px;
          background: rgba(16, 185, 129, 0.05);
          border: 1px solid rgba(16, 185, 129, 0.2);
          box-shadow: 0 0 10px rgba(16, 185, 129, 0.1);
        }

        .live-dot {
          width: 8px;
          height: 8px;
          background: #10B981;
          border-radius: 50%;
          box-shadow: 0 0 8px #10B981;
          animation: pulse-green 1.5s ease-in-out infinite;
        }
        @keyframes pulse-green {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.3); }
        }

        .header h1 {
          font-size: clamp(36px, 6vw, 56px);
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: -0.04em;
          color: #FFFFFF;
          margin-bottom: 12px;
          text-shadow: 0 0 30px rgba(255,255,255,0.1);
        }

        .header-sub {
          font-size: 14px;
          color: #737373;
          max-width: 600px;
          line-height: 1.6;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }

        /* ── Bracket HUD Component ── */
        .bracket-box {
          position: relative;
          padding: 24px;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
          transition: all 0.3s ease;
          border: 1px solid rgba(38, 38, 38, 0.3);
        }
        .bracket-box:hover {
          background: rgba(45, 69, 216, 0.02);
          border-color: rgba(45, 69, 216, 0.2);
          box-shadow: inset 0 0 20px rgba(45, 69, 216, 0.05), 0 0 15px rgba(45, 69, 216, 0.1);
        }
        .bracket-box .corner {
          position: absolute;
          width: 16px;
          height: 16px;
          border: 0 solid #262626;
          transition: border-color 0.3s ease, box-shadow 0.3s ease;
        }
        .bracket-box:hover .corner {
          border-color: #2D45D8;
          box-shadow: 0 0 10px rgba(45, 69, 216, 0.3);
        }
        .bracket-box .tl { top: -1px; left: -1px; border-top-width: 2px; border-left-width: 2px; }
        .bracket-box .tr { top: -1px; right: -1px; border-top-width: 2px; border-right-width: 2px; }
        .bracket-box .bl { bottom: -1px; left: -1px; border-bottom-width: 2px; border-left-width: 2px; }
        .bracket-box .br { bottom: -1px; right: -1px; border-bottom-width: 2px; border-right-width: 2px; }

        /* ── Stats Bar ── */
        .stats-bar {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 24px;
          margin-bottom: 48px;
        }
        
        .hud-stat {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .hud-stat .label {
          font-size: 11px;
          color: #737373;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          font-weight: 600;
        }
        .hud-stat .value {
          font-size: 36px;
          color: #FFD700;
          font-weight: 800;
          letter-spacing: -0.03em;
          position: relative;
          display: inline-block;
          width: fit-content;
          padding-bottom: 6px;
          text-shadow: 0 0 20px rgba(255, 215, 0, 0.2);
        }
        .hud-stat .value::after {
          content: "";
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          height: 3px;
          background: linear-gradient(90deg, #2D45D8, transparent);
        }

        /* ── Tabs ── */
        .tabs {
          display: flex;
          gap: 12px;
          margin-bottom: 32px;
        }
        .tab-btn {
          padding: 12px 24px;
          border: 1px solid #262626;
          background: rgba(0, 0, 0, 0.5);
          color: #737373;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.2s ease;
          position: relative;
          overflow: hidden;
        }
        .tab-btn::before {
          content: "";
          position: absolute;
          top: 0; left: 0; width: 2px; height: 100%;
          background: transparent;
          transition: background 0.2s;
        }
        .tab-btn.active {
          color: #FFFFFF;
          border-color: rgba(45, 69, 216, 0.4);
          background: rgba(45, 69, 216, 0.1);
        }
        .tab-btn.active::before {
          background: #2D45D8;
          box-shadow: 0 0 10px #2D45D8;
        }
        .tab-btn:hover:not(.active) {
          border-color: #2D45D8;
          color: #FFFFFF;
        }

        /* ── Controls Row ── */
        .controls-row {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 16px;
          margin-bottom: 16px;
        }
        .refresh-info {
          font-size: 11px;
          color: #737373;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .refresh-btn {
          background: transparent;
          border: 1px solid #262626;
          color: #2D45D8;
          font-family: inherit;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 8px 16px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .refresh-btn:hover {
          border-color: #2D45D8;
          box-shadow: inset 0 0 10px rgba(45, 69, 216, 0.2);
          text-shadow: 0 0 5px rgba(45, 69, 216, 0.5);
        }

        /* ── Table ── */
        .table-wrapper {
          padding: 0 !important;
        }
        .table-scroll-area {
          width: 100%;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          display: block;
        }
        .leaderboard-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 700px;
        }
        .leaderboard-table th {
          padding: 20px 24px;
          text-align: left;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #737373;
          border-bottom: 2px solid #262626;
          background: rgba(0,0,0,0.8);
        }
        .table-row {
          transition: background 0.2s ease, box-shadow 0.2s ease;
          border-bottom: 1px solid #1a1a1a;
        }
        .table-row:hover { 
          background: rgba(45, 69, 216, 0.05); 
        }
        .table-row:hover td {
          color: #FFFFFF;
        }
        .leaderboard-table td {
          padding: 18px 24px;
          font-size: 14px;
          color: #A3A3A3;
          font-weight: 500;
        }
        .rank-cell {
          font-size: 16px !important;
          font-weight: 800 !important;
          width: 80px;
          color: #FFD700 !important;
          letter-spacing: -0.05em;
        }
        
        /* Apply special glow for rank 1-3 */
        .table-row.top-three .rank-cell {
          text-shadow: 0 0 15px rgba(255, 215, 0, 0.4);
        }
        
        .wallet-link {
          color: #FFFFFF;
          text-decoration: none;
          font-family: inherit;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: color 0.2s;
        }
        .wallet-link:hover { color: #2D45D8; }
        .ext-icon { font-size: 10px; color: #737373; }
        
        .wins-badge {
          display: inline-block;
          color: #FFFFFF;
          font-weight: 800;
          font-size: 16px;
        }
        .winrate-badge { 
          font-weight: 800; 
          font-size: 15px; 
          letter-spacing: -0.02em;
        }
        .time-cell { 
          font-size: 12px !important; 
          color: #737373 !important; 
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        /* ── Skeleton / Loading ── */
        .table-skeleton {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .skeleton-row {
          height: 40px;
          background: #121212;
          position: relative;
          overflow: hidden;
          border: 1px solid #262626;
        }
        .skeleton-row::after {
          content: "";
          position: absolute;
          top: 0; right: 0; bottom: 0; left: 0;
          background: linear-gradient(90deg, transparent, rgba(45, 69, 216, 0.1), transparent);
          transform: translateX(-100%);
          animation: scanline 2s infinite linear;
        }
        @keyframes scanline {
          100% { transform: translateX(100%); }
        }

        /* ── Empty state ── */
        .empty-state {
          text-align: center;
          padding: 80px 20px;
        }
        .empty-icon { 
          font-size: 24px; 
          color: #FFD700; 
          font-weight: 800;
          display: block; 
          margin-bottom: 16px; 
          text-shadow: 0 0 20px rgba(255,215,0,0.3);
        }
        .empty-state p { 
          color: #737373; 
          font-size: 12px; 
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        /* ── Responsive Mobile Formatting ── */
        @media (max-width: 768px) {
          .page-wrapper {
            padding: 24px 16px 80px;
          }
          
          .header h1 {
            font-size: 32px;
          }
          
          .header-sub {
            font-size: 12px;
          }
          
          .stats-bar {
            grid-template-columns: 1fr;
            gap: 16px;
            margin-bottom: 32px;
          }
          
          .controls-row {
            flex-direction: column-reverse;
            align-items: flex-start;
          }

          .tabs {
            overflow-x: auto;
            white-space: nowrap;
          }
          
          .tab-btn {
            padding: 12px 16px;
            font-size: 11px;
          }

          /* Allow horizontal scroll for full table on mobile */
          .table-wrapper {
            background: rgba(0,0,0,0.6);
            border: 1px solid rgba(38,38,38,0.3);
            padding: 0 !important;
          }
          
          .leaderboard-table {
            min-width: 700px; /* Force minimum width to trigger scroll on small screens */
          }
          
          .leaderboard-table th,
          .leaderboard-table td {
            padding: 12px 16px;
            font-size: 12px;
          }
          
          .rank-cell {
            width: 40px;
            font-size: 14px !important;
          }
          
          .winrate-badge {
             font-size: 13px;
          }
        }
      `}</style>

      <div className="page-wrapper">
        {/* Header */}
        <div className="header">
          <div className="sys-status">
            <span className="live-dot" />
            DATALINK: ACTIVE // BTC 15-MIN
          </div>
          <h1>Polymarket Leaderboard</h1>
          <p className="header-sub">
            Track top tier operators across BTC prediction markets. Automatic synchronization every 15 cycles.
          </p>
        </div>

        {/* Stats bar */}
        <div className="stats-bar">
          <BracketBox className="hud-stat">
            <span className="label">Active Operators (24H)</span>
            <span className="value">{data24h.length}</span>
          </BracketBox>
          <BracketBox className="hud-stat">
            <span className="label">Global Directory</span>
            <span className="value">{dataOverall.length}</span>
          </BracketBox>
          <BracketBox className="hud-stat">
            <span className="label">Peak Win Rate</span>
            <span className="value">
              {data24h.length > 0 ? `${(data24h[0]?.win_rate || 0).toFixed(1)}%` : "—"}
            </span>
          </BracketBox>
        </div>

        {/* Controls */}
        <div className="controls-row">
          {lastRefresh && (
            <span className="refresh-info">
              SYNCED {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button className="refresh-btn" onClick={fetchAll}>
            [ FORCE SYNC ]
          </button>
        </div>

        {/* Tabs */}
        <div className="tabs">
          <button
            className={`tab-btn ${activeTab === "24h" ? "active" : ""}`}
            onClick={() => setActiveTab("24h")}
          >
            [ LAST 24H ]
          </button>
          <button
            className={`tab-btn ${activeTab === "overall" ? "active" : ""}`}
            onClick={() => setActiveTab("overall")}
          >
            [ ALL-TIME ]
          </button>
        </div>

        {/* Data View */}
        {activeTab === "24h" && <LeaderboardTable data={data24h} loading={loading24h} />}
        {activeTab === "overall" && <LeaderboardTable data={dataOverall} loading={loadingOverall} />}
      </div>
    </>
  );
}
