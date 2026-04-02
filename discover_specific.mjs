async function discover() {
  const mid = "0x2d661daedd5b298267b6c425f1dd0f5f4d7d6dbcc24c5b63e94b88350654462f";
  const r = await fetch(`https://clob.polymarket.com/markets/${mid}`);
  const data = await r.json();
  console.log("Market Details for 0x2d66...:", JSON.stringify(data, null, 2));
}
discover();
