async function checkSample() {
  const eventId = "331442"; // From my previous output
  const res = await fetch(`https://data-api.polymarket.com/trades?eventId=${eventId}&limit=1&filterType=CASH`, {
    headers: { "origin": "https://polymarket.com", "referer": "https://polymarket.com/" }
  });
  const data = await res.json();
  if (data[0]) {
    console.log("Sample Trade Raw:", JSON.stringify(data[0], null, 2));
    const t = data[0];
    const ts = t.timestamp || t.time;
    console.log("Timestamp raw:", ts, "Type:", typeof ts);
    try {
      console.log("ISO Date:", new Date(parseInt(ts)).toISOString());
    } catch(e) { console.log("Date Error:", e.message); }
  }
}
checkSample();
