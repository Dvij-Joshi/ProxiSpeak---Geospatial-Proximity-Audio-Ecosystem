import { useState } from 'react';
import OfficeDiorama from '../components/OfficeDiorama';
import SpatialPreview from './SpatialPreview';
import './publicSite.css';

const scenes = [
  {theme:'office',title:'Shared studio',detail:'Walk over to a desk for a quick conversation.'},
  {theme:'conference',title:'Auditorium',detail:'Gather at the stage, then split into smaller conversations.'},
  {theme:'lounge',title:'Social lounge',detail:'Find a seat and catch up away from the desks.'},
];

function StudioTour() {
  const [scene,setScene]=useState(scenes[0]);
  return <figure id="studio-tour" className="ps-tour" aria-label="Interactive virtual office preview">
    <div className="ps-tour-title"><span><i/> Studio tour</span><strong>{scene.title}</strong></div>
    <div className="ps-model" onPointerMove={e=>{
      if(e.pointerType!=='mouse') return;
      const rect=e.currentTarget.getBoundingClientRect();
      e.currentTarget.style.setProperty('--offset',((e.clientX-rect.left)/rect.width*8-4)+'px');
    }} onPointerLeave={e=>e.currentTarget.style.removeProperty('--offset')}>
      <OfficeDiorama theme={scene.theme} animated/>
    </div>
    <figcaption><div role="group" aria-label="Preview environment">{scenes.map(item=>
      <button key={item.theme} aria-pressed={scene===item} onClick={()=>setScene(item)}>{item.title}</button>
    )}</div><p aria-live="polite">{scene.detail}</p></figcaption>
  </figure>;
}

export default function LandingPage() {
  return <div className="ps-public" id="top">
    <a className="ps-skip" href="#product">Skip to content</a>
    <header className="ps-mast"><div className="ps-bound">
      <a className="ps-logo" href="#top"><img src="/favicon.svg" alt="" width="32" height="32"/>ProxiSpeak</a>
      <nav aria-label="Product navigation"><a href="#studio-tour">Studio tour</a><a href="#spatial-voice">Spatial voice</a></nav>
      <a className="ps-login" href="/dashboard">Open workspace <span aria-hidden="true">&#8599;</span></a>
    </div></header>
    <main id="product">
      <section className="ps-hero"><div className="ps-bound ps-hero-grid">
        <div className="ps-intro"><div className="ps-kicker"><i/> Proximity-based voice</div>
          <h1>Meet where<br/>you <em>move.</em></h1>
          <p>A virtual office you can walk through together. Step closer to a teammate to join their conversation, or find a quiet room for your own.</p>
          <div className="ps-actions"><a href="/dashboard" className="ps-cta">Get started <span aria-hidden="true">&#8599;</span></a>
            <a href="#spatial-voice" className="ps-under">Try the voice demo <span aria-hidden="true">&#8595;</span></a></div>
        </div>
        <StudioTour/>
      </div></section>
      <section className="ps-listen ps-bound" id="spatial-voice">
        <div><div className="ps-kicker"><i/> Spatial audio</div><h2>Hear the<br/><em>distance.</em></h2>
          <p>Nearby voices come into focus. Drag the slider to move the listener and see how much of the speaker&rsquo;s voice reaches them.</p></div>
        <SpatialPreview/>
      </section>
      <section className="ps-spaces"><div className="ps-bound"><h2>Room to collaborate.</h2>
        <div className="ps-story"><figure><OfficeDiorama theme="conference"/></figure>
          <div><h3>From the stage<br/>to the breakout.</h3><p>Meet as a group in the auditorium. When a smaller conversation starts, walk over together. Everyone sees the same floor and the same moving avatars.</p></div></div>
        <div className="ps-story"><figure><OfficeDiorama theme="lounge"/></figure>
          <div><h3>Make space for<br/>the in-between.</h3><p>Take a seat in the lounge, raise a hand or stop for a hallway chat. A shared place gives those small moments somewhere to happen.</p></div></div>
      </div></section>
      <section className="ps-outro ps-bound"><h2>Step into your workspace.</h2><a className="ps-cta" href="/dashboard">Get started <span aria-hidden="true">&#8599;</span></a></section>
    </main>
    <footer><div className="ps-bound"><a className="ps-logo" href="#top"><img src="/favicon.svg" width="28" height="28" alt=""/>ProxiSpeak</a>
      <nav aria-label="Footer"><a href="#studio-tour">Studio tour</a><a href="#spatial-voice">Voice demo</a><a href="/dashboard">Open workspace &#8599;</a></nav></div></footer>
  </div>;
}
