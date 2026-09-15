import { Pool, types } from "pg";
import type { PoolClient } from "pg";
import type { Database, Statement } from "./types";

function safeInteger(value: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new RangeError("Database integer exceeds JavaScript's safe range");
  return number;
}

types.setTypeParser(20, safeInteger);

export function placeholders(sql: string): string {
  let index = 0;
  return sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|\?/g, (token) =>
    token === "?" ? `$${++index}` : token,
  );
}

class PgStatement implements Statement {
  constructor(readonly pool: Pool, readonly sql: string, readonly values: unknown[] = []) {}
  bind(...values: unknown[]): Statement { return new PgStatement(this.pool, this.sql, values); }
  async first<T>(): Promise<T | null> {
    const result = await this.pool.query(this.sql, this.values);
    return (result.rows[0] as T) ?? null;
  }
  async all<T>(): Promise<{ results: T[] }> {
    return { results: (await this.pool.query(this.sql, this.values)).rows as T[] };
  }
  async run(client: Pool | PoolClient = this.pool) {
    const result = await client.query(this.sql, this.values);
    return { meta: { changes: result.rowCount ?? 0 } };
  }
}

export class PostgresDatabase implements Database {
  constructor(readonly pool: Pool) {}
  prepare(sql: string): Statement { return new PgStatement(this.pool, placeholders(sql)); }
  async batch(statements: Statement[]) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const results = [];
      for (const statement of statements) {
        if (!(statement instanceof PgStatement) || statement.pool !== this.pool) throw new Error("Foreign database statement");
        results.push(await statement.run(client));
      }
      await client.query("COMMIT");
      return results;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }
}
