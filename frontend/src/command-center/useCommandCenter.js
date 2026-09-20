import { useContext } from 'react';
import { CommandCenterContext } from './command-center-context.js';

export function useCommandCenter() {
  const value = useContext(CommandCenterContext);
  if (!value) throw new Error('useCommandCenter must be used inside CommandCenterProvider');
  return value;
}
