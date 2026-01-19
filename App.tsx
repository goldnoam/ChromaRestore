import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Language, ImageItem, RestoreParams, GradingPreset, EngineType, Translation } from './types';
import { translations } from './i18n';
import { processImageLocally, fileToBase64 } from './services/restorationService';
import { ImageCard } from './components/ImageCard';
import { AdPlaceholder } from './components/AdPlaceholder';

const DEFAULT_PARAMS: RestoreParams = {
  temp: 15,
  saturation: 1.25,
  contrast: 1.15,
  intensity: 1.0,
  grading: 'none',
  engine: 'local'
};

const LUCKY_PROFILES: RestoreParams[] = [
  { temp: 35, saturation: 1.45, contrast: 1.25, intensity: 1.0, grading: 'cinematic', engine: 'opencv' },
  { temp: -15, saturation: 1.3, contrast: 1.1, intensity: 0.9, grading: 'vintage', engine: 'local' },
  { temp: 10, saturation: 1.8, contrast: 1.4, intensity: 1.0, grading: 'vibrant', engine: 'paddlehub' },
  { temp: 20, saturation: 1.1, contrast: 1.0, intensity: 0.7, grading: 'sepia', engine: 'local' },
  { temp: 5, saturation: 1.5, contrast: 1.3, intensity: 1.0, grading: 'artistic', engine: 'opencv' },
  { temp: 0, saturation: 1.0, contrast: 1.0, intensity: 1.0, grading: 'stable', engine: 'paddlehub' },
];

const PRESET_ICONS: Record<GradingPreset, string> = {
  none: '⚪',
  cinematic: '🎬',
  vintage: '📷',
  vibrant: '🌈',
  sepia: '🎞️',
  artistic: '🎨',
  stable: '⚖️'
};

