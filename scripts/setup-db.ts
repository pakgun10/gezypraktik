import mysql from "mysql2/promise";

/**
 * Menyiapkan database + user MariaDB GezyPraktik.
 * Dijalankan sebagai root OS (otentikasi unix_socket MariaDB):
 *   bun scripts/setup-db.ts
 * Membaca DB_USER / DB_PASSWORD / DB_NAME / TEST_DB_NAME dari .env
 * (Bun memuat .env otomatis). Membuat database dev + test dan user
 * aplikasi dengan hak penuh atas keduanya. TIDAK membuat user root baru.
 * Di VM ini MariaDB-nya instalasi manual — pastikan mariadbd sudah jalan
 * (lihat README bagian "MariaDB lokal").
 */
const dbUser = process.env.DB_USER ?? "gezypraktik";
const dbPassword = process.env.DB_PASSWORD ?? "";
const dbName = process.env.DB_NAME ?? "gezypraktik";
const testDbName = process.env.TEST_DB_NAME ?? "gezypraktik_test";

if (!dbPassword) {
  console.error("DB_PASSWORD kosong. Isi dulu di .env (lihat .env.example).");
  process.exit(1);
}

const root = await mysql.createConnection({
  socketPath: "/run/mysqld/mysqld.sock",
  user: "root",
});

const q = async (sql: string) => {
  console.log(">", sql);
  await root.query(sql);
};

const pw = dbPassword.replace(/'/g, "''");
await q(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
await q(`CREATE DATABASE IF NOT EXISTS \`${testDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
await q(`CREATE USER IF NOT EXISTS '${dbUser}'@'127.0.0.1' IDENTIFIED BY '${pw}'`);
await q(`CREATE USER IF NOT EXISTS '${dbUser}'@'localhost' IDENTIFIED BY '${pw}'`);
await q(`GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'127.0.0.1'`);
await q(`GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'localhost'`);
await q(`GRANT ALL PRIVILEGES ON \`${testDbName}\`.* TO '${dbUser}'@'127.0.0.1'`);
await q(`GRANT ALL PRIVILEGES ON \`${testDbName}\`.* TO '${dbUser}'@'localhost'`);
await q("FLUSH PRIVILEGES");
await root.end();

console.log("\nSelesai.");
console.log(`  DB_USER=${dbUser}`);
console.log("  DB_PASSWORD=<isi .env>");
console.log(`  DB_NAME=${dbName}`);
console.log(`  TEST_DB_NAME=${testDbName}`);
