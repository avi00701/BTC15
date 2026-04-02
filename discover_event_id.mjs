async function discover() {
  const slug = "btc-updown-5m-1775147100";
  const r = await fetch(`https://gamma-api.polymarket.com/markets?slug=${slug}`);
  const data = await r.json();
  if (data && data[0]) {
    const m = data[0];
    console.log("Gamma Market ID:", m.id);
    console.log("Gamma Event Obj ID:", m.event?.id);
    console.log("Gamma Event ID (Top Level):", m.eventId);
  }
}
discover();
