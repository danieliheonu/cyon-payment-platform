import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { FileStorage } from "@/server/ports/file-storage";

/** Supabase Storage adapter for one private bucket. Uses the service role key (server only). */
export class SupabaseFileStorage implements FileStorage {
  private readonly client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string, private readonly bucket: string) {
    this.client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  }

  async upload(key: string, data: Uint8Array, contentType: string): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).upload(key, data, { contentType, upsert: false });
    if (error) throw new Error(`Upload failed: ${error.message}`);
  }

  async download(key: string): Promise<Uint8Array> {
    const { data, error } = await this.client.storage.from(this.bucket).download(key);
    if (error || !data) throw new Error(`Download failed: ${error?.message ?? "no data"}`);
    return new Uint8Array(await data.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).remove([key]);
    if (error) throw new Error(`Delete failed: ${error.message}`);
  }
}
