import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Language, ImageItem, RestoreParams } from './types';
import { translations } from './i18n';
import { processImageLocally, fileToBase64 } from './services/geminiService';
import { ImageCard } from './components/ImageCard';
import { AdPlaceholder } from './components/AdPlaceholder';

const INITIAL_SUGGESTIONS = ['Personal Photos', 'Family Heritage', 'Travel 2024', 'Work Projects', 'Client Deliverables'];

interface ViewState {
  zoom: number;
  pan: { x: number; y: number };
}

const DEFAULT_PARAMS: RestoreParams = {
  temp: 15,
  saturation: 1.25,
  contrast: 1.15,
  intensity: 1.0
};

const LUCKY_PROFILES: RestoreParams[] = [
  { temp: 35, saturation: 1.45, contrast: 1.25, intensity: 1.0 }, // Cinematic Warm
  { temp: -15, saturation: 1.3, contrast: 1.1, intensity: 0.9 }, // Cool Modern
  { temp: 10, saturation: 1.8, contrast: 1.4, intensity: 1.0 },  // High Vibrant
  { temp: 20, saturation: 1.1, contrast: 1.0, intensity: 0.7 },  // Natural Muted
];

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
  const [viewStates, setViewStates] = useState<Record<string, ViewState>>({});
  
  // Tuning parameters for current selected image
  const [tuningParams, setTuningParams] = useState<RestoreParams>(DEFAULT_PARAMS);
  const [isReprocessing, setIsReprocessing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const isDraggingImage = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const processTimerRef = useRef<number | null>(null);
  
  const t = translations[lang];
  const isRtl = lang === 'he';

  useEffect(() => {
    localStorage.setItem('chroma-theme', theme);
    document.documentElement.className = theme;
  }, [theme]);

  const filteredImages = images.filter(img => 
    img.file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const completedImagesCount = images.filter(img => img.status === 'completed').length;

  useEffect(() => {
    if (selectedIndex !== null && images[selectedIndex]) {
      const id = images[selectedIndex].id;
      setViewStates(prev => ({
        ...prev,
        [id]: { zoom: zoomLevel, pan: panOffset }
      }));
    }
  }, [zoomLevel, panOffset, selectedIndex, images]);

  const processSingle = useCallback(async (item: ImageItem, params: RestoreParams = DEFAULT_PARAMS) => {
    try {
      const base64 = await fileToBase64(item.file);
      const resultUrl = await processImageLocally(base64, item.file.type, params);
      
      setImages(prev => prev.map(img => 
        img.id === item.id ? { ...img, status: 'completed', resultUrl, destination: targetLabel } : img
      ));
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      setImages(prev => prev.map(img => 
        img.id === item.id ? { ...img, status: 'error', error: errorMessage } : img
      ));
    }
  }, [targetLabel]);

  // Reactive processing loop for real-time slider updates
  useEffect(() => {
    if (selectedIndex === null || !images[selectedIndex]) return;
    
    // Cleanup previous timer to debounce rapid slider movements
    if (processTimerRef.current) window.clearTimeout(processTimerRef.current);
    
    setIsReprocessing(true);
    
    processTimerRef.current = window.setTimeout(async () => {
      const item = images[selectedIndex!];
      await processSingle(item, tuningParams);
      setIsReprocessing(false);
    }, 60); // Balanced debounce

    return () => {
      if (processTimerRef.current) window.clearTimeout(processTimerRef.current);
    };
  }, [tuningParams, selectedIndex, processSingle]);

  const processNextPending = useCallback(async () => {
    const nextItem = images.find(img => img.status === 'pending');
    if (!nextItem || isProcessing) return;

    setIsProcessing(true);
    setImages(prev => prev.map(img => 
      img.id === nextItem.id ? { ...img, status: 'processing', error: undefined } : img
    ));

    await processSingle(nextItem, DEFAULT_PARAMS);
    
    if (targetLabel.trim() && !usedLabels.includes(targetLabel.trim())) {
      setUsedLabels(prev => [targetLabel.trim(), ...prev].slice(0, 15));
    }
    
    setIsProcessing(false);
  }, [images, isProcessing, targetLabel, usedLabels, processSingle]);

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

  const handleFeelingLucky = () => {
    const randomProfile = LUCKY_PROFILES[Math.floor(Math.random() * LUCKY_PROFILES.length)];
    setTuningParams(randomProfile);
  };

  const handleResetTuning = () => setTuningParams(DEFAULT_PARAMS);
  const handleShowOriginal = () => setTuningParams({ ...DEFAULT_PARAMS, intensity: 0 });

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
    const factor = 0.0005; 
    setZoomLevel(prev => Math.min(Math.max(prev + delta * factor * prev, 1), 8));
  }, [selectedIndex]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (selectedIndex === null) return;
    isDraggingImage.current = true;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingImage.current) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseUp = useCallback(() => {
    isDraggingImage.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const toggleFullScreen = useCallback(() => {
    if (!document.fullscreenElement) {
      modalRef.current?.requestFullscreen().catch(err => {
        console.error(`Fullscreen failed: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
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

  const exportCompleted = () => {
    const completed = images.filter(img => img.status === 'completed');
    if (completed.length === 0) return;
    const prefix = targetLabel || 'export';
    completed.forEach((img, idx) => {
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

  const onSelectImage = (item: ImageItem) => {
    const index = images.indexOf(item);
    setSelectedIndex(index);
    setShowOriginalInModal(false);
    const savedState = viewStates[item.id];
    if (savedState) {
      setZoomLevel(savedState.zoom);
      setPanOffset(savedState.pan);
    } else {
      resetView();
    }
    setTuningParams(DEFAULT_PARAMS);
  };

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
              className={`group relative overflow-hidden border-2 border-dashed rounded-[3rem] p-14 text-center cursor-pointer transition-all duration-500 ${isDragging ? 'drag-pulsing shimmer-effect' : `theme-border hover:border-indigo-500/50 ${theme === 'dark' ? 'bg-slate-900/50 hover:bg-slate-900' : 'bg-white hover:bg-slate-50 shadow-lg'}`}`}
              title={t.dropzoneTitle}
            >
              <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={(e) => handleFiles(e.target.files)} />
              <div className={`w-16 h-16 bg-indigo-500/10 rounded-[1.5rem] flex items-center justify-center mx-auto mb-6 transition-all group-hover:scale-110 ${isDragging ? 'scale-125 drag-content-pulsing' : ''}`}>
                <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              </div>
              <h3 className={`text-2xl font-black mb-1 theme-text-main transition-all ${isDragging ? 'drag-content-pulsing' : ''}`}>{t.dropzoneTitle}</h3>
              <p className={`theme-text-muted text-[10px] font-black uppercase tracking-[0.2em] transition-all ${isDragging ? 'drag-content-pulsing' : ''}`}>{t.dropzoneSub}</p>
            </div>

            {images.length > 0 && (
              <div className="space-y-4">
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

                <div className={`flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl border theme-border theme-bg-card shadow-sm`}>
                  <div className="flex items-center gap-6">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black uppercase tracking-widest theme-text-muted mb-0.5">{t.search}</span>
                      <span className="text-xs font-bold theme-text-main">{t.totalImages.replace('{count}', filteredImages.length.toString())}</span>
                    </div>
                    <div className="w-px h-8 theme-border"></div>
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500/70 mb-0.5">{t.completed}</span>
                      <span className="text-xs font-bold theme-text-main">{t.completedCount.replace('{count}', completedImagesCount.toString())}</span>
                    </div>
                  </div>
                  
                  <button 
                    onClick={exportCompleted}
                    disabled={completedImagesCount === 0}
                    className="group px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-800 disabled:text-slate-600 disabled:opacity-50 text-white text-[11px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center gap-3 shadow-lg hover:shadow-indigo-500/25 active:scale-95"
                  >
                    <svg className="w-4 h-4 transition-transform group-hover:translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    {t.exportCompleted}
                  </button>
                </div>
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
                  onSelect={onSelectImage} 
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
          className={`fixed inset-0 z-50 flex flex-col md:flex-row backdrop-blur-3xl animate-in fade-in duration-300 overflow-hidden ${theme === 'dark' ? 'bg-slate-950/98' : 'bg-slate-50/95'}`} 
          onClick={() => setSelectedIndex(null)}
        >
          <div className="flex-1 relative flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
             <div className={`h-16 px-6 flex items-center justify-between border-b theme-border transition-all ${isFullScreen ? 'opacity-40 hover:opacity-100 bg-slate-900/30' : 'backdrop-blur-xl theme-bg-card'}`}>
                <div className="flex items-center gap-3 truncate">
                  <span className={`text-[10px] font-black uppercase tracking-wider truncate px-3 py-1.5 rounded-lg border theme-border ${theme === 'dark' ? 'bg-slate-950 text-white' : 'bg-white text-slate-900'}`}>{images[selectedIndex].file.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onMouseDown={() => setShowOriginalInModal(true)}
                    onMouseUp={() => setShowOriginalInModal(false)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] transition-all border ${showOriginalInModal ? 'bg-indigo-600 text-white border-indigo-400' : 'theme-bg-app theme-text-main theme-border hover:bg-indigo-500/10'}`}
                    title={t.beforeAfter}
                  >
                    {t.beforeAfter}
                  </button>
                  <button 
                    onClick={() => setSelectedIndex(null)} 
                    className="p-2 theme-text-main hover:text-rose-400 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
             </div>

             <div className="flex-1 flex items-center justify-center p-4 md:p-8" onWheel={handleWheel}>
                <div 
                  className="relative transition-transform duration-100 ease-out" 
                  style={{ transform: `scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)` }}
                  onMouseDown={handleMouseDown}
                >
                  <img 
                    src={showOriginalInModal || !images[selectedIndex].resultUrl ? images[selectedIndex].previewUrl : images[selectedIndex].resultUrl} 
                    alt="Restored Preview" 
                    className={`max-w-full max-h-[75vh] object-contain rounded-2xl md:rounded-[2rem] border theme-border select-none shadow-2xl transition-opacity duration-300 ${isReprocessing ? 'opacity-70' : 'opacity-100'}`} 
                  />
                  {isReprocessing && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                    </div>
                  )}
                  {/* Local Analysis Scanline Effect */}
                  {isReprocessing && <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500/30 animate-[shimmer_2s_infinite] shadow-[0_0_15px_rgba(99,102,241,0.5)]"></div>}
                </div>
             </div>

             <div className="h-24 px-8 flex items-center justify-center gap-8">
                <div className={`flex items-center gap-4 px-6 py-3 rounded-full border shadow-xl ${theme === 'dark' ? 'bg-slate-900/80 border-white/10' : 'bg-white/90 border-slate-200'}`}>
                  <button onClick={() => setZoomLevel(prev => Math.max(prev - 0.25, 1))} className="p-2 theme-text-muted hover:text-indigo-400"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg></button>
                  <span className="text-[10px] font-black w-12 text-center">{Math.round(zoomLevel * 100)}%</span>
                  <button onClick={() => setZoomLevel(prev => Math.min(prev + 0.25, 8))} className="p-2 theme-text-muted hover:text-indigo-400"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg></button>
                </div>
             </div>
          </div>

          <div 
            className={`w-full md:w-80 h-auto md:h-full border-t md:border-t-0 md:border-l theme-border p-6 flex flex-col gap-8 overflow-y-auto ${theme === 'dark' ? 'bg-slate-900/50 backdrop-blur-3xl' : 'bg-white/80 backdrop-blur-3xl'}`}
            onClick={e => e.stopPropagation()}
          >
             <div>
                <h4 className="text-[10px] font-black uppercase tracking-[0.3em] theme-text-muted mb-8">{t.tuning}</h4>
                <div className="space-y-8">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] font-bold theme-text-main">{t.temperature}</label>
                      <span className="text-[10px] font-mono text-indigo-400">{tuningParams.temp}</span>
                    </div>
                    <input 
                      type="range" min="-100" max="100" step="1" 
                      value={tuningParams.temp} 
                      onChange={e => setTuningParams(p => ({...p, temp: parseInt(e.target.value)}))}
                      className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer"
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] font-bold theme-text-main">{t.saturation}</label>
                      <span className="text-[10px] font-mono text-indigo-400">{tuningParams.saturation.toFixed(2)}x</span>
                    </div>
                    <input 
                      type="range" min="0" max="3" step="0.05" 
                      value={tuningParams.saturation} 
                      onChange={e => setTuningParams(p => ({...p, saturation: parseFloat(e.target.value)}))}
                      className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer"
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] font-bold theme-text-main">{t.contrast}</label>
                      <span className="text-[10px] font-mono text-indigo-400">{tuningParams.contrast.toFixed(2)}x</span>
                    </div>
                    <input 
                      type="range" min="0.5" max="2" step="0.05" 
                      value={tuningParams.contrast} 
                      onChange={e => setTuningParams(p => ({...p, contrast: parseFloat(e.target.value)}))}
                      className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer"
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] font-bold theme-text-main">{t.intensity} (Depth)</label>
                      <span className="text-[10px] font-mono text-indigo-400">{Math.round(tuningParams.intensity * 100)}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="1" step="0.01" 
                      value={tuningParams.intensity} 
                      onChange={e => setTuningParams(p => ({...p, intensity: parseFloat(e.target.value)}))}
                      className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer"
                    />
                  </div>
                </div>
             </div>

             <div className="mt-auto space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={handleResetTuning}
                    className="flex flex-col items-center justify-center gap-2 p-3 rounded-2xl border theme-border theme-text-muted hover:theme-text-main hover:bg-slate-800/40 transition-all text-[9px] font-black uppercase tracking-widest"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    {t.resetTuning.split(' ')[0]}
                  </button>
                  <button 
                    onClick={handleShowOriginal}
                    className="flex flex-col items-center justify-center gap-2 p-3 rounded-2xl border theme-border theme-text-muted hover:theme-text-main hover:bg-slate-800/40 transition-all text-[9px] font-black uppercase tracking-widest"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2-2v12a2 2 0 002 2z" /></svg>
                    {t.original}
                  </button>
                </div>
                
                <button 
                  onClick={handleFeelingLucky}
                  className="w-full py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-indigo-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 border border-indigo-400/30"
                >
                  <span className="text-sm">✨</span>
                  {t.feelingLucky}
                </button>

                <button 
                  onClick={() => exportSingle(images[selectedIndex])}
                  className="w-full py-4 theme-bg-app border theme-border theme-text-main hover:bg-slate-800/50 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all"
                >
                  {t.export}
                </button>
             </div>
          </div>
        </div>
      )}

      <footer className="py-16 text-center opacity-40">
        <p className="text-[10px] font-black uppercase tracking-[0.5em] mb-3">Powered by ChromaRestore Semantic Engine v4.0</p>
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400">© 2026 Privacy-First Restoration Systems</p>
      </footer>
    </div>
  );
};

export default App;