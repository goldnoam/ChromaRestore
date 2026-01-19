import React from 'react';

interface AdPlaceholderProps {
  label: string;
}

export const AdPlaceholder: React.FC<AdPlaceholderProps> = ({ label }) => {
  return (
    <div className="w-full h-24 bg-slate-900/50 dark:bg-slate-900 border-2 border-dashed border-slate-800 dark:border-slate-800 flex items-center justify-center rounded-3xl my-6 overflow-hidden group hover:border-indigo-500/50 transition-colors">
      <div className="text-slate-500 text-sm font-medium flex flex-col items-center">
        <span className="mb-2 opacity-60 uppercase tracking-widest text-[9px] font-black group-hover:text-indigo-400 transition-colors">{label}</span>
        <div className="w-32 h-1 bg-slate-800 dark:bg-slate-800 rounded-full overflow-hidden">
          <div className="w-full h-full bg-indigo-500/20 animate-[shimmer_2s_infinite]"></div>
        </div>
      </div>
    </div>
  );
};