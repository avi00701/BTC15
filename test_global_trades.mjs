async function testGlobal() {
  const r = await fetch("https://clob.polymarket.com/trades?limit=5");
  const d = await r.json();
  console.log("Global Trades:", d);
}
testGlobal();
