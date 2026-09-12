export type Vec2 = {
  x: number;
  y: number;
};

type PositionSample = {
  x: number;
  y: number;
  receivedAt: number;
};

type SamplePair = {
  older: PositionSample;
  newer: PositionSample;
};

const HOLD_AFTER_MS = 1000;
// Match the 50ms send cadence so render time usually sits between the last two packets instead of snapping to the newest sample.
const INTERPOLATION_DELAY_MS = 50;

export class RemotePositionBuffer {
  private readonly buffers = new Map<string, SamplePair>();

  push(clientId: string, x: number, y: number, receivedAt: number): void {
    const incoming: PositionSample = { x, y, receivedAt };
    const existing = this.buffers.get(clientId);
    if (!existing) {
      this.buffers.set(clientId, { older: incoming, newer: incoming });
      return;
    }
    this.buffers.set(clientId, { older: existing.newer, newer: incoming });
  }

  sample(clientId: string, now: number): Vec2 | null {
    const pair = this.buffers.get(clientId);
    if (!pair) {
      return null;
    }

    if (now - pair.newer.receivedAt > HOLD_AFTER_MS) {
      return { x: pair.newer.x, y: pair.newer.y };
    }

    const span = pair.newer.receivedAt - pair.older.receivedAt;
    if (span <= 0) {
      return { x: pair.newer.x, y: pair.newer.y };
    }

    const renderTime = now - INTERPOLATION_DELAY_MS;
    const t = Math.min(1, Math.max(0, (renderTime - pair.older.receivedAt) / span));
    return {
      x: pair.older.x + (pair.newer.x - pair.older.x) * t,
      y: pair.older.y + (pair.newer.y - pair.older.y) * t,
    };
  }

  remove(clientId: string): void {
    this.buffers.delete(clientId);
  }

  retain(clientIds: Iterable<string>): void {
    const live = new Set(clientIds);
    for (const clientId of this.buffers.keys()) {
      if (!live.has(clientId)) {
        this.buffers.delete(clientId);
      }
    }
  }

  clientIds(): string[] {
    return [...this.buffers.keys()];
  }
}
