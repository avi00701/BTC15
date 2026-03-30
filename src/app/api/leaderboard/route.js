import { getLeaderboardData } from "@/lib/db";

export async function GET() {
  const data = await getLeaderboardData();
  return Response.json(data);
}
