import React, { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import '../../pages/market/MarketDetailGlass.css';

const DEFAULT_RANGES = [
  { label: '1H', value: '1h' },
  { label: '6H', value: '6h' },
  { label: '1D', value: '1d' },
  { label: '1W', value: '1w' },
  { label: '1M', value: '1m' },
  { label: 'ALL', value: 'all' }
];

// Normalize price to 0-1 range
const normalizePrice = (raw) => {
  if (raw === undefined || raw === null) return null;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return null;
  if (numeric > 100) return numeric / 10000;
  if (numeric > 1.5) return numeric / 100;
  if (numeric < 0) return 0;
  if (numeric > 1) return 1;
  return numeric;
};

const resolveTimestamp = (point = {}) => {
  const candidate =
    point.timestamp ||
    point.createdAt ||
    point.date ||
    (point.blockTimestamp ? Number(point.blockTimestamp) * 1000 : null) ||
    (point.block_time ? Number(point.block_time) * 1000 : null) ||
    point.time;
  if (!candidate) return NaN;
  const ts = new Date(candidate).getTime();
  return Number.isFinite(ts) ? ts : NaN;
};

const resolvePrice = (point = {}) => {
  if (point.yesPriceBps !== undefined) return point.yesPriceBps / 10000;
  if (point.noPriceBps !== undefined) return point.noPriceBps / 10000;
  if (point.price !== undefined) return point.price;
  if (point.value !== undefined) return point.value;
  if (point.priceDecimal !== undefined) return point.priceDecimal;
  if (point.priceCents !== undefined) return point.priceCents / 100;
  if (point.priceBps !== undefined) return point.priceBps / 10000;
  if (point.priceTicks !== undefined) return point.priceTicks / 10000;
  return undefined;
};

const sanitizeHistory = (history = []) =>
  history
    .map((point) => {
      const timestamp = resolveTimestamp(point);
      const price = normalizePrice(resolvePrice(point));
      if (!Number.isFinite(timestamp) || price === null) return null;
      return { timestamp, price };
    })
    .filter(Boolean)
    .sort((a, b) => a.timestamp - b.timestamp);

const parseRangeValue = (value = '') => {
  const lower = value.toLowerCase();
  if (lower === 'all') return { type: 'all' };
  const match = lower.match(/^(\d+)([hmwdmy])$/);
  if (!match) return null;
  const count = parseInt(match[1], 10);
  const unit = match[2];
  const unitMap = { h: 'hour', d: 'day', w: 'week', m: 'month', y: 'year' };
  return { type: unitMap[unit] || 'day', count };
};

// Custom tooltip component
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) return null;
  
  const date = new Date(label);
  const dateStr = date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  });

  return (
    <div style={{
      background: 'rgba(15, 15, 15, 0.96)',
      border: '1px solid rgba(255,255,255,0.2)',
      borderRadius: '8px',
      padding: '12px 16px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
    }}>
      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', marginBottom: '8px' }}>
        {dateStr}
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        {payload.map((entry, idx) => (
          <div
            key={idx}
            style={{
              padding: '5px 12px',
              borderRadius: '6px',
              background: entry.color,
              color: entry.name === 'YES' ? '#000' : '#fff',
              fontWeight: 600,
              fontSize: '13px'
            }}
          >
            {entry.name} {Number(entry.value).toFixed(1)}%
          </div>
        ))}
      </div>
    </div>
  );
};

