import { useState } from 'react';
import OfficeDiorama from '../components/OfficeDiorama';
import SpatialPreview from './SpatialPreview';
import { PublicLayout } from './PublicLayout';
import { HOME_FAQS } from './seoMeta';

const scenes = [
  { theme: 'office', title: 'Shared studio', detail: 'Walk over to a desk for a quick conversation.' },
  { theme: 'conference', title: 'Auditorium', detail: 'Gather at the stage, then split into smaller conversations.' },
  { theme: 'lounge', title: 'Social lounge', detail: 'Find a seat and catch up away from the desks.' },
];

function StudioTour() {
  const [scene, setScene] = useState(scenes[0]);
  return (
    <figure id="studio-tour" className="ps-tour" aria-label="Interactive virtual office preview">
      <div className="ps-tour-title">
        <span><i /> Studio tour</span>
        <strong>{scene.title}</strong>
      </div>
      <div
        className="ps-model"
        onPointerMove={(e) => {
          if (e.pointerType !== 'mouse') return;
          const rect = e.currentTarget.getBoundingClientRect();
          e.currentTarget.style.setProperty('--offset', (((e.clientX - rect.left) / rect.width) * 8 - 4) + 'px');
        }}
        onPointerLeave={(e) => e.currentTarget.style.removeProperty('--offset')}
      >
        <OfficeDiorama theme={scene.theme} animated />
      </div>
      <figcaption>
        <div role="group" aria-label="Preview environment">
          {scenes.map((item) => (
            <button key={item.theme} aria-pressed={scene === item} onClick={() => setScene(item)}>
              {item.title}
            </button>
          ))}
        </div>
        <p aria-live="polite">{scene.detail}</p>
      </figcaption>
    </figure>
  );
}

export default function LandingPage({ onNavigate }) {
  const link = (e, path) => onNavigate?.(e, path);

  return (
    <PublicLayout currentPath="/" onNavigate={onNavigate}>
      <section className="ps-hero">
        <div className="ps-bound ps-hero-grid">
          <div className="ps-intro">
            <div className="ps-kicker"><i /> Proximity-based voice</div>
            <h1>Virtual office with <em>spatial proximity audio.</em></h1>
            <p>
              Walk through a shared 2D virtual office with your team. Step closer to a teammate to start talking naturally,
              or close a conference room door for a private meeting.
            </p>
            <div className="ps-actions">
              <a href="/dashboard" className="ps-cta">
                Get started <span aria-hidden="true">&#8599;</span>
              </a>
              <a href="#spatial-voice" className="ps-under">
                Try the voice demo <span aria-hidden="true">&#8595;</span>
              </a>
            </div>
          </div>
          <StudioTour />
        </div>
      </section>

      <section className="ps-listen ps-bound" id="spatial-voice">
        <div>
          <div className="ps-kicker"><i /> Spatial audio</div>
          <h2>Hear the<br /><em>distance.</em></h2>
          <p>
            Nearby voices come into focus across a 320-pixel earshot zone while distant desks stay quiet. Drag the
            slider to move the listener and test how distance shapes volume.
          </p>
          <p className="ps-inline-link">
            <a href="/spatial-audio" onClick={(e) => link(e, '/spatial-audio')}>
              Read how proximity voice and wall muffling work &#8594;
            </a>
          </p>
        </div>
        <SpatialPreview />
      </section>

      <section className="ps-spaces">
        <div className="ps-bound">
          <h2>Room to collaborate.</h2>
          <div className="ps-story">
            <figure>
              <img
                src="/images/keynote-auditorium.webp"
                width="640"
                height="410"
                loading="lazy"
                decoding="async"
                alt="ProxiSpeak keynote auditorium virtual office floor plan with stage and breakout seating"
              />
            </figure>
            <div>
              <h3>From the stage<br />to the breakout.</h3>
              <p>
                Meet as a group in the auditorium. When a smaller conversation starts, walk over together. Everyone sees
                the same floor and the same moving avatars, or build your own room layout in the{' '}
                <a href="/designer">floor plan designer</a>.
              </p>
            </div>
          </div>

          <div className="ps-story">
            <figure>
              <img
                src="/images/rooftop-social-lounge.webp"
                width="640"
                height="410"
                loading="lazy"
                decoding="async"
                alt="ProxiSpeak rooftop social lounge virtual office with sofas, coffee tables, and team avatars"
              />
            </figure>
            <div>
              <h3>Make space for<br />the in-between.</h3>
              <p>
                Take a seat in the lounge, raise a hand or stop for a hallway chat. Browse all{' '}
                <a href="/templates" onClick={(e) => link(e, '/templates')}>virtual office templates</a> or manage a
                company campus in the <a href="/organizations">organization hub</a>.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="ps-faq ps-bound" id="faq">
        <div className="ps-kicker"><i /> Common questions</div>
        <h2>Frequently asked questions.</h2>
        <div className="ps-faq-grid">
          {HOME_FAQS.map((item) => (
            <article key={item.q} className="ps-faq-item">
              <h3>{item.q}</h3>
              <p>{item.a}</p>
            </article>
          ))}
        </div>
        <p className="ps-inline-link">
          <a href="/about" onClick={(e) => link(e, '/about')}>
            Learn about our peer-to-peer privacy model and engineering team &#8594;
          </a>
        </p>
      </section>

      <section className="ps-outro ps-bound">
        <h2>Step into your workspace.</h2>
        <a className="ps-cta" href="/dashboard">
          Get started <span aria-hidden="true">&#8599;</span>
        </a>
      </section>
    </PublicLayout>
  );
}
