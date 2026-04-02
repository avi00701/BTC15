async function discover() {
  const res = await fetch("https://gamma-api.polymarket.com/markets?limit=500&active=true");
  const data = await res.json();
  const btc = data.filter(m => (m.question || "").toLowerCase().includes("bitcoin") || (m.slug || "").toLowerCase().includes("bitcoin"));
  
  console.log(`Found ${btc.length} BTC markets.`);
  btc.slice(0, 50).forEach(m => {
    console.log(`- ID: ${m.id} | Slug: ${m.slug} | Tags: ${JSON.stringify(m.tags)}`);
  });
}
discover();
