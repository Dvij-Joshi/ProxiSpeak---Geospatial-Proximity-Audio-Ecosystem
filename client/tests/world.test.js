import assert from 'node:assert/strict';
import test from 'node:test';
import { THEMES, makeScene } from '../src/world/scenes.js';
import { blocked, touchesModel } from '../src/world/renderScene.js';
import { calculateAcoustics, W, H } from '../src/services/spatialAudio.js';

for (const theme of new Set(Object.values(THEMES))) {
  test(theme.name + ' spawn connects to every zone and doorway', () => {
    const scene = makeScene(theme);
    const { x, y } = scene.spawn;
    assert.equal(blocked(scene, x, y, {}), false);
    const step = 10;
    const columns = W / step;
    const cells = new Uint8Array(columns * H / step);
    const queue = [Math.floor(y / step) * columns + Math.floor(x / step)];
    cells[queue[0]] = 1;
    for (let i = 0; i < queue.length; i++) {
      const cell = queue[i];
      for (const next of [cell - columns, cell + columns, cell - 1, cell + 1]) {
        if (next < 0 || next >= cells.length || cells[next]) continue;
        const nx = (next % columns) * step, ny = Math.floor(next / columns) * step;
        const solid = blocked(scene, nx, ny, {});
        cells[next] = solid ? 2 : 1;
        if (!solid) queue.push(next);
      }
    }
    for (const zone of scene.zones) {
      const reached = queue.some(cell => {
        const px = (cell % columns) * step, py = Math.floor(cell / columns) * step;
        return px > zone.x + 20 && px < zone.x + zone.w - 20 &&
          py > zone.y + 20 && py < zone.y + zone.h - 20;
      });
      assert.ok(reached, zone.name);
    }
    for (const door of scene.doors) {
      const px = door.x + door.w / 2, py = door.y + door.h / 2;
      const cell = Math.round(py / step) * columns + Math.round(px / step);
      assert.equal(cells[cell], 1, door.key);
      assert.equal(blocked(scene, px, py, { [door.key]: false }), true, door.key);
    }
    // All walkable cells inside the perimeter should be connected.
    for (let py = 40; py < H - 35; py += step) {
      for (let px = 40; px < W - 35; px += step) {
        if (!cells[py/step*columns+px/step]) {
          assert.ok(blocked(scene,px,py,{}), 'Disconnected floor at '+px+', '+py);
        }
      }
    }
  });
}

test('a rotated object and embedded door use their saved geometry', () => {
  const scene = makeScene(THEMES.office, {
    layoutId: 'custom',
    walls: [{ x: 80, y: 200, w: 280, h: 8 }],
    doors: [{ key: 'entry', x: 180, y: 200, w: 80, h: 8 }],
    furniture: [{ type: 'desk', x: 340, y: 420, w: 100, h: 30, rotation: 90 }],
    soundZones: [{ id: 'studio', name: 'Studio', bounds: {x1:80,y1:20,x2:360,y2:204}, isIsolated:true }]
  });
  assert.equal(scene.zones[0].doorKey,'entry');
  assert.equal(blocked(scene,220,204,{entry:true}),false);
  assert.equal(blocked(scene,220,204,{entry:false}),true);
  assert.equal(touchesModel(390,393,1,scene.models.at(-1)),true);
  assert.equal(touchesModel(344,435,1,scene.models.at(-1)),false);
  const listener={x:220,y:245}, speaker={x:220,y:180};
  assert.ok(calculateAcoustics(listener,speaker,{entry:true},scene).targetGain > 0);
  assert.equal(calculateAcoustics(listener,speaker,{entry:false},scene).targetGain,0);
});

test('members sitting across the meeting room table hear each other with clear in-room gain', () => {
  const scene = makeScene(THEMES.office);
  // Two members sitting on opposite sides of the meeting room conference table (168px apart)
  const memberA = { x: 260, y: 154 };
  const memberB = { x: 260, y: 322 };
  const acoustics = calculateAcoustics(memberA, memberB, { 'meeting-room': false }, scene);
  assert.equal(acoustics.status, 'in-room');
  assert.ok(acoustics.targetGain >= 0.45, `Expected in-room gain >= 0.45, got ${acoustics.targetGain}`);
});

