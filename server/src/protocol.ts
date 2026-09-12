export type JoinMessage = {
  type: 'join';
  roomId: string;
  clientId: string;
};

export type CursorMessage = {
  type: 'cursor';
  clientId: string;
  x: number;
  y: number;
  seq: number;
};

export type ReactionMessage = {
  type: 'reaction';
  clientId: string;
  x: number;
  y: number;
  emoji: string;
  seq: number;
};

export type LeaveMessage = {
  type: 'leave';
  clientId: string;
};

export type PresenceMessage = {
  type: 'presence';
  clients: string[];
};

export type ClientToServerMessage = JoinMessage | CursorMessage | ReactionMessage;
export type ServerToClientMessage = CursorMessage | ReactionMessage | LeaveMessage | PresenceMessage;
export type Message = ClientToServerMessage | ServerToClientMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isSeq(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isClientIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => isNonEmptyString(entry));
}

export function validateClientToServer(value: unknown): ClientToServerMessage | null {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return null;
  }

  switch (value.type) {
    case 'join':
      if (!isNonEmptyString(value.roomId) || !isNonEmptyString(value.clientId)) {
        return null;
      }
      return { type: 'join', roomId: value.roomId, clientId: value.clientId };
    case 'cursor':
      if (
        !isNonEmptyString(value.clientId) ||
        !isFiniteNumber(value.x) ||
        !isFiniteNumber(value.y) ||
        !isSeq(value.seq)
      ) {
        return null;
      }
      return { type: 'cursor', clientId: value.clientId, x: value.x, y: value.y, seq: value.seq };
    case 'reaction':
      if (
        !isNonEmptyString(value.clientId) ||
        !isFiniteNumber(value.x) ||
        !isFiniteNumber(value.y) ||
        !isNonEmptyString(value.emoji) ||
        !isSeq(value.seq)
      ) {
        return null;
      }
      return {
        type: 'reaction',
        clientId: value.clientId,
        x: value.x,
        y: value.y,
        emoji: value.emoji,
        seq: value.seq,
      };
    default:
      return null;
  }
}

export function validateServerToClient(value: unknown): ServerToClientMessage | null {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return null;
  }

  switch (value.type) {
    case 'cursor':
    case 'reaction': {
      const asClient = validateClientToServer(value);
      if (!asClient || asClient.type === 'join') {
        return null;
      }
      return asClient;
    }
    case 'leave':
      if (!isNonEmptyString(value.clientId)) {
        return null;
      }
      return { type: 'leave', clientId: value.clientId };
    case 'presence':
      if (!isClientIdList(value.clients)) {
        return null;
      }
      return { type: 'presence', clients: value.clients };
    default:
      return null;
  }
}

export function parseServerToClient(raw: string): ServerToClientMessage | null {
  try {
    return validateServerToClient(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function serializeMessage(message: Message): string {
  return JSON.stringify(message);
}
