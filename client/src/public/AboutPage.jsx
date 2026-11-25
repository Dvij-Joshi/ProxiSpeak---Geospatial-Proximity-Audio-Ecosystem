import { PublicLayout, Breadcrumbs } from './PublicLayout';
import { PAGE_META } from './seoMeta';

const AUTHORS = [
  {
    name: 'Dvij Joshi',
    role: 'System Architecture, Spatial Audio DSP & Infrastructure',
    credentials: 'Built the Web Audio API distance attenuation curve, 2D wall raycasting engine, 60 FPS LERP movement loop, bcrypt/JWT auth, and deployment pipelines.',
  },
  {
    name: 'Kunj Kachhia',
    role: 'WebRTC Mesh Engineering & World Scene Systems',
    credentials: 'Engineered peer-to-peer WebRTC SDP serialization, Metered STUN/TURN NAT traversal, hardware audio device switching, and modular isometric floor scenes.',
  },
];

export default function AboutPage({ onNavigate }) {
  const link = (e, path) => onNavigate?.(e, path);
  const meta = PAGE_META['/about'];

  return (
    <PublicLayout currentPath="/about" onNavigate={onNavigate}>
      <section className="ps-subhero">
        <Breadcrumbs items={meta.breadcrumbs} onNavigate={onNavigate} />
        <div className="ps-bound">
          <div className="ps-kicker"><i /> Engineering &amp; privacy</div>
          <h1>Built for natural voice collaboration and audio privacy.</h1>
          <p className="ps-sublead">
            ProxiSpeak was engineered to restore casual office presence for remote teams without turning meetings into
            surveillance or central audio recordings.
          </p>
        </div>
      </section>

      <section className="ps-bound ps-about-grid">
        <article className="ps-card">
          <h2>Zero-Storage Audio Privacy</h2>
          <p>
            Unlike centralized conferencing tools that mix or record voice streams on cloud media servers, ProxiSpeak
            routes voice directly from browser to browser over encrypted DTLS/SRTP WebRTC channels.
          </p>
          <p>
            Our Node.js signaling server coordinates room membership, avatar coordinates, and text chat only. No voice
            audio bytes are stored or processed by our backend.
          </p>
        </article>

        <article className="ps-card">
          <h2>Transparent Technical Stack</h2>
          <p>
            The client runs on React 18, Vite, HTML5 2D Canvas, and the native Web Audio API. Account credentials are
            salted and hashed with bcrypt (10 rounds) alongside short-lived JSON Web Tokens.
          </p>
          <p>
            Inspect the source code directly on{' '}
            <a
              href="https://github.com/Dvij-Joshi/ProxiSpeak---Geospatial-Proximity-Audio-Ecosystem"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>{' '}
            or test the <a href="/spatial-audio" onClick={(e) => link(e, '/spatial-audio')}>spatial audio simulator</a>.
          </p>
        </article>
      </section>

      <section className="ps-spaces">
        <div className="ps-bound">
          <h2>Builders &amp; Maintainers</h2>
          <div className="ps-about-grid">
            {AUTHORS.map((author) => (
              <article key={author.name} className="ps-card">
                <h3>{author.name}</h3>
                <p className="ps-meta-note"><strong>{author.role}</strong></p>
                <p>{author.credentials}</p>
              </article>
            ))}
          </div>
          <p className="ps-inline-link">
            <a href="/templates" onClick={(e) => link(e, '/templates')}>
              Browse our virtual office floor plan templates &#8594;
            </a>
          </p>
        </div>
      </section>
    </PublicLayout>
  );
}
