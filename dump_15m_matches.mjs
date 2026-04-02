async function dumpMatch() {
  const res = await fetch("https://gamma-api.polymarket.com/markets?active=true&limit=1000");
  const data = await res.json();
  const forcedMatch = data.filter(m => m.slug?.includes("btc") && m.slug?.includes("15"));
  console.log(JSON.stringify(forcedMatch, null, 2));
}
dumpMatch();
