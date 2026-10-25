export type S3Config = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string | null;
  /** region potwierdzony udanym zapytaniem */
  regionOk?: boolean;
  prefix: string;
};

export function s3Config(env?: Record<string, string | undefined>): S3Config | null;
export function encodeKey(key: string): string;
export function authorization(r: {
  method: string;
  host: string;
  path: string;
  query?: Record<string, string>;
  headers: Record<string, string>;
  payloadHash: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service?: string;
  amzDate: string;
}): string;
export function s3Request(
  cfg: S3Config,
  method: string,
  key: string,
  opts?: { query?: Record<string, string>; body?: Uint8Array | string; headers?: Record<string, string>; timeoutMs?: number },
): Promise<Response>;
export function getObject(cfg: S3Config, key: string, timeoutMs?: number): Promise<Response>;
export function putObject(cfg: S3Config, key: string, body: Uint8Array, contentType: string, cacheControl?: string): Promise<void>;
export function listKeys(cfg: S3Config, prefix?: string): Promise<Set<string>>;
