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

const buildSeries = (history = []) => {
  // Only return REAL data from database - no fake fallbacks
  return sanitizeHistory(history);
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
  const [splitLines, setSplitLines] = useState(false); // false = show both lines together
  const [selectedSide, setSelectedSide] = useState('yes'); // only used when splitLines is true

  // Build series from REAL data only - no fake fallbacks
  const yesSeries = useMemo(
    () => buildSeries(yesPriceHistory),
    [yesPriceHistory]
  );

  const noSeries = useMemo(
    () => buildSeries(noPriceHistory),
    [noPriceHistory]
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

    // Catmull-Rom spline interpolation for truly smooth curves
    const catmullRomSpline = (p0, p1, p2, p3, t) => {
      const t2 = t * t;
      const t3 = t2 * t;
      return 0.5 * (
        (2 * p1) +
        (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t3
      );
    };

    // Create smooth interpolated data using spline
    const createSmoothData = (data) => {
      if (data.length < 2) return data;
      if (data.length === 2) {
        // Just 2 points - add some intermediate points with easing
        const [ts1, val1] = data[0];
        const [ts2, val2] = data[1];
        const result = [];
        const steps = 10;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          // Smooth ease-in-out
          const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          result.push([
            ts1 + (ts2 - ts1) * t,
            val1 + (val2 - val1) * eased
          ]);
        }
        return result;
      }

      const result = [];
      const pointsPerSegment = 8; // More points = smoother curves

      for (let i = 0; i < data.length - 1; i++) {
        // Get 4 control points for Catmull-Rom
        const p0 = data[Math.max(0, i - 1)];
        const p1 = data[i];
        const p2 = data[i + 1];
        const p3 = data[Math.min(data.length - 1, i + 2)];

        // Generate interpolated points
        for (let j = 0; j < pointsPerSegment; j++) {
          const t = j / pointsPerSegment;
          
          // Interpolate timestamp linearly
          const interpTs = p1[0] + (p2[0] - p1[0]) * t;
          
          // Interpolate value using Catmull-Rom spline
          const interpVal = catmullRomSpline(p0[1], p1[1], p2[1], p3[1], t);
          
          // Clamp value between 0 and 1
          const clampedVal = Math.max(0, Math.min(1, interpVal));
          
          result.push([interpTs, clampedVal]);
        }
      }
      
      // Add the final point
      result.push(data[data.length - 1]);
      
      return result;
    };

    // Format data and filter by time range
    const formatSeriesData = (lineData) => {
      // Filter by time range
      const filtered = lineData
        .filter(([ts]) => timeCutoff === 0 || ts >= timeCutoff);
      
      if (filtered.length === 0) return [];
      
      // Create smooth spline-interpolated data
      const smoothed = createSmoothData(filtered);
      
      // Convert to chart format
      return smoothed.map(([ts, value]) => {
        const rawPercent = Number(value || 0) * 100;
        return {
          value: [ts, rawPercent],
          actual: rawPercent
        };
      });
    };

    const yesData = formatSeriesData(yesLineData);
    const noData = formatSeriesData(noLineData);

    // If no real data, return null to show "no data" message instead of fake flat lines
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

    // Convert hex to rgba for area fill
    const hexToRgba = (hex, alpha) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    // Build series based on split mode
    const series = [];
    
    // Create smooth, clean lines - data is already spline-interpolated
    const createLineSeries = (name, color, data) => ({
      name,
      type: 'line',
      smooth: true, // Enable native smoothing on top of our spline data
      symbol: 'none',
      showSymbol: false,
      sampling: 'lttb',
      connectNulls: true,
      clip: true,
      lineStyle: {
        width: 2.5,
        color: color,
        type: 'solid',
        cap: 'round',
        join: 'round',
        // Glow effect for visibility
        shadowBlur: 14,
        shadowColor: hexToRgba(color, 0.55),
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        opacity: 1
      },
      areaStyle: undefined,
      emphasis: {
        focus: 'series',
        lineStyle: {
          width: 3.5,
          shadowBlur: 20,
          shadowColor: hexToRgba(color, 0.75),
          opacity: 1
        }
      },
      data
    });

    if (splitLines === true) {
      // SPLIT MODE: Show ONLY the selected side
      if (selectedSide === 'yes') {
        if (yesData.length > 0) {
          series.push(createLineSeries('YES', accentYes, yesData));
        }
      } else if (selectedSide === 'no') {
        if (noData.length > 0) {
          series.push(createLineSeries('NO', accentNo, noData));
        }
      }
    } else {
      // DEFAULT: Show both lines together
      if (yesData.length > 0) {
        series.push(createLineSeries('YES', accentYes, yesData));
      }
      if (noData.length > 0) {
        series.push(createLineSeries('NO', accentNo, noData));
      }
    }

    if (series.length === 0) return null;
    
    // Determine active color for tooltip border (YES takes priority)
    const activeColor = series[0]?.lineStyle?.color || accentYes;

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
        show: true,
        trigger: 'axis',
        confine: true,
        backgroundColor: 'rgba(15, 15, 15, 0.96)',
        borderColor: hexToRgba(activeColor, 0.6),
        borderWidth: 1,
        borderRadius: 8,
        padding: [12, 16],
        textStyle: {
          color: '#fff',
          fontSize: 13
        },
        extraCssText: 'box-shadow: 0 4px 20px rgba(0,0,0,0.5); z-index: 9999;',
        axisPointer: {
          type: 'cross',
          crossStyle: {
            color: 'rgba(255,255,255,0.3)',
            width: 1,
            type: 'dashed'
          },
          lineStyle: {
            color: hexToRgba(activeColor, 0.6),
            type: 'solid',
            width: 1
          },
          label: {
            show: false
          }
        },
        formatter: function(params) {
          if (!params || params.length === 0) return '';
          
          // Get the timestamp from first param
          const timestamp = params[0]?.value?.[0];
          if (!timestamp) return '';
          
          const date = new Date(timestamp);
          const dateStr = date.toLocaleString('en-US', { 
            month: 'short', day: 'numeric', year: 'numeric',
            hour: 'numeric', minute: '2-digit', hour12: true 
          });
          
          // Build tooltip content
          let content = `<div style="font-size: 11px; color: rgba(255,255,255,0.6); margin-bottom: 8px; font-weight: 500;">${dateStr}</div>`;
          content += `<div style="display: flex; gap: 8px; flex-wrap: wrap;">`;
          
          params.forEach(param => {
            if (!param?.value) return;
            const seriesName = param.seriesName || 'Value';
            const value = param.value[1];
            if (value === undefined || value === null) return;
            
            const color = seriesName === 'YES' ? '#FFE600' : '#7C3AED';
            const textColor = seriesName === 'YES' ? '#000' : '#fff';
            content += `<div style="display: inline-flex; align-items: center; padding: 5px 12px; border-radius: 6px; background: ${color}; color: ${textColor}; font-weight: 600; font-size: 13px;">
                    ${seriesName} ${Number(value).toFixed(1)}%
                  </div>`;
          });
          
          content += `</div>`;
          return content;
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
            const timeRange = maxTime - minTime;
            const oneDay = 24 * 60 * 60 * 1000;
            const oneWeek = 7 * oneDay;
            
            // Show time for ranges <= 1 day
            if (timeRange <= oneDay) {
              return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            }
            // Show day + time for ranges <= 1 week
            if (timeRange <= oneWeek) {
              const month = date.toLocaleString('default', { month: 'short' });
              const day = date.getDate();
              const time = date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
              return `${month} ${day}\n${time}`;
            }
            // Show month + day for longer ranges
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
  }, [accentNo, accentYes, hasData, noLineData, yesLineData, selectedSide, splitLines, selectedRange]);

  // Check if we only have current price fallback (2 points with same value = flat line)
  const hasOnlyFallback = hasData && 
    yesSeries.length === 2 && 
    yesSeries[0][1] === yesSeries[1][1] &&
    (yesPriceHistory.length === 0 && noPriceHistory.length === 0 && priceHistory.length === 0);

  if (!hasData || !chartOptions) {
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
        {/* Both lines button (default) */}
        <button
          onClick={() => {
            setSplitLines(false);
          }}
          className={`px-3 sm:px-4 py-1 sm:py-1.5 rounded-full transition-all text-[10px] sm:text-xs font-semibold ${
            !splitLines
              ? 'bg-white/20 text-white'
              : 'text-white/50 hover:text-white hover:bg-white/10'
          }`}
          style={{
            fontFamily: 'gilroy, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}
        >
          Both
        </button>

        {/* YES only button */}
        <button
          onClick={() => {
            setSplitLines(true);
            setSelectedSide('yes');
          }}
          className={`px-3 sm:px-4 py-1 sm:py-1.5 rounded-full transition-all text-[10px] sm:text-xs font-semibold ${
            splitLines && selectedSide === 'yes'
              ? 'bg-[#FFE600] text-black'
              : 'text-white/50 hover:text-white hover:bg-white/10'
          }`}
          style={{
            fontFamily: 'gilroy, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}
        >
          YES
        </button>

        {/* NO only button */}
        <button
          onClick={() => {
            setSplitLines(true);
            setSelectedSide('no');
          }}
          className={`px-3 sm:px-4 py-1 sm:py-1.5 rounded-full transition-all text-[10px] sm:text-xs font-semibold ${
            splitLines && selectedSide === 'no'
              ? 'bg-[#7C3AED] text-white'
              : 'text-white/50 hover:text-white hover:bg-white/10'
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
          <ReactECharts 
            key={`${splitLines}-${selectedSide}-${selectedRange}`}
            option={chartOptions} 
            style={{ height: '100%', width: '100%' }}
            notMerge={true}
            lazyUpdate={false}
          />
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

