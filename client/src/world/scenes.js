import { zoneForDoor } from './roomGeometry.js';
import { W,H,WALLS,ROOMS,DOORS } from '../services/spatialAudio.js';
import { drawFloor,drawZone,drawSpawn,INK } from './models.js';
import { layoutWallSegments,toSceneModel,toSceneZone } from '../components/layoutModels.js';

const model=(kind,x,y,w,h,color,variation)=>({kind,x,y,w,h,color,variation});
const plant=(x,y,size=32)=>model('plant',x,y,size,size);
const wall=(x,y,w,h)=>model('wall',x,y,w,h);
const zone=(name,x,y,w,h,color,extra={})=>({name,x,y,w,h,color,...extra});
const chairs=(xs,ys,rotation=0)=>ys.flatMap(y=>xs.map(x=>({...model('chair',x,y,28,26),rotation})));
const tableChairs=(xs,back,front)=>[...chairs(xs,[back]),...chairs(xs,[front],180)];
const desk=(x,y)=>model('desk',x,y,144,56);
const doorModels=Object.entries(DOORS).map(([key,d])=>({...d.wall,kind:'door',key,name:d.name}));
const perimeter=WALLS.slice(0,4);

// Windows replace stretches of the wall, so glass and piers share its footprint.
function glazed(walls) {
  return walls.flatMap((r,i)=>{
    if(Math.max(r.w,r.h)<200 || i%3===1) return [{...r,kind:'wall'}];
    const along=r.w>r.h?'w':'h', origin=along==='w'?'x':'y', length=r[along];
    const end=Math.floor(length*.22);
    return [[0,end,'wall'],[end,length-2*end,'window'],[length-end,end,'wall']].map(([offset,size,kind])=>({...r,[origin]:r[origin]+offset,[along]:size,kind}));
  });
}

function bay(x,y) {
  return [desk(x,y),...chairs([x+20,x+96],[y+66],180),plant(x+156,y+6,25)];
}

const office={
  id:'office',name:'Corporate Office',icon:'apartment',badgeColor:'#399c92',spawn:{x:1100,y:720},
  doors:doorModels,
  zones:ROOMS.map(({id,name,bounds:b,isIsolated,maxDistance},i)=>zone(name,b.x1,b.y1,b.x2-b.x1,b.y2-b.y1,['#9fc2b5','#d8bc98','#aabfc0','#debd9e','#bfb8c5'][i],{id,isIsolated,maxDistance:maxDistance||850,doorKey:id})).concat([
    zone('Studio west',112,560,784,280,'#c1c8af',{id:'studio-west',maxDistance:600}),
    zone('Studio east',1280,560,784,280,'#c1c8af',{id:'studio-east',maxDistance:600}),
    zone('Project floor',680,920,920,312,'#b6c9be',{id:'project-floor',maxDistance:700}),
    zone('Dispatch',1192,48,368,336,'#c5bba6',{id:'dispatch',maxDistance:600})
  ]),
  models:[...glazed(WALLS),
    model('table',164,202,272,100,'#b88862','racetrack_oval'),...tableChairs([184,260,336,400],154,322),
    model('screen',196,72,196,24),plant(64,78),plant(514,80),
    model('desk',786,150,196,76,undefined,'executive_l_desk'),...chairs([813,932],[258]),plant(1036,110),
    ...[1696,1808,1920,2032].map(x=>model('rack',x,110,62,112)),
    desk(1860,324),...chairs([1904],[395]),plant(2102,345),
    ...[160,410,664,1328,1576,1824].flatMap(x=>bay(x,650)),
    model('sofa',76,1016,144,54),model('table',104,1122,100,50),model('counter',304,1024,176,52),
    model('coffee',332,1152,58,40),plant(70,1184),
    model('printer',1810,1024,76,52),model('printer',1970,1024,80,52),model('table',1924,1160,152,60),
    ...[768,1280].flatMap(x=>[model('table',x,1040,224,72),...tableChairs([x+34,x+134],998,1128)]),
    plant(1092,1168),model('counter',1264,144,202,52),plant(1488,288)]
};
const conference={
  id:'conference',name:'Conference & Auditorium',icon:'account_balance',badgeColor:'#c58a69',spawn:{x:1100,y:1050},doors:[],
  zones:[zone('Keynote stage',500,18,1200,282,'#b4c6b7',{id:'keynote-stage',isStage:true,maxDistance:1600}),
    zone('Auditorium',500,302,1200,648,'#d1bf9e',{id:'auditorium',maxDistance:1200}),
    zone('West breakout',18,18,474,932,'#c6b5ad',{id:'west-breakout',isIsolated:true,maxDistance:800}),
    zone('East breakout',1708,18,474,932,'#a7c4bb',{id:'east-breakout',isIsolated:true,maxDistance:800}),
    zone('Networking foyer',18,976,2164,306,'#d7c9ab',{id:'networking-foyer',maxDistance:600})],
  models:[...glazed([...perimeter,wall(492,18,8,400),wall(492,580,8,370),wall(1700,18,8,400),wall(1700,580,8,370),
    wall(500,300,390,8),wall(1310,300,390,8),wall(18,950,830,8),wall(1352,950,830,8)]),
    model('screen',928,100,344,30),model('counter',1040,188,92,48),
    ...chairs([640,720,800,880,960,1212,1292,1372,1452,1532],[408,520,632,744,856],180),
    ...[108,1816].flatMap(x=>[model('table',x,306,238,106,undefined,'racetrack_oval'),...tableChairs([x+42,x+144],256,436),
      model('sofa',x,680,178,56),plant(x+190,672)]),
    model('counter',240,1096,232,56),plant(560,1104),model('coffee',1680,1096,80,56),plant(1870,1100)]
};
const lounge={
  id:'lounge',name:'Executive Sky Rooftop',icon:'deck',badgeColor:'#60967e',spawn:{x:1100,y:650},doors:[],
  zones:[zone('Fireside booths',18,18,522,882,'#d2b39b',{id:'fireside-booths',maxDistance:700}),
    zone('Espresso bar',548,18,1104,882,'#bccab7',{id:'espresso-bar',maxDistance:750}),
    zone('Games room',1668,18,514,882,'#b2c1ba',{id:'games-room',maxDistance:700}),
    zone('Sunset terrace',18,908,2164,374,'#d5bb96',{id:'sunset-terrace',maxDistance:800})],
  models:[...glazed([...perimeter,wall(540,18,8,350),wall(540,520,8,380),wall(1652,18,8,350),wall(1652,520,8,380),
    wall(18,900,858,8),wall(1324,900,858,8)]),
    ...[172,508].flatMap(y=>[model('sofa',100,y,224,58),model('table',136,y+94,140,62),plant(380,y)]),
    model('counter',828,260,520,80),model('coffee',912,134,124,56),model('coffee',1156,134,124,56),
    ...chairs([880,1000,1120,1240],[374]),plant(716,190),plant(1432,190),
    model('billiards',1776,260,272,150),model('sofa',1776,616,214,54),plant(2056,630),
    ...[280,760,1320,1800].flatMap(x=>[model('table',x,1040,128,72,undefined,'circular_round'),...tableChairs([x+50],996,1140),plant(x-68,1056)])]
};
export const THEMES={office,conference,lounge,rooftop:lounge};

