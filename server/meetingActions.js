// A meeting survives a brief loss of its last connection.
const histories = new Map();
export function meetingHistory(room, username) {
  let history = histories.get(room);
  if (!history) histories.set(room, history = { members: new Map() });
  clearTimeout(history.timer);
  const key = username.trim().toLowerCase();
  if (!history.members.has(key)) history.members.set(key, { hits: 0, penaltyUntil: 0, cooldownUntil: 0 });
  return history.members.get(key);
}

export function expireEmptyMeeting(room, users) {
  const history = histories.get(room);
  if (!users.size && history) {
    clearTimeout(history.timer);
    history.timer = setTimeout(() => { if (!users.size) histories.delete(room); }, 120000);
    history.timer.unref();
  }
}

export function installMeetingActions(socket, io, getUsers, getChairs, now = Date.now) {
  socket.on('meeting-action', (request = {}, reply) => {
    const reject = message => { if (typeof reply === 'function') reply(message); };
    const room = socket.data.roomId;
    if (!room || !request) return;
    const users = getUsers(room);
    const actor = users.get(socket.id);
    if (!actor) return;
    const time = now();
    const publish = (action, data) => io.to(room).emit('meeting-update', {
      action, id: socket.id, serverTime: time, ...data,
    });
    if (request.action === 'hand') {
      if (typeof request.raised !== 'boolean' || actor.raised === request.raised) return;
      actor.raised = request.raised;
      publish('hand', { raised: actor.raised });
    } else if (request.action === 'sit' || request.action === 'stand') {
      if (request.action === 'sit') {
        const chair = getChairs(room,actor).find(c => c.id === request.seat);
        if (actor.seat || !chair || Math.hypot(actor.x-chair.x,actor.y-chair.y) > 52 ||
            [...users.values()].some(u => u.seat === chair.id)) return reject('Chair unavailable');
        actor.standPoint = { x: actor.x, y: actor.y };
        Object.assign(actor, { seat: chair.id, x: chair.x, y: chair.y });
      } else {
        if (!actor.seat) return;
        Object.assign(actor, actor.standPoint, { seat: null });
        delete actor.standPoint;
      }
      Object.assign(socket.data, { x: actor.x, y: actor.y });
      publish(request.action, { seat: actor.seat, x: actor.x, y: actor.y });
    } else if (request.action === 'throw') {
      const target = users.get(request.target);
      if (!target || target === actor) return reject('Choose another participant');
      if (actor.cooldownUntil > time) return reject('Throw is cooling down');
      if (target.penaltyUntil > time) return reject('This participant is protected');
      if (request.sequence !== (actor.throwCount || 0) + 1) return reject('Throw already processed');
      actor.throwCount = request.sequence;
      actor.cooldownUntil = time + 2000;
      Object.assign(meetingHistory(room, actor.username), { cooldownUntil: actor.cooldownUntil, throwCount: actor.throwCount });
      target.hits = (target.hits || 0) + 1;
      target.penaltyUntil = time + (target.hits === 1 ? 30000 : 60000);
      Object.assign(meetingHistory(room, target.username), { hits: target.hits, penaltyUntil: target.penaltyUntil });
      target.isMuted = true;
      publish('throw', { throwCount:actor.throwCount, target: request.target, hits: target.hits, penaltyUntil: target.penaltyUntil,
        cooldownUntil: actor.cooldownUntil, from: {x:actor.x,y:actor.y}, to: {x:target.x,y:target.y} });
      if (target.hits >= 3) io.sockets.sockets.get(request.target)?.disconnect(true);
    }
    if (typeof reply === 'function') reply();
  });
}
