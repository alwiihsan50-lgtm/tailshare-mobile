import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { ServerStatus, ClipboardItem, FileRecord } from '../types';

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

// Timeout fetch helper
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkServerStatus(baseUrl: string): Promise<ServerStatus> {
  const cleanUrl = baseUrl.replace(/\/+$/, '');
  const res = await fetchWithTimeout(`${cleanUrl}/api/status`, {
    headers: { 'Accept': 'application/json' }
  }, 5000);
  
  if (!res.ok) {
    throw new ApiError(`Server returned status ${res.status}`, res.status);
  }
  const data = await res.json();
  return data;
}

export async function getClipboardHistory(baseUrl: string): Promise<ClipboardItem[]> {
  const cleanUrl = baseUrl.replace(/\/+$/, '');
  const res = await fetchWithTimeout(`${cleanUrl}/api/clipboard`, {
    headers: { 'Accept': 'application/json' }
  });
  if (!res.ok) throw new ApiError('Failed to fetch clipboard history', res.status);
  const data = await res.json();
  return data.history || [];
}

export async function sendClipboardToPc(
  baseUrl: string,
  text: string,
  deviceName = 'iPhone',
  copyToPc = true
): Promise<ClipboardItem> {
  const cleanUrl = baseUrl.replace(/\/+$/, '');
  const res = await fetchWithTimeout(`${cleanUrl}/api/clipboard`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      text,
      sourceDevice: deviceName,
      copyToPc
    })
  });
  if (!res.ok) throw new ApiError('Failed to send clipboard', res.status);
  const data = await res.json();
  return data.item;
}

export async function togglePinClipboard(baseUrl: string, id: string): Promise<void> {
  const cleanUrl = baseUrl.replace(/\/+$/, '');
  const res = await fetchWithTimeout(`${cleanUrl}/api/clipboard/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  });
  if (!res.ok) throw new ApiError('Failed to toggle pin', res.status);
}

export async function deleteClipboardItem(baseUrl: string, id: string): Promise<void> {
  const cleanUrl = baseUrl.replace(/\/+$/, '');
  const res = await fetchWithTimeout(`${cleanUrl}/api/clipboard/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new ApiError('Failed to delete clipboard item', res.status);
}

export async function getFilesList(baseUrl: string): Promise<FileRecord[]> {
  const cleanUrl = baseUrl.replace(/\/+$/, '');
  const res = await fetchWithTimeout(`${cleanUrl}/api/files`, {
    headers: { 'Accept': 'application/json' }
  });
  if (!res.ok) throw new ApiError('Failed to fetch files list', res.status);
  const data = await res.json();
  return data.files || [];
}

export async function uploadFileToPc(
  baseUrl: string,
  fileUri: string,
  fileName: string,
  mimeType = 'application/octet-stream',
  deviceName = 'iPhone'
): Promise<void> {
  const cleanUrl = baseUrl.replace(/\/+$/, '');
  const uploadUrl = `${cleanUrl}/api/files/upload`;

  const uploadResult = await FileSystem.uploadAsync(uploadUrl, fileUri, {
    fieldName: 'files',
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    mimeType,
    parameters: {
      senderDevice: deviceName
    },
    headers: {
      'Accept': 'application/json'
    }
  });

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new ApiError(`Upload failed with status ${uploadResult.status}`, uploadResult.status);
  }
}

export async function deleteFileFromPc(baseUrl: string, id: string): Promise<void> {
  const cleanUrl = baseUrl.replace(/\/+$/, '');
  const res = await fetchWithTimeout(`${cleanUrl}/api/files/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new ApiError('Failed to delete file', res.status);
}

export async function downloadAndShareFile(
  baseUrl: string,
  fileId: string,
  fileName: string
): Promise<string> {
  const cleanUrl = baseUrl.replace(/\/+$/, '');
  const downloadUrl = `${cleanUrl}/api/files/download/${fileId}`;
  const targetUri = `${FileSystem.cacheDirectory || ''}${encodeURIComponent(fileName)}`;

  const downloadResult = await FileSystem.downloadAsync(downloadUrl, targetUri);
  if (downloadResult.status !== 200) {
    throw new ApiError(`Download failed with status ${downloadResult.status}`);
  }

  // Open iOS Share sheet
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(downloadResult.uri);
  }
  return downloadResult.uri;
}
