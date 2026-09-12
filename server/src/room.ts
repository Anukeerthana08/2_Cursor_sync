import type { WebSocket } from 'ws';
import type { LeaveMessage, Message, PresenceMessage } from './protocol';
import { serializeMessage } from './protocol';

export type ClientConnection = {
  socket: WebSocket;
  clientId: string;
  roomId: string;
};

export class RoomRegistry {
  private readonly rooms = new Map<string, Set<ClientConnection>>();
  private readonly bySocket = new Map<WebSocket, ClientConnection>();

  join(socket: WebSocket, roomId: string, clientId: string): ClientConnection {
    const alreadyBound = this.bySocket.get(socket);
    if (alreadyBound) {
      this.leave(socket);
    }

    this.replaceExistingClient(roomId, clientId);

    const connection: ClientConnection = { socket, clientId, roomId };
    let members = this.rooms.get(roomId);
    if (!members) {
      members = new Set();
      this.rooms.set(roomId, members);
    }
    members.add(connection);
    this.bySocket.set(socket, connection);
    this.broadcastPresence(roomId);
    return connection;
  }

  leave(socket: WebSocket): void {
    const connection = this.bySocket.get(socket);
    if (!connection) {
      return;
    }

    this.bySocket.delete(socket);
    const members = this.rooms.get(connection.roomId);
    if (!members) {
      return;
    }

    members.delete(connection);
    if (members.size === 0) {
      this.rooms.delete(connection.roomId);
      return;
    }

    const leave: LeaveMessage = { type: 'leave', clientId: connection.clientId };
    this.broadcast(connection.roomId, leave, connection.clientId);
    this.broadcastPresence(connection.roomId);
  }

  connectionFor(socket: WebSocket): ClientConnection | undefined {
    return this.bySocket.get(socket);
  }

  broadcast(roomId: string, message: Message, exceptClientId?: string): void {
    const members = this.rooms.get(roomId);
    if (!members) {
      return;
    }

    const payload = serializeMessage(message);
    for (const member of members) {
      if (exceptClientId !== undefined && member.clientId === exceptClientId) {
        continue;
      }
      if (member.socket.readyState === member.socket.OPEN) {
        member.socket.send(payload);
      }
    }
  }

  private replaceExistingClient(roomId: string, clientId: string): void {
    const members = this.rooms.get(roomId);
    if (!members) {
      return;
    }

    for (const member of [...members]) {
      if (member.clientId !== clientId) {
        continue;
      }
      members.delete(member);
      this.bySocket.delete(member.socket);
      if (member.socket.readyState === member.socket.OPEN) {
        member.socket.close();
      }
    }

    if (members.size === 0) {
      this.rooms.delete(roomId);
    }
  }

  private broadcastPresence(roomId: string): void {
    const members = this.rooms.get(roomId);
    if (!members) {
      return;
    }

    const presence: PresenceMessage = {
      type: 'presence',
      clients: [...members].map((member) => member.clientId),
    };
    this.broadcast(roomId, presence);
  }
}
