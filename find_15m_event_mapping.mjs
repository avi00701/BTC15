async function findEventId() {
  const slug = "btc-updown-15m-1775128500";
  console.log(`Checking market: ${slug}`);
  const res = await fetch(`https://gamma-api.polymarket.com/markets?slug=${slug}`);
  const data = await res.json();
  if (data[0]) {
    const m = data[0];
    console.log("Gamma ID:", m.id);
    console.log("Group ID:", m.group?.id || "None");
    console.log("Parent ID:", m.parentId || "None");
    // Some markets have 'id' as the eventId in certain endpoints.
    // Let's check for any other numeric fields.
    console.log("All numeric fields:");
    for (const [k, v] of Object.entries(m)) {
       if (typeof v === 'number' && v > 10000) console.log(`${k}: ${v}`);
    }
  }
}
findEventId();
