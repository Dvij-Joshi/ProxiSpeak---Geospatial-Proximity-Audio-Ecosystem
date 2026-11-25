import { PublicLayout } from './PublicLayout';

export default function NotFoundPage({ onNavigate }) {
  const link = (e, path) => onNavigate?.(e, path);
  return (
    <PublicLayout currentPath="/404" onNavigate={onNavigate}>
      <section className="ps-subhero">
        <div className="ps-bound">
          <div className="ps-kicker"><i /> 404 Error</div>
          <h1>That workspace page could not be found.</h1>
          <p className="ps-sublead">
            The link you opened may have moved or expired. Use one of the pages below to continue exploring ProxiSpeak.
          </p>
          <div className="ps-actions">
            <a className="ps-cta" href="/" onClick={(e) => link(e, '/')}>
              Back to home
            </a>
            <a className="ps-under" href="/dashboard">
              Open workspace dashboard
            </a>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
