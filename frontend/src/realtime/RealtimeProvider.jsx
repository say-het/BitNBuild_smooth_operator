import { useEffect, useMemo, useState } from 'react';
import { realtimeClient } from '../lib/socket.js';
import { RealtimeContext } from './realtime-context.js';

export function RealtimeProvider({ children }) {
  const [connected, setConnected] = useState(false);
  const [connectionState, setConnectionState] = useState('offline');
  const [reconnectVersion, setReconnectVersion] = useState(0);

  useEffect(() => {
    const onConnect = () => { setConnected(true); setConnectionState('live'); };
    const onDisconnect = () => { setConnected(false); setConnectionState('offline'); };
    const onReconnectAttempt = () => setConnectionState('reconnecting');
    const onReconnect = () => { setConnectionState('live'); setReconnectVersion((value) => value + 1); };
    const onReconnectFailed = () => setConnectionState('offline');
    realtimeClient.on('connect', onConnect);
    realtimeClient.on('disconnect', onDisconnect);
    realtimeClient.onManager('reconnect_attempt', onReconnectAttempt);
    realtimeClient.onManager('reconnect', onReconnect);
    realtimeClient.onManager('reconnect_failed', onReconnectFailed);
    realtimeClient.connect();
    return () => {
      realtimeClient.off('connect', onConnect);
      realtimeClient.off('disconnect', onDisconnect);
      realtimeClient.offManager('reconnect_attempt', onReconnectAttempt);
      realtimeClient.offManager('reconnect', onReconnect);
      realtimeClient.offManager('reconnect_failed', onReconnectFailed);
      realtimeClient.disconnect();
    };
  }, []);

  const value = useMemo(() => ({
    connected,
    connectionState,
    reconnectVersion,
    subscribe: realtimeClient.subscribe,
    unsubscribe: realtimeClient.unsubscribe,
    on: realtimeClient.on,
    off: realtimeClient.off,
  }), [connected, connectionState, reconnectVersion]);

  return <RealtimeContext value={value}>{children}</RealtimeContext>;
}
