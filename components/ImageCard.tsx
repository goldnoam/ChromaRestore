import React from 'react';
import { ImageItem, Translation } from '../types';

interface ImageCardProps {
  item: ImageItem;
  t: Translation;
  theme: 'dark' | 'light';
  onRemove: (id: string) => void;
  onSelect: (item: ImageItem) => void;
  onShare: (item: ImageItem) => void;
}

export const ImageCard: React.FC<ImageCardProps> = ({ item, t, theme, onRemove, onSelect, onShare }) => {
  const statusColors = {
    pending: theme === 'dark' ? 'bg-slate-600' : 'bg-slate-400',
    processing: 'bg-indigo-400 animate-pulse',
    completed: 'bg-emerald-500',
    error: 'bg-rose-500'
  };

  const statusLabel = t[item.status as keyof Translation] || item.status;
  const errorTooltip = item.error ? `${t.error}: ${item.error}` : t.error;

  return (
    <div className={`relative group rounded-2xl overflow-hidden shadow-sm hover:shadow-2xl border transition-all duration-300 ease-out hover:scale-[1.02] theme-border theme-bg-card`}>
      <div 
        className={`aspect-square relative overflow-hidden cursor-pointer ${theme === 'dark' ? 'bg-slate-950' : 'bg-slate-100'}`}
        onClick={() => onSelect(item)}
      >
        <img 
          src={item.previewUrl} 
          alt={item.file.name} 
          className={`w-full h-full object-cover transition-all duration-700 ${item.status === 'processing' ? 'scale-110 blur-md opacity-40' : 'scale-100 blur-0'}`}
        />
        
        {item.status === 'processing' && (
          <div className="absolute inset-0 flex items-center justify-center bg-indigo-950/20 backdrop-blur-[2px]">
            <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
          </div>
        )}

        {/* Status Dot Badge (Top Corner) */}
        <div 
          className={`absolute top-3 right-3 w-3 h-3 rounded-full border-2 shadow-xl z-20 ${statusColors[item.status]} ${theme === 'dark' ? 'border-slate-900' : 'border-white'}`} 
          title={item.status === 'error' ? errorTooltip : statusLabel} 
        />

        {item.status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center bg-rose-500/20 backdrop-blur-[1px] p-4 text-center">
            <span 
              className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md shadow-lg cursor-help ${theme === 'dark' ? 'bg-slate-950/80 text-rose-400' : 'bg-white/90 text-rose-600'}`}
              title={errorTooltip}
            >
              {t.error}
            </span>
          </div>
        )}
      </div>

      <div className={`p-3 flex items-center justify-between transition-colors theme-bg-card`}>
        <div className="flex items-center gap-2 truncate max-w-[50%]">
          <div 
            className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColors[item.status]}`} 
            title={item.status === 'error' ? errorTooltip : statusLabel}
          />
          <p className={`text-[10px] font-bold truncate tracking-tight theme-text-muted`}>
            {item.file.name}
          </p>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={(e) => { e.stopPropagation(); onSelect(item); }} 
            className={`p-1.5 rounded-lg transition-all ${theme === 'dark' ? 'hover:bg-indigo-500/20 text-indigo-400' : 'hover:bg-indigo-50 text-indigo-600'}`}
            data-tooltip={t.fullScreen}
            aria-label={t.fullScreen}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onShare(item); }} 
            className={`p-1.5 rounded-lg transition-all ${theme === 'dark' ? 'hover:bg-indigo-500/20 text-indigo-400' : 'hover:bg-indigo-50 text-indigo-600'}`}
            data-tooltip={t.share}
            aria-label={t.share}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onRemove(item.id); }} 
            className={`p-1.5 rounded-lg transition-all ${theme === 'dark' ? 'hover:bg-rose-500/20 text-rose-500' : 'hover:bg-rose-50 text-rose-600'}`}
            data-tooltip={t.remove}
            aria-label={t.remove}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
};