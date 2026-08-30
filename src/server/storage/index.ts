import { LocalFileSystemStorage } from "./local-fs";
import { StorageError, type StorageAdapter, type StorageDriverName } from "./types";

export { LocalFileSystemStorage };
export { StorageError, assertValidKey } from "./types";
export type { StorageAdapter, StorageDriverName } from "./types";

/**
 * Factory: resolves the configured storage driver.
 *
 * Supported today: `local` (filesystem). Later, `s3` / `vercel-blob` drivers can
 * be registered here without touching any consuming code.
 */
export function createStorage(driver?: string): StorageAdapter {
  const name = (driver ?? process.env.STORAGE_DRIVER ?? "local").toLowerCase();
  switch (name satisfies StorageDriverName as StorageDriverName) {
    case "local":
      return new LocalFileSystemStorage();
    default:
      throw new StorageError(
        `Unsupported storage driver "${name}"`,
        "UNSUPPORTED_DRIVER",
      );
  }
}

/** Process-wide singleton (drivers are stateless, so this is safe). */
export const storage: StorageAdapter = createStorage();
