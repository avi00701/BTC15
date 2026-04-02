async function discover() {
  const ids = [
    "0x533e57ca632e9d3f905fa1e91102f3ccff9f4fc793c1c41e15863efa2d41fc08",
    "0x8e61cdf2b455ae1d826cf46ac26c12c2e72e733fbe64063426df5bc9fb11679c"
  ];
  for (const cid of ids) {
    const clobRes = await fetch(`https://clob.polymarket.com/markets/${cid}`);
    const clobData = await clobRes.json();
    console.log(`CID: ${cid} | CLOB Question: ${clobData.question}`);
    console.log(`Tags: ${JSON.stringify(clobData.tags)}`);
  }
}
discover();
