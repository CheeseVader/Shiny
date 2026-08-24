const icons = {
  dashboard: '◫',
  products: '◆',
  clients: '◎',
  inventory: '▦',
  branches: '⌂',
  orders: '▤',
  purchases: '▥',
  tcg: '✦',
  buylist: '⇄',
  reports: '▧',
  system: '⚙'
};

export default function NavIcon({ name }) {
  return <span className="nav-icon" aria-hidden="true">{icons[name] || '•'}</span>;
}
