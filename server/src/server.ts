import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { validateClientToServer } from './protocol';
import { RoomRegistry } from './room';

const port = Number.parseInt(process.env.PORT ?? '8080', 10);
const rooms = new RoomRegistry();
const wss = new WebSocketServer({ port });

function rawToText(data: RawData): string | null {
  if (typeof data === 'string') {
    return data;
  }
  if (Buffer.isBuffer(data)) {
    return data.toString('utf8');
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf8');
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8');
  }
  return null;
}

function detach(socket: WebSocket): void {
  rooms.leave(socket);
}

wss.on('connection', (socket) => {
  socket.on('message', (data) => {
    const text = rawToText(data);
    if (text === null) {
      console.error('discarding non-text websocket frame');
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      console.error('discarding malformed JSON', text);
      return;
    }

    const message = validateClientToServer(parsed);
    if (!message) {
      console.error('discarding unrecognized or invalid message', text);
      return;
    }

    if (message.type === 'join') {
      rooms.join(socket, message.roomId, message.clientId);
      return;
    }

    const connection = rooms.connectionFor(socket);
    if (!connection) {
      return;
    }
    if (message.clientId !== connection.clientId) {
      return;
    }

    rooms.broadcast(connection.roomId, message, connection.clientId);
  });

  socket.on('close', () => {
    detach(socket);
  });

  socket.on('error', () => {
    detach(socket);
  });
});

