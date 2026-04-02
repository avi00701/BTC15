async function testDataApi() {
  // Use a sample event ID found from previous discovery
  // Gamma ID for btc-updown-5m-1775147100 was 1817967
  const eventId = "1817967"; 
  const url = `https://data-api.polymarket.com/trades?eventId=${eventId}&limit=20&filterType=CASH`;
  
  console.log(`Testing Data API: ${url}`);
  const r = await fetch(url, {
    headers: {
      "origin": "https://polymarket.com",
      "referer": "https://polymarket.com/"
    }
  });
  
  if (!r.ok) {
    console.log(`Error: ${r.status} ${r.statusText}`);
    const text = await r.text();
    console.log(text);
    return;
  }
  
  const data = await r.json();
  console.log("Trades found:", data.length);
  if (data.length > 0) {
    console.log("Sample Trade:", JSON.stringify(data[0], null, 2));
  }
}
testDataApi();
