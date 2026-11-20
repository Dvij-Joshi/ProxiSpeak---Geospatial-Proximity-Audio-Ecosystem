// Saved layouts store plant, chair, and screen coordinates at their centers.
// Orthogonal partitions already encode their orientation in width and height.
export function toSceneModel(record, type = 'furniture') {
  const kind = type === 'furniture' ? (record.furnitureType || record.type) : type;
  let { x, y, w, h, rotation = 0 } = record;
  if (kind === 'plant' || kind === 'chair' || kind === 'screen') {
    const radius = record.r || 18;
    const divider = record.variation === 'planter_partition_box';
    w = w || (divider ? 140 : kind === 'plant' ? radius * 2 : kind === 'chair' ? 26 : 40);
    h = h || (divider ? 36 : kind === 'plant' ? radius * 2 : kind === 'chair' ? 24 : 10);
    x -= w / 2;
    y -= h / 2;
  }
  if ((kind === 'wall' || kind === 'door') && rotation % 90 === 0) rotation = 0;
  const kinds = { rect: 'table', conf_table: 'table', server_rack: 'rack' };
  return { ...record, kind: kinds[kind] || kind, x, y, w: w || 80, h: h || 48, rotation };
}

export function toSceneZone(zone) {
  const { x1, x2, y1, y2 } = zone.bounds;
  return { ...zone, x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

// Subtract collinear doors in wall-local coordinates, including angled walls.
export function layoutWallSegments(walls = [], doors = []) {
  const openings = doors.map(d => toSceneModel(d, 'door'));
  return walls.flatMap((wall, index) => {
    const model = { ...toSceneModel(wall, 'wall'), index };
    const horizontal = model.w >= model.h;
    const angle = (model.rotation + (horizontal ? 0 : 90)) * Math.PI / 180;
    const ux = Math.cos(angle), uy = Math.sin(angle);
    const cx = model.x + model.w / 2, cy = model.y + model.h / 2;
    const length = Math.max(model.w, model.h), thickness = Math.min(model.w, model.h);
    const gaps = [];
    for (const d of openings) {
      const da = (d.rotation + (d.w >= d.h ? 0 : 90)) * Math.PI / 180;
      if (Math.abs(Math.sin(da - angle)) > 0.001) continue;
      const dx = d.x + d.w / 2 - cx, dy = d.y + d.h / 2 - cy;
      if (Math.abs(dx * uy - dy * ux) >= (thickness + Math.min(d.w, d.h)) / 2) continue;
      const middle = dx * ux + dy * uy + length / 2;
      const half = Math.max(d.w, d.h) / 2;
      const start = Math.max(0, middle - half), end = Math.min(length, middle + half);
      if (end > start + 0.001) gaps.push([start, end]);
    }
    if (!gaps.length) return [model];
    const pieces = [];
    let cursor = 0;
    function add(end) {
      if (end - cursor <= 0.001) return;
      const w = horizontal ? end - cursor : thickness;
      const h = horizontal ? thickness : end - cursor;
      const offset = (cursor + end - length) / 2;
      pieces.push({ ...model, x: cx + ux * offset - w / 2, y: cy + uy * offset - h / 2, w, h });
    }
    for (const [start, end] of gaps.sort((a, b) => a[0] - b[0])) {
      add(start);
      cursor = Math.max(cursor, end);
    }
    add(length);
    return pieces;
  });
}
