export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<{ meta: { changes: number } }[]>;
}

export interface FileStore {
  put(key: string, body: ReadableStream<Uint8Array>, options: { httpMetadata: { contentType: string } }): Promise<void>;
  get(key: string): Promise<{
    body: ReadableStream<Uint8Array>;
    httpEtag: string;
    writeHttpMetadata(headers: Headers): void;
  } | null>;
  delete(key: string): Promise<void>;
}

export interface Env {
  DB: Database;
  BUCKET: FileStore;
  ADMIN_SECRET: string;
  PUBLIC_ORIGIN?: string;
  CLIENT_IP?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY_JWK?: string;
  VAPID_SUBJECT?: string;
}

export interface Vars {
  workspaceId: string;
  sessionId: string;
}

export type AppEnv = { Bindings: Env; Variables: Vars };

export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
