import React, { useEffect, useState, memo } from 'react';
import { useHistory } from 'react-router-dom';
import WormStyleNavbar from '../../components/modern/WormStyleNavbar';
import { centsToTCENT } from '../../utils/priceFormatter';

// Skeleton loading row component
const ActivityRowSkeleton = memo(() => (
  <div className="flex items-center border-b border-[#272727] animate-pulse">
    <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 px-3 sm:px-4 py-3">
      {/* Avatar skeleton */}
      <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg bg-white/10 flex-shrink-0" />
      
      {/* Content skeleton */}
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-3 sm:h-4 bg-white/10 rounded w-3/4" />
        <div className="h-2.5 sm:h-3 bg-white/5 rounded w-1/2" />
      </div>
    </div>
    
    {/* Time skeleton */}
    <div className="flex items-center gap-2 px-2 sm:px-4 py-3 flex-shrink-0">
      <div className="h-3 w-10 bg-white/10 rounded" />
      <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white/10" />
    </div>
  </div>
));

// Skeleton loading component for Activity page
const ActivitySkeleton = memo(() => (
  <div className="rounded-[18px] bg-[#050505] shadow-[0_22px_60px_rgba(0,0,0,0.75)]">
    {[...Array(8)].map((_, i) => (
      <ActivityRowSkeleton key={i} />
    ))}
  </div>
));

// Helper function to format timestamp as relative time
const formatTimeAgo = (timestamp) => {
  if (!timestamp) return '';
  
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now - date;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffSeconds < 60) {
    return 'just now';
  } else if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else if (diffWeeks < 4) {
    return `${diffWeeks}w ago`;
  } else {
    return `${diffMonths}mo ago`;
  }
};

const ActivityRow = ({ item, onClick }) => {
  const timeAgo = formatTimeAgo(item.createdAt || item.timestamp);
  
  return (
    <div
      className="flex items-center border-b border-[#272727] cursor-pointer hover:bg-white/5 transition-colors"
      onClick={onClick}
    >
      {/* Market thumbnail + info */}
      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 px-3 sm:px-4 py-3">
        <div className="relative w-9 h-9 sm:w-11 sm:h-11 rounded-lg overflow-hidden flex-shrink-0">
          {item.marketImageUrl ? (
            <>
              <img
                src={item.marketImageUrl}
                alt={item.marketTitle}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.style.display = 'none';
                  if (e.target.nextSibling) {
                    e.target.nextSibling.style.display = 'block';
                  }
                }}
              />
              <div
                className={`absolute inset-0 bg-gradient-to-br ${item.avatarGradient}`}
                style={{ display: 'none' }}
              />
            </>
          ) : (
            <div
              className={`absolute inset-0 bg-gradient-to-br ${item.avatarGradient || 'from-purple-500 to-blue-500'}`}
            />
          )}
        </div>
        
        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Market title */}
          <p
            className="text-[11px] sm:text-sm font-semibold text-white line-clamp-1"
            style={{
              fontFamily: '"Clash Grotesk", "Space Grotesk", sans-serif',
            }}
          >
            {item.marketTitle}
          </p>
          
          {/* Action description */}
          <p
            className="text-[10px] sm:text-xs text-[#888] mt-0.5 line-clamp-1"
            style={{
              fontFamily: '"Clash Grotesk", "Space Grotesk", sans-serif',
            }}
          >
            <span className="text-[#AAA]">{item.user}</span>
            {' '}{item.action}{' '}
            {item.side && (
              <span style={{ color: item.sideColor, fontWeight: 600 }}>{item.side}</span>
            )}
            {item.priceCents != null && item.shares != null && (
              <>
                {' '}at <span className="text-[#AAA]">{centsToTCENT(item.priceCents)}</span>
                {' '}(<span className="text-[#AAA]">{typeof item.shares === 'number' ? item.shares.toFixed(2) : '0'}</span> TCENT)
              </>
            )}
          </p>
        </div>
      </div>

      {/* Time + link - always visible */}
      <div className="flex items-center gap-2 px-2 sm:px-4 py-3 flex-shrink-0">
        <span
          className="text-[10px] sm:text-xs text-[#666] whitespace-nowrap"
          style={{
            fontFamily: '"Clash Grotesk", "Space Grotesk", sans-serif',
          }}
        >
          {timeAgo}
        </span>
        <a
          href={item.txUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border border-white/10 flex items-center justify-center hover:border-white/30 hover:bg-white/5 transition-colors"
        >
          <svg
            className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-[#888]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>
      </div>
    </div>
  );
};

