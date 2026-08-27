import React from 'react';

const DEFAULT_COLORS = ['#2563eb', '#12b76a', '#f79009', '#7f56d9', '#ef4444', '#64748b'];

export function R23Donut({ segments = [], center = '', caption = '' }) {
  const clean = segments.map((item, index) => ({
    label: item.label || `Serie ${index + 1}`,
    value: Math.max(0, Number(item.value || 0)),
    color: item.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]
  }));
  const total = clean.reduce((sum, item) => sum + item.value, 0);
  let cursor = 0;
  const stops = clean.length && total > 0 ? clean.map((item) => {
    const from = cursor;
    cursor += item.value / total * 100;
    return `${item.color} ${from.toFixed(2)}% ${cursor.toFixed(2)}%`;
  }).join(', ') : '#e9eef6 0 100%';

  return <div className="r23-donut-widget">
    <div className="r23-donut" style={{ background: `conic-gradient(${stops})` }}>
      <div><strong>{center || total.toLocaleString('es-MX')}</strong><span>{caption}</span></div>
    </div>
    <div className="r23-donut-legend">
      {clean.map((item) => <div key={item.label}>
        <i style={{ background: item.color }} />
        <span>{item.label}</span>
        <strong>{item.value.toLocaleString('es-MX')}</strong>
        <small>{total ? `${(item.value / total * 100).toFixed(1)}%` : '0%'}</small>
      </div>)}
    </div>
  </div>;
}

export function R23BarList({ items = [], format = (value) => Number(value || 0).toLocaleString('es-MX'), color = '#173f7a' }) {
  const clean = items.map((item) => ({ ...item, value: Math.max(0, Number(item.value || 0)) }));
  const max = Math.max(1, ...clean.map((item) => item.value));
  return <div className="r23-bar-list">
    {clean.map((item, index) => <div key={item.key || item.label || index}>
      <span>{item.label || 'Sin nombre'}</span>
      <i><b style={{ width: `${item.value / max * 100}%`, background: item.color || color }} /></i>
      <strong>{format(item.value)}</strong>
      {item.detail ? <small>{item.detail}</small> : null}
    </div>)}
    {!clean.length ? <div className="r23-chart-empty">Sin información disponible.</div> : null}
  </div>;
}

export function R23LineChart({ series = [], labels = [], currency = false }) {
  const safeSeries = series.map((item, index) => ({
    ...item,
    color: item.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
    values: (item.values || []).map((value) => Number(value || 0))
  }));
  const count = Math.max(1, labels.length, ...safeSeries.map((item) => item.values.length));
  const width = 720, height = 230, left = 46, right = 18, top = 20, bottom = 36;
  const innerWidth = width - left - right, innerHeight = height - top - bottom;
  const all = safeSeries.flatMap((item) => item.values);
  const max = Math.max(1, ...all);
  const point = (value, index) => {
    const x = left + (count === 1 ? innerWidth / 2 : index / (count - 1) * innerWidth);
    const y = top + innerHeight - Math.max(0, value) / max * innerHeight;
    return [x, y];
  };
  const compact = (value) => currency
    ? Number(value || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', notation: 'compact', maximumFractionDigits: 1 })
    : Number(value || 0).toLocaleString('es-MX', { notation: 'compact', maximumFractionDigits: 1 });

  return <div className="r23-line-widget">
    <div className="r23-chart-legend">{safeSeries.map((item) => <span key={item.label}><i style={{ background: item.color }} />{item.label}</span>)}</div>
    <svg role="img" aria-label={safeSeries.map((item) => item.label).join(' y ')} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {[0, .25, .5, .75, 1].map((ratio) => {
        const y = top + innerHeight - ratio * innerHeight;
        return <g key={ratio}><line x1={left} y1={y} x2={width - right} y2={y} className="r23-grid-line" /><text x={left - 8} y={y + 4} textAnchor="end">{compact(max * ratio)}</text></g>;
      })}
      {safeSeries.map((item) => {
        const points = item.values.map((value, index) => point(value, index));
        return <g key={item.label}>
          <polyline points={points.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke={item.color} strokeWidth="3" vectorEffect="non-scaling-stroke" />
          {points.map(([x, y], index) => <circle key={index} cx={x} cy={y} r="4" fill="#fff" stroke={item.color} strokeWidth="2" vectorEffect="non-scaling-stroke"><title>{`${item.label}: ${compact(item.values[index])}`}</title></circle>)}
        </g>;
      })}
      {Array.from({ length: count }).map((_, index) => {
        const [x] = point(0, index);
        const label = labels[index] || '';
        return <text key={index} x={x} y={height - 10} textAnchor="middle">{label}</text>;
      })}
    </svg>
    {!all.length ? <div className="r23-chart-empty">Sin movimientos en el período.</div> : null}
  </div>;
}

export function R23DualBars({ rows = [], positiveLabel = 'Ingresos', negativeLabel = 'Egresos' }) {
  const clean = rows.map((row) => ({ ...row, positive: Math.max(0, Number(row.positive || 0)), negative: Math.max(0, Number(row.negative || 0)) }));
  const max = Math.max(1, ...clean.flatMap((row) => [row.positive, row.negative]));
  return <div className="r23-dual-bars">
    <div className="r23-chart-legend"><span><i className="positive" />{positiveLabel}</span><span><i className="negative" />{negativeLabel}</span></div>
    <div className="r23-dual-bars-plot">
      {clean.map((row, index) => <div key={row.key || row.label || index}>
        <div className="positive" style={{ height: `${Math.max(row.positive ? 4 : 0, row.positive / max * 48)}%` }} title={`${positiveLabel}: ${row.positive}`} />
        <i />
        <div className="negative" style={{ height: `${Math.max(row.negative ? 4 : 0, row.negative / max * 48)}%` }} title={`${negativeLabel}: ${row.negative}`} />
        <span>{row.label}</span>
      </div>)}
    </div>
  </div>;
}

export function r23DayKey(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : '';
}

