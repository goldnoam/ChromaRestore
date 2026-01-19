import React, { useEffect } from 'react';

interface AdPlaceholderProps {
  label: string;
}

declare global {
  interface Window {
    adsbygoogle: any[];
  }
}

export const AdPlaceholder: React.FC<AdPlaceholderProps> = ({ label }) => {
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.adsbygoogle) {
        window.adsbygoogle.push({});
      }
    } catch (e) {
      // Silently handle cases where adsbygoogle is blocked or fails
    }
  }, []);

  return (
    <div className="w-full my-6 min-h-[100px] flex flex-col gap-2">
      {/* Real Ad Unit Container */}
      <ins className="adsbygoogle"
           style={{ display: 'block', textAlign: 'center' }}
           data-ad-client="ca-pub-0274741291001288"
           data-ad-slot="default"
           data-ad-format="auto"
           data-full-width-responsive="true"></ins>

      {/* Visual Fallback / Placeholder */}
      <div className="w-full h-24 bg-slate-900/50 dark:bg-slate-900 border-2 border-dashed border-slate-800 dark:border-slate-800 flex items-center justify-center rounded-3xl overflow-hidden group hover:border-indigo-500/50 transition-colors">
        <div className="text-slate-500 text-sm font-medium flex flex-col items-center">
          <span className="mb-2 opacity-60 uppercase tracking-widest text-[9px] font-black group-hover:text-indigo-400 transition-colors">{label}</span>
          <div className="w-32 h-1 bg-slate-800 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className="w-full h-full bg-indigo-500/20 animate-[shimmer_2s_infinite]"></div>
          </div>
        </div>
      </div>
    </div>
  );
};