import { drawModel, INK, OVAL_VERTICES, DOOR_POST } from './models.js';
import { drawGround } from './scenes.js';
import { drawEarshot,drawPlayer,drawName } from './character.js';
import { W,H,isDoorOpen } from '../services/spatialAudio.js';

function touchesBox(x, y, radius, halfWidth, halfHeight) {
  const dx = Math.max(0, Math.abs(x) - halfWidth);
  const dy = Math.max(0, Math.abs(y) - halfHeight);
  return dx*dx + dy*dy <= radius*radius;
}

export function touchesModel(x, y, radius, model, open=false) {
  const angle = (model.rotation || 0) * Math.PI/180;
  const dx = x - model.x - model.w/2, dy = y - model.y - model.h/2;
  const u = dx*Math.cos(angle) + dy*Math.sin(angle);
  const v = dy*Math.cos(angle) - dx*Math.sin(angle);
  const w = model.w/2, h = model.h/2;
  if (!touchesBox(u,v,radius,w,h)) return false;
  if (model.kind === 'door' && open) {
    return w >= h
      ? touchesBox(Math.abs(u)-w*(1-DOOR_POST), v, radius, w*DOOR_POST, h)
      : touchesBox(u, Math.abs(v)-h*(1-DOOR_POST), radius, w, h*DOOR_POST);
  }
  if (model.seats || !['racetrack_oval','circular_round'].includes(model.variation)) return true;
  // The faceted table edge doubles as the collision polygon.
  let inside = true;
  for (let i=0; i<OVAL_VERTICES.length; i++) {
    const [ax,ay] = OVAL_VERTICES[i], [bx,by] = OVAL_VERTICES[(i+1)%OVAL_VERTICES.length];
    const ex=(bx-ax)*w, ey=(by-ay)*h, px=u-ax*w, py=v-ay*h;
    if (ex*py-ey*px < 0) inside=false;
    const t=Math.max(0,Math.min(1,(px*ex+py*ey)/(ex*ex+ey*ey)));
    if ((px-t*ex)**2+(py-t*ey)**2 <= radius*radius) return true;
  }
  return inside;
}

export function blocked(scene, x, y, states, radius=15) {
  return x<radius || y<radius || x>W-radius || y>H-radius ||
    scene.models.some(m => touchesModel(x,y,radius,m)) ||
    scene.doors.some(d => touchesModel(x,y,radius,d,isDoorOpen(states,d.key)));
}

function canvas(w,h) {
  const image=document.createElement('canvas');
  image.width=Math.ceil(w); image.height=Math.ceil(h);
  return image;
}

function sprite(model,cache) {
  const {x,y,w,h,rotation=0}=model;
  const a=rotation*Math.PI/180;
  const width=Math.abs(w*Math.cos(a))+Math.abs(h*Math.sin(a));
  const height=Math.abs(w*Math.sin(a))+Math.abs(h*Math.cos(a));
  const left=Math.floor((w-width)/2)-24, top=Math.floor((h-height)/2)-54;
  const key=JSON.stringify([model.kind,w,h,rotation,model.color,model.variation,model.seats]);
  let image=cache.get(key);
  if(!image) {
    image=canvas(width+40,height+68);
    drawModel(image.getContext('2d'),{...model,x:-left,y:-top});
    cache.set(key,image);
  }
  return {x:x+left,y:y+top,depth:y+(h+height)/2,image};
}

export function prepareScene(scene) {
  const floor=canvas(W,H), cache=new Map();
  drawGround(floor.getContext('2d'),scene);
  const objects=scene.models.map(m=>sprite(m,cache)).sort((a,b)=>a.depth-b.depth);
  const radar=canvas(300,Math.round(300*H/W)),ctx=radar.getContext('2d');
  ctx.scale(radar.width/W,radar.height/H);
  ctx.drawImage(floor,0,0);
  objects.forEach(o=>ctx.drawImage(o.image,o.x,o.y));
  return {floor,objects,radar,seatDepth:new Map(scene.chairs.map(c => [c.id,c.depth]))};
}

export function paintScene(ctx,scene,prepared,players,states,camera,vw,vh,zoom,time,throws=[]) {
  if(!prepared) return;
  const left=camera.x-vw/(2*zoom),top=camera.y-vh/(2*zoom),right=2*camera.x-left,bottom=2*camera.y-top;
  ctx.fillStyle=INK;ctx.fillRect(0,0,vw,vh);
  ctx.save();ctx.scale(zoom,zoom);ctx.translate(-left,-top);
  ctx.drawImage(prepared.floor,0,0);
  const me=players.find(p=>p.local);
  if(me) drawEarshot(ctx,me.x,me.y);
  const actors=[
    ...scene.doors.map(door=>({door,depth:door.y+door.h})),
    ...players.map(player=>({player,depth:prepared.seatDepth.get(player.seat) ?? player.y}))
  ].sort((a,b)=>a.depth-b.depth);
  let next=0;
  function actor({door,player}) {
    if(door) {
      const open = isDoorOpen(states,door.key);
      const elapsed = Math.min(1,(time-(states[door.key]?.changedAt ?? -Infinity))/220);
      drawModel(ctx,door,{open,opening:open?elapsed:1-elapsed});
    }
    else drawPlayer(ctx,player,time);
  }
  for(const obj of prepared.objects) {
    while(next<actors.length && actors[next].depth<obj.depth) actor(actors[next++]);
    if(obj.x<=right && obj.y<=bottom && obj.x+obj.image.width>=left && obj.y+obj.image.height>=top) {
      ctx.drawImage(obj.image,obj.x,obj.y);
    }
  }
  while(next<actors.length) actor(actors[next++]);
  for(const shot of throws) {
    const progress = Math.min(1,(time-shot.start)/400);
    const x = shot.from.x+(shot.to.x-shot.from.x)*progress;
    const y = shot.from.y+(shot.to.y-shot.from.y)*progress-26-55*Math.sin(progress*Math.PI);
    ctx.fillStyle='#d84532';
    if (progress < 1) {
      ctx.beginPath(); ctx.arc(x,y,6,0,Math.PI*2); ctx.fill(); ctx.strokeStyle=INK; ctx.stroke();
    } else {
      const spread = Math.min(1,(time-shot.start-400)/300);
      for(let i=0;i<8;i++) {
        ctx.beginPath(); ctx.arc(x+Math.cos(i*2.4)*spread*23,y+Math.sin(i*2.4)*spread*16,5-3*spread,0,Math.PI*2); ctx.fill();
      }
    }
  }
  for(const p of players) drawName(ctx,p);
  ctx.restore();
}