const PolymarketChart = ({
  priceHistory = [],
  yesPriceHistory = [],
  noPriceHistory = [],
  currentYesPrice = 0.5,
  currentNoPrice = 0.5,
  accentYes = '#FFE600',
  accentNo = '#7C3AED',
  height = 320,
  selectedRange = 'all',
  onRangeChange = () => {},
  ranges = DEFAULT_RANGES,
  title = 'Price History'
}) => {
  const [splitLines, setSplitLines] = useState(false);
  const [selectedSide, setSelectedSide] = useState('yes');

  // Process data
  const yesSeries = useMemo(() => sanitizeHistory(yesPriceHistory), [yesPriceHistory]);
  const noSeries = useMemo(() => sanitizeHistory(noPriceHistory), [noPriceHistory]);
  const aggregatedSeries = useMemo(() => sanitizeHistory(priceHistory), [priceHistory]);

  // Build chart data
  const chartData = useMemo(() => {
    const now = Date.now();
    let timeCutoff = 0;
    const rangeValue = selectedRange?.toLowerCase() || 'all';

    if (rangeValue !== 'all') {
      const match = rangeValue.match(/^(\d+)([hmwdmy])$/);
      if (match) {
        const count = parseInt(match[1], 10);
        const unit = match[2];
        const msPerUnit = {
          h: 60 * 60 * 1000,
          d: 24 * 60 * 60 * 1000,
          w: 7 * 24 * 60 * 60 * 1000,
          m: 30 * 24 * 60 * 60 * 1000,
          y: 365 * 24 * 60 * 60 * 1000
        };
        timeCutoff = now - (count * (msPerUnit[unit] || msPerUnit.d));
      }
    }

    // Combine YES and NO data into unified format
    const dataMap = new Map();

    // Add YES data
    const yesData = yesSeries.length > 0 ? yesSeries : aggregatedSeries;
    yesData.forEach(({ timestamp, price }) => {
      if (timeCutoff === 0 || timestamp >= timeCutoff) {
        if (!dataMap.has(timestamp)) {
          dataMap.set(timestamp, { timestamp });
        }
        dataMap.get(timestamp).yes = price * 100;
      }
    });

    // Add NO data
    const noData = noSeries.length > 0 ? noSeries : aggregatedSeries.map(d => ({
      timestamp: d.timestamp,
      price: 1 - d.price
    }));
    noData.forEach(({ timestamp, price }) => {
      if (timeCutoff === 0 || timestamp >= timeCutoff) {
        if (!dataMap.has(timestamp)) {
          dataMap.set(timestamp, { timestamp });
        }
        dataMap.get(timestamp).no = price * 100;
      }
    });

    // Sort by timestamp and fill missing values
    const sorted = Array.from(dataMap.values()).sort((a, b) => a.timestamp - b.timestamp);
    
    // Forward-fill missing values
    let lastYes = sorted[0]?.yes;
    let lastNo = sorted[0]?.no;
    sorted.forEach(point => {
      if (point.yes !== undefined) lastYes = point.yes;
      else point.yes = lastYes;
      if (point.no !== undefined) lastNo = point.no;
      else point.no = lastNo;
    });

    // Step 1: Sample data if too many points (to prevent glitching)
    if (sorted.length < 2) return sorted;
    
    let sampled = sorted;
    const maxBasePoints = 30; // Maximum base points before interpolation
    
    if (sorted.length > maxBasePoints) {
      // Sample evenly to reduce points
      const step = Math.ceil(sorted.length / maxBasePoints);
      sampled = [];
      for (let i = 0; i < sorted.length; i += step) {
        sampled.push(sorted[i]);
      }
      // Always include the last point
      if (sampled[sampled.length - 1] !== sorted[sorted.length - 1]) {
        sampled.push(sorted[sorted.length - 1]);
      }
    }
    
    // Step 2: Add smooth interpolation between sampled points
    const interpolated = [];
    for (let i = 0; i < sampled.length; i++) {
      const current = sampled[i];
      interpolated.push(current);
      
      if (i < sampled.length - 1) {
        const next = sampled[i + 1];
        const timeDiff = next.timestamp - current.timestamp;
        const yesDiff = (next.yes || 0) - (current.yes || 0);
        const noDiff = (next.no || 0) - (current.no || 0);
        
        // Add 4 interpolation points with S-curve easing
        for (let j = 1; j <= 4; j++) {
          const t = j / 5;
          const eased = 0.5 - 0.5 * Math.cos(Math.PI * t);
          
          interpolated.push({
            timestamp: current.timestamp + timeDiff * t,
            yes: (current.yes || 0) + yesDiff * eased,
            no: (current.no || 0) + noDiff * eased
          });
        }
      }
    }

    return interpolated;
  }, [yesSeries, noSeries, aggregatedSeries, selectedRange]);

  const hasData = chartData.length > 0;

  const rangeButtons = useMemo(() => {
    const sourceRanges = ranges && ranges.length ? ranges : DEFAULT_RANGES;
    return sourceRanges
      .map((range) => {
        const parsed = parseRangeValue(range.value);
        if (!parsed) return null;
        return {
          text: range.label.toUpperCase(),
          dataRangeValue: range.value,
          ...parsed
        };
      })
      .filter(Boolean);
  }, [ranges]);

  const selectedRangeIndex = useMemo(() => {
    const index = rangeButtons.findIndex(
      (btn) => btn.dataRangeValue?.toLowerCase() === selectedRange?.toLowerCase()
    );
    return index >= 0 ? index : 0;
  }, [rangeButtons, selectedRange]);

  // Format X axis labels
  const formatXAxis = (timestamp) => {
    const date = new Date(timestamp);
    const timeRange = chartData.length > 1 
      ? chartData[chartData.length - 1].timestamp - chartData[0].timestamp 
      : 0;
            const oneDay = 24 * 60 * 60 * 1000;
            const oneWeek = 7 * oneDay;
            
            if (timeRange <= oneDay) {
              return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            }
            if (timeRange <= oneWeek) {
      return `${date.toLocaleString('default', { month: 'short' })} ${date.getDate()}`;
    }
    return `${date.toLocaleString('default', { month: 'short' })} ${date.getDate()}`;
  };

  if (!hasData) {
    return (
      <div
        className="glass-card flex flex-col items-center justify-center rounded-[16px] sm:rounded-[24px] border border-white/20 backdrop-blur-xl text-white/60 p-4"
        style={{ height: typeof height === 'number' ? Math.max(150, height * 0.7) : height, background: 'rgba(12,12,12,0.55)' }}
      >
        <svg className="w-8 h-8 mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <p className="text-sm">Loading price data...</p>
      </div>
    );
  }

  const renderControls = () => (
    <div className="mb-2 sm:mb-3 flex flex-wrap items-center justify-between gap-2">
      {/* Left side: Line selection buttons */}
      <div className="flex items-center gap-1 sm:gap-1.5 bg-white/5 backdrop-blur-md rounded-full p-0.5 sm:p-1 border border-white/10">
        <button
          onClick={() => setSplitLines(false)}
          className={`px-3 sm:px-4 py-1 sm:py-1.5 rounded-full transition-all text-[10px] sm:text-xs font-semibold ${
            !splitLines ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white hover:bg-white/10'
          }`}
          style={{ fontFamily: 'gilroy, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
        >
          Both
        </button>
        <button
          onClick={() => { setSplitLines(true); setSelectedSide('yes'); }}
          className={`px-3 sm:px-4 py-1 sm:py-1.5 rounded-full transition-all text-[10px] sm:text-xs font-semibold ${
            splitLines && selectedSide === 'yes' ? 'bg-[#FFE600] text-black' : 'text-white/50 hover:text-white hover:bg-white/10'
          }`}
          style={{ fontFamily: 'gilroy, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
        >
          YES
        </button>
        <button
          onClick={() => { setSplitLines(true); setSelectedSide('no'); }}
          className={`px-3 sm:px-4 py-1 sm:py-1.5 rounded-full transition-all text-[10px] sm:text-xs font-semibold ${
            splitLines && selectedSide === 'no' ? 'bg-[#7C3AED] text-white' : 'text-white/50 hover:text-white hover:bg-white/10'
          }`}
          style={{ fontFamily: 'gilroy, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
        >
          NO
        </button>
      </div>

      {/* Zoom Buttons */}
      <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
        <span className="hidden sm:inline text-white/60 text-xs font-medium mr-1">Zoom</span>
        {rangeButtons.map((btn, index) => {
          const isActive = index === selectedRangeIndex;
          return (
            <button
              key={btn.text + btn.dataRangeValue}
              onClick={() => onRangeChange?.(btn.dataRangeValue)}
              className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-full transition-all text-[10px] sm:text-xs font-medium ${
                isActive
                  ? 'bg-white/15 text-white border border-white/20'
                  : 'bg-white/5 text-white/60 hover:bg-white/10 border border-transparent'
              } backdrop-blur-md flex-shrink-0`}
              style={{ fontFamily: 'gilroy, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
            >
              {btn.text}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="glass-card w-full rounded-[16px] sm:rounded-[24px] border border-white/20 backdrop-blur-xl p-3 sm:p-4" style={{ background: 'rgba(12,12,12,0.55)' }}>
      {renderControls()}
      <div className="overflow-hidden rounded-[12px] sm:rounded-[16px]" style={{ height: typeof height === 'number' ? Math.max(180, height * 0.8) : height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 50, left: 10, bottom: 10 }}>
            {/* Grid lines */}
            <ReferenceLine y={20} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
            <ReferenceLine y={40} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
            <ReferenceLine y={60} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
            <ReferenceLine y={80} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
            <ReferenceLine y={100} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
            
            <XAxis
              dataKey="timestamp"
              tickFormatter={formatXAxis}
              stroke="rgba(255,255,255,0.1)"
              tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              tickLine={false}
              minTickGap={50}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 20, 40, 60, 80, 100]}
              orientation="right"
              stroke="rgba(255,255,255,0.1)"
              tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
              tickFormatter={(v) => `${v}%`}
              axisLine={false}
              tickLine={false}
              width={45}
            />
            <Tooltip content={<CustomTooltip />} />
            
            {/* YES Line - basis spline for maximum smooth rounded curves */}
            {(!splitLines || selectedSide === 'yes') && (
              <Line
                type="basis"
                dataKey="yes"
                name="YES"
                stroke={accentYes}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, fill: accentYes, stroke: '#000', strokeWidth: 2 }}
                style={{
                  filter: `drop-shadow(0 0 10px ${accentYes}88)`
                }}
              />
            )}
            
            {/* NO Line - basis spline for maximum smooth rounded curves */}
            {(!splitLines || selectedSide === 'no') && (
              <Line
                type="basis"
                dataKey="no"
                name="NO"
                stroke={accentNo}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, fill: accentNo, stroke: '#fff', strokeWidth: 2 }}
                style={{
                  filter: `drop-shadow(0 0 10px ${accentNo}88)`
                }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default PolymarketChart;
