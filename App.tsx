import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Language, ImageItem } from './types';
import { translations } from './i18n';
import { processImageWithGemini, fileToBase64 } from './services/geminiService';
import { ImageCard } from './components/ImageCard';
import { AdPlaceholder } from './components/AdPlaceholder';

const INITIAL_SUGGESTIONS = ['Personal Photos', 'Family Heritage', 'Travel 2024', 'Work Projects', 'Client Deliverables'];

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>('en');
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

  const filteredImages = images.filter(img => 
    img.file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const processNextPending = useCallback(async () => {
    const nextItem = images.find(img => img.status === 'pending');
    if (!nextItem || isProcessing) return;

    setIsProcessing(true);
    setImages(prev => prev.map(img => 
      img.id === nextItem.id ? { ...img, status: 'processing' } : img
    ));

    try {
      const base64 = await fileToBase64(nextItem.file);
      const resultUrl = await processImageWithGemini(base64, nextItem.file.type);
      setImages(prev => prev.map(img => 
        img.id === nextItem.id ? { ...img, status: 'completed', resultUrl } : img
      ));
      
      // Persist label to autocomplete suggestions
      if (targetLabel.trim() && !usedLabels.includes(targetLabel.trim())) {
        setUsedLabels(prev => [targetLabel.trim(), ...prev].slice(0, 15));
      }
    } catch (err) {
      setImages(prev => prev.map(img => 
        img.id === nextItem.id ? { ...img, status: 'error', error: String(err) } : img
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

  const toggleFullScreen = useCallback(() => {
    if (!document.fullscreenElement) {
      modalRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
      setIsFullScreen(true);
    } else {
      document.exitFullscreen();
      setIsFullScreen(false);
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullScreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

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
        }, idx * 200);
      }
    });
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (selectedIndex === null) return;
    
    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      toggleFullScreen();
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      setZoomLevel(prev => Math.min(prev + 0.2, 5));
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      setZoomLevel(prev => Math.max(prev - 0.2, 1));
    } else if (e.key === '0') {
      e.preventDefault();
      resetView();
    } else if (e.key === 'Escape') {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        setSelectedIndex(null);
      }
    }
  }, [selectedIndex, toggleFullScreen, resetView]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className={`min-h-screen dark bg-slate-950 text-slate-100 font-sans lang-${lang} ${isRtl ? 'rtl' : 'ltr'}`} dir={isRtl ? 'rtl' : 'ltr'}>
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-xl border-b border-slate-800 shadow-2xl">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl drop-shadow-[0_0_10px_rgba(99,102,241,0.5)]">🎨</span>
            <h1 className="text-lg font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-indigo-200">{t.title}</h1>
          </div>
          
          <div className="flex items-center gap-3">
            <select 
              value={lang} 
              onChange={(e) => setLang(e.target.value as Language)}
              title={t.languageSelect}
              aria-label={t.languageSelect}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer text-slate-100 hover:border-indigo-500/50"
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
          <h2 className="text-3xl md:text-5xl font-extrabold mb-4 tracking-tight text-white">{t.subtitle}</h2>
          <div className="flex items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <p className="text-slate-400 max-w-xl text-sm md:text-base font-medium">{t.offlineReady}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <aside className="lg:col-span-1 space-y-6">
            <div className="bg-slate-900 p-6 rounded-[2.5rem] shadow-2xl border border-slate-800">
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-3 ml-1">{t.targetFolder}</label>
              <div className="relative">
                <input 
                  type="text" 
                  list="labels-list"
                  value={targetLabel} 
                  onChange={(e) => setTargetLabel(e.target.value)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { 
                    e.preventDefault(); 
                    const droppedText = e.dataTransfer.getData('text');
                    if (droppedText) setTargetLabel(droppedText);
                  }}
                  placeholder={t.targetFolderPlaceholder} 
                  className="w-full pl-4 pr-10 py-3.5 bg-slate-950 border border-slate-800 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm font-medium text-white placeholder:text-slate-700" 
                  title={t.targetFolder}
                />
                <datalist id="labels-list">
                  {usedLabels.map(s => <option key={s} value={s} />)}
                </datalist>
                {targetLabel && (
                  <button onClick={() => setTargetLabel('')} title={t.close} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-rose-500 transition-colors">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" /></svg>
                  </button>
                )}
              </div>
              <div className="mt-8 space-y-3">
                <button 
                  onClick={exportFiltered} 
                  disabled={filteredImages.length === 0} 
                  title={t.downloadAll}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-800 disabled:text-slate-500 disabled:opacity-50 text-white font-bold rounded-2xl shadow-xl shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 text-sm"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  {t.downloadAll}
                </button>
                <button 
                  onClick={() => setImages([])} 
                  title={t.clearBtn}
                  className="w-full py-3 text-slate-500 hover:text-rose-400 text-[10px] font-black uppercase tracking-[0.2em] transition-colors"
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
              className={`group border-2 border-dashed rounded-[3rem] p-14 text-center cursor-pointer transition-all duration-500 ${isDragging ? 'drag-pulsing' : 'border-slate-800 hover:border-indigo-500/50 bg-slate-900/50 hover:bg-slate-900'}`}
              aria-label={t.dropzoneTitle}
            >
              <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={(e) => handleFiles(e.target.files)} />
              <div className={`w-16 h-16 bg-indigo-500/10 rounded-[1.5rem] flex items-center justify-center mx-auto mb-6 transition-all group-hover:scale-110 group-hover:bg-indigo-500/20 ${isDragging ? 'scale-125 drag-content-pulsing bg-indigo-500/30' : ''}`}>
                <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              </div>
              <div className={isDragging ? 'drag-content-pulsing' : ''}>
                <h3 className={`text-2xl font-black mb-1 transition-all ${isDragging ? 'text-indigo-400' : 'text-white'}`}>{t.dropzoneTitle}</h3>
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">{t.dropzoneSub}</p>
              </div>
            </div>

            {images.length > 0 && (
              <div className="flex flex-col md:flex-row gap-4 items-center">
                <div className="relative flex-1 w-full">
                  <input 
                    type="text" 
                    value={searchQuery} 
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t.searchPlaceholder}
                    title={t.search}
                    className="w-full pl-11 pr-4 py-4 bg-slate-900 border border-slate-800 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm text-white placeholder:text-slate-700 shadow-inner" 
                  />
                  <svg className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
                {searchQuery && (
                  <button 
                    onClick={exportFiltered} 
                    title={t.exportSearch}
                    className="px-6 py-4 bg-indigo-500/10 text-indigo-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500/20 transition-all"
                  >
                    {t.exportSearch}
                  </button>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-6 min-h-[400px]">
              {filteredImages.length > 0 ? (
                filteredImages.map((img) => (
                  <ImageCard 
                    key={img.id} 
                    item={img} 
                    t={t} 
                    onRemove={(id) => setImages(prev => prev.filter(i => i.id !== id))} 
                    onSelect={() => { setSelectedIndex(images.indexOf(img)); setShowOriginalInModal(false); }} 
                    onShare={handleShare} 
                  />
                ))
              ) : searchQuery && (
                <div className="col-span-full flex flex-col items-center justify-center py-20 text-slate-800">
                  <span className="text-5xl mb-4 opacity-50">🔍</span>
                  <p className="text-xs font-black uppercase tracking-[0.2em]">{t.noResults}</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      {/* Enhanced Modal */}
      {selectedIndex !== null && images[selectedIndex] && (
        <div ref={modalRef} className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 backdrop-blur-3xl animate-in fade-in duration-500 overflow-hidden" onClick={() => setSelectedIndex(null)}>
          <div className="h-16 px-6 flex items-center justify-between bg-slate-900/50 border-b border-white/5 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-4">
              <span className="text-white text-xs font-black truncate max-w-[120px] sm:max-w-xs tracking-tight" title={images[selectedIndex].file.name}>
                {images[selectedIndex].file.name}
              </span>
              <button 
                onClick={(e) => { e.stopPropagation(); toggleFullScreen(); }} 
                className="p-2 hover:bg-white/10 rounded-xl text-white transition-all hover:scale-110 active:scale-95"
                title={t.fullScreen}
                aria-label={t.fullScreen}
              >
                {isFullScreen ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                )}
              </button>
            </div>
            
            <div className="flex items-center gap-3">
              {images[selectedIndex].resultUrl && (
                <button 
                  onClick={(e) => { e.stopPropagation(); setShowOriginalInModal(!showOriginalInModal); }} 
                  className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.1em] shadow-lg transition-all hover:scale-105 active:scale-95 ${showOriginalInModal ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'}`}
                  title={showOriginalInModal ? t.result : t.original}
                >
                  {showOriginalInModal ? t.result : t.original}
                </button>
              )}
              <button 
                onClick={(e) => { e.stopPropagation(); handleShare(images[selectedIndex!]); }} 
                title={t.share}
                aria-label={t.share}
                className="p-2.5 hover:bg-white/10 rounded-xl text-white transition-all hover:scale-110 active:scale-95"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); exportSingle(images[selectedIndex!]); }} 
                disabled={!images[selectedIndex].resultUrl}
                title={t.export}
                aria-label={t.export}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-20 disabled:cursor-not-allowed text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.1em] shadow-lg shadow-indigo-500/20 transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                {t.export}
              </button>
              <button 
                onClick={() => setSelectedIndex(null)} 
                title={t.close}
                aria-label={t.close}
                className="p-2.5 hover:bg-rose-500/20 rounded-full text-slate-400 hover:text-rose-400 transition-all"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>

          <div 
            className="flex-1 flex items-center justify-center p-12 overflow-hidden cursor-move" 
            onClick={e => e.stopPropagation()}
            onMouseMove={(e) => {
              if (e.buttons === 1 && zoomLevel > 1) {
                setPanOffset(prev => ({ x: prev.x + e.movementX, y: prev.y + e.movementY }));
              }
            }}
          >
            <div 
              className="relative transition-transform duration-100 ease-out"
              style={{ transform: `scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)` }}
            >
              <img 
                src={showOriginalInModal || !images[selectedIndex].resultUrl ? images[selectedIndex].previewUrl : images[selectedIndex].resultUrl} 
                alt="Modal Main View" 
                className="max-w-full max-h-[70vh] object-contain rounded-[2rem] shadow-[0_0_100px_rgba(0,0,0,0.8)] pointer-events-none transition-all duration-500 border border-white/5" 
              />
              {images[selectedIndex].status === 'processing' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-md rounded-[2rem]">
                   <div className="flex flex-col items-center gap-4">
                      <div className="w-16 h-16 border-[6px] border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 animate-pulse">{t.processing}</span>
                   </div>
                </div>
              )}
            </div>
          </div>

          <div className="h-32 bg-slate-950/80 backdrop-blur-xl flex flex-col items-center justify-center px-10 border-t border-white/5 shadow-2xl shadow-black/50" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-6 w-full max-w-xl">
              <button 
                onClick={() => { setZoomLevel(prev => Math.max(prev - 0.2, 1)); if (zoomLevel <= 1.2) resetView(); }} 
                title={t.zoomOut}
                aria-label={t.zoomOut}
                className="p-3 text-slate-500 hover:text-white transition-colors bg-slate-900 rounded-2xl border border-slate-800 shadow-lg"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" /></svg>
              </button>
              <div className="flex-1 relative flex items-center">
                <input 
                  type="range" 
                  min="1" 
                  max="5" 
                  step="0.05" 
                  value={zoomLevel} 
                  title={`${t.zoomLevel}: ${zoomLevel.toFixed(1)}x`}
                  aria-label={t.zoomLevel}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setZoomLevel(val);
                    if (val === 1) setPanOffset({ x: 0, y: 0 });
                  }}
                  className="w-full h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all border border-slate-800 shadow-inner"
                />
              </div>
              <button 
                onClick={() => setZoomLevel(prev => Math.min(prev + 0.2, 5))} 
                title={t.zoomIn}
                aria-label={t.zoomIn}
                className="p-3 text-slate-500 hover:text-white transition-colors bg-slate-900 rounded-2xl border border-slate-800 shadow-lg"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
              </button>
            </div>
            <div className="mt-4 flex gap-6 items-center">
              <span className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500 bg-slate-900 px-3 py-1 rounded-full border border-slate-800 shadow-md">
                {t.zoomLevel}: {zoomLevel.toFixed(1)}x
              </span>
              <button 
                onClick={resetView} 
                className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-400 hover:text-indigo-300 transition-colors py-1"
                title={t.resetView}
                aria-label={t.resetView}
              >
                {t.resetView}
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="py-16 border-t border-slate-900 text-center opacity-40 hover:opacity-100 transition-opacity duration-700">
        <p className="text-[10px] font-black uppercase tracking-[0.5em] mb-3 text-slate-400">Restoration Engine powered by Gemini 2.5</p>
        <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-4 text-indigo-400">(C) Noam Gold AI 2026</p>
        <div className="flex items-center justify-center gap-3">
          <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Feedback Loop:</span>
          <a href="mailto:goldnoamai@gmail.com" className="text-[10px] font-black text-slate-500 hover:text-indigo-400 transition-colors border-b border-transparent hover:border-indigo-400/30 pb-0.5">goldnoamai@gmail.com</a>
        </div>
      </footer>
    </div>
  );
};

export default App;