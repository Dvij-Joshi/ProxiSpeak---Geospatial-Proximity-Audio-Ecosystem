import { INK } from './models.js';
import { MAX_DISTANCE } from '../services/spatialAudio.js';

function shape(ctx,points,fill) {
  ctx.beginPath();
  points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
  ctx.closePath(); ctx.fillStyle=fill; ctx.fill(); ctx.strokeStyle=INK; ctx.lineWidth=1.5; ctx.stroke();
}

export function drawCharacter(ctx,x,y,color,{moving=false,facing=1,back=false,time=0,seat=0,raised,red,chair}={}) {
  ctx.save();
  ctx.translate(x,y);
  ctx.fillStyle='rgba(32,51,52,.25)';
  ctx.beginPath(); ctx.ellipse(3,1,13,5,-.08,0,Math.PI*2); ctx.fill();
  const forwardX = chair ? -Math.sin(chair.angle) : 0;
  const forwardY = chair ? Math.cos(chair.angle) : 1;
  const sign = seat>.5 && Math.abs(forwardX)>.12 ? Math.sign(forwardX) : seat>.5 ? 1 : facing<0?-1:1;
  ctx.scale(sign,1);
  if (seat && chair) {
    // Project the hip onto the cushion with the same elevation shear as the chair mesh.
    ctx.translate(-.28*chair.height*sign*seat,(11-.8*chair.height)*seat);
  }
  const step=moving?Math.sin(time/95)*3.4:0;
  ctx.translate(0,-Math.abs(step)*.27);
  // High-top boots, cuffed trousers, colour-block jacket, face and swept hair.
  for(const [offset,stride] of [[-7,-step],[3,step]]) {
    if (seat && chair) {
      const hipX = offset+3, hipY = -11;
      const kneeX = hipX+sign*forwardX*12*seat;
      const kneeY = hipY+forwardY*9*seat+6*(1-seat);
      const ankleY = kneeY+8;
      shape(ctx,[[hipX-3,hipY-2],[hipX+3,hipY-2],[kneeX+3,kneeY],[kneeX+3,ankleY],[kneeX-3,ankleY],[kneeX-3,kneeY+2],[hipX-3,hipY+4]],'#465660');
      shape(ctx,[[kneeX-3,ankleY-1],[kneeX+3,ankleY-1],[kneeX+5,ankleY+2],[kneeX-3,ankleY+2]],'#eee0b8');
      continue;
    }
    shape(ctx,[[offset,-13],[offset+7,-13],[offset+6,stride-2],[offset+8,stride],[offset+8,stride+2],[offset-1,stride+2]],'#465660');
    shape(ctx,[[offset-1,stride-2],[offset+6,stride-2],[offset+10,stride],[offset+9,stride+2],[offset-1,stride+2]],'#eee0b8');
  }
  shape(ctx,[[-10,-24],[-5,-29],[5,-29],[10,-24],[8,-10],[-8,-10]],color||'#429a8a');
  shape(ctx,[[-10,-24],[-6,-24],[-6,-14],[-10,-11],[-13,-14]],color||'#429a8a');
  ctx.save(); ctx.translate(8,-24); ctx.rotate(-2.65*(raised || 0));
  shape(ctx,[[-2,-2],[3,0],[5,10],[1,12],[-2,7]],color||'#429a8a');
  ctx.restore();
  if (back) {
    shape(ctx,[[-6,-26],[1,-23],[7,-26],[6,-22],[0,-20],[-6,-22]],'#526764');
    shape(ctx,[[-8,-38],[-6,-42],[3,-44],[8,-40],[9,-34],[6,-29],[-2,-28],[-7,-31]],'#394348');
  } else {
    shape(ctx,[[-5,-28],[1,-24],[5,-28],[2,-16]],'#f1daba');
  shape(ctx,[[-7,-38],[-2,-42],[6,-40],[9,-36],[9,-31],[5,-27],[-1,-27],[-7,-32]],red ? '#d64839' : '#c79271');
  shape(ctx,[[-9,-36],[-8,-41],[-3,-44],[4,-43],[8,-41],[10,-37],[4,-38],[0,-35],[-3,-36],[-4,-31],[-7,-32]],'#394348');
  ctx.fillStyle=INK; ctx.fillRect(5,-34,1.8,1.7);
  }
  ctx.restore();
}

