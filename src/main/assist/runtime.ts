import type {
  AssistOverlayName,
  AssistRuntimeStatus,
} from '../../shared/api';

const status: AssistRuntimeStatus = {
  connected: false,
  phase: '',
  queueId: 0,
  championId: 0,
  position: '',
  lastAction: '',
  lastError: '',
  overlays: {
    helper: false,
    match: false,
    spells: false,
  },
};

export function getAssistRuntimeStatus(): AssistRuntimeStatus {
  return structuredClone(status);
}

export function updateAssistRuntimeStatus(
  patch: Partial<Omit<AssistRuntimeStatus, 'overlays'>>,
): void {
  Object.assign(status, patch);
}

export function setAssistOverlayStatus(name: AssistOverlayName, visible: boolean): void {
  status.overlays[name] = visible;
}

export function reportAssistAction(action: string): void {
  status.lastAction = action;
  status.lastError = '';
}

export function reportAssistError(error: unknown): void {
  status.lastError = error instanceof Error ? error.message : String(error);
}
