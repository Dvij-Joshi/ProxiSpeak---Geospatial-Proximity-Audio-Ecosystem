import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';
import { installMeetingActions, meetingHistory } from '../../server/meetingActions.js';

test('three connected participants share seats, hands, protected hits and removal', {timeout:12000}, async t => {
  const io = new Server(0);
  await once(io.httpServer,'listening');
  t.after(()=>io.close());
  const users = new Map();
  let clock = Date.now();
  io.on('connection', socket => {
    const username = socket.handshake.auth.name;
    socket.data.roomId = 'meeting-test';
    socket.join('meeting-test');
    users.set(socket.id,{username,x:10,y:20,...meetingHistory('meeting-test',username)});
    installMeetingActions(socket,io,()=>users,()=>[{id:'chair',x:15,y:22}],()=>clock);
    socket.on('disconnect',()=>users.delete(socket.id));
  });
  async function join(name) {
    const socket = connect('http://127.0.0.1:'+io.httpServer.address().port,{auth:{name},forceNew:true});
    t.after(()=>socket.disconnect());
    await once(socket,'connect');
    return socket;
  }
  const [a,b,c] = await Promise.all(['A','B','C'].map(join));
  const send = (s,action,extra={}) => s.timeout(2000).emitWithAck('meeting-action',{action,...extra});
  const seats = await Promise.all([send(a,'sit',{seat:'chair'}),send(b,'sit',{seat:'chair'})]);
  assert.equal(seats.filter(v=>v==='Chair unavailable').length,1);
  const seated = users.get(a.id).seat?a:b;
  await send(seated,'stand');
  assert.deepEqual([users.get(seated.id).x,users.get(seated.id).y],[10,20]);
  const update = new Promise(resolve => {
    function observe(event) {
      if (event.action !== 'hand') return;
      c.off('meeting-update',observe);
      resolve(event);
    }
    c.on('meeting-update',observe);
  });
  await send(a,'hand',{raised:true});
  assert.equal((await update).raised,true);
  await send(a,'hand',{raised:false});
  const toss = (s,target,sequence) => send(s,'throw',{target,sequence});
  assert.match(await toss(a,a.id,1),/another/);
  assert.match(await toss(a,'outside-room',1),/another/);
  await toss(a,b.id,1);
  assert.equal(users.get(b.id).penaltyUntil-clock,30000);
  assert.match(await toss(a,c.id,2),/cooling/);
  assert.match(await toss(c,b.id,1),/protected/);
  const departed = once(io.sockets.sockets.get(b.id),'disconnect');
  b.disconnect();
  await departed;
  const restored = await join('B');
  assert.equal(users.get(restored.id).hits,1);
  assert.equal(users.get(restored.id).penaltyUntil-clock,30000);
  clock += 30000;
  assert.match(await toss(a,restored.id,1),/processed/);
  await toss(a,restored.id,2);
  assert.equal(users.get(restored.id).penaltyUntil-clock,60000);
  clock += 60000;
  const removed = once(restored,'disconnect');
  await toss(c,restored.id,1);
  await removed;
  assert.equal(meetingHistory('meeting-test','B').hits,3);
  assert.equal(users.size,2);
  assert.equal(a.connected && c.connected,true);
});
