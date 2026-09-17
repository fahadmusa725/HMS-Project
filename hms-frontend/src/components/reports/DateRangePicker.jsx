import React, { useState } from 'react';

export function DateRangePicker({ onRangeChange }) {
  const [activePreset, setActivePreset] = useState('30d');

  // Compute preset date strings (YYYY-MM-DD)
  const getPresetRange = (preset) => {
    const today = new Date();
    const endDate = today.toISOString().slice(0, 10);
    let startDate = '';

    if (preset === '7d') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      startDate = d.toISOString().slice(0, 10);
    } else if (preset === '30d') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      startDate = d.toISOString().slice(0, 10);
    } else if (preset === 'thisMonth') {
      const d = new Date(today.getFullYear(), today.getMonth(), 1);
      startDate = d.toISOString().slice(0, 10);
    } else if (preset === 'all') {
      return { startDate: '', endDate: '' };
    }

    return { startDate, endDate };
  };

  const initialRange = getPresetRange('30d');
  const [customStart, setCustomStart] = useState(initialRange.startDate);
  const [customEnd, setCustomEnd] = useState(initialRange.endDate);

  const handlePresetClick = (preset) => {
    setActivePreset(preset);
    const range = getPresetRange(preset);
    setCustomStart(range.startDate);
    setCustomEnd(range.endDate);
    onRangeChange(range);
  };

  const handleCustomChange = (start, end) => {
    setActivePreset('custom');
    setCustomStart(start);
    setCustomEnd(end);
    onRangeChange({ startDate: start, endDate: end });
  };

  return (
    <div className="flex flex-wrap items-center gap-2.5 p-2 bg-muted/40 rounded-xl border border-border">
      <div className="flex items-center gap-1">
        {[
          { key: '7d', label: 'Last 7 days' },
          { key: '30d', label: 'Last 30 days' },
          { key: 'thisMonth', label: 'This month' },
          { key: 'all', label: 'All time' },
        ].map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => handlePresetClick(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              activePreset === key
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/80'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="h-5 w-px bg-border hidden sm:block mx-1" />

      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground font-medium text-[11px] hidden md:inline">Custom:</span>
        <input
          type="date"
          value={customStart}
          onChange={(e) => handleCustomChange(e.target.value, customEnd)}
          className="h-8 rounded-lg border border-input bg-card px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
        />
        <span className="text-muted-foreground font-medium">to</span>
        <input
          type="date"
          value={customEnd}
          onChange={(e) => handleCustomChange(customStart, e.target.value)}
          className="h-8 rounded-lg border border-input bg-card px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
        />
      </div>
    </div>
  );
}
