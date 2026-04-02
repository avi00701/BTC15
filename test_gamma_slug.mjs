async function discover() {
  const slug = "btc-updown-5m-1775139000";
  const url = `https://gamma-api.polymarket.com/markets?slug=${slug}`;
  const r = await fetch(url);
  const data = await r.json();
  console.log("Gamma Result for slug:", JSON.stringify(data, null, 2));
}
discover();
