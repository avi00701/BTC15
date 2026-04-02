async function discover() {
  // Try several endpoints to find the elusive 5m/15m markets
  const urls = [
    "https://gamma-api.polymarket.com/markets?active=true&limit=100",
    "https://gamma-api.polymarket.com/markets?limit=100&order=id&ascending=false"
  ];
  
  for (const url of urls) {
    console.log(`--- Fetching: ${url} ---`);
    const res = await fetch(url);
    const data = await res.json();
    const btc = data.filter(m => m.slug?.toLowerCase().includes("btc") || m.question?.toLowerCase().includes("btc") || m.slug?.toLowerCase().includes("bitcoin"));
    console.log("BTC Markets found:", btc.length);
    btc.slice(0, 10).forEach(m => {
      console.log(`ID: ${m.id} | Slug: ${m.slug} | Ques: ${m.question}`);
    });
  }
}
discover();
