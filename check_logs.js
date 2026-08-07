const { MongoClient } = require('mongodb');
async function run() {
  const client = new MongoClient("mongodb://127.0.0.1:27017");
  await client.connect();
  const db = client.db("solar_db");
  const logs = await db.collection("manualLogs").find().sort({timestamp: -1}).limit(5).toArray();
  console.log(JSON.stringify(logs, null, 2));
  process.exit(0);
}
run();
