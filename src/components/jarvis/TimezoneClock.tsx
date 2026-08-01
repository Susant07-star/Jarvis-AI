import React, { useState, useEffect } from 'react';
import { Globe, Clock } from 'lucide-react';

const COMMON_TIMEZONES = [
  { label: 'Nepal (NPT)', value: 'Asia/Kathmandu' },
  { label: 'India (IST)', value: 'Asia/Kolkata' },
  { label: 'New York (EST)', value: 'America/New_York' },
  { label: 'London (GMT)', value: 'Europe/London' },
  { label: 'Tokyo (JST)', value: 'Asia/Tokyo' },
  { label: 'Sydney (AEST)', value: 'Australia/Sydney' },
  { label: 'Dubai (GST)', value: 'Asia/Dubai' },
  { label: 'California (PST)', value: 'America/Los_Angeles' },
];

interface TimezoneClockProps {
  timezone: string;
  onTimezoneChange: (tz: string) => void;
}

export function TimezoneClock({ timezone, onTimezoneChange }: TimezoneClockProps) {
  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setDateStr(now.toLocaleDateString('en-US', { timeZone: timezone, weekday: 'short', month: 'short', day: 'numeric' }));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [timezone]);

  return (
    <div className="relative flex items-center gap-3">
      <div className="hidden lg:flex flex-col items-end">
        <div className="flex items-center gap-1.5 text-cyan-300">
          <Clock className="w-3 h-3" />
          <span className="font-mono text-xs tracking-wider">{timeStr}</span>
        </div>
        <span className="text-[9px] text-cyan-600 font-mono uppercase">{dateStr}</span>
      </div>

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-cyan-950/30 hover:bg-cyan-900/50 border border-cyan-800/30 transition-all text-cyan-400 group"
      >
        <Globe className="w-3.5 h-3.5 group-hover:animate-pulse" />
        <span className="text-[10px] font-mono tracking-wide max-w-[80px] truncate">
          {COMMON_TIMEZONES.find(t => t.value === timezone)?.label.split(' ')[0] || timezone.split('/')[1]}
        </span>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-[240]" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full right-0 mt-2 w-[calc(100vw-32px)] md:w-48 max-w-[250px] bg-gray-900/95 backdrop-blur-md border border-cyan-800/50 rounded-lg shadow-xl shadow-cyan-900/20 z-[250] overflow-hidden">
            <div className="p-2 border-b border-cyan-800/30">
              <span className="text-[10px] font-mono text-cyan-600 uppercase tracking-widest px-2">Select Region</span>
            </div>
            <div className="max-h-60 overflow-y-auto custom-scrollbar p-1">
              {COMMON_TIMEZONES.map((tz) => (
                <button
                  key={tz.value}
                  onClick={() => {
                    onTimezoneChange(tz.value);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs md:text-[11px] font-mono rounded hover:bg-cyan-900/40 transition-colors flex items-center justify-between ${timezone === tz.value ? 'text-cyan-300 bg-cyan-950/50' : 'text-cyan-600'}`}
                >
                  {tz.label}
                  {timezone === tz.value && <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
