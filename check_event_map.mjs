async function checkEventMap() {
  const slug = "btc-updown-15m-1775128500";
  console.log(`Checking /events?slug=${slug}`);
  const r = await fetch(`https://gamma-api.polymarket.com/events?slug=${slug}`);
  const d = await r.json();
  if (d && d[0]) {
    console.log("Event ID found:", d[0].id);
    console.log("Event Metadata:", JSON.stringify(d[0], null, 2));
  } else {
    // Try market id as parent
    console.log("No event found by slug.");
  }
}
checkEventMap();
