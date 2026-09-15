import { readFile } from "node:fs/promises";
import type { Pool } from "pg";

export async function initializeSchema(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(73462101)");
    await client.query(await readFile("migrations/0001_initial.sql", "utf8"));
    await client.query(await readFile("migrations/0002_tasks_resource.postgres.sql", "utf8"));
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
