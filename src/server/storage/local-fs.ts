import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { assertValidKey, type StorageAdapter, StorageError } from "./types";

/**
 * Filesystem-backed storage driver. Objects live under a single root directory
 * (default `storage/`), keyed by sanitized relative paths.
 */
export class LocalFileSystemStorage implements StorageAdapter {
  readonly driver = "local";
  private readonly root: string;

  constructor(root = process.env.STORAGE_LOCAL_ROOT ?? "storage") {
    this.root = resolve(process.cwd(), root);
  }

  private path(key: string): string {
    assertValidKey(key);
    const path = join(this.root, key);
    if (!path.startsWith(this.root)) {
      throw new StorageError(`Invalid storage key: ${key}`, "INVALID_KEY");
    }
    return path;
  }

  async put(key: string, data: Uint8Array | string): Promise<void> {
    const path = this.path(key);
    try {
      await mkdir(dirname(path), { recursive: true });
      const payload = typeof data === "string" ? new TextEncoder().encode(data) : data;
      await writeFile(path, payload);
    } catch (error) {
      throw new StorageError(`Failed to write object "${key}": ${String(error)}`, "WRITE_FAILED");
    }
  }

  async get(key: string): Promise<Uint8Array | null> {
    const path = this.path(key);
    try {
      return await readFile(path);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return null;
      }
      throw new StorageError(`Failed to read object "${key}": ${String(error)}`, "READ_FAILED");
    }
  }

  async delete(key: string): Promise<void> {
    const path = this.path(key);
    try {
      await rm(path, { force: true });
    } catch (error) {
      throw new StorageError(`Failed to delete object "${key}": ${String(error)}`, "DELETE_FAILED");
    }
  }

  async exists(key: string): Promise<boolean> {
    const path = this.path(key);
    try {
      const info = await stat(path);
      return info.isFile();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return false;
      }
      throw new StorageError(`Failed to stat object "${key}": ${String(error)}`, "READ_FAILED");
    }
  }
}
