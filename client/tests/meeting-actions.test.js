import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { installMeetingActions, meetingHistory } from '../../server/meetingActions.js';

test('three connected participants share seats, hands, protected hits and removal', async () => {
  const users = new Map();
  const sockets = new Map();
  const broadcasts = new EventEmitter();
  let clock = Date.now();

  const io = {
    to: (room) => ({
      emit: (event, data) => broadcasts.emit(`${room}:${event}`, data)
    }),
    sockets: {
      sockets: {
        get: (id) => sockets.get(id)
      }
    }
  };

  function join(id, username) {
    const s = new EventEmitter();
    s.id = id;
    s.data = { roomId: 'meeting-test' };
    s.handshake = { auth: { name: username } };
    s.disconnect = () => {
      sockets.delete(id);
      users.delete(id);
      s.emit('disconnect');
    };
    s.emitWithAck = (event, data) => new Promise((resolve) => {
      s.emit(event, data, (reply) => resolve(reply));
    });
    sockets.set(id, s);
    users.set(id, { username, x: 10, y: 20, ...meetingHistory('meeting-test', username) });
    installMeetingActions(s, io, () => users, () => [{ id: 'chair', x: 15, y: 22 }], () => clock);
    return s;
  }

  const a = join('socket-a', 'A');
  const b = join('socket-b', 'B');
  const c = join('socket-c', 'C');

  const send = (s, action, extra = {}) => s.emitWithAck('meeting-action', { action, ...extra });
  const seats = await Promise.all([send(a, 'sit', { seat: 'chair' }), send(b, 'sit', { seat: 'chair' })]);
  assert.equal(seats.filter(v => v === 'Chair unavailable').length, 1);
  const seated = users.get(a.id).seat ? a : b;
  await send(seated, 'stand');
  assert.deepEqual([users.get(seated.id).x, users.get(seated.id).y], [10, 20]);

  const update = new Promise(resolve => {
    function observe(event) {
      if (event.action !== 'hand') return;
      broadcasts.off('meeting-test:meeting-update', observe);
      resolve(event);
    }
    broadcasts.on('meeting-test:meeting-update', observe);
  });
  await send(a, 'hand', { raised: true });
  assert.equal((await update).raised, true);
  await send(a, 'hand', { raised: false });

  const toss = (s, target, sequence) => send(s, 'throw', { target, sequence });
  assert.match(await toss(a, a.id, 1), /another/);
  assert.match(await toss(a, 'outside-room', 1), /another/);
  await toss(a, b.id, 1);
  assert.equal(users.get(b.id).penaltyUntil - clock, 30000);
  assert.match(await toss(a, c.id, 2), /cooling/);
  assert.match(await toss(c, b.id, 1), /protected/);

  b.disconnect();
  const restored = join('socket-b-restored', 'B');
  assert.equal(users.get(restored.id).hits, 1);
  assert.equal(users.get(restored.id).penaltyUntil - clock, 30000);

  clock += 30000;
  assert.match(await toss(a, restored.id, 1), /processed/);
  await toss(a, restored.id, 2);
  assert.equal(users.get(restored.id).penaltyUntil - clock, 60000);

  clock += 60000;
  let restoredDisconnected = false;
  restored.on('disconnect', () => { restoredDisconnected = true; });
  await toss(c, restored.id, 1);
  assert.equal(restoredDisconnected, true);
  assert.equal(meetingHistory('meeting-test', 'B').hits, 3);
  assert.equal(users.size, 2);
});
