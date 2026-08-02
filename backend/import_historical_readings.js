"use strict";

// One-time, idempotent import of confirmed physical meter readings supplied on
// 1 Aug 2026. Run on the VM with MONGO_URI / MONGO_DB from its environment.
const { MongoClient } = require("mongodb");

const toTimestamp = (day, hour, minute) => Date.parse(`2026-07-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+05:00`);
const readings = [
  ["meter1", 59545.9, 28, 7, 51], ["meter1", 59546.1, 28, 12, 27], ["meter1", 59547.3, 28, 19, 34],
  ["meter1", 59547.9, 28, 22, 37], ["meter1", 59547.9, 29, 5, 25], ["meter1", 59549.1, 29, 13, 43],
  ["meter1", 59549.4, 29, 19, 5], ["meter1", 59551.0, 29, 23, 46], ["meter1", 59552.2, 30, 16, 59],
  ["meter1", 59553.0, 30, 21, 36], ["meter1", 59553.0, 31, 13, 0],
  ["meter2", 15060.8, 25, 0, 29], ["meter2", 15060.8, 28, 9, 3], ["meter2", 15060.8, 28, 12, 28],
  ["meter2", 15061.0, 28, 22, 37], ["meter2", 15067.3, 29, 5, 17], ["meter2", 15067.6, 29, 20, 1],
  ["meter2", 15067.6, 29, 23, 47], ["meter2", 15072.0, 30, 17, 0], ["meter2", 15072.0, 30, 21, 36],
  ["meter2", 15078.8, 31, 13, 0],
].map(([meterId, reading, day, hour, minute]) => ({
  id: `historical-${meterId}-${toTimestamp(day, hour, minute)}`,
  meterId,
  reading,
  timestamp: toTimestamp(day, hour, minute),
  source: "HISTORICAL_IMPORT",
  notes: "Confirmed physical reading imported 1 Aug 2026",
  anchorAt: toTimestamp(day, hour, minute),
}));

async function main() {
  const client = new MongoClient(process.env.MONGO_URI || "mongodb://localhost:27017");
  await client.connect();
  try {
    const db = client.db(process.env.MONGO_DB || "ont_monitor");
    const logs = db.collection("solar_manual_logs");
    const stateCollection = db.collection("solar_engine_state");
    await logs.bulkWrite(readings.map((reading) => ({ updateOne: { filter: { id: reading.id }, update: { $set: reading }, upsert: true } })));

    const state = await stateCollection.findOne({ _id: "primary" });
    if (!state) throw new Error("Solar engine state does not exist. Start the API once, then import.");
    const cycleStart = Date.parse("2026-07-28T12:00:00+05:00");
    state.meters.meter1.cycleBaselineReading = 59546.1;
    state.meters.meter1.cycleBaselineAt = cycleStart;
    state.meters.meter1.anchorReading = 59553.0;
    state.meters.meter1.anchorAt = toTimestamp(31, 13, 0);
    state.meters.meter2.cycleBaselineReading = 15060.8;
    state.meters.meter2.cycleBaselineAt = cycleStart;
    state.meters.meter2.anchorReading = 15078.8;
    state.meters.meter2.anchorAt = toTimestamp(31, 13, 0);
    state.updatedAt = Date.now();
    await stateCollection.replaceOne({ _id: "primary" }, state);
    console.log(`Imported ${readings.length} confirmed readings and applied 28 July baselines.`);
  } finally {
    await client.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
