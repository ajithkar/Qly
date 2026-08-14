/**
 * Live queue updates over WebSocket, with reconnection.
 *
 * The socket is a fast path, not the source of truth: the caller still holds
 * a fetched snapshot, and a dropped connection degrades to polling rather
 * than to a frozen screen showing a stale token number — which in a real
 * waiting room means calling the wrong person.
 */
import { useEffect, useRef, useState } from 'react';
import { tokenStore } from '@/api/client';

const MAX_BACKOFF_MS = 15000;

export function useQueueSocket(queueId, tenantId, onMessage) {
  const [connected, setConnected] = useState(false);
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    if (!queueId || !tenantId) return undefined;

    let socket;
    let retryTimer;
    let attempt = 0;
    let closedByUs = false;

    const connect = () => {
      const token = tokenStore.access;
      if (!token) return;

      // VITE_API_URL points at the backend's own origin once frontend and
      // backend are deployed separately (e.g. Vercel + Render) - falling
      // back to window.location only holds in dev, where Vite proxies /ws
      // to localhost:8000 on the same origin as the page.
      const apiUrl = import.meta.env.VITE_API_URL;
      const { protocol, host } = apiUrl ? new window.URL(apiUrl) : window.location;
      const scheme = protocol === 'https:' ? 'wss' : 'ws';
      const url = `${scheme}://${host}/ws/queues/${queueId}` +
        `?token=${encodeURIComponent(token)}&tenant_id=${encodeURIComponent(tenantId)}`;

      socket = new WebSocket(url);

      socket.onopen = () => {
        attempt = 0;
        setConnected(true);
      };

      socket.onmessage = (event) => {
        try {
          handlerRef.current?.(JSON.parse(event.data));
        } catch {
          // Ignore frames we cannot parse rather than tearing down the socket.
        }
      };

      socket.onclose = () => {
        setConnected(false);
        if (closedByUs) return;
        attempt += 1;
        const delay = Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS);
        retryTimer = setTimeout(connect, delay);
      };

      socket.onerror = () => socket.close();
    };

    connect();

    return () => {
      closedByUs = true;
      clearTimeout(retryTimer);
      socket?.close();
    };
  }, [queueId, tenantId]);

  return { connected };
}