const Activity = () => {
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('resolved');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const history = useHistory();

  const filterOptions = [
    { key: 'resolved', label: 'Resolved' },
    { key: 'created', label: 'Created' },
    { key: 'trades', label: 'Trades' },
  ];

  const handleActivityClick = (item) => {
    if (item.marketId) {
      history.push(`/markets/${item.marketId}`);
    }
  };

  // Filter activity
  const filteredActivity = activity.filter((item) => {
    if (filter === 'trades') return item.eventType === 'ORDER_FILLED' || item.eventType === 'ORDER_PLACED';
    if (filter === 'resolved') return item.eventType === 'MARKET_RESOLVED';
    if (filter === 'created') return item.eventType === 'MARKET_CREATED';
  });

  useEffect(() => {
    const fetchActivity = async () => {
      try {
        const base =
          window.__ENV?.API_BASE_URL ||
          import.meta.env.VITE_API_BASE_URL ||
          '';
        const res = await fetch(`${base}/api/activity?limit=50`);
        if (!res.ok) throw new Error('Failed to load activity');
        const data = await res.json();
        setActivity(data.activity || []);
      } catch (err) {
        console.error('Failed to fetch activity', err);
      } finally {
        setLoading(false);
      }
    };

    fetchActivity();
  }, []);

  return (
    <div className="min-h-screen bg-[#050505]">
      <WormStyleNavbar />

      <div className="pt-20 sm:pt-24 pb-16 sm:pb-24 px-3 sm:px-4">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-6">
            <div>
              <h1
                className="text-[28px] sm:text-[48px] font-bold text-white mb-1 sm:mb-2"
               style={{
                fontFamily:
                  '"Clash Grotesk", "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
               }}
              >
               PolyDegen Activity
              </h1>
              <p
                className="text-[12px] sm:text-[14px] text-[#BABABA] max-w-xl"
                style={{
                  fontFamily:
                    '"Clash Grotesk", "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                }}
              >
                Earn rewards by placing orders within the spread.
              </p>
            </div>

            {/* Filter dropdown */}
            <div 
              className="relative w-full sm:w-auto"
              style={{
                fontFamily:
                  '"Clash Grotesk", "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              }}
            >
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center justify-between sm:justify-start gap-3 bg-transparent border-2 border-[#FFE600] text-[#FFE600] rounded-full px-4 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base font-medium cursor-pointer hover:bg-[#FFE600]/10 transition-all focus:outline-none w-full sm:w-auto"
                style={{ minWidth: '120px' }}
              >
                <span>{filterOptions.find(o => o.key === filter)?.label || 'Resolved'}</span>
                <svg 
                  className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {/* Dropdown menu */}
              {dropdownOpen && (
                <>
                  {/* Backdrop to close dropdown */}
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setDropdownOpen(false)}
                  />
                  <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-full sm:w-48 bg-[#1A1A1A] border border-[#FFE600]/30 rounded-2xl shadow-xl z-50 overflow-hidden">
                    {filterOptions.map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => {
                          setFilter(key);
                          setDropdownOpen(false);
                        }}
                        className={`w-full px-4 sm:px-5 py-2.5 sm:py-3 text-left text-xs sm:text-sm font-medium transition-colors ${
                          filter === key
                            ? 'bg-[#FFE600]/20 text-[#FFE600]'
                            : 'text-white hover:bg-white/5'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Activity list – full-width rows with subtle dividers, no outer card */}
          {loading ? (
            <ActivitySkeleton />
          ) : filteredActivity.length === 0 ? (
            <div className="rounded-[18px] bg-[#050505] shadow-[0_22px_60px_rgba(0,0,0,0.75)]">
              <div className="px-4 py-6 text-sm text-[#BABABA]">
                {activity.length === 0 
                  ? 'No recent activity yet. Trade a market to see it here.'
                    : `No ${filter === 'resolved' ? '' : filter} activity found.`
                }
              </div>
            </div>
          ) : (
            <div className="rounded-[18px] bg-[#050505] shadow-[0_22px_60px_rgba(0,0,0,0.75)]">
              {filteredActivity.map((item) => (
                <ActivityRow 
                  key={item.id} 
                  item={item} 
                  onClick={() => handleActivityClick(item)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Activity;


