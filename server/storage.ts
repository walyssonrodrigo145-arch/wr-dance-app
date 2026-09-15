import { debugLog } from "./_core/logger";
import { ENV } from './_core/env';
import fs from 'fs';
import path from 'path';

// Define the local uploads directory
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

// Ensure the directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

type StorageConfig = { baseUrl: string; apiKey: string };

function getStorageConfig(): StorageConfig | null {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;

  if (!baseUrl || !apiKey) {
    return null;
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

function buildUploadUrl(baseUrl: string, relKey: string): URL {
  const url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", normalizeKey(relKey));
  return url;
}

async function buildDownloadUrl(
  baseUrl: string,
  relKey: string,
  apiKey: string
): Promise<string> {
  const downloadApiUrl = new URL(
    "v1/storage/downloadUrl",
    ensureTrailingSlash(baseUrl)
  );
  downloadApiUrl.searchParams.set("path", normalizeKey(relKey));
  const response = await fetch(downloadApiUrl, {
    method: "GET",
    headers: buildAuthHeaders(apiKey),
  });
  return (await response.json()).url;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function buildAuthHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` };
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const config = getStorageConfig();
  const key = normalizeKey(relKey);

  // If Forge proxy credentials are available, use them
  if (config) {
    const { baseUrl, apiKey } = config;
    const uploadUrl = buildUploadUrl(baseUrl, key);
    
    // Convert data to Blob for fetch
    const blob = typeof data === "string" 
      ? new Blob([data], { type: contentType }) 
      : new Blob([data as any], { type: contentType });
      
    const formData = new FormData();
    formData.append("file", blob, key.split("/").pop() ?? key);

    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: buildAuthHeaders(apiKey),
      body: formData,
    });

    if (!response.ok) {
      const message = await response.text().catch(() => response.statusText);
      throw new Error(`Storage upload failed (${response.status} ${response.statusText}): ${message}`);
    }
    const url = (await response.json()).url;
    return { key, url };
  }

  // Fallback to Local Storage (FileSystem)
  debugLog(`[Storage] Falling back to local storage for ${key}`);
  const filePath = path.join(UPLOADS_DIR, key);
  const dirPath = path.dirname(filePath);
  
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  fs.writeFileSync(filePath, data as any);
  
  const appUrl = ENV.appUrl.replace(/\/+$/, "");
  const url = `${appUrl}/uploads/${key}`;
  
  return { key, url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string; }> {
  const config = getStorageConfig();
  const key = normalizeKey(relKey);

  if (config) {
    const { baseUrl, apiKey } = config;
    return {
      key,
      url: await buildDownloadUrl(baseUrl, key, apiKey),
    };
  }

  // Local fallback
  const appUrl = ENV.appUrl.replace(/\/+$/, "");
  return {
    key,
    url: `${appUrl}/uploads/${key}`,
  };
}
