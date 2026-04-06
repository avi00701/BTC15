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

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    console.error(`[API 24h] Missing environment variables. url=${!!url}, anonKey=${!!anonKey}`);
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  const supabase = createClient(url, anonKey);

  try {
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
