import './publicSite.css';

export function Breadcrumbs({ items = [], onNavigate }) {
  if (!items || items.length < 2) return null;
  return (
    <nav className="ps-breadcrumbs ps-bound" aria-label="Breadcrumb">
      <ol>
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          const path = new URL(item.url).pathname;
          return (
            <li key={item.url}>
              {idx > 0 && <span aria-hidden="true">/</span>}
              {isLast ? (
                <span aria-current="page">{item.name}</span>
              ) : (
                <a href={path} onClick={(e) => onNavigate?.(e, path)}>
                  {item.name}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function PublicLayout({ currentPath = '/', onNavigate, children }) {
  const link = (e, path) => {
    if (onNavigate) onNavigate(e, path);
  };

  return (
    <div className="ps-public" id="top">
      <a className="ps-skip" href="#product">Skip to content</a>
      <header className="ps-mast">
        <div className="ps-bound">
          <a className="ps-logo" href="/" onClick={(e) => link(e, '/')}>
            <img src="/favicon.svg" alt="ProxiSpeak logo" width="32" height="32" />
            ProxiSpeak
          </a>
          <nav aria-label="Primary site navigation">
            <a href="/spatial-audio" aria-current={currentPath === '/spatial-audio' ? 'page' : undefined} onClick={(e) => link(e, '/spatial-audio')}>
              Spatial Audio
            </a>
            <a href="/templates" aria-current={currentPath === '/templates' ? 'page' : undefined} onClick={(e) => link(e, '/templates')}>
              Templates
            </a>
            <a href="/about" aria-current={currentPath === '/about' ? 'page' : undefined} onClick={(e) => link(e, '/about')}>
              About
            </a>
            <a href="/designer">Floor Designer</a>
          </nav>
          <a className="ps-login" href="/dashboard">
            Open workspace <span aria-hidden="true">&#8599;</span>
          </a>
        </div>
      </header>

      <main id="product">{children}</main>

      <footer>
        <div className="ps-bound ps-footer-grid">
          <div className="ps-footer-brand">
            <a className="ps-logo" href="/" onClick={(e) => link(e, '/')}>
              <img src="/favicon.svg" width="28" height="28" alt="ProxiSpeak logo" />
              ProxiSpeak
            </a>
            <p className="ps-footer-note">
              Peer-to-peer spatial voice collaboration inside shared 2D virtual offices.
            </p>
          </div>
          <nav aria-label="Product pages">
            <a href="/" onClick={(e) => link(e, '/')}>Home</a>
            <a href="/spatial-audio" onClick={(e) => link(e, '/spatial-audio')}>Spatial audio</a>
            <a href="/templates" onClick={(e) => link(e, '/templates')}>Office templates</a>
            <a href="/about" onClick={(e) => link(e, '/about')}>About &amp; security</a>
          </nav>
          <nav aria-label="Workspace tools">
            <a href="/dashboard">Workspace dashboard &#8599;</a>
            <a href="/designer">Office floor designer &#8599;</a>
            <a href="/organizations">Organization hub &#8599;</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
