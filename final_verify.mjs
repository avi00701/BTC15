async function verifyFinal() {
  const eventId = "332608"; // Discovered by browser
  const url = `https://data-api.polymarket.com/trades?eventId=${eventId}&limit=50&filterType=CASH`;
  
  console.log(`Final Verification of Trade API: ${url}`);
  const r = await fetch(url, {
    headers: {
      "origin": "https://polymarket.com",
      "referer": "https://polymarket.com/"
    }
  });
  
  if (!r.ok) return console.log(`Failed: ${r.status}`);
  
  const data = await r.json();
  console.log(`Success! Found ${data.length} trades.`);
  if (data.length > 0) {
    console.log("Sample Trade User:", data[0].pseudonym || data[0].proxyWallet);
    console.log("Sample Trade Timestamp:", data[0].timestamp);
  }
}
verifyFinal();
