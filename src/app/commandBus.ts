import { branchlineStore } from '../store/branchlineStore.js';
import type { Actor, DomainCommand } from '../domain/types.js';

let commandCounter = 0;

export function makeCommand<T>(actor: Actor, type: string, payload: T, reason?: string, correlationId?: string): DomainCommand<T> {
  commandCounter += 1;
  return {
    id: `cmd_${commandCounter.toString().padStart(4, '0')}`,
    actor,
    type,
    payload,
    reason,
    correlationId,
    createdAt: new Date().toISOString(),
  };
}

export const commandBus = {
  dispatch<T>(command: DomainCommand<T>) {
    return branchlineStore.dispatch(command);
  },
  getState: branchlineStore.getState,
  subscribe: branchlineStore.subscribe,
};
