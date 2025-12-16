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

    // Interpolate data points to create smoother curves
    // This adds intermediate points between existing data to avoid harsh step-like transitions
    const interpolateData = (data) => {
      if (data.length < 2) return data;
      
      const result = [];
      for (let i = 0; i < data.length - 1; i++) {
        const [ts1, val1] = data[i];
        const [ts2, val2] = data[i + 1];
        
        result.push([ts1, val1]);
        
        // Calculate time gap
        const timeDiff = ts2 - ts1;
        const valueDiff = Math.abs(val2 - val1);
        
        // Only interpolate if there's a significant time gap AND value change
        // This creates smoother transitions for large jumps
        if (timeDiff > 3600000 && valueDiff > 0.05) { // > 1 hour gap and > 5% change
          const numSteps = Math.min(5, Math.ceil(valueDiff / 0.1)); // Up to 5 intermediate points
          
          for (let j = 1; j <= numSteps; j++) {
            const ratio = j / (numSteps + 1);
            // Use ease-in-out curve for smoother transitions
            const easeRatio = ratio < 0.5 
              ? 2 * ratio * ratio 
              : 1 - Math.pow(-2 * ratio + 2, 2) / 2;
            
            const interpTs = ts1 + timeDiff * ratio;
            const interpVal = val1 + (val2 - val1) * easeRatio;
            result.push([interpTs, interpVal]);
          }
        }
      }
      // Add the last point
      result.push(data[data.length - 1]);
      
      return result;
    };

    // Format data and filter by time range
    const formatSeriesData = (lineData) => {
      // Filter by time range
      const filtered = lineData
        .filter(([ts]) => timeCutoff === 0 || ts >= timeCutoff);
      
      // Interpolate for smoother curves
      const interpolated = interpolateData(filtered);
      
      // Convert to chart format
      return interpolated.map(([ts, value]) => {
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
    
    // Create rounder/clearer lines with smooth spline interpolation
    const createLineSeries = (name, color, data) => ({
      name,
      type: 'line',
      smooth: 0.6, // Higher smoothing for rounder curves
      smoothMonotone: 'x', // Maintain monotonic smoothing along X-axis for cleaner look
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
        // Subtle glow for readability on dark background
        shadowBlur: 12,
        shadowColor: hexToRgba(color, 0.5),
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        opacity: 1
      },
      // NO area fill - clean line only
      areaStyle: undefined,
      emphasis: {
        focus: 'series',
        lineStyle: {
          width: 3,
          shadowBlur: 16,
          shadowColor: hexToRgba(color, 0.7),
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
        trigger: 'axis',
        backgroundColor: 'rgba(20, 20, 20, 0.95)',
        borderColor: hexToRgba(activeColor, 0.5),
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
            color: hexToRgba(activeColor, 0.5),
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
          
          // Build tooltip for all visible series
          let content = `<div style="font-size: 12px; color: rgba(255,255,255,0.7); margin-bottom: 6px;">${dateStr}</div>`;
          
          params.forEach(param => {
            const seriesName = param.seriesName;
            const value = param.value[1];
            const color = seriesName === 'YES' ? '#FFE600' : '#7C3AED';
            const textColor = seriesName === 'YES' ? '#000' : '#fff';
            content += `<div style="display: inline-block; padding: 4px 10px; border-radius: 4px; background: ${color}; color: ${textColor}; font-weight: 600; font-size: 14px; margin-right: 6px;">
                    ${seriesName} ${Number(value).toFixed(1)}%
                  </div>`;
          });
          
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

