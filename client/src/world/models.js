// A fixed oblique camera leaves floor coordinates identical to network coordinates.
// All elevations lean toward the back-left; face colours use world-space normals.
export const INK = '#203334';
const PAPER = '#f4edda';
const TEAL = '#399c92';
const GOLD = '#eed46d';
const CORAL = '#e47b57';

export const OVAL_VERTICES = Array.from({length:12}, (_,i) =>
  [Math.cos(i*Math.PI/6),Math.sin(i*Math.PI/6)]);
export const DOOR_POST = .075;

function shade(hex, factor) {
  if (!/^#[\da-f]{6}$/i.test(hex)) return hex;
  const rgb = parseInt(hex.slice(1), 16);
  return 'rgb(' + [16, 8, 0].map(n => Math.round(((rgb >> n) & 255) * factor)).join(',') + ')';
}

function polygon(ctx, points, fill, outline = INK, weight = 1.6) {
  ctx.beginPath();
  points.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (outline) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = weight;
    ctx.stroke();
  }
}

export function drawFloor(ctx, w, h) {
  ctx.fillStyle = '#d6cdb6';
  ctx.fillRect(0, 0, w, h);
  tile(ctx, 0, 0, w, h);
}

function tile(ctx, x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x,y,w,h);
  ctx.clip();
  ctx.strokeStyle = 'rgba(32,51,52,.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = Math.ceil(x/40)*40; i < x+w; i+=40) { ctx.moveTo(i,y); ctx.lineTo(i,y+h); }
  for (let i = Math.ceil(y/40)*40; i < y+h; i+=40) { ctx.moveTo(x,i); ctx.lineTo(x+w,i); }
  ctx.stroke();
  // Offset printer dots give the floor a little grain at game scale.
  ctx.fillStyle = 'rgba(32,51,52,.065)';
  for (let i = Math.floor(x/10)*10; i<x+w; i+=10) {
    for (let j = Math.floor(y/10)*10; j<y+h; j+=10) ctx.fillRect(i,j+(i%20?4:0),1.35,1.35);
  }
  ctx.restore();
}

export function drawZone(ctx, {x,y,w,h,name,color = '#a4c9bb',variation}, {selected=false}={}) {
  ctx.fillStyle = color;
  ctx.fillRect(x,y,w,h);
  tile(ctx,x,y,w,h);
  ctx.strokeStyle = selected ? GOLD : 'rgba(32,51,52,.38)';
  ctx.lineWidth = selected ? 4 : 2;
  ctx.strokeRect(x+6,y+6,w-12,h-12);
  if (variation === 'boardroom_vault') ctx.strokeRect(x+12,y+12,w-24,h-24);
  if (variation === 'focus_pod') {
    ctx.fillStyle = INK;
    for (const i of [0,1,2]) ctx.fillRect(x+w-44+i*9,y+12,5,12);
  }
  if (name) {
    ctx.save();
    ctx.font = 'bold 18px "Arial Narrow", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = INK;
    const label = name.toUpperCase();
    const width = Math.min(w-24,ctx.measureText(label).width+24);
    polygon(ctx,[[x+12,y+14],[x+width+18,y+14],[x+width+12,y+43],[x+12,y+43]],INK);
    ctx.fillStyle = PAPER;
    ctx.fillText(label,x+19,y+35,width-10);
    ctx.restore();
  }
}

export function drawSpawn(ctx, {x,y,color = TEAL,variation}, {selected=false}={}) {
  ctx.save();
  ctx.translate(x,y);
  const compass = variation === 'spatial_compass';
  polygon(ctx, compass ? [[0,-30],[38,0],[0,30],[-38,0]] : [[-47,-24],[47,-24],[41,24],[-47,24]],color,selected ? GOLD : INK,selected ? 4 : 1.6);
  for (const offset of [-15,0,15]) {
    polygon(ctx,[[offset-5,8],[offset+3,-8],[offset+10,-8],[offset+2,8]],PAPER,null);
  }
  ctx.restore();
}

