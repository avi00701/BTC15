async function find15m() {
  console.log("Searching for 15m BTC markets...");
  const res = await fetch("https://gamma-api.polymarket.com/markets?active=true&limit=100");
  const data = await res.json();
  const btc15 = data.filter(m => 
    m.question?.toLowerCase().includes("15 minute") || 
    m.slug?.toLowerCase().includes("15-minute") ||
    m.slug?.toLowerCase().includes("15m")
  );
  
  if (btc15.length > 0) {
    console.log(`Found ${btc15.length} potential 15m markets:`);
    btc15.forEach(m => {
      console.log(`- Slug: ${m.slug}`);
      console.log(`  Question: ${m.question}`);
      console.log(`  ID: ${m.id}`);
    });
  } else {
    console.log("No 15m markets found in active list.");
  }
}
find15m();
