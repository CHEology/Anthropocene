import { useEffect, useRef, useState } from 'react';

import type { WorldPresentation, WorldState } from '../../sim/types';

type LayerMode = 'comfort' | 'habitability' | 'water' | 'temperature';

interface MapCanvasProps {
  worldState: WorldState;
  presentation: WorldPresentation;
  layerMode: LayerMode;
  selectedTileId: string | null;
  hoveredTileId: string | null;
  showRoutes: boolean;
  showLabels: boolean;
  showPressure: boolean;
  onSelectTile(tileId: string): void;
  onHoverTile(tileId: string | null): void;
}

interface TileHitArea {
  tileId: string;
  points: Array<{ x: number; y: number }>;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function blendColor(from: [number, number, number], to: [number, number, number], mix: number) {
  const t = clamp(mix, 0, 1);
  const channel = (index: number) => Math.round(from[index] + (to[index] - from[index]) * t);
  return `rgb(${channel(0)} ${channel(1)} ${channel(2)})`;
}

function pointyHexPoints(cx: number, cy: number, radius: number) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = ((60 * index - 30) * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  });
}

function pointInPolygon(x: number, y: number, polygon: Array<{ x: number; y: number }>) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const xi = polygon[index].x;
    const yi = polygon[index].y;
    const xj = polygon[previous].x;
    const yj = polygon[previous].y;
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function findTileAtPoint(x: number, y: number, hitAreas: TileHitArea[]) {
  return hitAreas.find((hitArea) => pointInPolygon(x, y, hitArea.points))?.tileId ?? null;
}

function getLayerColor(tile: WorldState['tiles'][number], layerMode: LayerMode) {
  if (layerMode === 'habitability') {
    return blendColor([108, 87, 61], [128, 176, 118], tile.habitability / 5.2);
  }
  if (layerMode === 'water') {
    return blendColor([120, 93, 70], [88, 156, 193], tile.water / 6);
  }
  if (layerMode === 'temperature') {
    return blendColor([79, 124, 172], [201, 117, 64], (tile.temperature + 5) / 40);
  }
  return blendColor([98, 76, 57], [143, 186, 118], tile.comfort / 5.2);
}

function terrainStroke(terrain: WorldState['tiles'][number]['terrain']) {
  if (terrain === 'desert') {
    return 'rgba(255, 211, 145, 0.7)';
  }
  if (terrain === 'mountain') {
    return 'rgba(209, 223, 236, 0.8)';
  }
  if (terrain === 'coast') {
    return 'rgba(116, 170, 193, 0.8)';
  }
  return 'rgba(241, 227, 208, 0.2)';
}

