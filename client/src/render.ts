export type CursorDrawState = {
  clientId: string;
  x: number;
  y: number;
};

export type ReactionDrawState = {
  id: string;
  clientId: string;
  x: number;
  y: number;
  emoji: string;
  spawnedAt: number;
};

const REACTION_DURATION_MS = 1000;
const REACTION_RISE_PX = 28;

export function colorFromClientId(clientId: string): string {
  let hash = 2166136261;
  for (let index = 0; index < clientId.length; index += 1) {
    hash ^= clientId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const hue = (hash >>> 0) % 360;
  return `hsl(${hue} 70% 55%)`;
}

export function syncCanvasSize(canvas: HTMLCanvasElement): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (canvas.width !== width) {
    canvas.width = width;
  }
  if (canvas.height !== height) {
    canvas.height = height;
  }
}

export function isReactionExpired(reaction: ReactionDrawState, now: number): boolean {
  return now - reaction.spawnedAt >= REACTION_DURATION_MS;
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  cursors: CursorDrawState[],
  reactions: ReactionDrawState[],
  now: number,
): void {
  ctx.clearRect(0, 0, width, height);

  for (const cursor of cursors) {
    drawCursor(ctx, cursor);
  }

  for (const reaction of reactions) {
    const age = now - reaction.spawnedAt;
    if (age < 0 || age >= REACTION_DURATION_MS) {
      continue;
    }
    const progress = age / REACTION_DURATION_MS;
    ctx.save();
    ctx.globalAlpha = 1 - progress;
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(reaction.emoji, reaction.x, reaction.y - progress * REACTION_RISE_PX);
    ctx.restore();
  }
}

function drawCursor(ctx: CanvasRenderingContext2D, cursor: CursorDrawState): void {
  ctx.save();
  ctx.translate(cursor.x, cursor.y);
  ctx.fillStyle = colorFromClientId(cursor.clientId);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 18);
  ctx.lineTo(5, 14);
  ctx.lineTo(9, 22);
  ctx.lineTo(12, 21);
  ctx.lineTo(8, 12);
  ctx.lineTo(14, 12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
