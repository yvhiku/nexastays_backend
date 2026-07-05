export interface StoredMediaObject {
  assetId: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
}

export interface MediaStorageBackend {
  store(params: {
    buffer: Buffer;
    relativePath: string;
    mimeType: string;
  }): Promise<StoredMediaObject>;

  resolvePath(storageKey: string): string;
}
