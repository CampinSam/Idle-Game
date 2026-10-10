import { Injectable } from '@nestjs/common';

export interface PurchaseConfirmedEvent {
  purchaseId: string;
  userId: string;
  gemAmount: number;
  packId: string;
  paymentMethod: string;
}

type Handler = (event: PurchaseConfirmedEvent) => void;

@Injectable()
export class PurchaseEventBus {
  private readonly handlers = new Set<Handler>();

  emit(event: PurchaseConfirmedEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch { }
    }
  }

  subscribe(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}
