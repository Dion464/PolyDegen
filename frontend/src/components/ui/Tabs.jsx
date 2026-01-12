import React, { useState, useEffect } from 'react';

/**
 * Tabs - Reusable tab component
 */
export const Tabs = ({ 
  tabs, 
  onTabChange, 
  defaultTab, 
  activeTab,
  className = '' 
}) => {
  const [internalActiveTab, setInternalActiveTab] = useState(defaultTab || tabs[0]?.label);
  const currentTab = activeTab ?? internalActiveTab;

  useEffect(() => {
    if (defaultTab && defaultTab !== internalActiveTab) {
      setInternalActiveTab(defaultTab);
    }
  }, [defaultTab]);

  const handleTabClick = (tabLabel) => {
    if (onTabChange) {
      onTabChange(tabLabel);
    } else {
      setInternalActiveTab(tabLabel);
    }
    const tab = tabs.find(t => t.label === tabLabel);
    if (tab?.onSelect) tab.onSelect();
  };

  return (
    <div className={className}>
      <div className="flex border-b border-white/10 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.label}
            onClick={() => handleTabClick(tab.label)}
            className={`
              px-4 py-2 text-sm font-medium flex-1 min-w-0 transition-colors
              ${currentTab === tab.label 
                ? 'text-white bg-white/10 border-b-2 border-[#FFE600]' 
                : 'text-white/60 hover:text-white hover:bg-white/5'
              }
            `}
          >
            <span className="truncate text-xs sm:text-sm block">{tab.label}</span>
          </button>
        ))}
      </div>
      <div className="p-4">
        {tabs.map(tab => (
          currentTab === tab.label && <div key={tab.label}>{tab.content}</div>
        ))}
      </div>
    </div>
  );
};

export default Tabs;

