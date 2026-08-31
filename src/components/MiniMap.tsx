import { useEffect, useRef } from 'react';
import { MapGrid, Position, Enemy } from '../game/types';

export interface MiniMapProps {
  map: MapGrid;
  playerPos: Position;
  enemies: Enemy[];
}

export function MiniMap({ map, playerPos, enemies }: MiniMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const TILE = 3;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || map.length === 0) return;
    const mapH = map.length;
    const mapW = map[0].length;
    canvas.width = mapW * TILE;
    canvas.height = mapH * TILE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // First pass — draw all tile backgrounds
    for (let y = 0; y < mapH; y++) {
      for (let x = 0; x < mapW; x++) {
        const tile = map[y][x];
        if (!tile.seen) continue;

        let color: string;
        if (tile.visible) {
          if (tile.type === 'wall') color = '#44444f';
          else if (tile.type === 'water') color = '#2a5080';
          else if (tile.type === 'lava') color = '#e04000';
          else if (tile.type === 'volcano') color = '#ff2200';
          else if (tile.type === 'bush') color = '#2d6a28';
          else if (tile.type === 'tree') color = '#1a5020';
          else if (tile.type === 'stairs') color = '#8060d0';
          else if (tile.type === 'shrine') color = '#3a2e00';
          else if (tile.type === 'shrine-used') color = '#2e2e2e';
          else if (tile.type === 'safe-floor' || tile.type === 'shop-item') color = '#2e1e08';
          else if (tile.type === 'boss-floor') color = '#5a1a1a';
          else if (tile.type === 'door-closed') color = '#7a4a18';
          else if (tile.type === 'door-open') color = '#5a6a3a';
          else color = '#6a6a7a';
        } else {
          if (tile.type === 'wall') color = '#252530';
          else if (tile.type === 'water') color = '#1a3050';
          else if (tile.type === 'lava') color = '#801800';
          else if (tile.type === 'volcano') color = '#a01000';
          else if (tile.type === 'bush') color = '#1a3a18';
          else if (tile.type === 'tree') color = '#0f2d14';
          else if (tile.type === 'stairs') color = '#403060';
          else if (tile.type === 'shrine') color = '#1e1800';
          else if (tile.type === 'shrine-used') color = '#1e1e1e';
          else if (tile.type === 'safe-floor' || tile.type === 'shop-item') color = '#1a1008';
          else if (tile.type === 'boss-floor') color = '#3a0a0a';
          else if (tile.type === 'door-closed') color = '#4a2c0a';
          else if (tile.type === 'door-open') color = '#3a4222';
          else color = '#3a3a4a';
        }

        ctx.fillStyle = color;
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }

    // Second pass — draw distinct dots for shrine and shop tiles on top
    for (let y = 0; y < mapH; y++) {
      for (let x = 0; x < mapW; x++) {
        const tile = map[y][x];
        if (!tile.seen) continue;

        let dotColor: string | null = null;
        if (tile.type === 'shrine') {
          dotColor = tile.visible ? '#ffd700' : '#9a7a10';
        } else if (tile.type === 'shrine-used') {
          dotColor = tile.visible ? '#aaaaaa' : '#555555';
        } else if (tile.type === 'safe-floor' || tile.type === 'shop-item') {
          dotColor = tile.visible ? '#e08830' : '#7a4818';
        } else if (tile.type === 'boss-floor') {
          dotColor = tile.visible ? '#ff4444' : '#882222';
        }

        if (dotColor) {
          ctx.fillStyle = dotColor;
          ctx.fillRect(x * TILE + 1, y * TILE + 1, 1, 1);
        }
      }
    }

    // Enemies on currently visible tiles — color by threat tier
    for (const enemy of enemies) {
      const tile = map[enemy.pos.y]?.[enemy.pos.x];
      if (!tile?.visible) continue;
      const r = 3 + Math.floor(enemy.speed / 3);
      ctx.fillStyle = r <= 3 ? '#22c55e' : r <= 5 ? '#eab308' : '#ef4444';
      ctx.fillRect(enemy.pos.x * TILE, enemy.pos.y * TILE, TILE, TILE);
    }

    // Player dot
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(playerPos.x * TILE, playerPos.y * TILE, TILE, TILE);
  }, [map, playerPos, enemies]);

  if (map.length === 0) return null;
  const mapW = map[0].length;
  const mapH = map.length;

  return (
    <div className="border border-border/50 bg-black rounded-lg p-2 space-y-1.5">
      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Mini-map</h3>
      <div className="overflow-hidden rounded" style={{ maxWidth: '100%' }}>
        <canvas
          ref={canvasRef}
          width={mapW * TILE}
          height={mapH * TILE}
          style={{ display: 'block', imageRendering: 'pixelated', maxWidth: '100%' }}
        />
      </div>
      {/* Shrine / shop legend */}
      <div className="flex items-center gap-2.5 pt-0.5 flex-wrap" title="Special room markers">
        {([
          { color: '#ffd700', label: '🛕 Shrine' },
          { color: '#aaaaaa', label: '🛕 Used' },
          { color: '#e08830', label: '🍺 Shop' },
          { color: '#ff4444', label: '⚔️ Boss' },
        ] as const).map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1">
            <span style={{
              display: 'inline-block',
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: color,
              boxShadow: `0 0 3px ${color}`,
              flexShrink: 0,
            }} />
            <span className="text-muted-foreground/70" style={{ fontSize: 10 }}>{label}</span>
          </div>
        ))}
      </div>
      {/* Threat dot legend */}
      <div className="flex items-center gap-2.5 pt-0.5 flex-wrap" title="Enemy threat dots show detection range">
        {([
          { color: '#22c55e', label: 'Close' },
          { color: '#eab308', label: 'Mid' },
          { color: '#ef4444', label: 'Far' },
        ] as const).map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1">
            <span style={{
              display: 'inline-block',
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: color,
              boxShadow: `0 0 3px ${color}`,
              flexShrink: 0,
            }} />
            <span className="text-muted-foreground/70" style={{ fontSize: 10 }}>{label}</span>
          </div>
        ))}
        <span className="text-muted-foreground/40 ml-auto" style={{ fontSize: 10 }}>detection range</span>
      </div>
    </div>
  );
}
