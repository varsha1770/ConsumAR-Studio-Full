const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:Varsha%401770@127.0.0.1:5432/ConsumAR_Studio_DB?schema=public' });
client.connect().then(() => {
  return client.query('SELECT * FROM "ARModel" ORDER BY "createdAt" DESC LIMIT 1');
}).then(res => {
  console.log(res.rows[0]);
  process.exit(0);
}).catch(console.error);
