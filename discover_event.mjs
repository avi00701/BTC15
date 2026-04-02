async function discover() {
  // Use the verified slug from the subagent
  const slug = "btc-updown-5m-1775147100";
  const r = await fetch(`https://gamma-api.polymarket.com/markets?slug=${slug}`);
  const data = await r.json();
  if (data && data[0]) {
    console.log("Market ID:", data[0].id);
    console.log("Condition ID:", data[0].conditionId);
    console.log("Group ID (Event ID):", data[0].group_id);
    console.log("Tags:", JSON.stringify(data[0].tags));
  } else {
    console.log("Slug not found in Gamma.");
  }
}
discover();
