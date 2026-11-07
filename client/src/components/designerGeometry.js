// =============================================================================
// ProxiSpeak Custom Office Designer - 2D Geometric Collision & Wall Expansion Engine
// Implements Separating Axis Theorem (SAT) for oriented bounding boxes & circles,
// plus Clash of Clans-style interactive continuous directional wall expansion.
// =============================================================================

/**
 * Calculates the 4 corner points of an oriented bounding box rotated around its center.
 */
export function getRotatedBoxCorners(cx, cy, w, h, rotationDeg = 0) {
  const rad = ((rotationDeg || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hw = w / 2;
  const hh = h / 2;

  return [
    { x: cx + (-hw * cos - -hh * sin), y: cy + (-hw * sin + -hh * cos) },
    { x: cx + ( hw * cos - -hh * sin), y: cy + ( hw * sin + -hh * cos) },
    { x: cx + ( hw * cos -  hh * sin), y: cy + ( hw * sin +  hh * cos) },
    { x: cx + (-hw * cos -  hh * sin), y: cy + (-hw * sin +  hh * cos) },
  ];
}

/**
 * Separating Axis Theorem (SAT) collision test between two convex polygons.
 * Margin provides tolerance so adjacent touching edges (e.g. wall corners, T-junctions)
 * do not falsely register as overlapping collisions, while actual penetration is caught.
 */
export function doPolygonsIntersect(polyA, polyB, margin = 2) {
  if (!polyA || !polyB || polyA.length < 3 || polyB.length < 3) return false;

  const polygons = [polyA, polyB];
  for (let pIdx = 0; pIdx < polygons.length; pIdx++) {
    const poly = polygons[pIdx];
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % n];
      const edgeX = p2.x - p1.x;
      const edgeY = p2.y - p1.y;
      const axisX = -edgeY;
      const axisY = edgeX;
      const len = Math.hypot(axisX, axisY);
      if (len === 0) continue;

      const normX = axisX / len;
      const normY = axisY / len;

      let minA = Infinity, maxA = -Infinity;
      for (let j = 0; j < polyA.length; j++) {
        const proj = polyA[j].x * normX + polyA[j].y * normY;
        if (proj < minA) minA = proj;
        if (proj > maxA) maxA = proj;
      }

      let minB = Infinity, maxB = -Infinity;
      for (let j = 0; j < polyB.length; j++) {
        const proj = polyB[j].x * normX + polyB[j].y * normY;
        if (proj < minB) minB = proj;
        if (proj > maxB) maxB = proj;
      }

      // Apply margin to ignore boundary contacts
      const effMinA = minA + margin;
      const effMaxA = maxA - margin;
      const effMinB = minB + margin;
      const effMaxB = maxB - margin;

      if (effMinA >= effMaxA || effMinB >= effMaxB || effMaxA < effMinB || effMaxB < effMinA) {
        return false; // Separating axis found
      }
    }
  }
  return true; // Overlap on all axes
}

/**
 * Circle vs Oriented Polygon collision test.
 */
export function doPolygonCircleIntersect(poly, circleX, circleY, radius, margin = 2) {
  if (!poly || poly.length < 3) return false;
  const effR = Math.max(2, radius - margin);

  // 1. Check if circle center is inside polygon (ray-casting)
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > circleY) !== (yj > circleY)) &&
      (circleX < ((xj - xi) * (circleY - yi)) / (yj - yi) + xi);
    if (intersect) inside = true;
  }
  if (inside) return true;

  // 2. Check distance from circle center to each polygon edge segment
  const rSq = effR * effR;
  for (let i = 0; i < poly.length; i++) {
    const p1 = poly[i];
    const p2 = poly[(i + 1) % poly.length];
    const segX = p2.x - p1.x;
    const segY = p2.y - p1.y;
    const segLenSq = segX * segX + segY * segY;
    if (segLenSq === 0) continue;

    const t = Math.max(0, Math.min(1, ((circleX - p1.x) * segX + (circleY - p1.y) * segY) / segLenSq));
    const closeX = p1.x + t * segX;
    const closeY = p1.y + t * segY;
    const distSq = (circleX - closeX) * (circleX - closeX) + (circleY - closeY) * (circleY - closeY);
    if (distSq < rSq) return true;
  }

  return false;
}

