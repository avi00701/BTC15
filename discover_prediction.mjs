async function discover() {
  const now = Math.floor(Date.now() / 1000);
  const startOfWindow = now - (1 * 60 * 60); // Check last 1 hour
  
  const slugs = [];
  // 5 minute intervals (300 seconds)
  for (let t = Math.floor(now / 300) * 300; t >= startOfWindow; t -= 300) {
    slugs.push(`btc-updown-5m-${t}`);
  }
  // 15 minute intervals (900 seconds)
  for (let t = Math.floor(now / 900) * 900; t >= startOfWindow; t -= 900) {
    slugs.push(`btc-updown-15m-${t}`);
  }

  console.log(`Testing ${slugs.length} predicted slugs...`);
  const found = [];
  for (const slug of slugs) {
    const r = await fetch(`https://gamma-api.polymarket.com/markets?slug=${slug}`);
    const d = await r.json();
    if (d && d[0]) {
      found.push({ slug: d[0].slug, cid: d[0].conditionId });
    }
  }
  console.log(`Found ${found.length} valid markets via prediction.`);
  found.forEach(f => console.log(`- ${f.slug} | ${f.cid}`));
}
discover();
