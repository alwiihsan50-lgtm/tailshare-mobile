export interface ClipboardItem {
  id: string;
  text: string;
  source: string;
  pinned?: boolean;
  timestamp: number;
}

export interface FileRecord {
  id: string;
  originalName: string;
  savedName: string;
  filePath?: string;
  size: number;
  mimeType: string;
  uploadedAt: string | number;
  senderDevice?: string;
}

export interface ConnectionOption {
  id: string;
  type: string;
  label: string;
  badge: string;
  description: string;
  url: string;
  ip?: string;
  iface?: string;
  isWifi?: boolean;
}

export interface TailscalePeer {
  id: string;
  name: string;
  dnsName: string;
  ip: string;
  os: string;
  online: boolean;
  active: boolean;
}

export interface ServerStatus {
  success: boolean;
  port: number;
  webUrl: string;
  storageDir: string;
  connectionOptions: ConnectionOption[];
  tailscale: {
    connected: boolean;
    ip: string;
    dnsName: string;
    hostname: string;
    tailnet?: string;
    peers?: TailscalePeer[];
  };
  stats?: {
    clipboardCount: number;
    filesCount: number;
  };
}
