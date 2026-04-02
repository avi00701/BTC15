async function checkBucket() {
  const bucketId = "10192";
  console.log(`Searching for markets in BTC 15m Bucket: ${bucketId}`);
  const res = await fetch(`https://gamma-api.polymarket.com/markets?tagId=${bucketId}&active=true&limit=50`);
  const data = await res.json();
  if (data.length > 0) {
    console.log(`Found ${data.length} markets in bucket:`);
    data.slice(0, 5).forEach(m => {
       console.log(`- Slug: ${m.slug}`);
       console.log(`  Question: ${m.question}`);
    });
  } else {
    // Try without active=true
    const resAll = await fetch(`https://gamma-api.polymarket.com/markets?tagId=${bucketId}&limit=50`);
    const dataAll = await resAll.json();
    console.log(`Found ${dataAll.length} TOTAL markets in bucket (active or inactive).`);
    if (dataAll.length > 0) {
       dataAll.slice(0, 5).forEach(m => console.log(`- Slug: ${m.slug} (Active: ${m.active})`));
    }
  }
}
checkBucket();
