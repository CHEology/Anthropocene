import type { RegionLabel, RouteLane, TileState, TribeState } from '../../sim/types';

const SQRT_3 = Math.sqrt(3);

export interface MapCenter {
  x: number;
  y: number;
}

export interface MapLabelPlacement {
  key: string;
  kind: 'region' | 'tile';
  text: string;
  detail?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  priority: number;
}

export interface MapLayoutResult {
  radius: number;
  centers: Map<string, MapCenter>;
  totalWidth: number;
  totalHeight: number;
  contentBounds: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
}

type AnchorDirection = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

interface TileLabelCandidate {
  tile: TileState;
  priority: number;
  detail?: string;
}

function intersects(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

export function createMapLayout(
  tiles: TileState[],
  width: number,
  height: number,
  padding = 28,
): MapLayoutResult {
  const projected = tiles.map((tile) => ({
    id: tile.id,
    unitX: SQRT_3 * (tile.q + tile.r / 2),
    unitY: 1.5 * tile.r,
  }));

  const minUnitX = Math.min(...projected.map((entry) => entry.unitX));
  const maxUnitX = Math.max(...projected.map((entry) => entry.unitX));
  const minUnitY = Math.min(...projected.map((entry) => entry.unitY));
  const maxUnitY = Math.max(...projected.map((entry) => entry.unitY));

  const availableWidth = Math.max(width - padding * 2, 1);
  const availableHeight = Math.max(height - padding * 2, 1);
  const unitSpanX = maxUnitX - minUnitX;
  const unitSpanY = maxUnitY - minUnitY;
  const radius = Math.max(
    12,
    Math.min(availableWidth / (unitSpanX + SQRT_3), availableHeight / (unitSpanY + 2)),
  );

  const totalWidth = unitSpanX * radius + SQRT_3 * radius;
  const totalHeight = unitSpanY * radius + 2 * radius;
  const offsetX = (width - totalWidth) / 2;
  const offsetY = (height - totalHeight) / 2;
  const centers = new Map<string, MapCenter>();

  for (const entry of projected) {
    centers.set(entry.id, {
      x: offsetX + (entry.unitX - minUnitX) * radius + (SQRT_3 * radius) / 2,
      y: offsetY + (entry.unitY - minUnitY) * radius + radius,
    });
  }

  return {
    radius,
    centers,
    totalWidth,
    totalHeight,
    contentBounds: {
      left: offsetX,
      right: offsetX + totalWidth,
      top: offsetY,
      bottom: offsetY + totalHeight,
    },
  };
}

function estimateLabelWidth(text: string, fontSize: number) {
  return text.length * fontSize * 0.58;
}

function placeBox(
  center: MapCenter,
  width: number,
  height: number,
  radius: number,
  anchor: AnchorDirection,
) {
  const gap = Math.max(10, radius * 0.36);
  const diagonal = gap + radius * 0.32;

  if (anchor === 'n') {
    return { x: center.x - width / 2, y: center.y - radius - gap - height };
  }
  if (anchor === 'ne') {
    return { x: center.x + diagonal, y: center.y - radius - gap - height * 0.8 };
  }
  if (anchor === 'e') {
    return { x: center.x + radius + gap, y: center.y - height / 2 };
  }
  if (anchor === 'se') {
    return { x: center.x + diagonal, y: center.y + radius * 0.2 + gap };
  }
  if (anchor === 's') {
    return { x: center.x - width / 2, y: center.y + radius + gap };
  }
  if (anchor === 'sw') {
    return { x: center.x - width - diagonal, y: center.y + radius * 0.2 + gap };
  }
  if (anchor === 'w') {
    return { x: center.x - width - radius - gap, y: center.y - height / 2 };
  }
  return { x: center.x - width - diagonal, y: center.y - radius - gap - height * 0.8 };
}

function getRouteActivity(routeLanes: RouteLane[], tileId: string) {
  return routeLanes.reduce((count, route) => count + (route.tileIds.includes(tileId) ? 1 : 0), 0);
}

export function placeMapLabels(
  tiles: TileState[],
  tribes: TribeState[],
  regionLabels: RegionLabel[],
  routeLanes: RouteLane[],
  layout: MapLayoutResult,
  width: number,
  height: number,
  selectedTileId: string | null,
  hoveredTileId: string | null,
) {
  const accepted: MapLabelPlacement[] = [];
  const occupiedTileIds = new Set(tribes.map((tribe) => tribe.tileId));
  const tileCandidates: TileLabelCandidate[] = tiles
    .map((tile) => ({
      tile,
      priority:
        tile.id === selectedTileId
          ? 100
          : tile.id === hoveredTileId
            ? 95
            : occupiedTileIds.has(tile.id)
              ? 75
              : getRouteActivity(routeLanes, tile.id) > 1
                ? 60
                : 0,
      detail:
        tile.id === selectedTileId || tile.id === hoveredTileId
          ? `${tile.region} · ${tile.climate}`
          : undefined,
    }))
    .filter((candidate) => candidate.priority > 0)
    .sort((left, right) => right.priority - left.priority);

  const tileAnchors: AnchorDirection[] = ['n', 'ne', 'nw', 's', 'e', 'w', 'se', 'sw'];
  const regionAnchors: AnchorDirection[] = ['e', 'ne', 'n', 'se', 's', 'w'];

  const tryPlace = (
    key: string,
    kind: 'region' | 'tile',
    text: string,
    detail: string | undefined,
    center: MapCenter,
    radius: number,
    priority: number,
    anchors: AnchorDirection[],
  ) => {
    const titleFontSize = kind === 'region' ? 15 : 12;
    const detailFontSize = 11;
    const textWidth = estimateLabelWidth(text, titleFontSize);
    const detailWidth = detail ? estimateLabelWidth(detail, detailFontSize) : 0;
    const labelWidth = Math.ceil(Math.max(textWidth, detailWidth) + 18);
    const labelHeight = detail ? 34 : 22;

    for (const anchor of anchors) {
      const box = placeBox(center, labelWidth, labelHeight, radius, anchor);
      const paddedBox = {
        x: box.x - 4,
        y: box.y - 4,
        width: labelWidth + 8,
        height: labelHeight + 8,
      };
      const insideBounds =
        paddedBox.x >= 12 &&
        paddedBox.y >= 12 &&
        paddedBox.x + paddedBox.width <= width - 12 &&
        paddedBox.y + paddedBox.height <= height - 12;

      if (!insideBounds) {
        continue;
      }

      if (accepted.some((placement) => intersects(paddedBox, placement))) {
        continue;
      }

      accepted.push({
        key,
        kind,
        text,
        detail,
        x: box.x,
        y: box.y,
        width: labelWidth,
        height: labelHeight,
        priority,
      });
      return;
    }
  };

  for (const label of regionLabels) {
    const center = layout.centers.get(label.tileId);
    if (!center) {
      continue;
    }
    tryPlace(
      `region-${label.id}`,
      'region',
      label.label,
      label.detail,
      center,
      layout.radius,
      90,
      regionAnchors,
    );
  }

  for (const candidate of tileCandidates) {
    const center = layout.centers.get(candidate.tile.id);
    if (!center) {
      continue;
    }
    tryPlace(
      `tile-${candidate.tile.id}`,
      'tile',
      candidate.tile.name,
      candidate.detail,
      center,
      layout.radius,
      candidate.priority,
      tileAnchors,
    );
  }

  return accepted.sort((left, right) => left.priority - right.priority);
}

export function createHexPoints(center: MapCenter, radius: number) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = ((60 * index - 30) * Math.PI) / 180;
    return {
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    };
  });
}

export function calculateMapFootprint(centers: Map<string, MapCenter>, radius: number) {
  const xs = [...centers.values()].map((center) => center.x);
  const ys = [...centers.values()].map((center) => center.y);

  return {
    width: Math.max(...xs) - Math.min(...xs) + SQRT_3 * radius,
    height: Math.max(...ys) - Math.min(...ys) + radius * 2,
  };
}
