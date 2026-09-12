import { useEffect, useMemo, useRef, useState } from 'react';
import { RoomConnection } from './connection';
import { RemotePositionBuffer } from './interpolation';
import {
  colorFromClientId,
  drawFrame,
  isReactionExpired,
  syncCanvasSize,
  type CursorDrawState,
  type ReactionDrawState,
} from './render';

const CURSOR_SEND_INTERVAL_MS = 50;
const FIXED_REACTION_EMOJI = '⭐';

function readRoomId(): string {
  const room = new URLSearchParams(window.location.search).get('room');
  if (room && room.length > 0) {
    return room;
  }
  return 'default-room';
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clientIdRef = useRef(crypto.randomUUID());
  const roomId = useMemo(() => readRoomId(), []);
  const interpolatorRef = useRef(new RemotePositionBuffer());
  const lastAppliedSeqRef = useRef(new Map<string, number>());
  const reactionsRef = useRef<ReactionDrawState[]>([]);
  const localCursorRef = useRef<{ x: number; y: number } | null>(null);
  const outboundSeqRef = useRef(0);
  const connectionRef = useRef<RoomConnection | null>(null);

  const [presence, setPresence] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const localClientId = clientIdRef.current;

    const connection = new RoomConnection(
      `ws://${window.location.hostname}:8080`,
      roomId,
      localClientId,
      {
        onConnectionChange: setConnected,
        onMessage: (message) => {
          switch (message.type) {
            case 'presence':
              interpolatorRef.current.retain(message.clients.filter((id) => id !== localClientId));
              setPresence(message.clients);
              break;
            case 'leave':
              interpolatorRef.current.remove(message.clientId);
              lastAppliedSeqRef.current.delete(message.clientId);
              setPresence((ids) => ids.filter((id) => id !== message.clientId));
              break;
            case 'cursor': {
              if (message.clientId === localClientId) {
                break;
              }
              const previous = lastAppliedSeqRef.current.get(message.clientId) ?? -1;
              if (message.seq <= previous) {
                break;
              }
              lastAppliedSeqRef.current.set(message.clientId, message.seq);
              interpolatorRef.current.push(
                message.clientId,
                message.x,
                message.y,
                performance.now(),
              );
              break;
            }
            case 'reaction': {
              if (message.clientId === localClientId) {
                break;
              }
              const previous = lastAppliedSeqRef.current.get(message.clientId) ?? -1;
              if (message.seq <= previous) {
                break;
              }
              lastAppliedSeqRef.current.set(message.clientId, message.seq);
              reactionsRef.current.push({
                id: `${message.clientId}:${message.seq}`,
                clientId: message.clientId,
                x: message.x,
                y: message.y,
                emoji: message.emoji,
                spawnedAt: performance.now(),
              });
              break;
            }
            default:
              break;
          }
        },
      },
    );

    connectionRef.current = connection;
    connection.connect();

    return () => {
      connection.disconnect();
      connectionRef.current = null;
    };
  }, [roomId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    let frame = 0;
    const tick = () => {
      const now = performance.now();
      reactionsRef.current = reactionsRef.current.filter((reaction) => !isReactionExpired(reaction, now));

      const cursors: CursorDrawState[] = [];
      if (localCursorRef.current) {
        cursors.push({
          clientId: clientIdRef.current,
          x: localCursorRef.current.x,
          y: localCursorRef.current.y,
        });
      }
      for (const remoteId of interpolatorRef.current.clientIds()) {
        if (remoteId === clientIdRef.current) {
          continue;
        }
        const position = interpolatorRef.current.sample(remoteId, now);
        if (position) {
          cursors.push({ clientId: remoteId, x: position.x, y: position.y });
        }
      }

      syncCanvasSize(canvas);
      drawFrame(ctx, canvas.width, canvas.height, cursors, reactionsRef.current, now);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    const onResize = () => {
      syncCanvasSize(canvas);
    };
    window.addEventListener('resize', onResize);
    syncCanvasSize(canvas);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let latest = { x: 0, y: 0 };
    let hasUnsentMove = false;

    // 50ms (20 Hz) is enough samples for linear interpolation to look continuous while staying well below raw mousemove rates (~100–200 Hz).
    const sendTimer = window.setInterval(() => {
      if (!hasUnsentMove) {
        return;
      }
      hasUnsentMove = false;
      outboundSeqRef.current += 1;
      connectionRef.current?.send({
        type: 'cursor',
        clientId: clientIdRef.current,
        x: latest.x,
        y: latest.y,
        seq: outboundSeqRef.current,
      });
    }, CURSOR_SEND_INTERVAL_MS);

    const pointerOnCanvas = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    };

    const onMouseMove = (event: MouseEvent) => {
      latest = pointerOnCanvas(event);
      localCursorRef.current = latest;
      hasUnsentMove = true;
    };

    const onClick = (event: MouseEvent) => {
      const point = pointerOnCanvas(event);
      outboundSeqRef.current += 1;
      const seq = outboundSeqRef.current;
      reactionsRef.current.push({
        id: `${clientIdRef.current}:${seq}`,
        clientId: clientIdRef.current,
        x: point.x,
        y: point.y,
        emoji: FIXED_REACTION_EMOJI,
        spawnedAt: performance.now(),
      });
      connectionRef.current?.send({
        type: 'reaction',
        clientId: clientIdRef.current,
        x: point.x,
        y: point.y,
        emoji: FIXED_REACTION_EMOJI,
        seq,
      });
    };

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('click', onClick);

    return () => {
      window.clearInterval(sendTimer);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('click', onClick);
    };
  }, []);

  return (
    <>
      <aside className="presence">
        <h1>
          {roomId} · {presence.length} connected {connected ? '' : '(reconnecting)'}
        </h1>
        <ul>
          {presence.map((id) => (
            <li key={id}>
              <span className="dot" style={{ background: colorFromClientId(id) }} />
              {id === clientIdRef.current ? `${id} (you)` : id}
            </li>
          ))}
        </ul>
      </aside>
      <canvas ref={canvasRef} />
    </>
  );
}
