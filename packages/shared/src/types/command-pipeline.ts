export type Patch =
  | { op: 'upsert'; entity: string; id: string; data: any }
  | { op: 'delete'; entity: string; id: string };

export type UiIntent =
  | { type: 'modal'; key: string; title: string; body: any; buttons: any[] }
  | { type: 'toast'; tone: 'success' | 'error' | 'info'; message: string }
  | { type: 'navigate'; deepLink: string };

export interface CommandRequest {
  type: string;
  payload: Record<string, any>;
  idempotencyKey: string;
}

export interface CommandResponse {
  patches: Patch[];
  ui: UiIntent[];
  cursor: { delta: string };
}

export interface BootstrapResponse {
  serverTime: number;
  snapshot: {
    player: any;
    state: any;
    inventory?: any;
    jobs?: any;
    notifications?: any;
  };
  cursor: { delta: string };
}

export interface DeltaResponse {
  from: string;
  to: string;
  patches: Patch[];
  ui: UiIntent[];
}

export interface DeltaResetResponse {
  resetRequired: true;
}

export interface CommandHandlerResult {
  patches: Patch[];
  ui: UiIntent[];
}