/**
 * Validates a candidate component's proposed placement against existing components in the floor plan.
 * Respects architectural design rules:
 * - Doors on Walls: ALLOWED (doors puncture walls)
 * - Wall Endpoints Touching: ALLOWED (T-junctions & corners)
 * - Wall Duplicates or Crossing penetrations: BLOCKED
 * - Furniture on Furniture / Wall / Door: BLOCKED
 * - Sound Zones: ALLOWED (zones are acoustic room areas, not physical collision obstacles)
 */
export function checkPlacementCollision(candidate, worldState, options = {}) {
  const { walls = [], doors = [], furniture = [], spawnPoint = null } = worldState;
  const { ignoreIndex = null, ignoreType = null } = options;

  if (!candidate || candidate.type === 'zone') return { isCollision: false };

  const cType = candidate.furnitureType || candidate.type;
  const isCircularCandidate = cType === 'plant' || cType === 'spawn';

  let candPoly = null;
  let candCircle = null;

  if (isCircularCandidate) {
    candCircle = {
      x: candidate.x,
      y: candidate.y,
      r: candidate.r || (cType === 'spawn' ? 22 : 18),
    };
  } else {
    const cx = candidate.x + (candidate.w || 100) / 2;
    const cy = candidate.y + (candidate.h || 80) / 2;
    candPoly = getRotatedBoxCorners(cx, cy, candidate.w || 100, candidate.h || 80, candidate.rotation || 0);
  }

  // 1. Check against Walls
  // Rule: Doors CAN overlap walls (doors belong on walls).
  // Other elements (furniture, spawn) CANNOT overlap walls.
  // Walls cannot overlap other walls (margin=2 allows corner/edge touches but catches overlaps).
  if (cType !== 'door') {
    for (let i = 0; i < walls.length; i++) {
      if (ignoreType === 'wall' && ignoreIndex === i) continue;
      const w = walls[i];
      const wcx = w.x + w.w / 2;
      const wcy = w.y + w.h / 2;
      const wPoly = getRotatedBoxCorners(wcx, wcy, w.w, w.h, w.rotation || 0);

      if (cType === 'wall') {
        // Duplicate wall check: same position
        if (Math.hypot(candidate.x - w.x, candidate.y - w.y) < 6 && Math.abs(candidate.w - w.w) < 10) {
          return { isCollision: true, collidingType: 'Wall (Duplicate)', reason: 'A wall segment already exists at this location.' };
        }
        // Penetrating wall check: margin=2 allows adjacent edge/corner contact
        if (doPolygonsIntersect(candPoly, wPoly, 2.5)) {
          return { isCollision: true, collidingType: 'Wall', reason: 'Wall intersects another wall partition.' };
        }
      } else if (isCircularCandidate) {
        if (doPolygonCircleIntersect(wPoly, candCircle.x, candCircle.y, candCircle.r, 2)) {
          return { isCollision: true, collidingType: 'Wall', reason: 'Element intersects an architectural wall.' };
        }
      } else {
        if (doPolygonsIntersect(candPoly, wPoly, 2)) {
          return { isCollision: true, collidingType: 'Wall', reason: 'Furniture intersects an architectural wall.' };
        }
      }
    }
  }

  // 2. Check against Doors
  // Furniture cannot block or collide with doors
  for (let i = 0; i < doors.length; i++) {
    if (ignoreType === 'door' && ignoreIndex === i) continue;
    const d = doors[i];
    const dcx = d.x + d.w / 2;
    const dcy = d.y + d.h / 2;
    const dPoly = getRotatedBoxCorners(dcx, dcy, d.w, d.h, d.rotation || 0);

    if (cType === 'door') {
      // Duplicate door
      if (Math.hypot(candidate.x - d.x, candidate.y - d.y) < 10) {
        return { isCollision: true, collidingType: 'Door (Duplicate)', reason: 'A door already exists at this location.' };
      }
      if (doPolygonsIntersect(candPoly, dPoly, 2)) {
        return { isCollision: true, collidingType: 'Door', reason: 'Door overlaps another door opening.' };
      }
    } else if (cType === 'wall') {
      // Wall over door check: if duplicate door area
      // (Walls are created before doors normally, but prevent placing wall directly on existing door)
      if (doPolygonsIntersect(candPoly, dPoly, 4)) {
        // Only block if wall fully overlaps door
        if (Math.hypot(candidate.x + candidate.w / 2 - dcx, candidate.y + candidate.h / 2 - dcy) < 20) {
          return { isCollision: true, collidingType: 'Door', reason: 'Cannot place wall over existing door opening.' };
        }
      }
    } else if (isCircularCandidate) {
      if (doPolygonCircleIntersect(dPoly, candCircle.x, candCircle.y, candCircle.r, 2)) {
        return { isCollision: true, collidingType: 'Door', reason: 'Element blocks a door entrance.' };
      }
    } else {
      if (doPolygonsIntersect(candPoly, dPoly, 2)) {
        return { isCollision: true, collidingType: 'Door', reason: 'Furniture blocks a door entrance.' };
      }
    }
  }

  // 3. Check against Furniture
  for (let i = 0; i < furniture.length; i++) {
    if (ignoreType === 'furniture' && ignoreIndex === i) continue;
    const f = furniture[i];

    const isPlant = f.type === 'plant' || f.furnitureType === 'plant';
    if (isPlant) {
      const fCircle = { x: f.x, y: f.y, r: f.r || 20 };
      if (isCircularCandidate) {
        if (Math.hypot(candCircle.x - fCircle.x, candCircle.y - fCircle.y) < (candCircle.r + fCircle.r - 2)) {
          return { isCollision: true, collidingType: 'Plant', reason: 'Plant overlaps with existing plant decor.' };
        }
      } else {
        if (doPolygonCircleIntersect(candPoly, fCircle.x, fCircle.y, fCircle.r, 2)) {
          return { isCollision: true, collidingType: 'Plant', reason: 'Element overlaps with plant decor.' };
        }
      }
    } else {
      // Rectangular furniture (desk, table, sofa, server_rack)
      const fw = f.w || 100;
      const fh = f.h || 80;
      const fcx = f.x + fw / 2;
      const fcy = f.y + fh / 2;
      const fPoly = getRotatedBoxCorners(fcx, fcy, fw, fh, f.rotation || 0);

      if (isCircularCandidate) {
        if (doPolygonCircleIntersect(fPoly, candCircle.x, candCircle.y, candCircle.r, 2)) {
          return { isCollision: true, collidingType: f.name || 'Furniture', reason: 'Element overlaps existing furniture.' };
        }
      } else {
        // Duplicate check
        if (Math.hypot(candidate.x - f.x, candidate.y - f.y) < 8) {
          return { isCollision: true, collidingType: f.name || 'Furniture', reason: 'Duplicate placement on existing furniture.' };
        }
        if (doPolygonsIntersect(candPoly, fPoly, 2)) {
          return { isCollision: true, collidingType: f.name || 'Furniture', reason: 'Overlaps existing workspace furniture.' };
        }
      }
    }
  }

  // 4. Check against Spawn Point
  if (spawnPoint) {
    const spR = 22;
    if (isCircularCandidate) {
      if (cType === 'spawn') {
        // Same spawn point moved is fine
      } else if (Math.hypot(candCircle.x - spawnPoint.x, candCircle.y - spawnPoint.y) < (candCircle.r + spR - 2)) {
        return { isCollision: true, collidingType: 'Spawn Marker', reason: 'Element blocks the member spawn arrival zone.' };
      }
    } else {
      if (doPolygonCircleIntersect(candPoly, spawnPoint.x, spawnPoint.y, spR, 2)) {
        return { isCollision: true, collidingType: 'Spawn Marker', reason: 'Element blocks the member spawn arrival zone.' };
      }
    }
  }

  return { isCollision: false };
}

