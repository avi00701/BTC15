async function testTokenTrades() {
  const tokenId = "331965... (Wait, this is wrong format)";
  // Let's get a real token ID from discover_specific's output earlier
  // One was "349318994378374305273575517523029162492540860... (hex? or int?)"
  const url = `https://clob.polymarket.com/trades?asset_id=349318994378374305273575517523029162492540860`; // asset_id is the token hash
  
  console.log(`Testing Assets Trades: ${url}`);
  const r = await fetch(url);
  const data = await r.json();
  console.log("Trades found:", data.length || 0);
  if (data.error) console.log("Error:", data.error);
}
testTokenTrades();
