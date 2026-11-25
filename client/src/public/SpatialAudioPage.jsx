import SpatialPreview from './SpatialPreview';
import { PublicLayout, Breadcrumbs } from './PublicLayout';
import { PAGE_META, SPATIAL_FAQS } from './seoMeta';

export default function SpatialAudioPage({ onNavigate }) {
  const link = (e, path) => onNavigate?.(e, path);
  const meta = PAGE_META['/spatial-audio'];

  return (
    <PublicLayout currentPath="/spatial-audio" onNavigate={onNavigate}>
      <section className="ps-subhero">
        <Breadcrumbs items={meta.breadcrumbs} onNavigate={onNavigate} />
        <div className="ps-bound">
          <div className="ps-kicker"><i /> Acoustic engine</div>
          <h1>How spatial proximity audio works in your browser.</h1>
          <p className="ps-sublead">
            Instead of muting everyone into one flat conference call, ProxiSpeak calculates distance, stereo direction,
            and wall absorption on your own device in real time.
          </p>
        </div>
      </section>

      <section className="ps-listen ps-bound">
        <div>
          <h2>Try the live distance slider.</h2>
          <p>
            Move the listener closer or farther away from the speaker. Within 320 pixels in an open office, volume
            follows a smooth curve. Inside an enclosed boardroom, coverage expands to 850 pixels so everyone at the
            table hears clearly.
          </p>
        </div>
        <SpatialPreview />
      </section>

      <section className="ps-spaces">
        <div className="ps-bound ps-story">
          <figure>
            <img
              src="/images/shared-studio-office.webp"
              width="640"
              height="410"
              loading="lazy"
              decoding="async"
              alt="ProxiSpeak shared corporate studio office with desks, glass partitions, and spatial voice avatars"
            />
          </figure>
          <div>
            <h2>Three layers of browser audio processing.</h2>
            <ul className="ps-bullets">
              <li>
                <strong>Peer-to-peer WebRTC transport:</strong> Browsers exchange encrypted Opus 48 kHz audio directly,
                supported by Metered OpenRelay TURN servers when firewalls block direct connections.
              </li>
              <li>
                <strong>3D stereo panning:</strong> Voices standing to your left or right pan toward the matching ear so
                overlapping hallway chats stay easy to separate.
              </li>
              <li>
                <strong>Wall raycasting and soundproof doors:</strong> Line-of-sight checks against placed walls drop high
                frequencies with a low-pass filter, while closed meeting doors block outside sound completely.
              </li>
            </ul>
            <p className="ps-inline-link">
              <a href="/templates" onClick={(e) => link(e, '/templates')}>
                Explore acoustic room templates &#8594;
              </a>
            </p>
          </div>
        </div>
      </section>

      <section className="ps-faq ps-bound">
        <h2>Spatial audio FAQ.</h2>
        <div className="ps-faq-grid">
          {SPATIAL_FAQS.map((item) => (
            <article key={item.q} className="ps-faq-item">
              <h3>{item.q}</h3>
              <p>{item.a}</p>
            </article>
          ))}
        </div>
      </section>
    </PublicLayout>
  );
}
