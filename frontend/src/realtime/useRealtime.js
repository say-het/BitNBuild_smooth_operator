import { useContext } from 'react';
import { RealtimeContext } from './realtime-context.js';

export function useRealtime() {
  const realtime = useContext(RealtimeContext);
  if (!realtime) throw new Error('useRealtime must be used inside RealtimeProvider');
  return realtime;
}
