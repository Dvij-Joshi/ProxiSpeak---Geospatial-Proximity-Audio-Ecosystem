import { useEffect, useRef } from 'react';
import { drawCharacter } from '../world/character';

const ink='#233d3b', timber='#dfb786', sea='#6ead9c', coral='#dd7956';
const project=(x,y,z=0)=>[260+(x-y)*29,111+(x+y)*13-z*27];

function studio(ctx,theme) {
  function face(points,color,outline=true) {
    ctx.beginPath();
    points.map(p=>project(...p)).forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
    ctx.closePath();ctx.fillStyle=color;ctx.fill();
    if(outline){ctx.strokeStyle=ink;ctx.lineWidth=1.25;ctx.stroke();}
  }
  function block(x,y,w,d,z,h,top,front='#8b856b',side='#566f62') {
    face([[x+w,y,z],[x+w,y+d,z],[x+w,y+d,z+h],[x+w,y,z+h]],side);
    face([[x,y+d,z],[x+w,y+d,z],[x+w,y+d,z+h],[x,y+d,z+h]],front);
    face([[x,y,z+h],[x+w,y,z+h],[x+w,y+d,z+h],[x,y+d,z+h]],top);
  }
  function plant(x,y) {
    block(x-.24,y-.24,.48,.48,0,.48,'#e3cba3','#b99473');
    for(let i=0;i<11;i++){
      const a=i*2.4, dx=Math.cos(a)*.56,dy=Math.sin(a)*.56,h=1.05+(i%4)*.17;
      face([[x,y,.44],[x+dx*.57+.12,y+dy*.57,h-.2],[x+dx,y+dy,h],[x+dx*.4-.09,y+dy*.4,h-.23]],['#468574','#78a781','#b2c28a'][i%3]);
    }
  }
  function chair(x,y) {
    block(x+.2,y+.2,.33,.35,0,.42,ink);
    block(x,y,.73,.7,.39,.21,sea,'#377365');
    block(x,y+.58,.73,.13,.6,.46,'#81bdaa','#4c8273');
  }
  function desk(x,y,w=2.7,monitors=true) {
    face([[x-.1,y+.33,.01],[x+w,y+.33,.01],[x+w+.47,y+1.9,.01],[x+.39,y+1.88,.01]],'rgba(42,64,56,.11)',false);
    block(x+.1,y+.1,.18,1.1,0,.91,ink);
    block(x+w-.28,y+.1,.18,1.1,0,.91,ink);
    block(x,y,w,1.35,.9,.16,timber,'#af825d');
    if(!monitors)return;
    block(x+w*.48,y+.77,.32,.42,1.06,.02,'#fff2cb');
    block(x+w*.48,y+.26,.14,.14,1.06,.15,'#f9d978','#c88551');
    for(const offset of [.25,w-1.12]){
      const u=x+offset;
      block(u+.35,y+.46,.13,.16,1.06,.27,ink);
      block(u,y+.33,.88,.12,1.32,.55,'#637a70',ink);
      face([[u+.06,y+.46,1.38],[u+.82,y+.46,1.38],[u+.82,y+.46,1.8],[u+.06,y+.46,1.8]],'#498d87',false);
      for(let i=0;i<3;i++) face([[u+.14,y+.47,1.67-i*.09],[u+.58-i*.08,y+.47,1.67-i*.09],[u+.58-i*.08,y+.47,1.7-i*.09],[u+.14,y+.47,1.7-i*.09]],'#c9deac',false);
      block(u+.07,y+.88,.66,.23,1.06,.025,'#586a61');
    }
  }
  function sofa(x,y,w) {
    block(x,y,w,1.05,0,.52,coral,'#b55e48');
    block(x,y,w,.17,.5,.6,'#f2ad7f','#cf7756');
    for(let i=0;i<3;i++)block(x+.12+i*(w-.24)/3,y+.2,(w-.24)/3-.03,.68,.49,.11,'#e9966c');
    block(x,y,.15,1,.52,.29,coral);block(x+w-.15,y,.15,1,.52,.29,coral);
  }
  block(0,0,12,8,-.48,.48,'#e1d9be','#bac4a6','#93a894');
  for(let x=0;x<12;x++)for(let y=0;y<8;y++) {
    const c=theme==='lounge'?['#c7b895','#cfc19f']:['#e2dbc2','#ebe3cb'];
    face([[x,y,0],[x+.984,y,0],[x+.984,y+.984,0],[x,y+.984,0]],c[(x+y)%2],false);
  }
  block(0,0,12,.16,0,2.27,'#f3e6c8','#c0cdb3');
  block(0,0,.16,8,0,2.27,'#f3e6c8','#b4c7b2','#a3bcb0');
  for(let x=.4;x<11.6;x+=1.4) {
    face([[x,.17,.86],[x+1.25,.17,.86],[x+1.25,.17,2.05],[x,.17,2.05]],'#8fb7ae');
    face([[x+.03,.18,.91],[x+.29,.18,.91],[x+.89,.18,2],[x+.6,.18,2]],'#c6d9c4',false);
  }
  // Inset door, slatted acoustic panels and the signal mural on the return wall.
  face([[.17,1.05,0],[.17,2.56,0],[.17,2.56,1.91],[.17,1.05,1.91]],'#486d61');
  face([[.18,1.2,.76],[.18,2.39,.76],[.18,2.39,1.73],[.18,1.2,1.73]],'#a1c1b2');
  block(.18,2.23,.1,.15,.65,.07,'#f3cf79');
  face([[.17,3.32,.93],[.17,7.45,.93],[.17,7.45,1.88],[.17,3.32,1.88]],'#315e57');
  for(let i=0;i<18;i++){
    const y=3.51+i*.21,h=.1+.47*Math.abs(Math.sin(i*.78)*Math.cos(i*.3));
    face([[.18,y,1.41-h/2],[.18,y+.105,1.41-h/2],[.18,y+.105,1.41+h/2],[.18,y,1.41+h/2]],i%4===0?'#edd174':'#a6c8ac',false);
  }
  for(const x of [1.05,4.35,7.65]){
    face([[x,.23,.015],[x+1.6,.23,.015],[x+3.25,3.15,.015],[x+1.65,3.15,.015]],'rgba(255,244,186,.30)',false);
  }
  if(theme==='office') {
    face([[.38,4.3,.02],[4.2,4.3,.02],[4.2,7.45,.02],[.38,7.45,.02]],'#9bafa0');
    for(let k=0;k<3;k++)face([[.55,6.81+k*.14,.03],[4,6.81+k*.14,.03],[4,6.85+k*.14,.03],[.55,6.85+k*.14,.03]],'#dbe0c6',false);
  }
  const objects=[];
  const add=(x,y,fn)=>objects.push({depth:x+y,fn});
  add(.8,1,()=>plant(.8,1));add(11,1,()=>plant(11,1));
  if(theme==='conference') {
    add(4,1,()=>{block(2,.45,6,1.45,0,.27,timber);block(3,.53,3.9,.14,.27,1.72,ink,'#527e79');});
    for(const y of [2.6,4.1])for(const x of [2,3.2,4.4,6.3,7.5,8.7])add(x,y,()=>chair(x,y));
  }else if(theme==='lounge'){
    add(2,1.4,()=>sofa(1.2,1.35,3.2));add(7,1.5,()=>sofa(6.3,1.45,3.3));
    add(3,3,()=>desk(2.1,3,1.7,false));add(8,3,()=>desk(7.1,3,1.7,false));
    add(10,3,()=>plant(10.4,3.4));
  }else{
    add(2,1,()=>desk(1.7,1,3.3)); add(7.4,.95,()=>desk(7,.95,3.1));
    for(const x of [2,3.9,7.3,9])add(x,2.75,()=>chair(x,2.75));
    add(.95,4.8,()=>sofa(.65,4.6,2.25));
    add(1.7,6.15,()=>{block(1.4,5.95,1.6,.72,.2,.18,timber);block(1.6,6.08,.55,.33,.38,.06,'#559d90');});
  }
  add(10.2,4.2,()=>plant(10.2,4.2));
  for(const o of objects.sort((a,b)=>a.depth-b.depth))o.fn();
}

