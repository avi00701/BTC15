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
  if (rate >= 50) return "#2D45D8"; // Blue (Unified)
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
        <p>AWAITING DATA FROM DATALINK // NO ELIGIBLE OPERATORS FOUND</p>
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
              <th>Profile</th>
              <th>Wins</th>
              <th>Total Trade</th>
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
  const [market, setMarket] = useState("btc_15m");

  const fetchAll = useCallback(async () => {
    setLoading24h(true);
    setLoadingOverall(true);

    try {
      const [r24h, rOverall] = await Promise.all([
        fetch(`/api/leaderboard-24h?type=${market}`).then((r) => r.json()).catch(() => []),
        fetch(`/api/leaderboard-overall?type=${market}`).then((r) => r.json()).catch(() => []),
      ]);

      setData24h(Array.isArray(r24h) ? r24h : []);
      setDataOverall(Array.isArray(rOverall) ? rOverall : []);
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading24h(false);
      setLoadingOverall(false);
      setLastRefresh(new Date());
    }
  }, [market]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 60 * 1000 * 5); // 5 mins
    return () => clearInterval(interval);
  }, [fetchAll]);

  const displayData = activeTab === "24h" ? data24h : dataOverall;
  const displayLoading = activeTab === "24h" ? loading24h : loadingOverall;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        /* ── Scrollbars ── */
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: #080808; border-left: 1px solid #1a1a1a; border-top: 1px solid #1a1a1a; }
        ::-webkit-scrollbar-thumb { background: #333333; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #2D45D8; }

        body {
          font-family: 'Space Grotesk', monospace, sans-serif;
          background-color: #000000;
          color: #FFFFFF;
          min-height: 100vh;
          overflow-x: hidden;
          margin: 0;
          padding: 0;
        }

        /* ── CRT & HUD OVERLAYS ── */
        .crt-overlay {
          position: fixed;
          top: 0; left: 0; width: 100vw; height: 100vh;
          background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.1) 50%), 
                      linear-gradient(90deg, rgba(255, 0, 0, 0.02), rgba(0, 255, 0, 0.01), rgba(0, 0, 255, 0.02));
          background-size: 100% 3px, 3px 100%;
          pointer-events: none;
          z-index: 9999;
          opacity: 0.2;
        }
        .vignette {
          position: fixed;
          top: 0; left: 0; width: 100%; height: 100%;
          box-shadow: inset 0 0 12vw rgba(0,0,0,0.9);
          pointer-events: none;
          z-index: 9998;
        }

        .page-wrapper {
          max-width: 1200px;
          margin: 0 auto;
          padding: 48px 24px 80px;
          position: relative;
          background-image: 
            radial-gradient(circle at 50% 50%, rgba(45, 69, 216, 0.05) 0%, transparent 70%),
            linear-gradient(rgba(45, 69, 216, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(45, 69, 216, 0.03) 1px, transparent 1px);
          background-size: 100% 100%, 48px 48px, 48px 48px;
          animation: grid-drift 100s linear infinite;
        }

        @keyframes grid-drift {
          from { background-position: center, 0 0, 0 0; }
          to { background-position: center, 0 1000px, 1000px 0; }
        }

        .header {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          margin-bottom: 32px;
        }

        .title-container {
          position: relative;
          display: inline-block;
          padding: 8px 20px;
          border-radius: 2px;
          background: rgba(0, 0, 0, 0.6);
          border: 1px solid rgba(45, 69, 216, 0.2);
          overflow: hidden;
          margin-top: 12px;
        }
        .laser-trace {
          position: absolute;
          inset: 0px;
          pointer-events: none;
          z-index: 0;
          overflow: hidden;
        }
        .laser-trace::after {
          content: "";
          position: absolute;
          inset: -200%;
          background: conic-gradient(
            from 0deg,
            transparent 0%,
            transparent 20%,
            rgba(45, 69, 216, 1) 25%,
            rgba(16, 185, 129, 1) 27%,
            rgba(45, 69, 216, 1) 30%,
            transparent 35%,
            transparent 100%
          );
          animation: beam-rotate 4s linear infinite;
        }
        @keyframes beam-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .sys-status {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          font-size: 13px;
          font-weight: 800;
          text-transform: uppercase;
          color: #10B981;
          margin-bottom: 20px;
          padding: 10px 20px;
          background: rgba(16, 185, 129, 0.08);
          border: 2px solid rgba(16, 185, 129, 0.4);
          box-shadow: 0 0 15px rgba(16, 185, 129, 0.15);
        }
        .live-dot {
          width: 10px; height: 10px; background: #10B981; border-radius: 50%;
          box-shadow: 0 0 12px #10B981, 0 0 20px rgba(16, 185, 129, 0.6); 
          animation: pulse-green 1s infinite alternate;
        }
        @keyframes pulse-green { 0% { opacity: 1; transform: scale(1); filter: brightness(1.2); } 100% { opacity: 0.7; transform: scale(1.4); filter: brightness(1.5); } }

        .header h1 { font-size: clamp(32px, 5vw, 56px); font-weight: 800; text-transform: uppercase; letter-spacing: -0.04em; margin-bottom: 0; position: relative; z-index: 2; }
        .header-sub { font-size: 14px; color: #737373; max-width: 600px; text-transform: uppercase; letter-spacing: 0.02em; line-height: 1.6; }

        .bracket-box {
          position: relative; padding: 28px; background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(12px);
          border: 1px solid rgba(45, 69, 216, 0.1); transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          z-index: 1;
        }
        .bracket-box:hover { border-color: rgba(45, 69, 216, 0.5); background: rgba(45, 69, 216, 0.04); box-shadow: inset 0 0 20px rgba(45, 69, 216, 0.1); }
        .bracket-box .corner { position: absolute; width: 16px; height: 16px; border: 0 solid #2D45D8; transition: all 0.3s; opacity: 0.4; }
        .bracket-box:hover .corner { opacity: 1; filter: drop-shadow(0 0 5px #2D45D8); }
        .bracket-box .tl { top: -2px; left: -2px; border-top-width: 3px; border-left-width: 3px; }
        .bracket-box .tr { top: -2px; right: -2px; border-top-width: 3px; border-right-width: 3px; }
        .bracket-box .bl { bottom: -2px; left: -2px; border-bottom-width: 3px; border-left-width: 3px; }
        .bracket-box .br { bottom: -2px; right: -2px; border-bottom-width: 3px; border-right-width: 3px; }

        .stats-bar { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 24px; margin-bottom: 48px; }
        .hud-stat { display: flex; flex-direction: column; gap: 12px; }
        .hud-stat .label { font-size: 13px; color: #94A3B8; text-transform: uppercase; font-weight: 800; letter-spacing: 0.2em; margin-bottom: 4px; }
        .hud-stat .value { 
          font-size: 42px; color: #2D45D8; font-weight: 900; 
          text-shadow: 0 0 15px rgba(45, 69, 216, 0.6), 0 0 35px rgba(45, 69, 216, 0.4); 
          letter-spacing: -0.02em;
        }

        .market-tabs { display: flex; gap: 16px; margin-bottom: 32px; flex-wrap: wrap; }
        .market-btn {
          padding: 20px 36px; border: 2px solid #1e1e1e; background: rgba(15, 10, 30, 0.4);
          color: #94A3B8; font-weight: 800; text-transform: uppercase; cursor: pointer; font-family: inherit;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); position: relative; min-width: 200px;
          letter-spacing: 0.05em; font-size: 14px;
        }
        .market-btn.active { 
          color: #FFFFFF; border-color: #2D45D8; 
          background: rgba(45, 69, 216, 0.15); 
          box-shadow: 0 0 20px rgba(45, 69, 216, 0.25), inset 0 0 15px rgba(45, 69, 216, 0.1);
          text-shadow: 0 0 10px rgba(255,255,255,0.3);
        }
        .market-btn:hover:not(.active) { color: #CBD5E1; border-color: #475569; background: rgba(45, 69, 216, 0.05); }

        .controls-row { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
        .tabs { display: flex; gap: 8px; }
        .tab-btn {
          padding: 14px 28px; border: 2px solid #1e1e1e; background: #050505; color: #94A3B8;
          font-size: 14px; font-weight: 800; text-transform: uppercase; cursor: pointer; font-family: inherit; transition: all 0.2s;
          letter-spacing: 0.05em;
        }
        .tab-btn.active { 
          color: #FFFFFF; border-color: #2D45D8; 
          background: rgba(45, 69, 216, 0.2); 
          box-shadow: 0 0 15px rgba(45, 69, 216, 0.2);
        }
        
        .refresh-btn {
          background: transparent; border: 1px solid #262626; color: #2D45D8; font-family: inherit; font-size: 11px;
          font-weight: 700; padding: 10px 20px; cursor: pointer; text-transform: uppercase;
        }
        .refresh-btn:hover { border-color: #2D45D8; background: rgba(45, 69, 216, 0.05); }

        .leaderboard-table { width: 100%; border-collapse: collapse; }
        .leaderboard-table th {
          padding: 24px 28px; text-align: left; font-size: 13px; color: #94A3B8; text-transform: uppercase;
          border-bottom: 2px solid #262626; letter-spacing: 0.12em; font-weight: 900;
        }
        .table-row { border-bottom: 1px solid #1a1a1a; transition: background 0.2s; }
        .table-row:hover { background: rgba(45, 69, 216, 0.08); }
        .leaderboard-table td { padding: 22px 28px; font-size: 16px; color: #F8FAFC; border-bottom: 1px solid #141414; }
        .rank-cell { font-weight: 900; color: #2D45D8 !important; width: 80px; text-shadow: 0 0 10px rgba(45, 69, 216, 0.4); font-size: 18px; }
        .wallet-link { color: #F8FAFC; text-decoration: none; font-weight: 700; display: inline-flex; align-items: center; gap: 8px; transition: all 0.2s; }
        .wallet-link:hover { color: #2D45D8; text-shadow: 0 0 8px rgba(45, 69, 216, 0.5); }
        .wins-badge { 
          font-weight: 900; color: #FFF; font-size: 20px; 
          background: rgba(255,255,255,0.05); padding: 6px 12px; border-radius: 4px;
          border: 1px solid rgba(255,255,255,0.1);
          text-shadow: 0 0 8px rgba(255,255,255,0.2);
        }
        .winrate-badge { font-weight: 900; letter-spacing: 0.02em; }

        .footer-note { font-size: 10px; color: #404040; text-transform: uppercase; letter-spacing: 0.15em; margin-top: 32px; }

        @media (max-width: 768px) {
          .page-wrapper { padding: 24px 16px; }
          .stats-bar { grid-template-columns: 1fr; }
          .controls-row { flex-direction: column; align-items: stretch; }
          .market-btn { width: 100%; }
          .table-scroll-area { overflow-x: auto; }
          .leaderboard-table { min-width: 600px; }
        }
      `}</style>

      <div className="main-hud">
        <div className="crt-overlay" />
        <div className="vignette" />

        <div className="page-wrapper">
          <div className="header">
            <div className="sys-status">
              <span className="live-dot" />
              DATALINK: ACTIVE // {market.replace("_", " ").toUpperCase()} // {activeTab.toUpperCase()}
            </div>
            <div className="title-container" style={{ position: 'relative', background: '#000', overflow: 'hidden' }}>
              <div className="laser-trace" />
              <div style={{ position: 'absolute', inset: '1px', background: '#000', zIndex: 1, borderRadius: '4px' }} />
              <h1 style={{ position: 'relative', zIndex: 2 }}>Polymarket BTC Leaderboard</h1>
            </div>
          </div>

          <div className="market-tabs">
            <button className={`market-btn ${market === "btc_15m" ? "active" : ""}`} onClick={() => setMarket("btc_15m")}>
              BTC 15 MIN
            </button>
            <button className={`market-btn ${market === "btc_5m" ? "active" : ""}`} onClick={() => setMarket("btc_5m")}>
              BTC 5 MIN
            </button>
          </div>

          <div className="stats-bar">
            <BracketBox className="hud-stat">
              <span className="label">Cohort Density ({activeTab})</span>
              <span className="value">{displayData.length}</span>
            </BracketBox>
            <BracketBox className="hud-stat">
              <span className="label">Sync Heartbeat</span>
              <span className="value" style={{ fontSize: '18px', color: '#FFF' }}>
                {lastRefresh ? lastRefresh.toLocaleTimeString() : "PENDING..."}
              </span>
            </BracketBox>
            <BracketBox className="hud-stat">
              <span className="label">Elite Win Rate</span>
              <span className="value" style={{ color: '#10B981' }}>
                {displayData.length > 0 ? `${(displayData[0]?.win_rate || 0).toFixed(1)}%` : "—"}
              </span>
            </BracketBox>
          </div>

          <div className="controls-row">
            <div className="tabs">
              <button className={`tab-btn ${activeTab === "24h" ? "active" : ""}`} onClick={() => setActiveTab("24h")}>
                24H DYNAMIC
              </button>
              <button className={`tab-btn ${activeTab === "overall" ? "active" : ""}`} onClick={() => setActiveTab("overall")}>
                ALL-TIME STATS
              </button>
            </div>
            <button className="refresh-btn" onClick={fetchAll}>
              {loading24h || loadingOverall ? "[ SCANNING... ]" : "[ FORCE REFRESH ]"}
            </button>
          </div>

          <LeaderboardTable data={displayData} loading={displayLoading} />

          <div className="footer-note">
            * RANKING ENFORCED VIA WEIGHTED LOGARITHMIC SCORING. MINIMUM 5 TOTAL TRADES REQUIRED FOR REGISTRY.
          </div>
        </div>
      </div>
    </>
  );
}
