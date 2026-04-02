async function discover() {
  const res = await fetch("https://gamma-api.polymarket.com/markets?active=true&limit=500");
  const data = await res.json();
  // Filter for ANY BTC market and look for 5 minute or 15 minute in queston
  const btc = data.filter(m => {
    const q = (m.question || "").toLowerCase();
    return q.includes("bitcoin") && (q.includes("5 minute") || q.includes("15 minute"));
  });
  console.log("5m/15m BTC Markets found:", btc.length);
  btc.forEach(m => {
    console.log(`ID: ${m.id} [${m.conditionId}] | Slug: ${m.slug} | Question: ${m.question}`);
  });
}
discover();
