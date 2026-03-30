import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function getLeaderboardData() {
  const { data, error } = await supabase
    .from("users_stats")
    .select("*")
    .order("wins", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Database error:", error.message);
    return [];
  }

  return data || [];
}
