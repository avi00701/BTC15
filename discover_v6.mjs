async function discover() {
  const mid = "0x2d661daedd5b298267b6c425f1dd0f5f4d7d6dbcc24c5b63e94b88350654462f";
  const r = await fetch(`https://clob.polymarket.com/markets/${mid}`);
  const data = await r.json();
  console.log("Event ID:", data.event_id || "NOT FOUND");
  // Also check clob search
  const searchRes = await fetch("https://clob.polymarket.com/search?query=BTC%20Price%20Prediction");
  const sData = await searchRes.json();
  console.log("Search Results:", sData.length);
  sData.slice(0, 5).forEach(s => console.log(`Title: ${s.title} | CID: ${s.condition_id}`));
}
discover();
