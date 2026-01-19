import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Language, ImageItem } from './types';
import { translations } from './i18n';
import { processImageWithGemini, fileToBase64 } from './services/geminiService';
import { ImageCard } from './components/ImageCard';
import { AdPlaceholder } from './components/AdPlaceholder';

const INITIAL_SUGGESTIONS = ['Personal Photos', 'Family Heritage', 'Travel 2024', 'Work Projects', 'Client Deliverables'];

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>('en');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('chroma-theme') as 'dark' | 'light') || 'dark';
  });
  const [images, setImages] = useState<ImageItem[]>([]);
  const [targetLabel, setTargetLabel] = useState('');
  const [usedLabels, setUsedLabels] = useState<string[]>(INITIAL_SUGGESTIONS);
  const [searchQuery, setSearchQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showOriginalInModal, setShowOriginalInModal] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const t = translations[lang];
  const isRtl = lang === 'he';

  useEffect(() => {
    localStorage.setItem('chroma-theme', theme);
    document.documentElement.className = theme;
  }, [theme]);

  const filteredImages = images.filter(img => 
    img.file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const processNextPending = useCallback(async () => {
    const nextItem = images.find(img => img.status === 'pending');
    if (!nextItem || isProcessing) return;

    setIsProcessing(true);
    setImages(prev => prev.map(img => 
      img.id === nextItem.id ? { ...img, status: 'processing', error: undefined } : img
    ));

    try {
      const base64 = await fileToBase64(nextItem.file);
      const resultUrl = await processImageWithGemini(base64, nextItem.file.type);
      setImages(prev => prev.map(img => 
        img.id === nextItem.id ? { ...img, status: 'completed', resultUrl, destination: targetLabel } : img
      ));
      
      if (targetLabel.trim() && !usedLabels.includes(targetLabel.trim())) {
        setUsedLabels(prev => [targetLabel.trim(), ...prev].slice(0, 15));
      }
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      setImages(prev => prev.map(img => 
        img.id === nextItem.id ? { ...img, status: 'error', error: errorMessage } : img
      ));
    } finally {
      setIsProcessing(false);
    }
  }, [images, isProcessing, targetLabel, usedLabels]);

  useEffect(() => {
    processNextPending();
  }, [images, processNextPending]);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const newImages: ImageItem[] = Array.from(files).map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'pending'
    }));
    setImages(prev => [...prev, ...newImages]);
  };

  const handleShare = (item: ImageItem) => {
    const url = item.resultUrl || item.previewUrl;
    navigator.clipboard.writeText(url).then(() => {
      alert(t.shareSuccess);
    });
  };

  const resetView = useCallback(() => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (selectedIndex === null) return;
    const delta = -e.deltaY;
    const factor = 0.001;
    setZoomLevel(prev => Math.min(Math.max(prev + delta * factor * prev, 1), 8));
  }, [selectedIndex]);

  const toggleFullScreen = useCallback(() => {
    if (!document.fullscreenElement) {
      modalRef.current?.requestFullscreen().catch(err => {
        console.error(`Fullscreen failed: ${err.message}`);
      });
      setIsFullScreen(true);
    } else {
      document.exitFullscreen();
      setIsFullScreen(false);
    }
  }, []);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  useEffect(() => {
    const onFsChange = () => setIsFullScreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handlePickFolder = async () => {
    if ('showDirectoryPicker' in window) {
      try {
        const handle = await (window as any).showDirectoryPicker();
        setTargetLabel(handle.name);
      } catch (e) {
        console.debug('Folder picker cancelled', e);
      }
    } else {
      alert('Manual folder typing is required on this browser.');
    }
  };

  const exportSingle = (img: ImageItem) => {
    if (!img.resultUrl) return;
    const prefix = targetLabel.trim() || 'colorized';
    const link = document.createElement('a');
    link.href = img.resultUrl;
    link.download = `${prefix}_${img.file.name}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportFiltered = () => {
    if (filteredImages.length === 0) return;
    const prefix = targetLabel || 'export';
    filteredImages.forEach((img, idx) => {
      if (img.resultUrl) {
        setTimeout(() => {
          const link = document.createElement('a');
          link.href = img.resultUrl!;
          link.download = `${prefix}_${img.file.name}`;
          link.click();
        }, idx * 150);
      }
    });
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (selectedIndex === null) return;
    if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFullScreen(); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoomLevel(prev => Math.min(prev + 0.2, 8)); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); setZoomLevel(prev => Math.max(prev - 0.2, 1)); }
    else if (e.key === '0') { e.preventDefault(); resetView(); }
    else if (e.key === 'Escape') {
      if (document.fullscreenElement) document.exitFullscreen();
      else setSelectedIndex(null);
    }
  }, [selectedIndex, toggleFullScreen, resetView]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className={`min-h-screen ${theme} theme-bg-app theme-text-main font-sans lang-${lang} ${isRtl ? 'rtl' : 'ltr'}`} dir={isRtl ? 'rtl' : 'ltr'}>
      <header className={`sticky top-0 z-40 backdrop-blur-xl border-b theme-border shadow-2xl ${theme === 'dark' ? 'bg-slate-900/90' : 'bg-white/90'}`}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl drop-shadow-[0_0_10px_rgba(99,102,241,0.5)]" title={t.title}>🎨</span>
            <h1 className="text-lg font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-indigo-300">{t.title}</h1>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={toggleTheme}
              className={`p-2 rounded-xl transition-all border theme-border ${theme === 'dark' ? 'bg-slate-800 text-yellow-400 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 9H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
              )}
            </button>
            <select 
              value={lang} 
              onChange={(e) => setLang(e.target.value as Language)}
              title={t.languageSelect}
              className={`border theme-border rounded-xl px-3 py-1.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer ${theme === 'dark' ? 'bg-slate-800 text-slate-100' : 'bg-slate-100 text-slate-900'}`}
            >
              <option value="en">English</option>
              <option value="he">עברית</option>
              <option value="zh">中文</option>
              <option value="hi">हिन्दी</option>
              <option value="de">Deutsch</option>
              <option value="es">Español</option>
              <option value="fr">Français</option>
            </select>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-5xl font-extrabold mb-4 tracking-tight theme-text-main">{t.subtitle}</h2>
          <div className="flex items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <p className="theme-text-muted max-w-xl text-sm font-medium">{t.offlineReady}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <aside className="lg:col-span-1 space-y-6">
            <div className={`p-6 rounded-[2.5rem] shadow-2xl border theme-border theme-bg-card`}>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] theme-text-muted mb-3 ml-1">{t.targetFolder}</label>
              <div className="relative group">
                <input 
                  type="text" 
                  list="labels-list"
                  value={targetLabel} 
                  onChange={(e) => setTargetLabel(e.target.value)}
                  placeholder={t.targetFolderPlaceholder} 
                  className={`w-full pl-4 pr-10 py-3.5 border theme-border rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm font-medium theme-text-main ${theme === 'dark' ? 'bg-slate-950 placeholder:text-slate-700' : 'bg-slate-50 placeholder:text-slate-400'}`} 
                  title={t.targetFolder}
                />
                <datalist id="labels-list">
                  {usedLabels.map(s => <option key={s} value={s} />)}
                </datalist>
                <button 
                  onClick={handlePickFolder}
                  title={t.pickFolder}
                  className="absolute right-3 top-1/2 -translate-y-1/2 theme-text-muted hover:text-indigo-400 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                </button>
              </div>
              <div className="mt-8 space-y-3">
                <button 
                  onClick={exportFiltered} 
                  disabled={filteredImages.length === 0} 
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-800 disabled:text-slate-500 disabled:opacity-50 text-white font-bold rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2 text-sm"
                  title={t.downloadAll}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  {t.downloadAll}
                </button>
                <button 
                  onClick={() => setImages([])} 
                  className="w-full py-3 theme-text-muted hover:text-rose-400 text-[10px] font-black uppercase tracking-[0.2em] transition-colors"
                  title={t.clearBtn}
                >
                  {t.clearBtn}
                </button>
              </div>
            </div>
            <AdPlaceholder label={t.adPlaceholder} />
          </aside>

          <section className="lg:col-span-3 space-y-6">
            <div 
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
              className={`group border-2 border-dashed rounded-[3rem] p-14 text-center cursor-pointer transition-all duration-500 ${isDragging ? 'drag-pulsing' : `theme-border hover:border-indigo-500/50 ${theme === 'dark' ? 'bg-slate-900/50 hover:bg-slate-900' : 'bg-white hover:bg-slate-50 shadow-lg'}`}`}
              title={t.dropzoneTitle}
            >
              <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={(e) => handleFiles(e.target.files)} />
              <div className={`w-16 h-16 bg-indigo-500/10 rounded-[1.5rem] flex items-center justify-center mx-auto mb-6 transition-all group-hover:scale-110 ${isDragging ? 'scale-125 drag-content-pulsing' : ''}`}>
                <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              </div>
              <h3 className="text-2xl font-black mb-1 theme-text-main">{t.dropzoneTitle}</h3>
              <p className="theme-text-muted text-[10px] font-black uppercase tracking-[0.2em]">{t.dropzoneSub}</p>
            </div>

            {images.length > 0 && (
              <div className="relative">
                <input 
                  type="text" 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t.searchPlaceholder}
                  className={`w-full pl-11 pr-4 py-4 border theme-border rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm theme-text-main theme-bg-card`} 
                  title={t.search}
                />
                <svg className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 theme-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredImages.map((img) => (
                <ImageCard 
                  key={img.id} 
                  item={img} 
                  t={t} 
                  theme={theme}
                  onRemove={(id) => setImages(prev => prev.filter(i => i.id !== id))} 
                  onSelect={(item) => { setSelectedIndex(images.indexOf(item)); setShowOriginalInModal(false); resetView(); }} 
                  onShare={handleShare} 
                />
              ))}
            </div>
          </section>
        </div>
      </main>

      {selectedIndex !== null && images[selectedIndex] && (
        <div 
          ref={modalRef} 
          className={`fixed inset-0 z-50 flex flex-col backdrop-blur-3xl animate-in fade-in duration-300 overflow-hidden ${theme === 'dark' ? 'bg-slate-950/98' : 'bg-slate-50/95'}`} 
          onClick={() => setSelectedIndex(null)}
          onWheel={handleWheel}
        >
          {/* Header Bar - Distinct & Sticky */}
          <div className={`absolute top-0 left-0 right-0 z-50 h-16 px-6 flex items-center justify-between border-b theme-border transition-all ${isFullScreen ? 'opacity-40 hover:opacity-100 bg-slate-900/30' : 'backdrop-blur-xl theme-bg-card'}`} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 truncate">
               <span className={`text-[10px] font-black uppercase tracking-wider truncate px-3 py-1.5 rounded-lg border theme-border ${theme === 'dark' ? 'bg-slate-950 text-white' : 'bg-white text-slate-900'}`}>{images[selectedIndex].file.name}</span>
               {isFullScreen && <span className="text-[10px] font-bold text-indigo-400 animate-pulse tracking-widest bg-indigo-500/10 px-2 py-1 rounded">LIVE FULLSCREEN</span>}
            </div>
            <div className="flex items-center gap-3">
              {images[selectedIndex].resultUrl && (
                <button 
                  onClick={(e) => { e.stopPropagation(); setShowOriginalInModal(!showOriginalInModal); }} 
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] transition-all border ${showOriginalInModal ? 'bg-indigo-600 text-white border-indigo-400' : 'theme-bg-app theme-text-main theme-border hover:bg-indigo-500/10'}`}
                  title={showOriginalInModal ? t.result : t.original}
                >
                  {showOriginalInModal ? t.result : t.original}
                </button>
              )}
              <button 
                onClick={(e) => { e.stopPropagation(); exportSingle(images[selectedIndex!]); }} 
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.1em] disabled:opacity-50 transition-colors border border-indigo-400 shadow-lg"
                disabled={!images[selectedIndex].resultUrl}
                title={t.export}
              >
                {t.export}
              </button>
              <div className="w-px h-6 theme-border mx-1"></div>
              <button 
                onClick={() => setSelectedIndex(null)} 
                className="p-2 theme-text-main hover:text-rose-400 transition-colors"
                title={t.close}
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>

          {/* Main Viewport */}
          <div className="flex-1 flex items-center justify-center p-4 md:p-12 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="relative transition-transform duration-100 ease-out" style={{ transform: `scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)` }}>
              <img 
                src={showOriginalInModal || !images[selectedIndex].resultUrl ? images[selectedIndex].previewUrl : images[selectedIndex].resultUrl} 
                alt="Restored Preview" 
                className={`max-w-full max-h-[85vh] object-contain rounded-2xl md:rounded-[2rem] border theme-border ${theme === 'dark' ? 'shadow-[0_50px_100px_-20px_rgba(0,0,0,0.8)]' : 'shadow-2xl'}`} 
              />
              {images[selectedIndex].status === 'error' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-rose-950/60 backdrop-blur-md rounded-2xl md:rounded-[2rem] p-8 text-center border-2 border-rose-500/20">
                   <div className="w-20 h-20 bg-rose-500/30 rounded-full flex items-center justify-center mb-6 border border-rose-500/50 shadow-2xl animate-bounce">
                      <svg className="w-10 h-10 text-rose-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                   </div>
                   <h4 className="text-2xl font-black text-rose-300 mb-3 uppercase tracking-widest drop-shadow-lg">{t.error}</h4>
                   <p className="text-slate-100 text-sm max-w-lg bg-black/60 p-6 rounded-2xl border border-white/10 shadow-3xl font-mono leading-relaxed backdrop-blur-lg">
                     {images[selectedIndex].error || "A processing error occurred. Please check your internet or try a different image format."}
                   </p>
                </div>
              )}
            </div>
          </div>

          {/* Controls Island */}
          <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-5 transition-all duration-500 ${isFullScreen ? 'bottom-12 scale-110' : ''}`} onClick={e => e.stopPropagation()}>
            <div className={`flex items-center gap-6 px-8 py-5 rounded-[2.5rem] border shadow-3xl transition-all duration-500 ${theme === 'dark' ? 'bg-slate-900/80 border-white/10 backdrop-blur-xl' : 'bg-white/90 border-slate-200 backdrop-blur-xl'}`}>
              <button 
                onClick={() => setZoomLevel(prev => Math.max(prev - 0.25, 1))} 
                className={`p-4 rounded-2xl border transition-all shadow-lg active:scale-90 ${theme === 'dark' ? 'bg-slate-800 text-slate-300 hover:bg-indigo-600 hover:text-white border-white/5' : 'bg-slate-100 text-slate-700 hover:bg-indigo-500 hover:text-white border-slate-200'}`}
                title={t.zoomOut}
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M20 12H4" /></svg>
              </button>
              
              <div className="flex flex-col items-center gap-2 min-w-[140px]">
                 <input 
                   type="range" 
                   min="1" 
                   max="8" 
                   step="0.01" 
                   value={zoomLevel} 
                   onChange={(e) => setZoomLevel(parseFloat(e.target.value))} 
                   className="w-full accent-indigo-400 h-2 rounded-full cursor-pointer hover:accent-indigo-300 transition-all shadow-inner" 
                   title={t.zoomLevel}
                 />
                 <span className={`text-[10px] font-black uppercase tracking-widest ${theme === 'dark' ? 'text-indigo-200' : 'text-indigo-600'}`}>{t.zoomLevel}: {Math.round(zoomLevel * 100)}%</span>
              </div>

              <button 
                onClick={() => setZoomLevel(prev => Math.min(prev + 0.25, 8))} 
                className={`p-4 rounded-2xl border transition-all shadow-lg active:scale-90 ${theme === 'dark' ? 'bg-slate-800 text-slate-300 hover:bg-indigo-600 hover:text-white border-white/5' : 'bg-slate-100 text-slate-700 hover:bg-indigo-500 hover:text-white border-slate-200'}`}
                title={t.zoomIn}
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
              </button>

              <div className="w-px h-10 theme-border hidden sm:block"></div>

              <button 
                onClick={toggleFullScreen}
                className={`p-4 rounded-2xl border transition-all hidden sm:block shadow-lg active:scale-95 ${theme === 'dark' ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 border-white/10' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200'} ${isFullScreen ? 'ring-2 ring-indigo-500' : ''}`}
                title={t.fullScreen}
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </button>
            </div>
            
            <button 
              onClick={resetView} 
              className={`px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-2xl border ${theme === 'dark' ? 'bg-slate-950/80 text-indigo-400 border-white/5 hover:text-indigo-200' : 'bg-white text-indigo-600 border-slate-200 hover:bg-slate-50'}`}
              title={t.resetView}
            >
              {t.resetView}
            </button>
          </div>
        </div>
      )}

      <footer className="py-16 text-center opacity-40">
        <p className="text-[10px] font-black uppercase tracking-[0.5em] mb-3">Powered by Gemini 2.5 Restoration Engine</p>
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400">© 2026 ChromaRestore Pro Systems</p>
      </footer>
    </div>
  );
};

export default App;