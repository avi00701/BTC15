async function discover() {
  const q = "bitcoin-price-prediction";
  const r = await fetch(`https://gamma-api.polymarket.com/events?slug=${q}`);
  const d = await r.json();
  if (d && d.length > 0) {
    console.log("Event Name:", d[0].title);
    console.log("ID:", d[0].id);
    if (d[0].markets) console.log("Markets count:", d[0].markets.length);
    d[0].markets?.slice(0, 5).forEach(m => console.log(`Slug: ${m.slug} | CID: ${m.conditionId}`));
  } else {
    console.log("Event slug not found.");
  }
}
discover();
