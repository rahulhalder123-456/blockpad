/* a private local DHT so sharing tests need no internet: node tools/testnet.js <out.json> */
const createTestnet = require('hyperdht/testnet');
(async () => {
  const t = await createTestnet(3);
  require('fs').writeFileSync(process.argv[2], JSON.stringify({ bootstrap: t.bootstrap.map((b) => b.host + ':' + b.port) }));
  console.log('testnet up', t.bootstrap);
  setInterval(() => {}, 1 << 30);
})();
