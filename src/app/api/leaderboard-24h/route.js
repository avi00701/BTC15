import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "btc_15m";
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Query users_stats filtered by last_updated in the past 24 hours
  const { data, error } = await supabase
    .from("users_stats")
    .select("wallet, wins, total_trades, win_rate, last_updated")
    .eq("market_type", type)
    .gte("last_updated", last24h)
    .order("wins", { ascending: false })
    .limit(50);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data || []);
}
