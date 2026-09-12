import {
  parseServerToClient,
  serializeMessage,
  type JoinMessage,
  type Message,
} from '../../server/src/protocol';

const RECONNECT_DELAY_MS = 2000;

export type ConnectionHandlers = {
  onMessage: (message: Message) => void;
  onConnectionChange: (connected: boolean) => void;
};

export class RoomConnection {
  private socket: WebSocket | null = null;
  private disposed = false;
  private reconnectTimer: number | null = null;

  constructor(
    private readonly url: string,
    private readonly roomId: string,
    private readonly clientId: string,
    private readonly handlers: ConnectionHandlers,
  ) {}

  connect(): void {
    this.disposed = false;
    this.openSocket();
  }

  disconnect(): void {
    this.disposed = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.dropSocket();
  }

  send(message: Message): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(serializeMessage(message));
    }
  }

  private openSocket(): void {
    this.dropSocket();
    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.onopen = () => {
      const join: JoinMessage = {
        type: 'join',
        roomId: this.roomId,
        clientId: this.clientId,
      };
      socket.send(serializeMessage(join));
      this.handlers.onConnectionChange(true);
    };

    socket.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
      if (typeof event.data !== 'string') {
        return;
      }
      const message = parseServerToClient(event.data);
      if (!message) {
        return;
      }
      this.handlers.onMessage(message);
    };

    socket.onerror = () => {
      socket.close();
    };

    socket.onclose = () => {
      this.handlers.onConnectionChange(false);
      this.scheduleReconnect();
    };
  }

  private dropSocket(): void {
    if (!this.socket) {
      return;
    }
    this.socket.onopen = null;
    this.socket.onclose = null;
    this.socket.onerror = null;
    this.socket.onmessage = null;
    if (
      this.socket.readyState === WebSocket.OPEN ||
      this.socket.readyState === WebSocket.CONNECTING
    ) {
      this.socket.close();
    }
    this.socket = null;
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer !== null) {
      return;
    }
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.disposed) {
        this.openSocket();
      }
    }, RECONNECT_DELAY_MS);
  }
}
