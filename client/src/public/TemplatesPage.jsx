import { PublicLayout, Breadcrumbs } from './PublicLayout';
import { PAGE_META } from './seoMeta';

const TEMPLATES = [
  {
    title: 'Corporate Headquarters Office',
    image: '/images/shared-studio-office.webp',
    alt: 'Corporate Headquarters virtual office template with open team desks and private soundproof conference suites',
    summary: 'Open team desk clusters paired with enclosed, knock-to-enter meeting rooms and a manager suite.',
    acoustics: '320 px open desk earshot, 850 px enclosed boardroom zone, wall attenuation.',
  },
  {
    title: 'Keynote & Breakout Auditorium',
    image: '/images/keynote-auditorium.webp',
    alt: 'Keynote Auditorium virtual office template featuring a main speaker stage and side breakout pods',
    summary: 'Stage broadcast audio lets presenters address the entire hall before attendees walk into side breakout wings.',
    acoustics: 'Stage PA broadcast coverage across the auditorium hall plus isolated breakout wings.',
  },
  {
    title: 'Executive Sky Rooftop Lounge',
    image: '/images/rooftop-social-lounge.webp',
    alt: 'Executive Sky Rooftop virtual office template with lounge sofas, espresso bar, and social tables',
    summary: 'Relaxed open-air terrace designed for coffee chats, onboarding socials, and informal cross-team syncs.',
    acoustics: 'Smooth ambient stereo drop-off across sofa seating and terrace zones.',
  },
];

export default function TemplatesPage({ onNavigate }) {
  const link = (e, path) => onNavigate?.(e, path);
  const meta = PAGE_META['/templates'];

  return (
    <PublicLayout currentPath="/templates" onNavigate={onNavigate}>
      <section className="ps-subhero">
        <Breadcrumbs items={meta.breadcrumbs} onNavigate={onNavigate} />
        <div className="ps-bound">
          <div className="ps-kicker"><i /> Workspace layouts</div>
          <h1>Virtual office templates and floor plan designer.</h1>
          <p className="ps-sublead">
            Start instantly with three acoustic floor presets, or open the interactive 2D Office Designer to draw custom
            walls, soundproof doors, and desk layouts for your team.
          </p>
        </div>
      </section>

      <section className="ps-bound ps-templates-list">
        {TEMPLATES.map((tpl) => (
          <article key={tpl.title} className="ps-story">
            <figure>
              <img
                src={tpl.image}
                width="640"
                height="410"
                loading="lazy"
                decoding="async"
                alt={tpl.alt}
              />
            </figure>
            <div>
              <h2>{tpl.title}</h2>
              <p>{tpl.summary}</p>
              <p className="ps-meta-note"><strong>Acoustics:</strong> {tpl.acoustics}</p>
              <div className="ps-actions">
                <a className="ps-cta" href="/dashboard">Launch workspace &#8599;</a>
                <a className="ps-under" href="/designer">Customize in Designer</a>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="ps-spaces">
        <div className="ps-bound ps-outro">
          <div>
            <h2>Need private team rooms for your company?</h2>
            <p>
              Create a dedicated space in the <a href="/organizations">Organization Hub</a> or inspect how{' '}
              <a href="/spatial-audio" onClick={(e) => link(e, '/spatial-audio')}>spatial audio attenuation</a> behaves
              around custom walls.
            </p>
          </div>
          <a className="ps-cta" href="/designer">Open floor designer &#8599;</a>
        </div>
      </section>
    </PublicLayout>
  );
}
