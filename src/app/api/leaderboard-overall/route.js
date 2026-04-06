import { createClient } from "@supabase/supabase-js";

// Rate limiting middleware
const rateLimit = {};

function checkRateLimit(ip) {
  const now = Date.now();
  if (!rateLimit[ip]) rateLimit[ip] = [];
  
  rateLimit[ip] = rateLimit[ip].filter(t => now - t < 60000);

  if (rateLimit[ip].length > 30) {
    throw new Error("Too many requests");
  }

  rateLimit[ip].push(now);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function GET(request) {
  try {
    // Basic IP extraction for Next.js App Router (may be forwarded by Vercel)
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    checkRateLimit(ip);
  } catch (error) {
    return new Response(JSON.stringify({ error: "Too many requests" }), { 
      status: 429,
      headers: { "Content-Type": "application/json" }
    });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "btc_15m";

  const { data, error } = await supabase
    .from("leaderboard_stats")
    .select("wallet, wins, total_trades, win_rate, last_updated")
    .eq("market_type", type)
    .gte("total_trades", 5)
    .order("score", { ascending: false })
    .limit(100);

  if (error) {
    console.error(`[API Overall] Query error: ${error.message}`);
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
