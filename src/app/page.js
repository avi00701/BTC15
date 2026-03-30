import { getLeaderboardData } from "@/lib/db";
import { Trophy, TrendingUp, User as UserIcon, Activity, ExternalLink } from "lucide-react";

function getProfileLink(wallet) {
  return `https://polymarket.com/profile/${wallet}`;
}

function shortWallet(addr) {
  if (!addr) return "Unknown";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

export default async function Page() {
  const data = await getLeaderboardData();

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white selection:bg-yellow-500/30">
      {/* Background Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full" />
        <div className="absolute top-[20%] -right-[10%] w-[30%] h-[30%] bg-purple-500/10 blur-[100px] rounded-full" />
      </div>

      <main className="relative z-10 max-w-5xl mx-auto px-6 py-12">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-2 bg-gradient-to-r from-white via-white to-zinc-500 bg-clip-text text-transparent">
              BTC 15m Leaderboard
            </h1>
            <p className="text-zinc-400 text-lg">
              Top traders on Polymarket's Bitcoin 15-minute intervals.
            </p>
          </div>
          <div className="flex items-center gap-3 bg-zinc-900/50 border border-zinc-800 p-4 rounded-2xl backdrop-blur-md">
            <Activity className="text-green-500 w-5 h-5" />
            <div>
              <p className="text-xs text-zinc-500 uppercase font-semibold">Active Traders</p>
              <p className="text-xl font-mono font-bold">{data.length}</p>
            </div>
          </div>
        </div>

        {/* Leaderboard Table Container */}
        <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-3xl overflow-hidden backdrop-blur-xl shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-900/50 border-b border-zinc-800">
                  <th className="px-6 py-5 text-sm font-semibold text-zinc-400">#</th>
                  <th className="px-6 py-5 text-sm font-semibold text-zinc-400">Trader Profile</th>
                  <th className="px-6 py-5 text-sm font-semibold text-zinc-400 text-center">Wins</th>
                  <th className="px-6 py-5 text-sm font-semibold text-zinc-400 text-center">Total Trades</th>
                  <th className="px-6 py-5 text-sm font-semibold text-zinc-400 text-right">Win Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {data.length === 0 ? (
                   <tr>
                    <td colSpan={5} className="px-6 py-20 text-center text-zinc-500 italic">
                      No data found. Please run the update-leaderboard API.
                    </td>
                  </tr>
                ) : (
                  data.map((user, index) => {
                    const isTop3 = index < 3;
                    const rankColors = [
                      "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
                      "text-zinc-300 bg-zinc-300/10 border-zinc-300/20",
                      "text-orange-400 bg-orange-400/10 border-orange-400/20",
                    ];
                    
                    return (
                      <tr 
                        key={user.wallet} 
                        className="group hover:bg-white/[0.02] transition-colors duration-200"
                      >
                        <td className="px-6 py-5">
                          {isTop3 ? (
                            <div className={`w-8 h-8 rounded-full border flex items-center justify-center font-bold ${rankColors[index]}`}>
                              <Trophy className="w-4 h-4 mr-0.5" />
                              <span className="text-xs">{index + 1}</span>
                            </div>
                          ) : (
                            <span className="text-zinc-600 font-mono pl-3">{index + 1}</span>
                          )}
                        </td>

                        <td className="px-6 py-5">
                          <a
                            href={getProfileLink(user.wallet)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 group/link max-w-fit"
                          >
                            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700 group-hover/link:border-blue-500/50 transition-colors">
                              <UserIcon className="w-5 h-5 text-zinc-400 group-hover/link:text-blue-400" />
                            </div>
                            <div className="flex flex-col">
                              <span className="font-medium group-hover/link:text-blue-400 flex items-center gap-1.5 transition-colors">
                                {shortWallet(user.wallet)}
                                <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover/link:opacity-100 transition-opacity" />
                              </span>
                              <span className="text-xs text-zinc-500 font-mono">Polymarket Profile</span>
                            </div>
                          </a>
                        </td>

                        <td className="px-6 py-5 text-center">
                          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span className="font-bold">{user.wins}</span>
                          </div>
                        </td>

                        <td className="px-6 py-5 text-center">
                          <span className="text-zinc-300 font-medium">{user.total_trades}</span>
                        </td>

                        <td className="px-6 py-5 text-right">
                          <div className="flex flex-col items-end">
                            <span className={`text-xl font-bold ${user.win_rate >= 50 ? 'text-white' : 'text-zinc-400'}`}>
                              {user.win_rate.toFixed(2)}%
                            </span>
                            <div className="w-24 h-1 bg-zinc-800 rounded-full mt-2 overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all duration-1000 ${user.win_rate >= 70 ? 'bg-emerald-500' : user.win_rate >= 50 ? 'bg-blue-500' : 'bg-red-500'}`}
                                style={{ width: `${user.win_rate}%` }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          
          {/* Footer Decoration */}
          <div className="p-6 bg-zinc-900/50 border-t border-zinc-800 text-center">
            <p className="text-zinc-500 text-sm">
              Data updates every 15 minutes via <span className="text-zinc-400 font-semibold underline decoration-zinc-700 underline-offset-4">cron-job.org</span>
            </p>
          </div>
        </div>
      </main>

      {/* Footer Branding */}
      <footer className="relative z-10 py-12 text-center">
        <div className="flex items-center justify-center gap-2 text-zinc-500 text-sm">
          <span>Built with</span>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-zinc-900 border border-zinc-800 font-bold text-zinc-400">
            <Activity className="w-3.5 h-3.5" /> Next.js
          </div>
          <span>&</span>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-zinc-900 border border-zinc-800 font-bold text-zinc-400">
             Supabase
          </div>
        </div>
      </footer>
    </div>
  );
}
