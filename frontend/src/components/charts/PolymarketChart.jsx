import React, { useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import '../../pages/market/MarketDetailGlass.css';

const DEFAULT_RANGES = [
  { label: '1H', value: '1h' },
  { label: '6H', value: '6h' },
  { label: '1D', value: '1d' },
  { label: '1W', value: '1w' },
  { label: '1M', value: '1m' },
  { label: 'ALL', value: 'all' }
];

// Normalize price to 0-1 range (NO artificial clamping)
const normalizePrice = (raw) => {
  if (raw === undefined || raw === null) return null;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return null;
  
  // If value is > 1.5, assume it's in percentage or basis points
  if (numeric > 100) return numeric / 10000; // basis points
  if (numeric > 1.5) return numeric / 100; // percentage
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
  // Handle yesPriceBps directly (from database)
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

// Only use REAL data from database - no interpolation
const sanitizeHistory = (history = []) =>
  history
    .map((point) => {
      const timestamp = resolveTimestamp(point);
      const price = normalizePrice(resolvePrice(point));
      if (!Number.isFinite(timestamp) || price === null) return null;
      return [timestamp, price];
    })
    .filter(Boolean)
    .sort((a, b) => a[0] - b[0]);

const buildSeries = (history = [], fallbackPrice) => {
  const sanitized = sanitizeHistory(history);
  
  // Only use fallback if NO real data exists
  if (!sanitized.length && fallbackPrice !== undefined && fallbackPrice !== null) {
    const fallbackNormalized = normalizePrice(
      fallbackPrice > 1 ? fallbackPrice / 100 : fallbackPrice
    );
    if (fallbackNormalized !== null) {
      return [[Date.now(), fallbackNormalized]];
    }
  }
  return sanitized;
};

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

const PolymarketChart = ({
  priceHistory = [],
  yesPriceHistory = [],
  noPriceHistory = [],
  currentYesPrice = 0.5,
  currentNoPrice = 0.5,
  accentYes = '#FFE600', // Yellow for YES
  accentNo = '#7C3AED',  // Purple for NO
  height = 320,
  selectedRange = 'all',
  onRangeChange = () => {},
  ranges = DEFAULT_RANGES,
  title = 'Price History'
}) => {
  const [selectedSide, setSelectedSide] = useState('yes');

  // Build series from REAL data only - no interpolation
  const yesSeries = useMemo(
    () => buildSeries(yesPriceHistory, currentYesPrice),
    [yesPriceHistory, currentYesPrice]
  );

  const noSeries = useMemo(
    () => buildSeries(noPriceHistory, currentNoPrice),
    [noPriceHistory, currentNoPrice]
  );

  const aggregatedSeries = useMemo(() => sanitizeHistory(priceHistory), [priceHistory]);

  // Use ONLY real data - no densification or smoothing
  const { yesLineData, noLineData } = useMemo(() => {
    let yesData = [];
    let noData = [];

    if (yesSeries.length > 0) {
      yesData = yesSeries;
    } else if (aggregatedSeries.length > 0) {
      yesData = aggregatedSeries;
    }

    if (noSeries.length > 0) {
      noData = noSeries;
    } else if (aggregatedSeries.length > 0) {
      noData = aggregatedSeries.map(([ts, val]) => [ts, 1 - val]);
    }

    return { yesLineData: yesData, noLineData: noData };
  }, [yesSeries, noSeries, aggregatedSeries]);

  const hasData = yesLineData.length > 0 || noLineData.length > 0;

  const rangeButtons = useMemo(() => {
    const sourceRanges = ranges && ranges.length ? ranges : DEFAULT_RANGES;
    const mapped = sourceRanges
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

    return mapped.length ? mapped : [{ text: 'ALL', type: 'all', dataRangeValue: 'all' }];
  }, [ranges]);

  const selectedRangeIndex = useMemo(() => {
    const index = rangeButtons.findIndex(
      (btn) => btn.dataRangeValue?.toLowerCase() === selectedRange?.toLowerCase()
    );
    return index >= 0 ? index : 0;
  }, [rangeButtons, selectedRange]);

  const chartOptions = useMemo(() => {
    if (!hasData) return null;

    // Calculate time cutoff based on selected range
    const now = Date.now();
    let timeCutoff = 0;
    const rangeValue = selectedRange?.toLowerCase() || 'all';
    
    if (rangeValue !== 'all') {
      const match = rangeValue.match(/^(\d+)([hmwdmy])$/);
      if (match) {
        const count = parseInt(match[1], 10);
        const unit = match[2];
        const msPerUnit = {
          h: 60 * 60 * 1000,           // hour
          d: 24 * 60 * 60 * 1000,      // day
          w: 7 * 24 * 60 * 60 * 1000,  // week
          m: 30 * 24 * 60 * 60 * 1000, // month
          y: 365 * 24 * 60 * 60 * 1000 // year
        };
        timeCutoff = now - (count * (msPerUnit[unit] || msPerUnit.d));
      }
    }

    // Format data and filter by time range
    const formatSeriesData = (lineData, fallbackPrice = null) => {
      let filtered = lineData
        .filter(([ts]) => timeCutoff === 0 || ts >= timeCutoff)
        .map(([ts, value]) => {
          const rawPercent = Number(value || 0) * 100;
          return {
            value: [ts, rawPercent],
            actual: rawPercent
          };
        });
      
      // If only 1 point or no points in range, but we have data, create a line
      if (filtered.length <= 1 && lineData.length > 0) {
        // Get the most recent value from all data
        const lastPoint = lineData[lineData.length - 1];
        const lastValue = Number(lastPoint[1] || 0) * 100;
        
        // Use fallback price if available
        const displayValue = filtered.length === 1 ? filtered[0].actual : 
                            (fallbackPrice !== null ? Number(fallbackPrice) * 100 : lastValue);
        
        // Create start point at cutoff time (or earliest data time for 'all')
        const startTime = timeCutoff > 0 ? timeCutoff : (lineData[0]?.[0] || now - 86400000);
        const endTime = now;
        
        filtered = [
          { value: [startTime, displayValue], actual: displayValue },
          { value: [endTime, displayValue], actual: displayValue }
        ];
      } else if (filtered.length > 0) {
        // Extend line to current time with last known value
        const lastFiltered = filtered[filtered.length - 1];
        if (lastFiltered.value[0] < now - 60000) { // If last point is more than 1 min old
          filtered.push({
            value: [now, lastFiltered.actual],
            actual: lastFiltered.actual
          });
        }
      }
      
      return filtered;
    };

    const yesData = formatSeriesData(yesLineData, currentYesPrice);
    const noData = formatSeriesData(noLineData, currentNoPrice);

    // If no data at all, show empty state
    if (yesData.length === 0 && noData.length === 0) {
      return null;
    }

    // Calculate time range
    const allTimestamps = [
      ...yesData.map((point) => point.value[0]),
      ...noData.map((point) => point.value[0])
    ].filter(Number.isFinite);
    
    // Set min/max - use cutoff for min when in a time range
    const dataMinTime = allTimestamps.length > 0 ? Math.min(...allTimestamps) : now - 86400000;
    const dataMaxTime = allTimestamps.length > 0 ? Math.max(...allTimestamps) : now;
    
    // For time ranges, use cutoff as min
    const minTime = timeCutoff > 0 ? timeCutoff : dataMinTime;
    const maxTime = Math.max(dataMaxTime, now); // Always extend to now

    const latestYes = yesData.length ? yesData[yesData.length - 1].actual : 0;
    const latestNo = noData.length ? noData[noData.length - 1].actual : 0;

    // Show only the selected side
    const activeSeries = selectedSide === 'yes' && yesData.length
      ? { key: 'YES', color: accentYes, data: yesData, latest: latestYes }
      : noData.length
      ? { key: 'NO', color: accentNo, data: noData, latest: latestNo }
      : null;

    if (!activeSeries) return null;

    // Convert hex to rgba for area fill
    const hexToRgba = (hex, alpha) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    // Smooth curved line with YES/NO colors - high tension for rounded curves
    const series = [
      {
        name: activeSeries.key,
        type: 'line',
        smooth: 0.6, // Higher value = more rounded curves
        symbol: 'none',
        showSymbol: false,
        sampling: 'lttb',
        connectNulls: true,
        lineStyle: {
          width: 2.5,
          color: activeSeries.color,
          type: 'solid',
          cap: 'round',
          join: 'round'
        },
        // Area fill matching line color
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: hexToRgba(activeSeries.color, 0.15) },
              { offset: 1, color: hexToRgba(activeSeries.color, 0.02) }
            ]
          }
        },
        emphasis: {
          focus: 'series',
          lineStyle: { width: 3 }
        },
        data: activeSeries.data
      }
    ];

    return {
      backgroundColor: 'transparent',
      animation: true,
      animationDuration: 400,
      grid: {
        left: '3%',
        right: '12%',
        top: '8%',
        bottom: '12%',
        containLabel: true
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(20, 20, 20, 0.95)',
        borderColor: hexToRgba(activeSeries.color, 0.5),
        borderWidth: 1,
        padding: [10, 14],
        textStyle: {
          color: '#fff',
          fontSize: 13
        },
        position: function (point, params, dom, rect, size) {
          // Keep tooltip inside chart bounds
          let x = point[0] + 15;
          let y = point[1] - 50;
          
          // If tooltip would go off the right edge, move it to the left of cursor
          if (x + size.contentSize[0] > size.viewSize[0] - 20) {
            x = point[0] - size.contentSize[0] - 15;
          }
          // If tooltip would go off the left edge
          if (x < 10) {
            x = 10;
          }
          // Keep tooltip vertically in bounds
          if (y < 10) {
            y = 10;
          }
          if (y + size.contentSize[1] > size.viewSize[1] - 10) {
            y = size.viewSize[1] - size.contentSize[1] - 10;
          }
          return [x, y];
        },
        axisPointer: {
          type: 'line',
          lineStyle: {
            color: hexToRgba(activeSeries.color, 0.5),
            type: 'dashed',
            width: 1
          }
        },
        formatter: function(params) {
          if (!params || params.length === 0) return '';
          const date = new Date(params[0].value[0]);
          const dateStr = date.toLocaleString('en-US', { 
            month: 'short', day: 'numeric', year: 'numeric',
            hour: 'numeric', minute: '2-digit', hour12: true 
          });
          const value = params[0].value[1];
          const textColor = activeSeries.key === 'YES' ? '#000' : '#fff';
          return `<div style="font-size: 12px; color: rgba(255,255,255,0.7); margin-bottom: 6px;">${dateStr}</div>
                  <div style="display: inline-block; padding: 4px 10px; border-radius: 4px; background: ${activeSeries.color}; color: ${textColor}; font-weight: 600; font-size: 14px;">
                    ${activeSeries.key} ${Number(value).toFixed(1)}%
                  </div>`;
        }
      },
      legend: { show: false },
      xAxis: {
        type: 'time',
        boundaryGap: false,
        axisLine: {
          show: true,
          lineStyle: { color: 'rgba(255, 255, 255, 0.1)', width: 1 }
        },
        axisLabel: {
          show: true,
          color: 'rgba(255, 255, 255, 0.5)',
          fontSize: 11,
          margin: 14,
          formatter: function(value) {
            const date = new Date(value);
            const month = date.toLocaleString('default', { month: 'short' });
            const day = date.getDate();
            return `${month} ${day}`;
          }
        },
        splitLine: { show: false },
        min: minTime,
        max: maxTime
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        interval: 20,
        position: 'right',
        axisLine: { show: false },
        axisLabel: {
          show: true,
          color: 'rgba(255, 255, 255, 0.5)',
          fontSize: 11,
          margin: 10,
          formatter: (val) => `${val}%`
        },
        splitLine: {
          show: true,
          lineStyle: {
            color: 'rgba(255, 255, 255, 0.06)',
            type: 'dashed',
            width: 1
          }
        }
      },
      series
    };
  }, [accentNo, accentYes, hasData, noLineData, yesLineData, selectedSide]);

  if (!hasData || !chartOptions) {
    return (
      <div
        className="glass-card flex items-center justify-center rounded-[16px] sm:rounded-[24px] border border-white/20 backdrop-blur-xl text-xs sm:text-sm text-white/60 p-4"
        style={{ height: typeof height === 'number' ? Math.max(150, height * 0.7) : height, background: 'rgba(12,12,12,0.55)' }}
      >
        No price data available yet
      </div>
    );
  }

  const renderControls = () => (
    <div className="mb-2 sm:mb-3 flex flex-wrap items-center justify-between gap-2">
      {/* YES/NO Toggle Buttons */}
      <div className="flex items-center gap-1.5 sm:gap-2 bg-white/5 backdrop-blur-md rounded-full p-0.5 sm:p-1 border border-white/10">
        <button
          onClick={() => setSelectedSide('yes')}
          className={`px-3 sm:px-4 py-1 sm:py-1.5 rounded-full transition-all text-[10px] sm:text-xs font-semibold ${
            selectedSide === 'yes'
              ? 'bg-[#FFE600] text-black'
              : 'text-white/60 hover:text-white'
          }`}
          style={{
            fontFamily: 'gilroy, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}
        >
          YES
        </button>
        <button
          onClick={() => setSelectedSide('no')}
          className={`px-3 sm:px-4 py-1 sm:py-1.5 rounded-full transition-all text-[10px] sm:text-xs font-semibold ${
            selectedSide === 'no'
              ? 'bg-[#7C3AED] text-white'
              : 'text-white/60 hover:text-white'
          }`}
          style={{
            fontFamily: 'gilroy, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}
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
              style={{
                fontFamily: 'gilroy, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
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
        {chartOptions ? (
          <ReactECharts option={chartOptions} style={{ height: '100%', width: '100%' }} />
        ) : (
          <div className="h-full flex items-center justify-center text-white/40 text-sm" style={{ fontFamily: 'gilroy, sans-serif' }}>
            <div className="text-center">
              <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <p>No trading activity in this time period</p>
              <p className="text-xs text-white/25 mt-1">Try selecting a longer time range</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PolymarketChart;

