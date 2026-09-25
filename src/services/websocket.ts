import { ClipboardItem, FileRecord } from '../types';

export interface WebSocketCallbacks {
  onClipboardUpdate?: (item: ClipboardItem, history: ClipboardItem[]) => void;
  onClipboardHistory?: (history: ClipboardItem[]) => void;
  onFilesUpdated?: (files: FileRecord[]) => void;
  onConnectionChange?: (connected: boolean) => void;
}

export class TailShareWebSocket {
  private ws: WebSocket | null = null;
  private url: string = '';
  private callbacks: WebSocketCallbacks = {};
  private reconnectTimer: any = null;
  private isDestroyed: boolean = false;

  constructor(baseUrl: string, callbacks: WebSocketCallbacks) {
    this.updateUrl(baseUrl);
    this.callbacks = callbacks;
  }

  public updateUrl(baseUrl: string) {
    const clean = baseUrl.replace(/\/+$/, '');
    const wsUrl = clean.startsWith('https://')
      ? clean.replace('https://', 'wss://')
      : clean.replace('http://', 'ws://');
    this.url = wsUrl;
  }

  public connect() {
    this.isDestroyed = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    if (!this.url) return;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.callbacks.onConnectionChange?.(true);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const { type, payload } = msg;

          if (type === 'clipboard:update') {
            this.callbacks.onClipboardUpdate?.(payload.item, payload.history || []);
          } else if (type === 'clipboard:history') {
            this.callbacks.onClipboardHistory?.(payload.history || []);
          } else if (type === 'files:updated') {
            this.callbacks.onFilesUpdated?.(payload.allFiles || payload.files || []);
          } else if (type === 'files:deleted') {
            this.callbacks.onFilesUpdated?.(payload.allFiles || []);
          }
        } catch (e) {
          console.warn('WS Message parse error:', e);
        }
      };

      this.ws.onerror = () => {
        this.callbacks.onConnectionChange?.(false);
      };

      this.ws.onclose = () => {
        this.callbacks.onConnectionChange?.(false);
        if (!this.isDestroyed) {
          this.reconnectTimer = setTimeout(() => {
            this.connect();
          }, 3500);
        }
      };
    } catch (e) {
      this.callbacks.onConnectionChange?.(false);
    }
  }

  public disconnect() {
    this.isDestroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.callbacks.onConnectionChange?.(false);
  }
}
