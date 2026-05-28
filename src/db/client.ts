import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../config/env.js";
import * as schema from "./schema.js";

export const pool = new Pool({
  connectionString: env.DATABASE_URL
});

export const db = drizzle(pool, { schema });

export async function checkDatabase() {
  const result = await pool.query("select 1 as ok");
  return result.rows[0]?.ok === 1;
}
