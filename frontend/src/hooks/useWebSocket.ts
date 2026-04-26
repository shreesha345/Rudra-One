import { useEffect, useRef, useState, useCallback } from 'react';

export interface TranscriptionMessage {
  type: 'transcription' | 'connected' | 'keepalive' | 'call_started' | 'call_ended' | 'audio';
  speaker?: string;
  message?: string;
  timestamp: string;
  caller_number?: string;
  is_final?: boolean;
  confidence?: number;
  call_sid?: string;
  audio?: string;  // Base64 encoded audio data
}

interface UseWebSocketOptions {
  url: string;
  onMessage?: (message: TranscriptionMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  autoReconnect?: boolean;
  reconnectInterval?: number;
}

export const useWebSocket = ({
  url,
  onMessage,
  onOpen,
  onClose,
  onError,
  autoReconnect = true,
  reconnectInterval = 3000,
}: UseWebSocketOptions) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<TranscriptionMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldReconnectRef = useRef(true);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  
  // Store callbacks in refs to avoid recreating connect function
  const onMessageRef = useRef(onMessage);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  const onErrorRef = useRef(onError);
  
  useEffect(() => {
    onMessageRef.current = onMessage;
    onOpenRef.current = onOpen;
    onCloseRef.current = onClose;
    onErrorRef.current = onError;
  }, [onMessage, onOpen, onClose, onError]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    // Don't connect if URL is empty
    if (!url) {
      return;
    }

    // Stop reconnecting after max attempts
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      console.warn(`Max reconnection attempts (${maxReconnectAttempts}) reached for ${url}`);
      return;
    }

    try {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        console.log('WebSocket connected:', url);
        setIsConnected(true);
        reconnectAttemptsRef.current = 0; // Reset on successful connection
        onOpenRef.current?.();
      };

      ws.onmessage = (event) => {
        try {
          const message: TranscriptionMessage = JSON.parse(event.data);
          setLastMessage(message);
          onMessageRef.current?.(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected:', url);
        setIsConnected(false);
        wsRef.current = null;
        onCloseRef.current?.();

        if (autoReconnect && shouldReconnectRef.current && url && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current += 1;
          // Exponential backoff: 3s, 6s, 12s, 24s, 48s
          const backoffDelay = reconnectInterval * Math.pow(2, reconnectAttemptsRef.current - 1);
          console.log(`Reconnect attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts} in ${backoffDelay}ms`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, backoffDelay);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        onErrorRef.current?.(error);
        // Close the connection on error to trigger reconnect
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      // Retry connection after interval if auto-reconnect is enabled
      if (autoReconnect && shouldReconnectRef.current && url && reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectAttemptsRef.current += 1;
        const backoffDelay = reconnectInterval * Math.pow(2, reconnectAttemptsRef.current - 1);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('Retrying connection after error...');
          connect();
        }, backoffDelay);
      }
    }
  }, [url, autoReconnect, reconnectInterval]);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    reconnectAttemptsRef.current = 0;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const sendMessage = useCallback((message: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(message);
    } else {
      console.warn('WebSocket is not connected');
    }
  }, []);

  useEffect(() => {
    // Only connect if URL is provided
    if (url) {
      shouldReconnectRef.current = true;
      connect();
    }

    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [url, connect]);

  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    shouldReconnectRef.current = true;
    connect();
  }, [connect]);

  return {
    isConnected,
    lastMessage,
    sendMessage,
    disconnect,
    reconnect,
  };
};