/**
 * Calculates interactive directional wall expansion handles around a selected wall segment.
 * Inspired by Clash of Clans wall-building logic:
 * - Detects open vs connected endpoints
 * - Supports continuing straight in both directions
 * - Supports 90° corner turns (both clockwise and counter-clockwise)
 * - Automatically snaps loop closures
 */
export function getWallExpansionArrows(selectedWall, allWalls = [], worldW = 2200, worldH = 1300) {
  if (!selectedWall) return [];

  const w = selectedWall.w;
  const h = selectedWall.h;
  const isHoriz = w >= h;
  const thickness = Math.min(w, h);
  const length = Math.max(w, h);

  const arrows = [];

  // Helper to check if a proposed wall already exists in allWalls
  const isWallDuplicate = (target) => {
    return allWalls.some((existing) => {
      return (
        Math.hypot(existing.x - target.x, existing.y - target.y) < 6 &&
        Math.abs(existing.w - target.w) < 8 &&
        Math.abs(existing.h - target.h) < 8
      );
    });
  };

  // Helper to check if a point is within world bounds
  const isWithinWorld = (x, y, segW, segH) => {
    return x >= 18 && x + segW <= worldW - 18 && y >= 18 && y + segH <= worldH - 18;
  };

  // Check which ends are already connected
  // Horizontal wall has West (Left) and East (Right)
  // Vertical wall has North (Top) and South (Bottom)
  if (isHoriz) {
    const x1 = selectedWall.x;
    const x2 = selectedWall.x + w;
    const y1 = selectedWall.y;
    const y2 = selectedWall.y + h;
    const midY = y1 + h / 2;

    // Check if East (Right) end is connected
    const isEastConnected = allWalls.some((other) => {
      if (other === selectedWall) return false;
      // Other wall touching around x2
      return Math.abs(other.x - x2) < 8 || Math.abs(other.x + other.w - x2) < 8;
    });

    // Check if West (Left) end is connected
    const isWestConnected = allWalls.some((other) => {
      if (other === selectedWall) return false;
      // Other wall touching around x1
      return Math.abs(other.x + other.w - x1) < 8 || Math.abs(other.x - x1) < 8;
    });

    // 1. East (Right) End Expansion Controls
    if (!isEastConnected) {
      // 1a. Continue Straight Right [→]
      const targetRight = {
        x: x2,
        y: y1,
        w: w,
        h: h,
        rotation: 0,
        variation: selectedWall.variation || 'concrete_stud',
        color: selectedWall.color || '#2c3050',
        thickness,
      };
      if (isWithinWorld(targetRight.x, targetRight.y, targetRight.w, targetRight.h) && !isWallDuplicate(targetRight)) {
        arrows.push({
          id: 'east-extend',
          x: x2 + 22,
          y: midY,
          direction: 'right',
          icon: 'east',
          label: 'Extend Right (East)',
          targetWall: targetRight,
        });
      }

      // 1b. Turn 90° Down [↓] (Corner)
      const targetDown = {
        x: x2 - thickness,
        y: y2,
        w: thickness,
        h: length,
        rotation: 90,
        variation: selectedWall.variation || 'concrete_stud',
        color: selectedWall.color || '#2c3050',
        thickness,
      };
      if (isWithinWorld(targetDown.x, targetDown.y, targetDown.w, targetDown.h) && !isWallDuplicate(targetDown)) {
        arrows.push({
          id: 'east-turn-down',
          x: x2 + 4,
          y: y2 + 22,
          direction: 'down',
          icon: 'south',
          label: 'Turn Down (South)',
          targetWall: targetDown,
        });
      }

      // 1c. Turn 90° Up [↑] (Corner)
      const targetUp = {
        x: x2 - thickness,
        y: y1 - length,
        w: thickness,
        h: length,
        rotation: 90,
        variation: selectedWall.variation || 'concrete_stud',
        color: selectedWall.color || '#2c3050',
        thickness,
      };
      if (isWithinWorld(targetUp.x, targetUp.y, targetUp.w, targetUp.h) && !isWallDuplicate(targetUp)) {
        arrows.push({
          id: 'east-turn-up',
          x: x2 + 4,
          y: y1 - 22,
          direction: 'up',
          icon: 'north',
          label: 'Turn Up (North)',
          targetWall: targetUp,
        });
      }
    }

    // 2. West (Left) End Expansion Controls
    if (!isWestConnected) {
      // 2a. Continue Straight Left [←]
      const targetLeft = {
        x: x1 - w,
        y: y1,
        w: w,
        h: h,
        rotation: 0,
        variation: selectedWall.variation || 'concrete_stud',
        color: selectedWall.color || '#2c3050',
        thickness,
      };
      if (isWithinWorld(targetLeft.x, targetLeft.y, targetLeft.w, targetLeft.h) && !isWallDuplicate(targetLeft)) {
        arrows.push({
          id: 'west-extend',
          x: x1 - 22,
          y: midY,
          direction: 'left',
          icon: 'west',
          label: 'Extend Left (West)',
          targetWall: targetLeft,
        });
      }

      // 2b. Turn 90° Down [↓] (Corner)
      const targetWestDown = {
        x: x1,
        y: y2,
        w: thickness,
        h: length,
        rotation: 90,
        variation: selectedWall.variation || 'concrete_stud',
        color: selectedWall.color || '#2c3050',
        thickness,
      };
      if (isWithinWorld(targetWestDown.x, targetWestDown.y, targetWestDown.w, targetWestDown.h) && !isWallDuplicate(targetWestDown)) {
        arrows.push({
          id: 'west-turn-down',
          x: x1 - 4,
          y: y2 + 22,
          direction: 'down',
          icon: 'south',
          label: 'Turn Down (South)',
          targetWall: targetWestDown,
        });
      }

      // 2c. Turn 90° Up [↑] (Corner)
      const targetWestUp = {
        x: x1,
        y: y1 - length,
        w: thickness,
        h: length,
        rotation: 90,
        variation: selectedWall.variation || 'concrete_stud',
        color: selectedWall.color || '#2c3050',
        thickness,
      };
      if (isWithinWorld(targetWestUp.x, targetWestUp.y, targetWestUp.w, targetWestUp.h) && !isWallDuplicate(targetWestUp)) {
        arrows.push({
          id: 'west-turn-up',
          x: x1 - 4,
          y: y1 - 22,
          direction: 'up',
          icon: 'north',
          label: 'Turn Up (North)',
          targetWall: targetWestUp,
        });
      }
    }
  } else {
    // Vertical Wall
    const x1 = selectedWall.x;
    const x2 = selectedWall.x + w;
    const y1 = selectedWall.y;
    const y2 = selectedWall.y + h;
    const midX = x1 + w / 2;

    // Check if South (Bottom) end is connected
    const isSouthConnected = allWalls.some((other) => {
      if (other === selectedWall) return false;
      return Math.abs(other.y - y2) < 8 || Math.abs(other.y + other.h - y2) < 8;
    });

    // Check if North (Top) end is connected
    const isNorthConnected = allWalls.some((other) => {
      if (other === selectedWall) return false;
      return Math.abs(other.y + other.h - y1) < 8 || Math.abs(other.y - y1) < 8;
    });

    // 1. South (Bottom) End Expansion Controls
    if (!isSouthConnected) {
      // 1a. Continue Straight Down [↓]
      const targetDown = {
        x: x1,
        y: y2,
        w: w,
        h: h,
        rotation: 90,
        variation: selectedWall.variation || 'concrete_stud',
        color: selectedWall.color || '#2c3050',
        thickness,
      };
      if (isWithinWorld(targetDown.x, targetDown.y, targetDown.w, targetDown.h) && !isWallDuplicate(targetDown)) {
        arrows.push({
          id: 'south-extend',
          x: midX,
          y: y2 + 22,
          direction: 'down',
          icon: 'south',
          label: 'Extend Down (South)',
          targetWall: targetDown,
        });
      }

      // 1b. Turn 90° Right [→] (Corner)
      const targetRight = {
        x: x2,
        y: y2 - thickness,
        w: length,
        h: thickness,
        rotation: 0,
        variation: selectedWall.variation || 'concrete_stud',
        color: selectedWall.color || '#2c3050',
        thickness,
      };
      if (isWithinWorld(targetRight.x, targetRight.y, targetRight.w, targetRight.h) && !isWallDuplicate(targetRight)) {
        arrows.push({
          id: 'south-turn-right',
          x: x2 + 22,
          y: y2 + 4,
          direction: 'right',
          icon: 'east',
          label: 'Turn Right (East)',
          targetWall: targetRight,
        });
      }

      // 1c. Turn 90° Left [←] (Corner)
      const targetLeft = {
        x: x1 - length,
        y: y2 - thickness,
        w: length,
        h: thickness,
        rotation: 0,
        variation: selectedWall.variation || 'concrete_stud',
        color: selectedWall.color || '#2c3050',
        thickness,
      };
      if (isWithinWorld(targetLeft.x, targetLeft.y, targetLeft.w, targetLeft.h) && !isWallDuplicate(targetLeft)) {
        arrows.push({
          id: 'south-turn-left',
          x: x1 - 22,
          y: y2 + 4,
          direction: 'left',
          icon: 'west',
          label: 'Turn Left (West)',
          targetWall: targetLeft,
        });
      }
    }

    // 2. North (Top) End Expansion Controls
    if (!isNorthConnected) {
      // 2a. Continue Straight Up [↑]
      const targetUp = {
        x: x1,
        y: y1 - h,
        w: w,
        h: h,
        rotation: 90,
        variation: selectedWall.variation || 'concrete_stud',
        color: selectedWall.color || '#2c3050',
        thickness,
      };
      if (isWithinWorld(targetUp.x, targetUp.y, targetUp.w, targetUp.h) && !isWallDuplicate(targetUp)) {
        arrows.push({
          id: 'north-extend',
          x: midX,
          y: y1 - 22,
          direction: 'up',
          icon: 'north',
          label: 'Extend Up (North)',
          targetWall: targetUp,
        });
      }

      // 2b. Turn 90° Right [→] (Corner)
      const targetNorthRight = {
        x: x2,
        y: y1,
        w: length,
        h: thickness,
        rotation: 0,
        variation: selectedWall.variation || 'concrete_stud',
        color: selectedWall.color || '#2c3050',
        thickness,
      };
      if (isWithinWorld(targetNorthRight.x, targetNorthRight.y, targetNorthRight.w, targetNorthRight.h) && !isWallDuplicate(targetNorthRight)) {
        arrows.push({
          id: 'north-turn-right',
          x: x2 + 22,
          y: y1 - 4,
          direction: 'right',
          icon: 'east',
          label: 'Turn Right (East)',
          targetWall: targetNorthRight,
        });
      }

      // 2c. Turn 90° Left [←] (Corner)
      const targetNorthLeft = {
        x: x1 - length,
        y: y1,
        w: length,
        h: thickness,
        rotation: 0,
        variation: selectedWall.variation || 'concrete_stud',
        color: selectedWall.color || '#2c3050',
        thickness,
      };
      if (isWithinWorld(targetNorthLeft.x, targetNorthLeft.y, targetNorthLeft.w, targetNorthLeft.h) && !isWallDuplicate(targetNorthLeft)) {
        arrows.push({
          id: 'north-turn-left',
          x: x1 - 22,
          y: y1 - 4,
          direction: 'left',
          icon: 'west',
          label: 'Turn Left (West)',
          targetWall: targetNorthLeft,
        });
      }
    }
  }

  return arrows;
}