export default function OfficeDiorama({theme='office',animated=false}) {
  const ref=useRef(null);
  useEffect(()=>{
    const canvas=ref.current,ctx=canvas.getContext('2d');
    if (!ctx) return;
    const plate=document.createElement('canvas'),scale=Math.min(window.devicePixelRatio||1,2);
    plate.width=canvas.width=Math.round(640*scale);plate.height=canvas.height=Math.round(410*scale);
    const art=plate.getContext('2d');art.scale(scale,scale);art.lineJoin='round';studio(art,theme);
    const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame,visible=false,last=0,t=0;
    function paint(now) {
      if(last)t+=Math.min(60,now-last);last=now;
      ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(plate,0,0);
      ctx.setTransform(scale,0,0,scale,0,0);
      const walk=Math.sin(t/2400),avatars=[[6.5+walk,5.6,'#ecae55'],[8.1,5.7,'#549f98'],[4.8,6.8,'#dd8063']];
      for(const [i,[x,y,color]] of avatars.entries()){
        const [u,v]=project(x,y);
        if(i===1){ctx.beginPath();ctx.ellipse(u,v,25+3*Math.sin(t/410),10,0,0,Math.PI*2);ctx.strokeStyle='#468c7e';ctx.lineWidth=2;ctx.stroke();}
        drawCharacter(ctx,u,v,color,{moving:i===0&&animated&&!motion.matches,facing:i===0?Math.sign(Math.cos(t/2400)):-1,time:t});
      }
      if(theme==='office'){const [u,v]=project(7.9,1.42,1.54);ctx.fillStyle=Math.sin(t/750)>0?'#f7e398':'#92c4ae';ctx.fillRect(u,v,3,2);}
      if(animated&&visible&&!motion.matches&&!document.hidden)frame=requestAnimationFrame(paint);
    }
    function resume(){cancelAnimationFrame(frame);last=0;paint(performance.now());}
    paint(0);
    if(!animated)return;
    const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;resume();});
    observer.observe(canvas);motion.addEventListener('change',resume);document.addEventListener('visibilitychange',resume);
    return ()=>{observer.disconnect();cancelAnimationFrame(frame);motion.removeEventListener('change',resume);document.removeEventListener('visibilitychange',resume);};
  },[theme,animated]);
  return <canvas ref={ref} width="640" height="410" className="office-diorama" role="img" aria-label={`Cutaway of a virtual ${theme} with furniture and team avatars`}/>;
}
