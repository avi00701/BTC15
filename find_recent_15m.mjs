async function findRecent15m() {
  console.log("Searching for recently resolved 15m BTC markets...");
  // Search without active=true, looking for resolved markets
  const res = await fetch("https://gamma-api.polymarket.com/markets?limit=100");
  const data = await res.json();
  const btc15 = data.filter(m => 
    (m.question?.toLowerCase().includes("15 minute") || 
     m.slug?.toLowerCase().includes("15-minute") ||
     m.slug?.toLowerCase().includes("15m")) &&
     m.question?.toLowerCase().includes("bitcoin")
  );
  
  if (btc15.length > 0) {
    console.log(`Found ${btc15.length} markets:`);
    btc15.slice(0, 10).forEach(m => {
       console.log(`- Slug: ${m.slug}`);
       console.log(`  Question: ${m.question}`);
       console.log(`  Active: ${m.active}, Resolved: ${m.closed}`);
    });
  } else {
    // Try specifically for the btc-updown pattern but 15m
    const res2 = await fetch("https://gamma-api.polymarket.com/markets?active=true&limit=1000");
    const data2 = await res2.json();
    const forcedMatch = data2.filter(m => m.slug?.includes("btc") && m.slug?.includes("15"));
    console.log(`Forced match found ${forcedMatch.length} markets.`);
    forcedMatch.slice(0, 5).forEach(m => console.log(`- Slug: ${m.slug}`));
  }
}
findRecent15m();