export function drawEarshot(ctx,x,y) {
  ctx.save();
  ctx.strokeStyle='rgba(42,102,95,.46)'; ctx.lineWidth=1.4; ctx.setLineDash([8,10]);
  ctx.beginPath(); ctx.arc(x,y,MAX_DISTANCE,0,Math.PI*2); ctx.stroke();
  ctx.restore();
}

export function drawPlayer(ctx,p,time,chair) {
  const {x,y,color,moving,local,muted,speaking,intensity,facing}=p;
  ctx.save();
  const transition = Math.max(0,1-(time-(p.seatAt ?? -Infinity))/280);
  if (transition && Number.isFinite(p.previousX)) {
    ctx.translate((p.previousX-x)*transition**2,(p.previousY-y)*transition**2);
  }
  const live=!muted && (speaking || intensity>.05);
  ctx.strokeStyle=live?'#327b64':local?'#f8edb7':'#55675d';
  ctx.lineWidth=local||live?3:1.4;
  ctx.beginPath(); ctx.ellipse(x,y,local?18:15,local?8:6,0,0,Math.PI*2); ctx.stroke();
  if(live) {
    const phase=(time%800)/800;
    ctx.globalAlpha=1-phase;
    ctx.beginPath(); ctx.ellipse(x,y,18+phase*10,8+phase*5,0,0,Math.PI*2); ctx.stroke();
    ctx.globalAlpha=1;
  }
  if (p.selected) {
    ctx.strokeStyle='#d94b32'; ctx.lineWidth=3;
    ctx.strokeRect(x-19,y-46,38,48);
  }
  const pose = (active,since) => {
    const progress = Math.min(1,(time-(since ?? -Infinity))/180);
    return active ? progress : 1-progress;
  };
  drawCharacter(ctx,x,y,color,{moving,facing,chair,back:p.seat && chair ? Math.cos(chair.angle)<-.3 : p.back,time,
    seat:pose(p.seat,p.seatAt),raised:pose(p.raised,p.handAt),red:p.red});
  ctx.restore();
}

export function drawName(ctx,p) {
  const {x,y,name,muted,speaking,intensity,acoustic,volume,local}=p;
  const live=!muted && (speaking||intensity>.05);
  ctx.save(); ctx.textAlign='center'; ctx.font='bold 11px Arial';
  const label=(p.raised ? '\u270b ' : '') + String(name||'Guest').slice(0,26);
  const width=ctx.measureText(label).width+26;
  ctx.fillStyle=INK; ctx.fillRect(x-width/2,y-64,width,16);
  ctx.fillStyle='#fff3d4'; ctx.fillText(label,x+5,y-52.5);
  ctx.fillStyle=muted?'#e98769':live?'#a6df8f':'#eed46d';
  for(let i=0;i<3;i++){
    const h=muted?2:live?3+i*2:3;
    ctx.fillRect(x-width/2+4+i*2.7,y-55-h/2,1.8,h);
  }
  const pct=Math.round((volume||0)*100)+'%';
  const statuses={'door-closed':'Door closed','blocked-wall':'Soundproof',occluded:'Muffled',doorway:'Open door','in-room':acoustic?.remoteRoom?.name};
  const detail=local?acoustic?.localRoom?.name:statuses[acoustic?.status]||((volume||0)>.04?pct:'');
  if(detail) {
    ctx.font='bold 9px Arial';
    const sub=detail+(!local&&statuses[acoustic?.status]?' · '+pct:'');
    const w=ctx.measureText(sub).width+8;
    ctx.fillStyle='#f4edda';ctx.fillRect(x-w/2,y+8,w,13);ctx.fillStyle=INK;ctx.fillText(sub,x,y+18);
  }
  ctx.restore();
}