export function MapCanvas({
  worldState,
  presentation,
  layerMode,
  selectedTileId,
  hoveredTileId,
  showRoutes,
  showLabels,
  showPressure,
  onSelectTile,
  onHoverTile,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hitAreasRef = useRef<TileHitArea[]>([]);
  const [size, setSize] = useState({ width: 960, height: 640 });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const update = () => {
      const rect = element.getBoundingClientRect();
      setSize({
        width: Math.max(420, Math.round(rect.width)),
        height: Math.max(420, Math.round(rect.height)),
      });
    };

    update();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = size.width * devicePixelRatio;
    canvas.height = size.height * devicePixelRatio;
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.clearRect(0, 0, size.width, size.height);

    const projected = worldState.tiles.map((tile) => {
      const x = Math.sqrt(3) * (tile.q + tile.r / 2);
      const y = 1.5 * tile.r;
      return { tile, x, y };
    });

    const minX = Math.min(...projected.map((entry) => entry.x));
    const maxX = Math.max(...projected.map((entry) => entry.x));
    const minY = Math.min(...projected.map((entry) => entry.y));
    const maxY = Math.max(...projected.map((entry) => entry.y));
    const widthSpan = Math.max(maxX - minX, 1);
    const heightSpan = Math.max(maxY - minY, 1);
    const radius = Math.min((size.width - 160) / (widthSpan + 2.6) / Math.sqrt(3), (size.height - 130) / (heightSpan + 2.4) / 2);
    const paddingX = (size.width - widthSpan * radius * Math.sqrt(3)) / 2;
    const paddingY = (size.height - heightSpan * radius * 1.9) / 2;
    const centers = new Map(
      projected.map((entry) => [
        entry.tile.id,
        {
          x: paddingX + (entry.x - minX) * radius * Math.sqrt(3),
          y: paddingY + (entry.y - minY) * radius * 1.15,
        },
      ]),
    );

    context.fillStyle = '#17140f';
    context.fillRect(0, 0, size.width, size.height);

    const gradient = context.createLinearGradient(0, 0, size.width, size.height);
    gradient.addColorStop(0, 'rgba(233, 210, 172, 0.07)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
    gradient.addColorStop(1, 'rgba(106, 65, 39, 0.1)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size.width, size.height);

    hitAreasRef.current = [];

    for (const tile of worldState.tiles) {
      const center = centers.get(tile.id)!;
      const points = pointyHexPoints(center.x, center.y, radius);
      hitAreasRef.current.push({ tileId: tile.id, points });

      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      for (const point of points.slice(1)) {
        context.lineTo(point.x, point.y);
      }
      context.closePath();
      context.fillStyle = getLayerColor(tile, layerMode);
      context.fill();

      if (showPressure) {
        const tribes = worldState.tribes.filter((tribe) => tribe.tileId === tile.id);
        const pressure = tribes.length
          ? tribes.reduce((sum, tribe) => sum + tribe.pressures.total, 0) / tribes.length
          : 0;
        if (pressure > 0.55) {
          context.save();
          context.beginPath();
          context.arc(center.x, center.y, radius * 0.92, 0, Math.PI * 2);
          context.strokeStyle = `rgba(211, 90, 59, ${0.28 + pressure * 0.45})`;
          context.lineWidth = 5;
          context.stroke();
          context.restore();
        }
      }

      context.strokeStyle = terrainStroke(tile.terrain);
      context.lineWidth = tile.id === selectedTileId ? 4 : tile.id === hoveredTileId ? 2.5 : 1.2;
      if (tile.id === selectedTileId) {
        context.strokeStyle = '#f4d393';
      }
      if (tile.id === hoveredTileId && tile.id !== selectedTileId) {
        context.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      }
      context.stroke();
    }

    if (showRoutes) {
      context.save();
      context.setLineDash([8, 10]);
      context.lineWidth = 2;
      context.strokeStyle = 'rgba(245, 210, 141, 0.75)';
      for (const route of presentation.routeLanes) {
        context.beginPath();
        route.tileIds.forEach((tileId, index) => {
          const center = centers.get(tileId);
          if (!center) {
            return;
          }
          if (index === 0) {
            context.moveTo(center.x, center.y);
          } else {
            context.lineTo(center.x, center.y);
          }
        });
        context.stroke();
      }
      context.restore();
    }

    const tribesByTile = new Map<string, WorldState['tribes']>();
    for (const tribe of worldState.tribes) {
      tribesByTile.set(tribe.tileId, [...(tribesByTile.get(tribe.tileId) ?? []), tribe]);
    }

    for (const [tileId, tribes] of tribesByTile) {
      const center = centers.get(tileId)!;
      tribes.forEach((tribe, index) => {
        const angle = ((index / Math.max(tribes.length, 1)) * Math.PI * 2) - Math.PI / 2;
        const offset = tribes.length === 1 ? 0 : radius * 0.28;
        const markerX = center.x + Math.cos(angle) * offset;
        const markerY = center.y + Math.sin(angle) * offset;
        context.beginPath();
        context.arc(markerX, markerY, 7, 0, Math.PI * 2);
        context.fillStyle = tribe.color;
        context.fill();
        context.lineWidth = tribe.statusFlags.highlighted ? 3 : 1.5;
        context.strokeStyle = tribe.statusFlags.highlighted ? '#fff0c4' : 'rgba(24, 20, 16, 0.8)';
        context.stroke();
      });
    }

    context.fillStyle = 'rgba(254, 246, 232, 0.74)';
    context.font = '12px "Palatino Linotype", Georgia, serif';
    context.textAlign = 'center';
    for (const tile of worldState.tiles) {
      const center = centers.get(tile.id)!;
      context.fillText(tile.name, center.x, center.y + radius * 0.04);
    }

    if (showLabels) {
      context.textAlign = 'left';
      for (const label of presentation.regionLabels) {
        const center = centers.get(label.tileId);
        if (!center) {
          continue;
        }
        context.fillStyle = 'rgba(255, 241, 217, 0.88)';
        context.font = '600 16px "Palatino Linotype", Georgia, serif';
        context.fillText(label.label, center.x + radius * 0.7, center.y - radius * 0.35);
        context.fillStyle = 'rgba(255, 241, 217, 0.56)';
        context.font = '11px "Segoe UI Variable Text", "Trebuchet MS", sans-serif';
        context.fillText(label.detail, center.x + radius * 0.7, center.y - radius * 0.12);
      }
    }
  }, [hoveredTileId, layerMode, presentation, selectedTileId, showLabels, showPressure, showRoutes, size, worldState]);

  function handlePointer(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    onHoverTile(findTileAtPoint(x, y, hitAreasRef.current));
  }

  function handleClick(event: React.MouseEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const tileId = findTileAtPoint(x, y, hitAreasRef.current);
    if (tileId) {
      onSelectTile(tileId);
    }
  }

  return (
    <div className="map-canvas-shell" ref={containerRef}>
      <canvas
        className="map-canvas"
        ref={canvasRef}
        onClick={handleClick}
        onPointerLeave={() => onHoverTile(null)}
        onPointerMove={handlePointer}
      />
    </div>
  );
}
