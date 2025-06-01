import 'dotenv/config';
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

const pool = new Pool({
    connectionString: process.env.DATABASE_URL!,
    ssl: false
});
const db = drizzle(pool, { schema });

export default db;