import useAdminBrand from '../hooks/useAdminBrand.js';

export default function BrandLogo({ compact = false, className = '' }) {
  const identity = useAdminBrand();
  const longName = identity.name.length > 10;

  return <div
    className={`dynamic-brand-logo ${compact ? 'compact' : ''} ${longName ? 'long-name' : ''} ${className}`.trim()}
    title={`${identity.name} ${identity.descriptor}`}>
    <span className="dynamic-brand-symbol" aria-hidden="true">{identity.logoText}</span>
    <span className="dynamic-brand-wordmark">
      <strong>{identity.name}</strong>
      <small>{identity.descriptor}</small>
    </span>
  </div>;
}
