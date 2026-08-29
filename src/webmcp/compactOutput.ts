import type { AppState, ToolEnvelope, ToolFailure, ToolSuccess } from '../domain/types.js';

export function success<T>(state: AppState, summary: string, data: T, affectedIds?: string[], nextTools?: string[]): ToolSuccess<T> {
  return {
    ok: true,
    code: 'OK',
    summary,
    state_version: state.stateVersion,
    context_version: state.contextVersion,
    data,
    affected_ids: affectedIds?.slice(0, 20),
    next_tools: nextTools?.slice(0, 6),
  };
}

export function failure(
  state: AppState,
  code: ToolFailure['code'],
  summary: string,
  recoverable: boolean,
  details?: Record<string, unknown>,
  nextTools?: string[],
): ToolFailure {
  return {
    ok: false,
    code,
    summary,
    recoverable,
    state_version: state.stateVersion,
    context_version: state.contextVersion,
    details,
    next_tools: nextTools?.slice(0, 6),
  };
}

export function outputSize(envelope: ToolEnvelope<unknown>): number {
  return JSON.stringify(envelope).length;
}
