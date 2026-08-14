type ConnectionState = "disconnected" | "connecting" | "connected";

type EventHandler = (payload: unknown) => void;

const BASE_RECONNECT_MS = 2000;
const MAX_RECONNECT_MS = 8000;

let socket: WebSocket | null = null;
let explicitDisconnect = false;
let reconnectAttempt = 0;
let hasConnectedBefore = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const subscribers = new Map<string, Set<EventHandler>>();

function getWebSocketUrl() {
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api";
  const url = new URL(apiUrl);

  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  url.hash = "";

  return url.toString();
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect() {
  const delay = Math.min(
    BASE_RECONNECT_MS * 2 ** reconnectAttempt,
    MAX_RECONNECT_MS
  );
  reconnectAttempt += 1;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function dispatchEvent(eventType: string, payload: unknown) {
  const handlers = subscribers.get(eventType);
  if (!handlers) {
    return;
  }

  handlers.forEach((handler) => {
    handler(payload);
  });
}

function handleIncomingMessage(event: MessageEvent<string>) {
  try {
    const data = JSON.parse(event.data) as {
      type?: string;
      payload?: unknown;
    };

    if (typeof data.type === "string") {
      dispatchEvent(data.type, data.payload);
    }
  } catch {
    console.log("WebSocket: failed to parse message");
  }
}

export function subscribe(
  eventType: string,
  handler: EventHandler
): () => void {
  if (!subscribers.has(eventType)) {
    subscribers.set(eventType, new Set());
  }

  subscribers.get(eventType)?.add(handler);

  return () => {
    subscribers.get(eventType)?.delete(handler);
  };
}

export function send(eventType: string, payload: unknown) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.warn("WebSocket: cannot send, not connected");
    return;
  }

  socket.send(JSON.stringify({ type: eventType, payload }));
}

export function getConnectionState(): ConnectionState {
  if (!socket) {
    return "disconnected";
  }

  switch (socket.readyState) {
    case WebSocket.CONNECTING:
      return "connecting";
    case WebSocket.OPEN:
      return "connected";
    default:
      return "disconnected";
  }
}

export function connect() {
  if (typeof window === "undefined") {
    return;
  }

  if (
    socket?.readyState === WebSocket.OPEN ||
    socket?.readyState === WebSocket.CONNECTING
  ) {
    return;
  }

  explicitDisconnect = false;
  clearReconnectTimer();

  const ws = new WebSocket(getWebSocketUrl());
  socket = ws;

  ws.onopen = () => {
    console.log("WebSocket connected");
    reconnectAttempt = 0;
    dispatchEvent("__connected", null);

    if (hasConnectedBefore) {
      dispatchEvent("__reconnected", null);
    } else {
      hasConnectedBefore = true;
    }
  };

  ws.onmessage = handleIncomingMessage;

  ws.onclose = () => {
    console.log("WebSocket closed");
    socket = null;

    if (!explicitDisconnect) {
      scheduleReconnect();
    }
  };

  ws.onerror = () => {
    console.log("WebSocket error");
  };
}

export function disconnect() {
  explicitDisconnect = true;
  clearReconnectTimer();
  reconnectAttempt = 0;
  hasConnectedBefore = false;

  if (socket) {
    socket.close();
    socket = null;
  }
}
