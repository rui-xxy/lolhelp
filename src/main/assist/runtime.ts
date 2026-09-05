import type { AssistRuntimeStatus } from '../../shared/api';

const status: AssistRuntimeStatus = {
  connected: false,
  phase: '',
  queueId: 0,
  championId: 0,
  position: '',
  lastAction: '',
  lastError: '',
};

export function getAssistRuntimeStatus(): AssistRuntimeStatus {
  return structuredClone(status);
}

export function updateAssistRuntimeStatus(
  patch: Partial<AssistRuntimeStatus>,
): void {
  Object.assign(status, patch);
}

export function reportAssistAction(action: string): void {
  status.lastAction = action;
  status.lastError = '';
}

export function reportAssistError(error: unknown): void {
  status.lastError = error instanceof Error ? error.message : String(error);
}
