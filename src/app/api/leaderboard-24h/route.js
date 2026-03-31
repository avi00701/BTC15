import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET() {
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("trades")
    .select("wallet, is_win, timestamp")
    .gte("timestamp", last24h)
    .order("timestamp", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return Response.json([]);
  }

  // Aggregate per wallet
  const users = {};
  data.forEach((t) => {
    if (!users[t.wallet]) {
      users[t.wallet] = { wins: 0, total_trades: 0, last_updated: t.timestamp };
    }
    users[t.wallet].total_trades++;
    if (t.is_win) users[t.wallet].wins++;
    if (new Date(t.timestamp) > new Date(users[t.wallet].last_updated)) {
      users[t.wallet].last_updated = t.timestamp;
    }
  });

  const leaderboard = Object.entries(users)
    .map(([wallet, d]) => ({
      wallet,
      wins: d.wins,
      total_trades: d.total_trades,
      win_rate: d.total_trades > 0 ? (d.wins / d.total_trades) * 100 : 0,
      last_updated: d.last_updated,
    }))
    .sort((a, b) => b.wins - a.wins)
    .slice(0, 50);

  return Response.json(leaderboard);
}
