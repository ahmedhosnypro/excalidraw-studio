/**
 * Storage abstraction used for scene blobs (and any future binary assets).
 *
 * The rest of the app only ever talks to this interface, so swapping the local
 * filesystem driver for S3 / Vercel Blob / anything else later is a matter of
 * implementing one class and registering it in `createStorage`.
 */
export interface StorageAdapter {
  /** Identifier of the driver ("local", "s3", "vercel-blob", ...). */
  readonly driver: string;
  /** Writes an object, overwriting any existing object at the same key. */
  put(key: string, data: Uint8Array | string): Promise<void>;
  /** Reads an object, or resolves to `null` when the key does not exist. */
  get(key: string): Promise<Uint8Array | null>;
  /** Removes an object. Missing keys are treated as success. */
  delete(key: string): Promise<void>;
  /** Checks whether an object exists. */
  exists(key: string): Promise<boolean>;
}

export type StorageDriverName = "local";

export class StorageError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INVALID_KEY"
      | "READ_FAILED"
      | "WRITE_FAILED"
      | "DELETE_FAILED"
      | "UNSUPPORTED_DRIVER",
  ) {
    super(message);
    this.name = "StorageError";
  }
}

const KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9/_-]*(\.[a-zA-Z0-9]+)?$/;

/** Validates a storage key: no traversal, no empty segments, reasonable length. */
export function assertValidKey(key: string): void {
  if (
    key.length === 0 ||
    key.length > 512 ||
    key.includes("..") ||
    key.startsWith("/") ||
    key.endsWith("/") ||
    key.includes("//") ||
    !KEY_PATTERN.test(key)
  ) {
    throw new StorageError(`Invalid storage key: ${key}`, "INVALID_KEY");
  }
}
