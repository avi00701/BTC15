async function discover() {
  const gammaId = "1817967"; // A known market id
  const r = await fetch(`https://gamma-api.polymarket.com/markets/${gammaId}`);
  const d = await r.json();
  console.log("Gamma Market object keys:", Object.keys(d));
  // Look for any 6-digit number in the values
  for (const [k, v] of Object.entries(d)) {
    if (typeof v === "number" && v > 100000 && v < 999999) {
      console.log(`Potential EventID found: ${k} = ${v}`);
    }
  }
}
discover();