// Models and collision share one rotated floor footprint. Local (u,v) are
// fractions of that footprint, z is elevation in world units.
export function drawModel(ctx, model, {selected=false,backrestOnly=false,ghost=false,open=false,opening=open?1:0}={}) {
  const {kind,x,y,w,h,rotation=0,variation=''} = model;
  if (!(w>0 && h>0)) return;
  ctx.save();
  ctx.lineJoin = 'round';
  if (ghost) ctx.globalAlpha *= .6;
  const a = rotation*Math.PI/180, c=Math.cos(a), s=Math.sin(a);
  function point(u,v,z=0) {
    const dx=(u-.5)*w, dy=(v-.5)*h;
    return [x+w/2+c*dx-s*dy-.28*z,y+h/2+s*dx+c*dy-.8*z];
  }
  const rect=(u,v,b,d)=>[[u,v],[u+b,v],[u+b,v+d],[u,v+d]];
  function solid(base, z, height, color) {
    const bottom=base.map(([u,v])=>point(u,v,z));
    const top=base.map(([u,v])=>point(u,v,z+height));
    for(let i=0;i<base.length;i++){
      const j=(i+1)%base.length;
      const dx=bottom[j][0]-bottom[i][0], dy=bottom[j][1]-bottom[i][1];
      if(.28*dy-.8*dx>0.0001) {
        polygon(ctx,[bottom[i],bottom[j],top[j],top[i]],shade(color,dy>0?.52:.72));
      }
    }
    polygon(ctx,top,color);
  }
  const box=(u,v,b,d,z,height,color)=>solid(rect(u,v,b,d),z,height,color);
  const mark=(u,v,b,d,z,color)=>polygon(ctx,rect(u,v,b,d).map(([i,j])=>point(i,j,z)),color,null);
  const oval=(u,v,rx,ry)=>OVAL_VERTICES.map(([dx,dy])=>[u+rx*dx,v+ry*dy]);
  const color=model.color;
  const roundTable = variation==='racetrack_oval' || variation==='circular_round';
  if (backrestOnly) {
    box(.003,.06,.994,.15,15,12,color||TEAL);
    ctx.restore();
    return;
  }
  const footprint=(roundTable && !model.seats ? oval(.5,.5,.5,.5) : rect(0,0,1,1)).map(([u,v])=>point(u,v));
  if(kind!=='door'||!open) polygon(ctx,footprint.map(([i,j])=>[i+4,j+5]),'rgba(32,51,52,.19)',null);
  function monitor(u,v,b,d,z) {
    box(u+b*.28,v+d*.48,b*.44,d*.52,z,2,INK);
    box(u+b*.46,v+d*.24,b*.08,d*.35,z,8,'#526b69');
    const panelHeight = Math.min(54, Math.max(13, b*w*.32));
    box(u,v,b,d*.28,z+7,panelHeight,'#50686a');
    if (.8*c - .28*s <= 0) return;
    const face = (coords,fill) => polygon(ctx,coords.map(([px,py]) =>
      point(u+b*px,v+d*.28,z+7+panelHeight*py)),fill,null);
    face([[.025,.92],[.975,.92],[.975,.09],[.025,.09]],'#244b4c');
    // Two poster inks and a stair-stepped waveform on the display glass.
    face([[.04,.87],[.32,.87],[.15,.15],[.04,.15]],TEAL);
    face([[.14,.15],[.32,.87],[.38,.87],[.20,.15]],GOLD);
    for(let i=0;i<8;i++) {
      const px=.45+.06*i, peak=[.37,.48,.65,.82,.54,.68,.47,.33][i];
      face([[px,.23],[px,peak],[px+.033,peak],[px+.033,.23]],i>5?GOLD:'#abd9c6');
    }
  }

  if (kind==='wall' || kind==='window' || kind==='door') {
    const vertical=h>w, glass=kind==='window'||variation.includes('glass');
    const surface=color || (glass?'#a1d1cb':kind==='door'?GOLD:'#809997');
    const height=kind==='door'?18:24;
    const segment=(start,length,z,rise,tint)=>vertical?box(0,start,1,length,z,rise,tint):box(start,0,length,1,z,rise,tint);
    if(opening>0 && kind==='door') {
      segment(0,DOOR_POST,0,18,TEAL);
      segment(1-DOOR_POST,DOOR_POST,0,18,TEAL);
      segment(.09,.82,0,0,'#b4cead');
      if (opening < 1) segment(.08,.84*(1-opening),0,height,surface);
    } else {
      segment(0,1,0,height,surface);
      if(glass) {
        const pane=(t,z)=>vertical?point(1,t,z):point(t,1,z);
        polygon(ctx,[pane(.015,3),pane(.985,3),pane(.985,height-3),pane(.015,height-3)],'#70aaa8');
        for(let t=.04;t<.94;t+=Math.min(1,88/Math.max(w,h))) {
          const width=Math.min(.055,7/Math.max(w,h));
          polygon(ctx,[pane(t,4),pane(t+width,4),pane(t+width*2,height-4),pane(t+width,height-4)],'#c5e3d3',null);
        }
      }
      const count=Math.max(1,Math.ceil(Math.max(w,h)/(variation==='slatted_timber'?20:80)));
      for(let i=0;i<count;i++) segment(i/count,Math.min(.045,4/Math.max(w,h)),0,height+1,INK);
      if(kind==='door') {
        segment(variation==='double_swing'?.49:.72,.045,height,2,INK);
        segment(.1,.25,height,1,variation==='modern_sound_lock'?CORAL:PAPER);
        if (variation === 'sliding_pocket') {
          segment(.05,.9,height+1,1,INK);
          segment(.12,.60,height+2,1,'#9cb7af');
        } else if (variation === 'glass_frameless') {
          segment(.14,.45,height+1,1,'#d4ede2');
        } else if (variation === 'modern_sound_lock') {
          for (const t of [.12,.22,.32]) segment(t,.038,height+1,1,INK);
        }
      } else if(glass) segment(.14,.36,height,.7,'#dff6df');
    }
  } else if (kind==='plant') {
    if (variation === 'ficus_lyrata') solid(oval(.5,.5,.34,.35),0,14,PAPER);
    else box(.08,.12,.84,.76,0,12,variation==='planter_partition_box'?'#dfc198':'#c7805c');
    mark(.19,.2,.62,.57,12,INK);
    const divider = variation === 'planter_partition_box';
    const leaves = divider ? Math.min(28,Math.max(8,Math.floor(w/8))) : 7;
    for(let i=0;i<leaves;i++){
      const angle=i*2.4;
      const origin = divider ? .15+.7*i/(leaves-1) : .5;
      const spread = divider ? .14 : .45;
      const u=origin+spread*Math.cos(angle), v=.5+.44*Math.sin(angle);
      const tip=point(u,v,variation==='ficus_lyrata'?37:26+(i%3)*4);
      const root=point(origin,.52,12);
      const edge=point(origin+spread*.7*Math.cos(angle+.62),.5+.30*Math.sin(angle+.62),22);
      const other=point(origin+spread*.7*Math.cos(angle-.63),.5+.31*Math.sin(angle-.63),21);
      polygon(ctx,[root,edge,tip,other],i%2?color||'#6f9f64':'#4b8475');
      polygon(ctx,[root,tip,other],'rgba(24,55,51,.24)',null);
    }
  } else if(kind==='chair'||kind==='sofa') {
    const cover = color || (kind === 'sofa' ? CORAL : TEAL);
    const split = variation === 'accent_armchairs_set';
    const n = kind === 'chair' ? 1 : split ? 2 : Math.max(2,Math.round(w/52));
    const gap = split ? .09 : .006;
    for (let i=0; i<n; i++) {
      const u = i/n + gap/2;
      const width = 1/n-gap;
      const curved = variation === 'curved_banquette';
      const v = curved ? .04 + .26*Math.sin((i+.5)*Math.PI/n) : .06;
      const depth = variation === 'l_sectional' && i > 0 ? .59 : .9-v;
      box(u+.02,v+.03,width-.04,depth-.03,0,6,INK);
      box(u,v,width,depth,6,9,cover);
      box(u,v,width,.15,15,12,cover);
      mark(u+.03,v+.172,width-.06,.018,15,PAPER);
      if (split || i===0) box(u,v+.16,.045,depth-.23,13,7,cover);
      if (split || i===n-1) box(u+width-.045,v+.16,.045,depth-.23,13,7,cover);
    }
  } else if(kind==='rack'||kind==='server_rack'||kind==='printer'||kind==='coffee') {
    const printer=kind==='printer', coffee=kind==='coffee', height=printer?24:coffee?28:40;
    box(0,0,1,1,0,height,color||'#759191');
    box(.06,.06,.88,.88,height,3,'#405557');
    if(printer) {
      box(.14,.12,.72,.49,height+3,4,'#c4d4c8');
      box(.59,.61,.28,.16,height+3,1,'#9bd2c5');
      mark(.65,.65,.14,.04,height+4,INK);
      mark(.23,.72,.56,.12,height+3,PAPER);
    } else if(coffee) {
      box(.12,.12,.76,.44,height+3,9,'#d8c196');
      solid(oval(.45,.73,.12,.09),height+3,5,PAPER);
    } else {
      const count=variation==='blade_chassis'?7:4;
      if (variation === 'open_frame_lab') {
        for (const u of [.08,.88]) box(u,.05,.045,.9,height+3,5,'#b5c4b7');
        for (const v of [.18,.77]) box(.11,v,.77,.04,height+3,3,INK);
      }
      for(let i=0;i<count;i++) {
        mark(.12,.13+i*.72/count,.56,.055,height+3,INK);
        mark(.77,.13+i*.72/count,.09,.055,height+3,i%3?GOLD:TEAL);
      }
    }
  } else if(kind==='screen') {
    monitor(0,0,1,1,0);
  } else {
    const desk=kind==='desk', billiards=kind==='billiards';
    const surface=color||(billiards?'#67a48c':kind==='counter'?'#dec99a':'#d5a875');
    const rise = kind==='counter' || variation==='standing_desk_cluster' ? 24 : 16;
    const configuredSeats = Math.max(0,Math.min(16,Number(model.seats)||0));
    // Custom tables include chairs inside their allocated floor footprint.
    // Built-in rooms have independently positioned chairs with their own colliders.
    const composite = kind === 'table' && configuredSeats > 0;
    const seatRows = composite ? Math.ceil(configuredSeats / 2) : 0;
    function tableSeats(v, count, back) {
      for (let i=0; i<count; i++) {
        const u=.06 + .88*(i+.5)/count;
        const span=Math.min(.62/count,25/w);
        box(u-span/2,v,span,.12,1,8,INK);
        box(u-span/2,v+(back ? .075 : 0),span,.045,8,8,'#667c78');
      }
    }
    if (composite) tableSeats(.015,seatRows,false);
    const top = composite ? .17 : 0, depth = composite ? .66 : 1;
    if(roundTable) solid(oval(.5,.5,.30,.29*depth),0,rise,'#667b75');
    else box(.08,top+.07,.84,depth-.14,0,rise,'#667b75');
    if(variation==='racetrack_oval'||variation==='circular_round') solid(oval(.5,.5,.5,depth/2),rise,5,surface);
    else if(variation==='modular_u_shape'||variation==='executive_l_desk') {
      box(0,top,1,.42*depth,rise,5,surface);
      box(0,top+.42*depth,.32,.58*depth,rise,5,surface);
      if(variation==='modular_u_shape') box(.68,top+.42*depth,.32,.58*depth,rise,5,surface);
    } else box(0,top,1,depth,rise,5,surface);
    if(desk) {
      const n=variation==='quad_cluster'?4:variation==='executive_l_desk'?1:2;
      for(let i=0;i<n;i++){
        const u=.05+i*.9/n;
        const monitorWidth = variation==='executive_l_desk' ? .38 : .7/n;
        monitor(u,.12,monitorWidth,.18,rise+5);
        const keyboardWidth = Math.min(.22,.48/n);
        mark(u+.012,.31,keyboardWidth,.09,rise+5,INK);
        mark(u+.02,.325,keyboardWidth*.8,.015,rise+5,'#b9c8b9');
        mark(u+keyboardWidth+.03,.33,.028,.05,rise+5,PAPER);
      }
    } else if(billiards) {
      for(const [u,v] of [[.08,.09],[.5,.09],[.92,.09],[.08,.91],[.5,.91],[.92,.91]]) solid(oval(u,v,.027,.04),rise+5,0,INK);
      for(let i=0;i<5;i++) solid(oval(.63+(i%2)*.035,.36+i*.052,.021,.029),rise+5,2,i%2?PAPER:CORAL);
    } else {
      if (variation === 'glass_minimalist') {
        mark(.08,top+.13*depth,.64,.03,rise+5,'#c9eded');
        mark(.2,top+.19*depth,.46,.017,rise+5,'#c9eded');
      }
      mark(.19,top+.18*depth,.23,.04,rise+5,INK);
      box(.22,top+.26*depth,.15,.13*depth,rise+5,1,PAPER);
      if (w>110 && !variation.includes('u_shape')) {
        box(.62,top+.53*depth,.14,.12*depth,rise+5,1,'#437e78');
        mark(.635,top+.55*depth,.08,.018*depth,rise+6,PAPER);
        solid(oval(.79,top+.46*depth,Math.min(.025,4/w),Math.min(.06,4/h)),rise+5,4,PAPER);
      }
      if (composite) tableSeats(.865,configuredSeats-seatRows,true);
    }
  }
  if(selected) {
    ctx.beginPath();
    footprint.forEach(([i,j],n)=>n?ctx.lineTo(i,j):ctx.moveTo(i,j));
    ctx.closePath(); ctx.strokeStyle=GOLD; ctx.lineWidth=3; ctx.stroke();
  }
  ctx.restore();
}
