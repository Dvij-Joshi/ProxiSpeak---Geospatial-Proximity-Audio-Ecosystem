import { useState } from 'react';
import { AvatarPortrait } from './WorkspaceArt';
import { calculateAcoustics } from '../services/spatialAudio';

export default function SpatialPreview() {
  const [distance,setDistance]=useState(125);
  const volume=Math.round(100*calculateAcoustics({x:1100,y:720},{x:1100+distance,y:720}).targetGain);
  return <div className="spatial-console">
    <div className="spatial-stage" aria-hidden="true"><i className="earshot"/><div className="speaker"><AvatarPortrait transparent color="#df815c"/></div>
      <div className="listener" style={{left:(23+distance/360*65)+'%'}}><AvatarPortrait transparent color="#61ab96"/></div></div>
    <div className="spatial-controls"><label htmlFor="voice-distance">Distance between avatars</label><output htmlFor="voice-distance">{volume}% volume</output>
      <input id="voice-distance" type="range" min="25" max="360" value={distance} onChange={e=>setDistance(Number(e.target.value))}/>
    </div>
  </div>;
}
