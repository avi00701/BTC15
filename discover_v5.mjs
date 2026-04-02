async function discover() {
  const res = await fetch("https://gamma-api.polymarket.com/markets?active=true&limit=500");
  const data = await res.json();
  const matched = data.filter(m => (m.slug || "").includes("minute") || (m.question || "").toLowerCase().includes("minute"));
  console.log(`Found ${matched.length} 'minute' markets.`);
  matched.forEach(m => {
    console.log(`- ID: ${m.id} | Slug: ${m.slug} | Question: ${m.question}`);
  });
}
discover();