/**
 * Draws a stylish, Clash of Clans-inspired directional wall expansion arrow button on canvas.
 */
export function drawExpansionArrow(ctx, arrow, isHovered = false, zoom = 1) {
  const radius = Math.max(12, Math.min(20, 15 / Math.sqrt(zoom)));

  ctx.save();
  ctx.translate(arrow.x, arrow.y);

  // Outer ambient glow ring
  ctx.beginPath();
  ctx.arc(0, 0, radius + (isHovered ? 6 : 3), 0, Math.PI * 2);
  ctx.fillStyle = isHovered ? 'rgba(56, 189, 248, 0.45)' : 'rgba(56, 189, 248, 0.15)';
  ctx.fill();

  // Button background
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = isHovered ? '#0284c7' : '#080d1a';
  ctx.fill();
  ctx.strokeStyle = isHovered ? '#ffffff' : '#38bdf8';
  ctx.lineWidth = isHovered ? 2.5 : 1.8;
  ctx.stroke();

  // Vector Arrow Glyph
  ctx.fillStyle = isHovered ? '#ffffff' : '#38bdf8';
  ctx.strokeStyle = isHovered ? '#ffffff' : '#38bdf8';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const s = radius * 0.45;
  ctx.beginPath();
  if (arrow.direction === 'right') {
    ctx.moveTo(-s, 0); ctx.lineTo(s, 0);
    ctx.moveTo(s * 0.3, -s * 0.7); ctx.lineTo(s, 0); ctx.lineTo(s * 0.3, s * 0.7);
  } else if (arrow.direction === 'left') {
    ctx.moveTo(s, 0); ctx.lineTo(-s, 0);
    ctx.moveTo(-s * 0.3, -s * 0.7); ctx.lineTo(-s, 0); ctx.lineTo(-s * 0.3, s * 0.7);
  } else if (arrow.direction === 'down') {
    ctx.moveTo(0, -s); ctx.lineTo(0, s);
    ctx.moveTo(-s * 0.7, s * 0.3); ctx.lineTo(0, s); ctx.lineTo(s * 0.7, s * 0.3);
  } else if (arrow.direction === 'up') {
    ctx.moveTo(0, s); ctx.lineTo(0, -s);
    ctx.moveTo(-s * 0.7, -s * 0.3); ctx.lineTo(0, -s); ctx.lineTo(s * 0.7, -s * 0.3);
  }
  ctx.stroke();

  // Subtle '+' tag indicating addition
  ctx.font = `700 ${Math.round(radius * 0.55)}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.restore();
}

/**
 * Draws a translucent dashed ghost preview of the next wall segment on hover.
 */
export function drawExpansionPreview(ctx, arrow) {
  if (!arrow || !arrow.targetWall) return;
  const tw = arrow.targetWall;

  ctx.save();
  ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);

  ctx.fillRect(tw.x, tw.y, tw.w, tw.h);
  ctx.strokeRect(tw.x, tw.y, tw.w, tw.h);

  // Directional guide indicator
  ctx.setLineDash([]);
  ctx.font = '700 9px monospace';
  ctx.fillStyle = '#38bdf8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('+ CONNECT', tw.x + tw.w / 2, tw.y + tw.h / 2);

  ctx.restore();
}
