// Match a saved acoustic room to its physical entrance. Presets carry a shared
// identifier; hand-drawn layouts have separately generated door and zone keys.
export function zoneForDoor(zones,door) {
  const named=zones.find(z=>z?.bounds && z.id===door.key);
  if(named) return named;
  const x=door.x+door.w/2,y=door.y+door.h/2;
  return zones.find(({bounds:b})=>b && x>=b.x1-12 && x<=b.x2+12 && y>=b.y1-12 && y<=b.y2+12 &&
    Math.min(Math.abs(x-b.x1),Math.abs(x-b.x2),Math.abs(y-b.y1),Math.abs(y-b.y2))<=12);
}
