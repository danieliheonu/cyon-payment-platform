/**
 * Private file storage (proof-of-payment files, backups). Files are never exposed by URL:
 * they are streamed through routes that authorize the viewer first.
 */
export interface FileStorage {
  upload(key: string, data: Uint8Array, contentType: string): Promise<void>;
  download(key: string): Promise<Uint8Array>;
  /** Removes a file; succeeds if it is already gone. */
  delete(key: string): Promise<void>;
}

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };
