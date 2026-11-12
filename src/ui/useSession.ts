import { useSyncExternalStore } from 'react';
import { Session } from '../session/session';

export function useSessionState(session: Session) {
  return useSyncExternalStore(session.subscribe, session.getState);
}