export function makeScene(base,layout,name) {
  const custom=layout && [layout.walls,layout.doors,layout.furniture,layout.soundZones].some(a=>a?.length);
  const scene=custom?{
    ...base,id:layout.layoutId||'custom',
    spawn:layout.spawnPoint||base.spawn,
    zones:(layout.soundZones||[]).filter(z=>z?.bounds).map(toSceneZone),
    models:[...layoutWallSegments(layout.walls||[],layout.doors||[]),...(layout.furniture||[]).map(f=>toSceneModel(f))],
    doors:(layout.doors||[]).map(d=>({...toSceneModel(d,'door'),key:d.key||d.id,name:d.name||d.key}))
  }:{
    ...base,
    zones:base.zones.map(z=>({...z})),
    doors:base.doors.map(d=>({...d})),
    models:base.models.map(m=>({...m})),
  };
  scene.barriers=scene.models.filter(m=>m.kind==='wall'||m.kind==='window');
  scene.zones=scene.zones.map(z=>{
    const door=scene.doors.find(d=>zoneForDoor(scene.zones,d)===z);
    return {...z,doorKey:door?.key||z.doorKey||z.id};
  });
  return {...scene,isCustom:!!custom,name:layout?.name||name||scene.name,hasDoors:scene.doors.length>0,
    doorLookup:Object.fromEntries(scene.doors.map(d=>[d.key,{name:d.name,wall:d}]))};
}

export function drawGround(ctx,scene) {
  drawFloor(ctx,W,H);
  scene.zones.forEach(z=>drawZone(ctx,z));
  if (!scene.isCustom) {
    // Painted floor guides sit beneath all furniture and players.
    ctx.save();
    ctx.lineWidth=2;
    ctx.strokeStyle='#8a987d';
    if (scene.id==='office') {
      for (const x of [936,1256]) {
        ctx.beginPath();ctx.moveTo(x,628);ctx.lineTo(x,853);ctx.lineTo(x+(x<1100?-42:42),895);ctx.stroke();
      }
    } else if (scene.id==='conference') {
      ctx.strokeStyle='#a58167';
      for(const x of [1022,1178]) {
        ctx.beginPath();ctx.moveTo(x,370);ctx.lineTo(x,916);ctx.stroke();
        for(let y=405;y<916;y+=112) ctx.strokeRect(x-3,y,6,12);
      }
    } else {
      // Terrace planks and countersunk bolts inside the acoustic boundary.
      ctx.strokeStyle='rgba(96,74,50,.18)';
      ctx.fillStyle='#a79780';
      for(let y=960;y<1270;y+=20) {
        ctx.beginPath();ctx.moveTo(28,y);ctx.lineTo(2170,y);ctx.stroke();
        for(let x=90+(y%40)*6;x<2170;x+=240) ctx.fillRect(x,y-1,2,2);
      }
    }
    ctx.restore();
  }
  if(!scene.isCustom && scene.id==='office') {
    // Letterpress title occupies the pedestrian spine between the two studios.
    ctx.save();ctx.translate(972,536);ctx.fillStyle=INK;
    ctx.font='900 32px "Arial Narrow",sans-serif';ctx.fillText('PROXI / HQ',0,0);
    ctx.fillRect(0,9,194,3);
    ctx.font='bold 11px monospace';ctx.fillText('CENTRAL CONCOURSE',1,28);
    for(let i=0;i<7;i++){
      ctx.save();ctx.translate(3+i*28,50);ctx.transform(1,0,-.55,1,0,0);
      ctx.fillStyle=i%2?'#c5b281':'#937f51';ctx.fillRect(0,0,12,7);ctx.restore();
    }
    ctx.restore();
  }
  drawSpawn(ctx,scene.spawn);
}
