import { configFromEnv, runMigrations, closePool } from "../db";

const applied = await runMigrations(configFromEnv());
console.log(
  applied.length > 0
    ? `Migrasi diterapkan: ${applied.join(", ")}`
    : "Tidak ada migrasi baru."
);
await closePool();
process.exit(0);
