import { useEffect, useRef, useState } from 'react';

import type { WorldPresentation, WorldState } from '../../sim/types';
import { createHexPoints, createMapLayout, placeMapLabels } from './mapLayout';

type LayerMode = 'comfort' | 'habitability' | 'water' | 'temperature';
type ThemeMode = 'dark' | 'light';

interface MapCanvasProps {
  worldState: WorldState;
  presentation: WorldPresentation;
  layerMode: LayerMode;
  selectedTileId: string | null;
  hoveredTileId: string | null;
  showRoutes: boolean;
  showLabels: boolean;
  showPressure: boolean;
  themeMode: ThemeMode;
  onSelectTile(tileId: string): void;
  onHoverTile(tileId: string | null): void;
}

interface TileHitArea {
  tileId: string;
  points: Array<{ x: number; y: number }>;
}

interface MapPalette {
  canvas: string;
  grid: string;
  frameFill: string;
  frameStroke: string;
  labelRegionFill: string;
  labelRegionStroke: string;
  labelTileFill: string;
  labelTileStroke: string;
  labelRegionText: string;
  labelTileText: string;
  labelDetail: string;
  pressureHigh: string;
  pressureMedium: string;
  route: string;
  riverGlow: string;
  riverMain: string;
  riverHighlight: string;
  selection: string;
  hover: string;
  markerOutline: string;
  allianceHalo: string;
  hazardDisaster: string;
  hazardDisease: string;
  hazardCrisis: string;
  megafaunaTrace: string;
  stats: string;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function blendColor(from: [number, number, number], to: [number, number, number], mix: number) {
  const t = clamp(mix, 0, 1);
  const channel = (index: number) => Math.round(from[index] + (to[index] - from[index]) * t);
  return `rgb(${channel(0)} ${channel(1)} ${channel(2)})`;
}

function getPalette(themeMode: ThemeMode): MapPalette {
  if (themeMode === 'light') {
    return {
      canvas: '#eef3f7',
      grid: '#d8e1ea',
      frameFill: '#f8fbfd',
      frameStroke: '#c1ccd7',
      labelRegionFill: '#e8eef4',
      labelRegionStroke: '#a8b5c4',
      labelTileFill: '#ffffff',
      labelTileStroke: '#c4cfda',
      labelRegionText: '#12202e',
      labelTileText: '#233140',
      labelDetail: '#617080',
      pressureHigh: '#bf6545',
      pressureMedium: '#997647',
      route: '#6f8398',
      riverGlow: 'rgba(121, 171, 214, 0.24)',
      riverMain: '#4b88b6',
      riverHighlight: 'rgba(233, 245, 255, 0.5)',
      selection: '#16212d',
      hover: '#5d7387',
      markerOutline: '#ffffff',
      allianceHalo: '#6e8f63',
      hazardDisaster: '#bf6545',
      hazardDisease: '#6d93b7',
      hazardCrisis: '#ba6a4a',
      megafaunaTrace: '#b88b4b',
      stats: '#5c6d7e',
    };
  }

  return {
    canvas: '#0d1117',
    grid: '#171d25',
    frameFill: '#10161d',
    frameStroke: '#202834',
    labelRegionFill: '#11161d',
    labelRegionStroke: '#556372',
    labelTileFill: '#151b23',
    labelTileStroke: '#394452',
    labelRegionText: '#f3f6fa',
    labelTileText: '#dfe6ee',
    labelDetail: '#8d98a5',
    pressureHigh: '#bf5f3c',
    pressureMedium: '#8d6a3a',
    route: '#5c6f82',
    riverGlow: 'rgba(58, 110, 153, 0.3)',
    riverMain: '#5f96c2',
    riverHighlight: 'rgba(221, 237, 248, 0.36)',
    selection: '#f2f5f8',
    hover: '#8ba1b7',
    markerOutline: '#0f141a',
    allianceHalo: '#89a97e',
    hazardDisaster: '#bf5f3c',
    hazardDisease: '#7aa2c8',
    hazardCrisis: '#d28d69',
    megafaunaTrace: '#d0a15d',
    stats: '#9ba6b2',
  };
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

function getLayerColor(tile: WorldState['tiles'][number], layerMode: LayerMode, themeMode: ThemeMode) {
  // Sea tiles are always rendered as water blue
  if (tile.terrain === 'sea') {
    return themeMode === 'light' ? 'rgb(120 165 200)' : 'rgb(35 65 95)';
  }
  if (layerMode === 'habitability') {
    return themeMode === 'light'
      ? blendColor([197, 205, 214], [129, 171, 126], tile.habitability / 5.2)
      : blendColor([82, 89, 97], [113, 161, 117], tile.habitability / 5.2);
  }
  if (layerMode === 'water') {
    return themeMode === 'light'
      ? blendColor([201, 208, 216], [110, 150, 187], tile.water / 6)
      : blendColor([84, 88, 96], [72, 125, 168], tile.water / 6);
  }
  if (layerMode === 'temperature') {
    return themeMode === 'light'
      ? blendColor([138, 171, 204], [216, 147, 118], (tile.temperature + 5) / 40)
      : blendColor([80, 122, 171], [193, 110, 81], (tile.temperature + 5) / 40);
  }
  return themeMode === 'light'
    ? blendColor([188, 198, 208], [142, 171, 134], tile.comfort / 5.2)
    : blendColor([79, 88, 95], [130, 154, 122], tile.comfort / 5.2);
}

function terrainStroke(tile: WorldState['tiles'][number], themeMode: ThemeMode) {
  if (tile.terrain === 'sea') {
    return themeMode === 'light' ? '#4a7da8' : '#2d5a7f';
  }
  if (tile.terrain === 'desert') {
    return themeMode === 'light' ? '#9f8660' : '#8e7755';
  }
  if (tile.terrain === 'mountain' || tile.terrain === 'highland') {
    return themeMode === 'light' ? '#8d97a3' : '#7f8a97';
  }
  if (tile.terrain === 'coast' || tile.terrain === 'river_valley') {
    return themeMode === 'light' ? '#5e84ac' : '#5179a6';
  }
  return themeMode === 'light' ? '#5f6d7b' : '#303743';
}

function drawLabel(
  context: CanvasRenderingContext2D,
  placement: ReturnType<typeof placeMapLabels>[number],
  palette: MapPalette,
) {
  context.fillStyle = placement.kind === 'region' ? palette.labelRegionFill : palette.labelTileFill;
  context.strokeStyle = placement.kind === 'region' ? palette.labelRegionStroke : palette.labelTileStroke;
  context.lineWidth = 1;
  context.fillRect(placement.x, placement.y, placement.width, placement.height);
  context.strokeRect(placement.x, placement.y, placement.width, placement.height);

  context.textAlign = 'left';
  context.textBaseline = 'top';
  context.fillStyle = placement.kind === 'region' ? palette.labelRegionText : palette.labelTileText;
  context.font = placement.kind === 'region'
    ? '600 13px "Aptos", "Segoe UI Variable Text", sans-serif'
    : '600 11px "Aptos", "Segoe UI Variable Text", sans-serif';
  context.fillText(placement.text, placement.x + 8, placement.y + 6);

  if (placement.detail) {
    context.fillStyle = palette.labelDetail;
    context.font = '11px "Aptos", "Segoe UI Variable Text", sans-serif';
    context.fillText(placement.detail, placement.x + 8, placement.y + 19);
  }
}

function materializeLanePoints(
  tileIds: string[],
  centers: Map<string, { x: number; y: number }>,
) {
  const points: Array<{ x: number; y: number }> = [];
  let previousTileId: string | null = null;

  for (const tileId of tileIds) {
    if (!tileId || tileId === previousTileId) {
      continue;
    }
    const center = centers.get(tileId);
    if (center) {
      points.push(center);
    }
    previousTileId = tileId;
  }

  return points;
}

function axialDistance(left: { q: number; r: number }, right: { q: number; r: number }) {
  const dq = left.q - right.q;
  const dr = left.r - right.r;
  const ds = dq + dr;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(ds)) / 2;
}

function riverTravelCost(tile: WorldState['tiles'][number]) {
  let cost = 1;

  if (tile.terrain === 'river_valley') {
    cost = 0.18;
  } else if (tile.terrain === 'coast') {
    cost = 0.46;
  } else if (tile.water >= 5) {
    cost = 0.52;
  } else if (tile.water >= 4) {
    cost = 0.72;
  } else if (tile.terrain === 'plains' || tile.terrain === 'forest') {
    cost = 0.96;
  } else if (tile.terrain === 'savanna' || tile.terrain === 'steppe') {
    cost = 1.08;
  } else if (tile.terrain === 'highland') {
    cost = 1.6;
  } else if (tile.terrain === 'desert') {
    cost = 2.2;
  } else if (tile.terrain === 'mountain') {
    cost = 3.4;
  }

  if (tile.isVolcanic || tile.isTectonic) {
    cost += 0.08;
  }

  return cost;
}

function findWeightedTilePath(
  startId: string,
  endId: string,
  tileMap: Map<string, WorldState['tiles'][number]>,
) {
  if (startId === endId) {
    return [startId];
  }

  const start = tileMap.get(startId);
  const goal = tileMap.get(endId);
  if (!start || !goal) {
    return [startId, endId].filter(Boolean);
  }

  const frontier: Array<{ tileId: string; priority: number }> = [{ tileId: startId, priority: 0 }];
  const cameFrom = new Map<string, string | null>([[startId, null]]);
  const costs = new Map<string, number>([[startId, 0]]);

  while (frontier.length) {
    frontier.sort((left, right) => left.priority - right.priority);
    const currentId = frontier.shift()!.tileId;
    if (currentId === endId) {
      break;
    }

    const current = tileMap.get(currentId);
    if (!current) {
      continue;
    }

    for (const neighborId of current.neighbors) {
      const neighbor = tileMap.get(neighborId);
      if (!neighbor) {
        continue;
      }

      const nextCost = (costs.get(currentId) ?? 0) + riverTravelCost(neighbor);
      if (nextCost >= (costs.get(neighborId) ?? Number.POSITIVE_INFINITY)) {
        continue;
      }

      costs.set(neighborId, nextCost);
      cameFrom.set(neighborId, currentId);
      frontier.push({
        tileId: neighborId,
        priority: nextCost + axialDistance(neighbor, goal) * 0.28,
      });
    }
  }

  if (!cameFrom.has(endId)) {
    return [startId, endId];
  }

  const path: string[] = [];
  let cursor: string | null = endId;
  while (cursor) {
    path.push(cursor);
    cursor = cameFrom.get(cursor) ?? null;
  }

  return path.reverse();
}

function densifyPolyline(points: Array<{ x: number; y: number }>) {
  if (points.length < 2) {
    return points;
  }

  const dense: Array<{ x: number; y: number }> = [points[0]];
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    dense.push(
      { x: current.x + (next.x - current.x) / 3, y: current.y + (next.y - current.y) / 3 },
      { x: (current.x + next.x) / 2, y: (current.y + next.y) / 2 },
      { x: current.x + ((next.x - current.x) * 2) / 3, y: current.y + ((next.y - current.y) * 2) / 3 },
      next,
    );
  }

