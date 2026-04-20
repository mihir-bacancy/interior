import "./ipv4-bootstrap";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

/**
 * DATABASE_URL is validated at request time, not module load, so Vercel's
 * "Collecting page data" build step (which imports API routes without
 * runtime env vars) doesn't crash.
 */
const url = process.env.DATABASE_URL || "postgresql://placeholder:placeholder@localhost:5432/placeholder";
const sql = neon(url);

export const db = drizzle({ client: sql, schema });

export * from "./schema";