const ENGINE_ICONS: Record<EngineType, string> = {
  local: '⚡',
  opencv: '🤖',
  paddlehub: '🧬'
};

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>('en');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('chroma-theme') as 'dark' | 'light') || 'dark';
  });
  const [images, setImages] = useState<ImageItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [showOriginalInModal, setShowOriginalInModal] = useState(false);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [lastSaved, setLastSaved] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [targetPrefix, setTargetPrefix] = useState('');
  
  const [tuningParams, setTuningParams] = useState<RestoreParams>(DEFAULT_PARAMS);
  const [isReprocessing, setIsReprocessing] = useState(false);

  // Camera States
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalViewportRef = useRef<HTMLDivElement>(null);
  const modalContainerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDraggingImage = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const processTimerRef = useRef<number | null>(null);
  
  const t = translations[lang];
  const isRtl = lang === 'he';

  // Fullscreen management
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      modalContainerRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  }, []);

  // Keyboard shortcut for fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedIndex !== null && e.key.toLowerCase() === 'f') {
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, toggleFullscreen]);

  // SEO & Meta Initialization
  useEffect(() => {
    document.title = t.title + " | " + t.subtitle;
    const meta = document.querySelector('meta[name="description"]') || document.createElement('meta');
    meta.setAttribute('name', 'description');
    meta.setAttribute('content', `${t.subtitle} - Professional restoration engine.`);
    if (!document.head.contains(meta)) document.head.appendChild(meta);
  }, [t]);

  useEffect(() => {
    localStorage.setItem('chroma-theme', theme);
    document.documentElement.className = theme;
  }, [theme]);

  // Camera Logic
  const openCamera = async () => {
    setIsCameraOpen(true);
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      setCameraError(t.cameraPermissionDenied);
      setIsCameraOpen(false);
    }
  };

  const closeCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
    setIsCameraOpen(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `captured_${Date.now()}.jpg`, { type: 'image/jpeg' });
          const newItem: ImageItem = {
            id: Math.random().toString(36).substr(2, 9),
            file,
            previewUrl: URL.createObjectURL(file),
            status: 'pending'
          };
          setImages(prev => [newItem, ...prev]);
          closeCamera();
        }
      }, 'image/jpeg');
    }
  };

  useEffect(() => {
    const el = modalViewportRef.current;
    if (!el || selectedIndex === null) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const scaleFactor = 1.1;
      const direction = e.deltaY < 0 ? 1 : -1;
      setZoomLevel(prev => {
        const next = direction > 0 ? prev * scaleFactor : prev / scaleFactor;
        return Math.min(Math.max(next, 0.5), 10);
      });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [selectedIndex]);

  const exportSingle = useCallback((item: ImageItem) => {
    if (!item.resultUrl) return;
    const prefix = targetPrefix.trim() || 'colorized';
    const link = document.createElement('a');
    link.href = item.resultUrl;
    link.download = `${prefix}_${item.file.name}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [targetPrefix]);

  const processSingle = useCallback(async (item: ImageItem, params: RestoreParams = DEFAULT_PARAMS) => {
    try {
      const base64 = await fileToBase64(item.file);
      const resultUrl = await processImageLocally(base64, item.file.type, params);
      
      setImages(prev => prev.map(img => 
        img.id === item.id ? { ...img, status: 'completed', resultUrl, error: undefined } : img
      ));
    } catch (err: any) {
      setImages(prev => prev.map(img => 
        img.id === item.id ? { ...img, status: 'error', error: err.message || "Unknown error" } : img
      ));
    }
  }, []);

  const getStorageKey = (item: ImageItem) => `tuning_${item.file.name}_${item.file.size}`;

  useEffect(() => {
    if (selectedIndex === null || !images[selectedIndex]) return;
    const item = images[selectedIndex];
    if (processTimerRef.current) window.clearTimeout(processTimerRef.current);
    
    setIsReprocessing(true);
    processTimerRef.current = window.setTimeout(async () => {
      await processSingle(item, tuningParams);
      setIsReprocessing(false);
      localStorage.setItem(getStorageKey(item), JSON.stringify(tuningParams));
      setLastSaved(true);
      setTimeout(() => setLastSaved(false), 1500);
    }, 100);

    return () => { if (processTimerRef.current) window.clearTimeout(processTimerRef.current); };
  }, [tuningParams, selectedIndex, processSingle]);

  const processNextPending = useCallback(async () => {
    const nextItem = images.find(img => img.status === 'pending');
    if (!nextItem || isProcessing) return;

    setIsProcessing(true);
    setImages(prev => prev.map(img => 
      img.id === nextItem.id ? { ...img, status: 'processing', error: undefined } : img
    ));

    const saved = localStorage.getItem(getStorageKey(nextItem));
    const params = saved ? JSON.parse(saved) : DEFAULT_PARAMS;
    await processSingle(nextItem, params);
    setIsProcessing(false);
  }, [images, isProcessing, processSingle]);

  useEffect(() => { processNextPending(); }, [images, processNextPending]);

  const exportCompleted = useCallback(() => {
    images.forEach(img => {
      if (img.status === 'completed') exportSingle(img);
    });
  }, [images, exportSingle]);

  const handleShare = useCallback((item: ImageItem) => {
    const shareData = {
      title: t.shareTitle,
      text: `${t.subtitle} - ${item.file.name}`,
      url: window.location.href,
    };
    if (navigator.share) {
      navigator.share(shareData).catch(() => {
        navigator.clipboard.writeText(window.location.href);
        alert(t.shareSuccess);
      });
    } else {
      navigator.clipboard.writeText(window.location.href).then(() => {
        alert(t.shareSuccess);
      });
    }
  }, [t.shareTitle, t.subtitle, t.shareSuccess]);

  const handleResetTuning = useCallback(() => {
    setTuningParams(DEFAULT_PARAMS);
  }, []);

  const handleShowOriginal = useCallback(() => {
    setShowOriginalInModal(prev => !prev);
  }, []);

  const handleFeelingLucky = useCallback(() => {
    const randomProfile = LUCKY_PROFILES[Math.floor(Math.random() * LUCKY_PROFILES.length)];
    setTuningParams(randomProfile);
  }, []);

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

  const handleMouseUp = useCallback(() => { isDraggingImage.current = false; }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const onSelectImage = (item: ImageItem, immediateFs: boolean = false) => {
    const index = images.indexOf(item);
    setSelectedIndex(index);
    setShowOriginalInModal(false);
    setIsControlsVisible(window.innerWidth > 768); 
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
    const saved = localStorage.getItem(getStorageKey(item));
    setTuningParams(saved ? JSON.parse(saved) : DEFAULT_PARAMS);
    
    if (immediateFs) {
      setTimeout(toggleFullscreen, 100);
    }
  };

  return (
    <div className={`min-h-screen ${theme} theme-bg-app theme-text-main font-sans lang-${lang} ${isRtl ? 'rtl' : 'ltr'}`} dir={isRtl ? 'rtl' : 'ltr'}>
      <header className={`sticky top-0 z-40 backdrop-blur-xl border-b theme-border shadow-2xl ${theme === 'dark' ? 'bg-slate-900/90' : 'bg-white/90'}`}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎨</span>
            <h1 className="text-lg font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-indigo-300">{t.title}</h1>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')} 
              className={`p-2.5 rounded-xl transition-all border shadow-lg theme-border ${theme === 'dark' ? 'bg-slate-800 text-yellow-400 border-slate-700' : 'bg-white text-slate-700'}`} 
              data-tooltip={t.themeToggle}
            >
              {theme === 'dark' ? '🌙' : '☀️'}
            </button>
            <select 
              value={lang} 
              onChange={(e) => setLang(e.target.value as Language)} 
              className={`border theme-border rounded-xl px-3 py-1.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer shadow-sm ${theme === 'dark' ? 'bg-slate-800 text-slate-100' : 'bg-white text-slate-900'}`}
              data-tooltip={t.languageSelect}
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
              <div className="mt-4 space-y-3">
                <div className="space-y-1.5 mb-4">
                  <label className="text-[10px] font-black uppercase tracking-widest theme-text-muted px-1">{t.targetFolder}</label>
                  <input 
                    type="text" 
                    value={targetPrefix}
                    onChange={(e) => setTargetPrefix(e.target.value)}
                    placeholder={t.targetFolderPlaceholder}
                    className="w-full px-4 py-3 rounded-xl border theme-border theme-bg-app theme-text-main text-xs outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                </div>
                <button 
                  onClick={() => images.some(i => i.status === 'completed') && exportCompleted()} 
                  disabled={!images.some(i => i.status === 'completed')} 
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2 text-sm"
                  data-tooltip={t.downloadAll}
                >
                  📥 {t.downloadAll}
                </button>
                <button 
                  onClick={openCamera}
                  className="w-full py-4 bg-slate-100 dark:bg-slate-800 hover:bg-indigo-500 hover:text-white transition-all text-slate-700 dark:text-slate-200 font-bold rounded-2xl shadow-xl flex items-center justify-center gap-2 text-sm"
                  data-tooltip={t.openCamera}
                >
                  📷 {t.openCamera}
                </button>
                <button 
                  onClick={() => setImages([])} 
                  className="w-full py-3 theme-text-muted hover:text-rose-400 text-[10px] font-black uppercase tracking-[0.2em]"
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
              className={`group relative overflow-hidden border-2 border-dashed rounded-[3rem] p-14 text-center cursor-pointer transition-all duration-500 ${isDragging ? 'drag-pulsing shimmer-effect' : `theme-border hover:border-indigo-500/50 ${theme === 'dark' ? 'bg-slate-900/50 hover:bg-slate-900' : 'bg-white hover:bg-slate-50'}`}`}
            >
              <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={(e) => handleFiles(e.target.files)} />
              <div className={`transition-all duration-500 ${isDragging ? 'drag-content-pulsing' : ''}`}>
                <div className="w-16 h-16 bg-indigo-500/10 rounded-[1.5rem] flex items-center justify-center mx-auto mb-6">
                  <span className="text-3xl group-hover:scale-110 transition-transform">📤</span>
                </div>
                <h3 className={`text-2xl font-black mb-1 theme-text-main transition-all ${isDragging ? 'scale-105' : ''}`}>{t.dropzoneTitle}</h3>
                <p className={`theme-text-muted text-[10px] font-black uppercase tracking-[0.2em] transition-all ${isDragging ? 'opacity-80' : ''}`}>{t.dropzoneSub}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {images.map((img) => (
                <ImageCard 
                  key={img.id} item={img} t={t} theme={theme} 
                  onRemove={(id) => setImages(prev => prev.filter(i => i.id !== id))} 
                  onSelect={(item, immediateFs) => onSelectImage(item, immediateFs)} 
                  onShare={handleShare} 
                />
              ))}
            </div>
          </section>
        </div>
      </main>

      {/* Camera Modal */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-md p-6">
          <div className="relative max-w-2xl w-full flex flex-col items-center gap-6">
            <div className="relative w-full aspect-video rounded-3xl overflow-hidden border-4 border-white/10 shadow-2xl bg-black">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                className="w-full h-full object-cover grayscale"
              />
              <canvas ref={canvasRef} className="hidden" />
              <div className="absolute top-4 left-4 flex items-center gap-2">
                 <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                 <span className="text-[10px] font-black uppercase tracking-widest text-white shadow-sm">Live B&W Capture</span>
              </div>
            </div>
            
            <div className="flex gap-4">
              <button 
                onClick={closeCamera}
                className="p-5 rounded-full bg-slate-800 text-white hover:bg-slate-700 transition-all border border-white/10"
              >
                ✖
              </button>
              <button 
                onClick={capturePhoto}
                className="px-10 py-5 rounded-full bg-indigo-600 text-white font-black uppercase tracking-widest hover:bg-indigo-500 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-indigo-500/20"
              >
                {t.capture}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedIndex !== null && images[selectedIndex] && (
        <div 
          ref={modalContainerRef}
          className={`fixed inset-0 z-50 flex flex-col md:flex-row backdrop-blur-3xl animate-in fade-in duration-300 overflow-hidden ${theme === 'dark' ? 'bg-slate-950/98' : 'bg-slate-50/95'}`} 
          onClick={() => setSelectedIndex(null)}
        >
          <div className="flex-1 relative flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
             <div className="h-16 px-6 flex items-center justify-between border-b theme-border backdrop-blur-xl theme-bg-card z-10">
                <span className="text-[10px] font-black uppercase tracking-wider truncate px-3 py-1.5 rounded-lg border theme-border">{images[selectedIndex].file.name}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => exportSingle(images[selectedIndex])} className={`p-2 rounded-xl transition-all border theme-border flex items-center justify-center w-10 h-10 theme-bg-app theme-text-main hover:bg-slate-100 dark:hover:bg-slate-800`} data-tooltip={t.export}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  </button>
                  <button onClick={toggleFullscreen} className={`p-2 rounded-xl transition-all border theme-border flex items-center justify-center w-10 h-10 ${isFullscreen ? 'bg-indigo-600 text-white border-indigo-500' : 'theme-bg-app theme-text-main hover:bg-slate-100 dark:hover:bg-slate-800'}`} data-tooltip={t.fullScreen}>
                    {isFullscreen ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5" /></svg>
                    )}
                  </button>
                  <button onMouseDown={() => setShowOriginalInModal(true)} onMouseUp={() => setShowOriginalInModal(false)} onTouchStart={() => setShowOriginalInModal(true)} onTouchEnd={() => setShowOriginalInModal(false)} className={`px-4 py-2 h-10 rounded-xl text-[10px] font-black uppercase border transition-all ${showOriginalInModal ? 'bg-indigo-600 text-white border-indigo-500' : 'theme-bg-app theme-text-main theme-border hover:bg-slate-100 dark:hover:bg-slate-800'}`} data-tooltip={t.beforeAfter}>{t.beforeAfter}</button>
                  <button onClick={() => setSelectedIndex(null)} className="p-2 w-10 h-10 flex items-center justify-center rounded-xl theme-text-main hover:text-rose-400 hover:bg-rose-500/10 transition-all" data-tooltip={t.close}>✖</button>
                </div>
             </div>
             
             <div 
                ref={modalViewportRef}
                className="flex-1 flex items-center justify-center p-4 md:p-8 relative overflow-hidden"
             >
                <div 
                  className="relative transition-transform duration-100 ease-out flex flex-col items-center" 
                  style={{ transform: `scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)` }} 
                  onMouseDown={handleMouseDown}
                >
                  <img src={showOriginalInModal || !images[selectedIndex].resultUrl ? images[selectedIndex].previewUrl : images[selectedIndex].resultUrl} alt="Preview" className={`max-w-full max-h-[70vh] object-contain rounded-2xl shadow-2xl select-none ${isReprocessing ? 'opacity-50 blur-sm' : 'opacity-100'}`} />
                  
                  {images[selectedIndex].status === 'error' && (
                    <div className="mt-4 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 text-xs font-bold max-w-sm text-center">
                      ⚠️ {images[selectedIndex].error}
                    </div>
                  )}

                  {isReprocessing && <div className="absolute inset-0 flex items-center justify-center"><div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div>}
                </div>
             </div>

             <div className="h-20 flex items-center justify-center gap-6 z-10">
                <div className="flex items-center gap-4 px-6 py-2 rounded-full border theme-border shadow-xl theme-bg-card">
                  <button onClick={() => setZoomLevel(p => Math.max(p - 0.2, 0.5))} className="hover:text-indigo-500 transition-colors p-1" data-tooltip={t.zoomOut}>➖</button>
                  <button onClick={() => { setZoomLevel(1); setPanOffset({x:0,y:0}); }} className="text-[10px] font-black hover:text-indigo-500 transition-colors" data-tooltip={t.resetView}>{Math.round(zoomLevel * 100)}%</button>
                  <button onClick={() => setZoomLevel(p => Math.min(p + 0.2, 10))} className="hover:text-indigo-500 transition-colors p-1" data-tooltip={t.zoomIn}>➕</button>
                </div>
             </div>
          </div>

          {/* Tuning Sidebar */}
          <div className={`fixed md:relative bottom-0 left-0 right-0 md:w-80 h-[60vh] md:h-full border-t md:border-t-0 md:border-l theme-border p-6 flex flex-col gap-6 overflow-y-auto transition-transform duration-500 z-20 theme-bg-card ${isControlsVisible ? 'translate-y-0' : 'translate-y-full md:translate-y-0'}`} onClick={e => e.stopPropagation()}>
             <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-black uppercase tracking-[0.3em] theme-text-muted">{t.tuning}</h4>
                {lastSaved && <span className="text-[9px] font-bold text-emerald-500 animate-pulse">✓ {t.settingsSaved}</span>}
             </div>

             {/* Engine Selection */}
             <div className="space-y-4">
               <h5 className="text-[9px] font-black uppercase tracking-widest theme-text-muted">{t.engineType}</h5>
               <div className="grid grid-cols-1 gap-2">
                 {(['local', 'opencv', 'paddlehub'] as EngineType[]).map(et => (
                   <button 
                     key={et} 
                     onClick={() => setTuningParams(p => ({...p, engine: et}))}
                     className={`flex items-center gap-3 px-4 py-3 rounded-xl text-[10px] font-black uppercase border transition-all ${tuningParams.engine === et ? 'bg-emerald-600 text-white border-emerald-400 shadow-lg' : 'theme-border theme-text-muted hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                     data-tooltip={t[`${et}Desc` as keyof Translation]}
                   >
                     <span className="text-base">{ENGINE_ICONS[et]}</span>
                     {t[`${et}Engine` as keyof Translation]}
                   </button>
                 ))}
               </div>
             </div>

             <div className="space-y-4">
               <h5 className="text-[9px] font-black uppercase tracking-widest theme-text-muted">{t.colorGrading}</h5>
               <div className="flex flex-col gap-2">
                 {(['none', 'cinematic', 'vintage', 'vibrant', 'sepia', 'artistic', 'stable'] as GradingPreset[]).map(gp => (
                   <button 
                     key={gp} 
                     onClick={() => setTuningParams(p => ({...p, grading: gp}))}
                     className={`flex items-center gap-3 px-4 py-3 rounded-xl text-[10px] font-black uppercase border transition-all ${tuningParams.grading === gp ? 'bg-indigo-600 text-white border-indigo-400 shadow-lg' : 'theme-border theme-text-muted hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                     data-tooltip={t[`${gp}Desc` as keyof Translation]}
                   >
                     <span className="text-base">{PRESET_ICONS[gp]}</span>
                     {t[gp as keyof Translation]}
                   </button>
                 ))}
               </div>
             </div>

             <div className="space-y-5">
                {[
                  { label: t.temperature, key: 'temp', min: -100, max: 100, step: 1, val: tuningParams.temp },
                  { label: t.saturation, key: 'saturation', min: 0, max: 3, step: 0.05, val: tuningParams.saturation },
                  { label: t.contrast, key: 'contrast', min: 0.5, max: 2, step: 0.05, val: tuningParams.contrast },
                  { label: t.intensity, key: 'intensity', min: 0, max: 1, step: 0.01, val: tuningParams.intensity }
                ].map((s) => (
                  <div key={s.key} className="space-y-2">
                    <div className="flex justify-between items-center"><label className="text-[10px] font-bold">{s.label}</label><span className="text-[10px] font-mono text-indigo-400">{s.val}</span></div>
                    <input type="range" min={s.min} max={s.max} step={s.step} value={s.val} onChange={e => setTuningParams(p => ({...p, [s.key as keyof RestoreParams]: parseFloat(e.target.value)}))} className="w-full accent-indigo-500" />
                  </div>
                ))}
             </div>

             <div className="mt-auto space-y-3 pb-4">
                <div className="space-y-1.5 mb-2">
                  <label className="text-[10px] font-black uppercase tracking-widest theme-text-muted px-1">{t.targetFolder}</label>
                  <input 
                    type="text" 
                    value={targetPrefix}
                    onChange={(e) => setTargetPrefix(e.target.value)}
                    placeholder={t.targetFolderPlaceholder}
                    className="w-full px-4 py-3 rounded-xl border theme-border theme-bg-app theme-text-main text-xs outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={handleResetTuning} className="p-3 rounded-2xl border theme-border theme-text-muted text-[9px] font-black uppercase hover:bg-slate-100 dark:hover:bg-slate-800 transition-all" data-tooltip={t.resetTuning}>🔄 {t.resetTuning.split(' ')[0]}</button>
                  <button onClick={handleShowOriginal} className="p-3 rounded-2xl border theme-border theme-text-muted text-[9px] font-black uppercase hover:bg-slate-100 dark:hover:bg-slate-800 transition-all" data-tooltip={t.showOriginal}>🖼️ {t.original}</button>
                </div>
                <button onClick={handleFeelingLucky} className="w-full py-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-2xl text-[10px] font-black uppercase active:scale-95 transition-all shadow-lg shadow-indigo-500/20" data-tooltip={t.feelingLucky}>✨ {t.feelingLucky}</button>
                <button onClick={() => exportSingle(images[selectedIndex])} className="w-full py-4 theme-bg-app border theme-border theme-text-main rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] active:scale-95 transition-all hover:bg-slate-100 dark:hover:bg-slate-800" data-tooltip={t.export}>💾 {t.export}</button>
             </div>
          </div>
        </div>
      )}

      <footer className="py-20 text-center theme-text-muted opacity-60">
        <div className="flex flex-col items-center gap-4">
           <div className="flex items-center gap-6">
              <a href="mailto:goldnoamai@gmail.com" className="text-[10px] font-black uppercase tracking-[0.2em] hover:text-indigo-400 transition-colors">{t.sendFeedback}</a>
              <span className="opacity-20">|</span>
              <p className="text-[10px] font-black uppercase tracking-[0.3em]">(C) Noam Gold AI 2026</p>
           </div>
           <p className="text-[9px] font-black uppercase tracking-[0.5em] text-indigo-400/80">ChromaRestore Pro Core v11.0 (Hybrid Local Engine)</p>
        </div>
      </footer>
    </div>
  );
};

export default App;