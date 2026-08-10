export interface StoredMediaObject {
  assetId: string;
  /** Relative object key under the storage root / bucket prefix (server-generated). */
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
}

export interface MediaStorageBackend {
  /**
   * Persist bytes at a server-built relative key.
   * Callers must supply a UUID assetId and a safe relativeKey (no `..`, no absolute paths).
   */
  store(params: {
    buffer: Buffer;
    /** e.g. host/{userId}/listing/photo_{uuid}.jpg */
    relativeKey: string;
    mimeType: string;
    assetId: string;
  }): Promise<StoredMediaObject>;

  /** True if the object (or remote claim) exists. */
  exists(relativeKey: string): Promise<boolean>;

  /**
   * Local absolute path, or http(s) delivery URL for redirect/proxy.
   * Ownership must already be enforced by the caller.
   */
  resolveDelivery(relativeKey: string): Promise<string>;

  delete?(relativeKey: string): Promise<void>;
}
