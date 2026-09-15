import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { FileStore } from "./types";

export class LocalFileStore implements FileStore {
  readonly root: string;
  constructor(root: string) { this.root = resolve(root); }
  private path(key: string): string {
    if (!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(key)) throw new Error("Invalid storage key");
    return join(this.root, createHash("sha256").update(key).digest("hex"));
  }
  async put(key: string, body: ReadableStream<Uint8Array>, options: { httpMetadata: { contentType: string } }): Promise<void> {
    const target = this.path(key);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const temporary = join(this.root, `.upload-${randomUUID()}`);
    await mkdir(temporary, { mode: 0o700 });
    try {
      const hash = createHash("sha256");
      const digest = new Transform({ transform(chunk, _encoding, callback) { hash.update(chunk); callback(null, chunk); } });
      await pipeline(Readable.fromWeb(body as import("node:stream/web").ReadableStream<Uint8Array>), digest, createWriteStream(join(temporary, "body"), { flags: "wx", mode: 0o600 }));
      await writeFile(join(temporary, "metadata.json"), JSON.stringify({ contentType: options.httpMetadata.contentType, etag: `"${hash.digest("hex")}"` }), { mode: 0o600 });
      await rename(temporary, target);
    } finally { await rm(temporary, { recursive: true, force: true }); }
  }
  async get(key: string) {
    const target = this.path(key);
    try {
      const metadata = JSON.parse(await readFile(join(target, "metadata.json"), "utf8")) as { contentType: string; etag: string };
      const info = await stat(join(target, "body"));
      return {
        body: Readable.toWeb(createReadStream(join(target, "body"))) as ReadableStream<Uint8Array>,
        httpEtag: metadata.etag,
        writeHttpMetadata(headers: Headers) {
          headers.set("Content-Type", metadata.contentType);
          headers.set("Content-Length", String(info.size));
        },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
  async delete(key: string): Promise<void> { await rm(this.path(key), { recursive: true, force: true }); }
}
