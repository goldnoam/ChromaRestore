
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
  { temp: 5, saturation: 1.5, contrast: 1.3, intensity: 1.0, grading: 'artistic', engine: 'paddlehub' },
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

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      modalContainerRef.current?.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedIndex !== null && e.key.toLowerCase() === 'f') toggleFullscreen();
      if (selectedIndex !== null && e.key === '0') { setZoomLevel(1); setPanOffset({x:0,y:0}); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, toggleFullscreen]);

  useEffect(() => {
    document.title = t.title + " | " + t.subtitle;
  }, [t]);

  useEffect(() => {
    localStorage.setItem('chroma-theme', theme);
    document.documentElement.className = theme;
  }, [theme]);

  const openCamera = async () => {
    setIsCameraOpen(true);
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setCameraError(t.cameraPermissionDenied);
      setIsCameraOpen(false);
    }
  };

  const closeCamera = () => {
    if (videoRef.current?.srcObject) (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
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
          setImages(prev => [{ id: Math.random().toString(36).substr(2, 9), file: file as any as File, previewUrl: URL.createObjectURL(file as any as Blob), status: 'pending' }, ...prev]);
          closeCamera();
        }
      }, 'image/jpeg');
    }
  };

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
      setImages(prev => prev.map(img => img.id === item.id ? { ...img, status: 'completed', resultUrl } : img));
    } catch (err: any) {
      setImages(prev => prev.map(img => img.id === item.id ? { ...img, status: 'error', error: err.message } : img));
    }
  }, []);

  useEffect(() => {
    if (selectedIndex === null || !images[selectedIndex]) return;
    const item = images[selectedIndex];
    if (processTimerRef.current) window.clearTimeout(processTimerRef.current);
    setIsReprocessing(true);
    processTimerRef.current = window.setTimeout(async () => {
      await processSingle(item, tuningParams);
      setIsReprocessing(false);
      localStorage.setItem(`tuning_${item.file.name}`, JSON.stringify(tuningParams));
      setLastSaved(true);
      setTimeout(() => setLastSaved(false), 1500);
    }, 150);
    return () => { if (processTimerRef.current) window.clearTimeout(processTimerRef.current); };
  }, [tuningParams, selectedIndex, processSingle]);

  const processNextPending = useCallback(async () => {
    const nextItem = images.find(img => img.status === 'pending');
    if (!nextItem || isProcessing) return;
    setIsProcessing(true);
    setImages(prev => prev.map(img => img.id === nextItem.id ? { ...img, status: 'processing' } : img));
    const saved = localStorage.getItem(`tuning_${nextItem.file.name}`);
    await processSingle(nextItem, saved ? JSON.parse(saved) : DEFAULT_PARAMS);
    setIsProcessing(false);
  }, [images, isProcessing, processSingle]);

  useEffect(() => { processNextPending(); }, [images, processNextPending]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (selectedIndex === null) return;
    isDraggingImage.current = true;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingImage.current) return;
    setPanOffset(prev => ({ x: prev.x + (e.clientX - lastMousePos.current.x), y: prev.y + (e.clientY - lastMousePos.current.y) }));
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseUp = useCallback(() => { isDraggingImage.current = false; }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [handleMouseMove, handleMouseUp]);

  const onSelectImage = (item: ImageItem, immediateFs: boolean = false) => {
    const index = images.indexOf(item);
    setSelectedIndex(index);
    setZoomLevel(1); setPanOffset({x:0,y:0});
    const saved = localStorage.getItem(`tuning_${item.file.name}`);
    setTuningParams(saved ? JSON.parse(saved) : DEFAULT_PARAMS);
    if (immediateFs) setTimeout(toggleFullscreen, 100);
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
            <button onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')} className="p-2.5 rounded-xl border theme-border theme-bg-card transition-transform active:scale-95">{theme === 'dark' ? '🌙' : '☀️'}</button>
            <select value={lang} onChange={(e) => setLang(e.target.value as Language)} className="border theme-border rounded-xl px-3 py-1.5 text-xs font-bold theme-bg-card outline-none focus:ring-2 focus:ring-indigo-500">
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
          <h2 className="text-3xl md:text-5xl font-extrabold mb-4 tracking-tight">{t.subtitle}</h2>
          <p className="theme-text-muted text-sm font-medium flex items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            {t.offlineReady}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <aside className="lg:col-span-1 space-y-6">
            <div className="p-6 rounded-[2.5rem] shadow-2xl border theme-border theme-bg-card">
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest opacity-60 ml-1">{t.targetFolder}</label>
                  <input type="text" value={targetPrefix} onChange={e => setTargetPrefix(e.target.value)} placeholder={t.targetFolderPlaceholder} className="w-full px-4 py-3 rounded-xl border theme-border theme-bg-app text-xs outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
                </div>
                <button onClick={() => images.forEach(img => img.status === 'completed' && exportSingle(img))} disabled={!images.some(i => i.status === 'completed')} className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2">
                   <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                   {t.downloadAll}
                </button>
                <button onClick={openCamera} className="w-full py-4 bg-slate-100 dark:bg-slate-800 hover:bg-indigo-500 hover:text-white transition-all text-slate-700 dark:text-slate-200 font-bold rounded-2xl shadow-xl flex items-center justify-center gap-2">
                  <span>📷</span> {t.openCamera}
                </button>
                <button onClick={() => setImages([])} className="w-full py-3 theme-text-muted hover:text-rose-500 transition-colors text-[10px] font-black uppercase tracking-widest">{t.clearBtn}</button>
              </div>
            </div>
            <AdPlaceholder label={t.adPlaceholder} />
          </aside>

          <section className="lg:col-span-3 space-y-6">
            <div 
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }} 
              onDragLeave={() => setIsDragging(false)} 
              onDrop={e => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files) Array.from(e.dataTransfer.files).forEach(file => setImages(p => [...p, { id: Math.random().toString(36).substr(2, 9), file: file as any as File, previewUrl: URL.createObjectURL(file as any as Blob), status: 'pending' }])); }} 
              onClick={() => fileInputRef.current?.click()} 
              className={`border-2 border-dashed rounded-[3rem] p-14 text-center cursor-pointer transition-all duration-500 group relative overflow-hidden ${isDragging ? 'drag-pulsing shimmer-effect' : 'theme-border hover:border-indigo-500/50 theme-bg-card'}`}
            >
              <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={e => e.target.files && Array.from(e.target.files).forEach(file => setImages(p => [...p, { id: Math.random().toString(36).substr(2, 9), file: file as any as File, previewUrl: URL.createObjectURL(file as any as Blob), status: 'pending' }]))} />
              <div className="mb-6 mx-auto w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              </div>
              <h3 className="text-2xl font-black mb-1">{t.dropzoneTitle}</h3>
              <p className="theme-text-muted text-[10px] font-black uppercase tracking-widest">{t.dropzoneSub}</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
              {images.map(img => <ImageCard key={img.id} item={img} t={t} theme={theme} onRemove={id => setImages(p => p.filter(i => i.id !== id))} onSelect={onSelectImage} onShare={i => navigator.share?.({ title: t.shareTitle, url: window.location.href })} />)}
            </div>
          </section>
        </div>
      </main>

      {isCameraOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-md p-6">
          <div className="relative max-w-2xl w-full flex flex-col items-center gap-6">
            <div className="relative w-full aspect-video rounded-[2rem] overflow-hidden border-4 border-white/10 shadow-2xl">
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover grayscale" />
              <canvas ref={canvasRef} className="hidden" />
              <div className="absolute top-4 left-4 flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-[10px] font-black uppercase text-white tracking-widest shadow-sm">Live Feed</span>
              </div>
            </div>
            <div className="flex gap-4">
              <button onClick={closeCamera} className="p-5 rounded-full bg-slate-800 text-white hover:bg-slate-700 transition-all border border-white/5">✖</button>
              <button onClick={capturePhoto} className="px-10 py-5 rounded-full bg-indigo-600 text-white font-black uppercase shadow-xl hover:bg-indigo-500 active:scale-95 transition-all">{t.capture}</button>
            </div>
          </div>
        </div>
      )}

      {selectedIndex !== null && images[selectedIndex] && (
        <div ref={modalContainerRef} className={`fixed inset-0 z-50 flex flex-col md:flex-row backdrop-blur-3xl overflow-hidden animate-in fade-in duration-300 ${theme === 'dark' ? 'bg-slate-950/98' : 'bg-slate-50/95'}`} onClick={() => setSelectedIndex(null)}>
          <div className="flex-1 relative flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="h-16 px-6 flex items-center justify-between border-b theme-border theme-bg-card z-10">
              <span className="text-[10px] font-black uppercase tracking-wider truncate border theme-border px-3 py-1.5 rounded-lg max-w-[200px]">{images[selectedIndex].file.name}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => exportSingle(images[selectedIndex])} className="p-2 w-10 h-10 border theme-border rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-all group" data-tooltip={t.export}>
                   <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                </button>
                <button onClick={toggleFullscreen} className="p-2 w-10 h-10 border theme-border rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-all group" data-tooltip={t.fullScreen}>
                   <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5" /></svg>
                </button>
                <button onMouseDown={() => setShowOriginalInModal(true)} onMouseUp={() => setShowOriginalInModal(false)} onMouseLeave={() => setShowOriginalInModal(false)} onTouchStart={() => setShowOriginalInModal(true)} onTouchEnd={() => setShowOriginalInModal(false)} className={`px-4 py-2 h-10 text-[10px] font-black uppercase border theme-border rounded-xl transition-all ${showOriginalInModal ? 'bg-indigo-600 text-white border-indigo-500' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>{t.beforeAfter}</button>
                <button onClick={() => setSelectedIndex(null)} className="p-2 w-10 h-10 flex items-center justify-center rounded-xl hover:text-rose-400 transition-colors">✖</button>
              </div>
            </div>
            
            <div ref={modalViewportRef} className="flex-1 flex items-center justify-center p-8 overflow-hidden relative cursor-grab active:cursor-grabbing" onMouseDown={handleMouseDown}>
              <div className="relative transition-transform duration-75 select-none" style={{ transform: `scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)` }}>
                <img src={showOriginalInModal || !images[selectedIndex].resultUrl ? images[selectedIndex].previewUrl : images[selectedIndex].resultUrl} className={`max-w-full max-h-[70vh] rounded-2xl shadow-2xl select-none pointer-events-none transition-all duration-300 ${isReprocessing ? 'opacity-50 blur-sm' : ''}`} draggable={false} />
                {isReprocessing && <div className="absolute inset-0 flex items-center justify-center bg-black/10 rounded-2xl backdrop-blur-[2px]"><div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>}
              </div>
            </div>
          </div>

          <aside className="md:w-80 h-full border-l theme-border p-6 flex flex-col gap-6 overflow-y-auto theme-bg-card scrollbar-hide" onClick={e => e.stopPropagation()}>
            <h4 className="text-[10px] font-black uppercase tracking-widest opacity-50 flex items-center gap-2">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
              {t.tuning}
            </h4>
            
            <div className="space-y-4">
               <h5 className="text-[9px] font-black uppercase tracking-widest opacity-70">{t.engineType}</h5>
               <div className="grid grid-cols-1 gap-2">
                 {(['local', 'opencv', 'paddlehub'] as EngineType[]).map(et => (
                   <button key={et} onClick={() => setTuningParams(p => ({...p, engine: et}))} className={`flex items-center gap-3 px-4 py-3 rounded-xl text-[10px] font-black uppercase border transition-all ${tuningParams.engine === et ? 'bg-emerald-600 text-white border-emerald-400 shadow-lg' : 'theme-border opacity-60 hover:opacity-100 hover:bg-slate-100 dark:hover:bg-slate-800'}`} data-tooltip={t[`${et}Desc` as keyof Translation]}>
                     <span className="text-base">{ENGINE_ICONS[et]}</span> {t[`${et}Engine` as keyof Translation]}
                   </button>
                 ))}
               </div>
            </div>

            <div className="space-y-4">
               <h5 className="text-[9px] font-black uppercase tracking-widest opacity-70">{t.colorGrading}</h5>
               <div className="grading-list-vertical">
                 {(['none', 'cinematic', 'vintage', 'vibrant', 'sepia', 'artistic', 'stable'] as GradingPreset[]).map(gp => (
                   <button 
                     key={gp} 
                     onClick={() => setTuningParams(p => ({...p, grading: gp}))} 
                     className={`flex items-center gap-3 px-4 py-3 rounded-xl text-[10px] font-black uppercase border transition-all ${tuningParams.grading === gp ? 'bg-indigo-600 text-white border-indigo-400 shadow-lg' : 'theme-border opacity-60 hover:opacity-100 hover:bg-slate-100 dark:hover:bg-slate-800'}`} 
                     data-tooltip={t[`${gp}Desc` as keyof Translation]}
                   >
                     <span className="text-base">{PRESET_ICONS[gp]}</span> {t[gp as keyof Translation]}
                   </button>
                 ))}
               </div>
            </div>

            <div className="space-y-5">
              {[
                { label: t.temperature, k: 'temp', min: -100, max: 100, step: 1 },
                { label: t.saturation, k: 'saturation', min: 0, max: 3, step: 0.1 },
                { label: t.contrast, k: 'contrast', min: 0.5, max: 2, step: 0.1 },
                { label: t.intensity, k: 'intensity', min: 0, max: 1, step: 0.05 }
              ].map(s => (
                <div key={s.k} className="space-y-2">
                  <div className="flex justify-between text-[10px] font-bold"><span>{s.label}</span><span className="font-mono text-indigo-500">{tuningParams[s.k as keyof RestoreParams]}</span></div>
                  <input type="range" min={s.min} max={s.max} step={s.step} value={tuningParams[s.k as keyof RestoreParams] as number} onChange={e => setTuningParams(p => ({...p, [s.k]: parseFloat(e.target.value)}))} className="w-full accent-indigo-500 cursor-pointer" />
                </div>
              ))}
            </div>

            <div className="mt-auto pt-6 space-y-3">
              <div className="flex gap-2">
                <button onClick={() => setTuningParams(DEFAULT_PARAMS)} className="flex-1 py-3 rounded-xl border theme-border text-[9px] font-black uppercase hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">{t.resetTuning}</button>
                <button onClick={() => setTuningParams(LUCKY_PROFILES[Math.floor(Math.random()*LUCKY_PROFILES.length)])} className="flex-[2] py-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-2xl text-[10px] font-black uppercase shadow-lg shadow-indigo-500/20 active:scale-95 transition-all">✨ {t.feelingLucky}</button>
              </div>
              <button onClick={() => exportSingle(images[selectedIndex])} className="w-full py-4 bg-slate-100 dark:bg-slate-800 border theme-border rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white hover:border-indigo-500 transition-all">{t.export}</button>
            </div>
          </aside>
        </div>
      )}

      <footer className="py-20 text-center flex flex-col items-center gap-3 opacity-60">
        <div className="flex items-center gap-6">
           <a href="mailto:goldnoamai@gmail.com" className="text-[10px] font-black uppercase tracking-[0.2em] hover:text-indigo-400 transition-colors">{t.sendFeedback}</a>
           <span className="w-1 h-1 rounded-full bg-slate-700"></span>
           <p className="text-[10px] font-black uppercase tracking-[0.3em]">(C) Noam Gold AI 2026</p>
        </div>
        <p className="text-[9px] font-bold opacity-40 uppercase tracking-[0.5em] text-indigo-400">ChromaRestore Pro Core v15.0 (Hybrid Local + GAN Simulation)</p>
      </footer>
    </div>
  );
};

export default App;
