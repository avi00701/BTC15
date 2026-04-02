import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "btc_15m";

  // Use the RPC for DB-level aggregation & performance
  const { data, error } = await supabase.rpc("get_24h_leaderboard", { m_type: type });

  if (error) {
    console.error(`[API 24h] Query error: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify(data || []), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "s-maxage=60, stale-while-revalidate=120"
    }
  });
}