  return dense;
}

function materializeRiverLanePoints(
  tileIds: string[],
  tiles: WorldState['tiles'],
  centers: Map<string, { x: number; y: number }>,
) {
  const tileMap = new Map(tiles.map((tile) => [tile.id, tile] as const));
  const expandedTileIds: string[] = [];

  for (let index = 0; index < tileIds.length; index += 1) {
    const tileId = tileIds[index];
    if (!tileId) {
      continue;
    }

    if (!expandedTileIds.length) {
      expandedTileIds.push(tileId);
      continue;
    }

    const previousTileId = expandedTileIds[expandedTileIds.length - 1];
    const segment = findWeightedTilePath(previousTileId, tileId, tileMap);
    expandedTileIds.push(...segment.slice(1));
  }

  return densifyPolyline(materializeLanePoints(expandedTileIds, centers));
}

function traceSmoothLane(
  context: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
) {
  if (points.length < 2) {
    return;
  }

  context.beginPath();
  context.moveTo(points[0].x, points[0].y);

  if (points.length === 2 || typeof context.quadraticCurveTo !== 'function') {
    for (const point of points.slice(1)) {
      context.lineTo(point.x, point.y);
    }
    return;
  }

  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;
    context.quadraticCurveTo(current.x, current.y, midX, midY);
  }

  const penultimate = points[points.length - 2];
  const last = points[points.length - 1];
  context.quadraticCurveTo(penultimate.x, penultimate.y, last.x, last.y);
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
  themeMode,
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

    const update = (width = element.clientWidth, height = element.clientHeight) => {
      const nextWidth = Math.max(520, Math.round(width));
      const nextHeight = Math.max(440, Math.round(height));
      setSize((current) => (
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight }
      ));
    };

    update();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries.find((candidate) => candidate.target === element);
      if (!entry) {
        return;
      }
      update(entry.contentRect.width, entry.contentRect.height);
    });
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

    const palette = getPalette(themeMode);
    const devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.width * devicePixelRatio);
    canvas.height = Math.round(size.height * devicePixelRatio);
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.clearRect(0, 0, size.width, size.height);

    const layout = createMapLayout(worldState.tiles, size.width, size.height, 36);
    const labelPlacements = showLabels
      ? placeMapLabels(
          worldState.tiles,
          worldState.tribes,
          presentation.regionLabels,
          presentation.routeLanes,
          layout,
          size.width,
          size.height,
          selectedTileId,
          hoveredTileId,
        )
      : [];

    context.fillStyle = palette.canvas;
    context.fillRect(0, 0, size.width, size.height);

    context.strokeStyle = palette.grid;
    context.lineWidth = 1;
    for (let x = 0; x < size.width; x += 48) {
      context.beginPath();
      context.moveTo(x + 0.5, 0);
      context.lineTo(x + 0.5, size.height);
      context.stroke();
    }
    for (let y = 0; y < size.height; y += 48) {
      context.beginPath();
      context.moveTo(0, y + 0.5);
      context.lineTo(size.width, y + 0.5);
      context.stroke();
    }

    context.fillStyle = palette.frameFill;
    context.fillRect(
      layout.contentBounds.left - 18,
      layout.contentBounds.top - 18,
      layout.totalWidth + 36,
      layout.totalHeight + 36,
    );
    context.strokeStyle = palette.frameStroke;
    context.strokeRect(
      layout.contentBounds.left - 18,
      layout.contentBounds.top - 18,
      layout.totalWidth + 36,
      layout.totalHeight + 36,
    );

    hitAreasRef.current = [];

    for (const tile of worldState.tiles) {
      const center = layout.centers.get(tile.id)!;
      const points = createHexPoints(center, layout.radius);
      hitAreasRef.current.push({ tileId: tile.id, points });

      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      for (const point of points.slice(1)) {
        context.lineTo(point.x, point.y);
      }
      context.closePath();
      context.fillStyle = getLayerColor(tile, layerMode, themeMode);
      context.fill();

      context.strokeStyle = terrainStroke(tile, themeMode);
      context.lineWidth = 1.1;
      context.stroke();

      if (showPressure) {
        const tribes = worldState.tribes.filter((tribe) => tribe.tileId === tile.id);
        const pressure = tribes.length
          ? tribes.reduce((sum, tribe) => sum + tribe.pressures.total, 0) / tribes.length
          : 0;
        if (pressure > 0.5) {
          context.fillStyle = pressure > 0.75 ? palette.pressureHigh : palette.pressureMedium;
          context.fillRect(center.x - layout.radius * 0.45, center.y + layout.radius * 0.36, layout.radius * 0.9, 4);
        }
      }
      if (tile.activePlagues.length) {
        context.beginPath();
        context.arc(center.x - layout.radius * 0.34, center.y - layout.radius * 0.44, 4.5, 0, Math.PI * 2);
        context.fillStyle = palette.hazardDisease;
        context.fill();
      }

      if ((tile.id === hoveredTileId || tile.id === selectedTileId) && tile.megafaunaIndex > 0.08) {
        context.beginPath();
        context.arc(center.x + layout.radius * 0.28, center.y - layout.radius * 0.34, 5.5, 0, Math.PI * 2);
        context.strokeStyle = palette.megafaunaTrace;
        context.lineWidth = 1.6;
        context.stroke();
      }

      if ((tile.id === hoveredTileId || tile.id === selectedTileId) && (tile.activeDisasters.length || tile.activePlagues.length)) {
        context.beginPath();
        context.arc(center.x, center.y, layout.radius * 0.26, 0, Math.PI * 2);
        context.strokeStyle = palette.hazardCrisis;
        context.lineWidth = 1.4;
        context.stroke();
      }

      if (tile.id === hoveredTileId || tile.id === selectedTileId) {
        context.beginPath();
        context.moveTo(points[0].x, points[0].y);
        for (const point of points.slice(1)) {
          context.lineTo(point.x, point.y);
        }
        context.closePath();
        context.strokeStyle = tile.id === selectedTileId ? palette.selection : palette.hover;
        context.lineWidth = tile.id === selectedTileId ? 2.6 : 2;
        context.stroke();
      }
    }

    const scriptedRiverLanes = (presentation.riverLanes ?? [])
      .map((lane) => materializeRiverLanePoints(lane.tileIds, worldState.tiles, layout.centers))
      .filter((points) => points.length > 1);

    if (scriptedRiverLanes.length > 0) {
      context.save();
      context.lineCap = 'round';
      context.lineJoin = 'round';

      for (const points of scriptedRiverLanes) {
        const width = clamp(2.1 + Math.sqrt(points.length) * 0.16, 2.2, 4.8);

        context.strokeStyle = palette.riverGlow;
        context.globalAlpha = themeMode === 'dark' ? 0.42 : 0.3;
        context.lineWidth = width + 2.2;
        traceSmoothLane(context, points);
        context.stroke();

        context.strokeStyle = palette.riverMain;
        context.globalAlpha = themeMode === 'dark' ? 0.92 : 0.84;
        context.lineWidth = width;
        traceSmoothLane(context, points);
        context.stroke();

        context.strokeStyle = palette.riverHighlight;
        context.globalAlpha = themeMode === 'dark' ? 0.55 : 0.4;
        context.lineWidth = Math.max(0.9, width * 0.34);
        traceSmoothLane(context, points);
        context.stroke();
      }

      context.restore();
    } else {
      const riverTiles = worldState.tiles.filter(
        (tile) => tile.terrain === 'river_valley' || (tile.water >= 5 && tile.terrain !== 'desert'),
      );
      const riverTileIds = new Set(riverTiles.map((tile) => tile.id));
      const riverChains: Array<Array<{ x: number; y: number }>> = [];
      const visitedRiverEdges = new Set<string>();

      for (const tile of riverTiles) {
        const center = layout.centers.get(tile.id);
        if (!center) {
          continue;
        }
        for (const neighborId of tile.neighbors) {
          if (!riverTileIds.has(neighborId)) {
            continue;
          }
          const edgeKey = [tile.id, neighborId].sort().join(':');
          if (visitedRiverEdges.has(edgeKey)) {
            continue;
          }
          visitedRiverEdges.add(edgeKey);
          const neighborCenter = layout.centers.get(neighborId);
          if (!neighborCenter) {
            continue;
          }
          riverChains.push([center, neighborCenter]);
        }
      }

      if (riverChains.length > 0 || riverTiles.length > 0) {
        context.save();
        context.lineCap = 'round';
        context.lineJoin = 'round';

        for (const chain of riverChains) {
          if (chain.length < 2) {
            continue;
          }
          context.strokeStyle = palette.riverMain;
          context.globalAlpha = themeMode === 'dark' ? 0.42 : 0.34;
          context.lineWidth = 2.4;
          traceSmoothLane(context, chain);
          context.stroke();
        }

        for (const tile of riverTiles) {
          if (tile.terrain !== 'river_valley') {
            continue;
          }
          const center = layout.centers.get(tile.id);
          if (!center) {
            continue;
          }
          const hasRiverNeighbor = tile.neighbors.some((neighborId) => riverTileIds.has(neighborId));
          if (!hasRiverNeighbor) {
            context.beginPath();
            context.arc(center.x, center.y, layout.radius * 0.18, 0, Math.PI * 2);
            context.fillStyle = palette.riverMain;
            context.globalAlpha = themeMode === 'dark' ? 0.3 : 0.24;
            context.fill();
          }
        }

        context.restore();
      }
    }

    if (showRoutes) {
      context.save();
      context.lineWidth = 2;
      context.strokeStyle = palette.route;
      for (const route of presentation.routeLanes) {
        context.beginPath();
        route.tileIds.forEach((tileId, index) => {
          const center = layout.centers.get(tileId);
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
      const center = layout.centers.get(tileId)!;
      const markerRadius = clamp(layout.radius * 0.15, 5, 8);
      tribes.forEach((tribe, index) => {
        const angle = ((index / Math.max(tribes.length, 1)) * Math.PI * 2) - Math.PI / 2;
        const offset = tribes.length === 1 ? 0 : layout.radius * 0.26;
        const markerX = center.x + Math.cos(angle) * offset;
        const markerY = center.y + Math.sin(angle) * offset;
        if (tribe.alliances.length) {
          context.beginPath();
          context.arc(markerX, markerY, markerRadius + 1.8, 0, Math.PI * 2);
          context.strokeStyle = palette.allianceHalo;
          context.lineWidth = 1.4;
          context.stroke();
        }
        context.beginPath();
        context.arc(markerX, markerY, markerRadius, 0, Math.PI * 2);
        context.fillStyle = tribe.color;
        context.fill();
        context.lineWidth = tribe.statusFlags.highlighted ? 2 : 1;
        context.strokeStyle = palette.markerOutline;
        context.stroke();
      });
    }

    if (showLabels) {
      for (const placement of labelPlacements) {
        drawLabel(context, placement, palette);
      }
    }

    context.fillStyle = palette.stats;
    context.font = '11px "Consolas", "SFMono-Regular", monospace';
    context.textAlign = 'left';
    context.textBaseline = 'top';
    context.fillText(`LAYER ${layerMode.toUpperCase()}`, 16, 16);
    context.fillText(`TILES ${worldState.tiles.length}`, 16, 32);
    context.fillText(`TRIBES ${worldState.tribes.length}`, 16, 48);
  }, [hoveredTileId, layerMode, presentation, selectedTileId, showLabels, showPressure, showRoutes, size, themeMode, worldState]);

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
