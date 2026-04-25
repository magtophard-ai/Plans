import { getToken } from './client';
import { camelize } from './client';
import { WS_BASE } from './client';

export type WsConnectionStatus = 'idle' | 'connected' | 'reconnecting';

type WsEventHandler = (channel: string, event: string, payload: any) => void;
type ReconnectCallback = () => void;
type StatusListener = (status: WsConnectionStatus) => void;

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let subscriptions = new Set<string>();
let handler: WsEventHandler | null = null;
let userId: string | null = null;
let onReconnectCb: ReconnectCallback | null = null;
let wasReconnect = false;
let currentStatus: WsConnectionStatus = 'idle';
let statusListener: StatusListener | null = null;

function setStatus(next: WsConnectionStatus) {
  if (currentStatus === next) return;
  currentStatus = next;
  if (statusListener) statusListener(next);
}

let staleTimer: ReturnType<typeof setInterval> | null = null;
let lastMsgTime = 0;

const MAX_BACKOFF = 30000;
const STALE_THRESHOLD = 60000;

function getBackoff(): number {
  return Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_BACKOFF) + Math.random() * 500;
}

function startStaleDetection() {
  if (staleTimer) clearInterval(staleTimer);
  lastMsgTime = Date.now();
  staleTimer = setInterval(() => {
    if (Date.now() - lastMsgTime > STALE_THRESHOLD) {
      if (ws) { ws.onclose = null; ws.close(); ws = null; }
      scheduleReconnect();
    }
  }, 15000);
}

function stopStaleDetection() {
  if (staleTimer) { clearInterval(staleTimer); staleTimer = null; }
}

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  const token = getToken();
  if (!token) return;

  wasReconnect = reconnectAttempts > 0;
  ws = new WebSocket(WS_BASE);

  ws.onopen = () => {
    reconnectAttempts = 0;
    setStatus('connected');
    ws!.send(JSON.stringify({ type: 'auth', token }));
  };

  ws.onmessage = (ev) => {
    lastMsgTime = Date.now();
    try {
      const msg = JSON.parse(ev.data as string);
      if (msg.type === 'auth_ok') {
        userId = msg.userId;
        subscriptions.add(`user:${userId}`);
        ws!.send(JSON.stringify({ type: 'subscribe', channel: `user:${userId}` }));
        for (const ch of subscriptions) {
          if (ch !== `user:${userId}`) {
            ws!.send(JSON.stringify({ type: 'subscribe', channel: ch }));
          }
        }
        startStaleDetection();
        if (wasReconnect && onReconnectCb) {
          onReconnectCb();
        }
        wasReconnect = false;
      } else if (msg.type === 'ping') {
        ws!.send(JSON.stringify({ type: 'pong' }));
      } else if (msg.type === 'event') {
        const payload = camelize(msg.payload);
        if (handler) handler(msg.channel, msg.event, payload);
      }
    } catch {}
  };

  ws.onclose = () => {
    ws = null;
    stopStaleDetection();
    setStatus('reconnecting');
    scheduleReconnect();
  };

  ws.onerror = () => {
    ws = null;
    stopStaleDetection();
    setStatus('reconnecting');
    scheduleReconnect();
  };
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectAttempts++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, getBackoff());
}

export function startWs() {
  subscriptions.clear();
  reconnectAttempts = 0;
  wasReconnect = false;
  setStatus('reconnecting');
  connect();
}

export function stopWs() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  stopStaleDetection();
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
  subscriptions.clear();
  userId = null;
  reconnectAttempts = 0;
  wasReconnect = false;
  setStatus('idle');
}

export function subscribe(channel: string) {
  subscriptions.add(channel);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'subscribe', channel }));
  }
}

export function unsubscribe(channel: string) {
  subscriptions.delete(channel);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'unsubscribe', channel }));
  }
}

export function setHandler(h: WsEventHandler) {
  handler = h;
}

export function setOnReconnect(cb: ReconnectCallback) {
  onReconnectCb = cb;
}

export function setOnStatusChange(cb: StatusListener | null) {
  statusListener = cb;
  if (cb) cb(currentStatus);
}

export function getWsStatus(): WsConnectionStatus {
  return currentStatus;
}

export function getSubscriptions(): Set<string> {
  return new Set(subscriptions);
}

