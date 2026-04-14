import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Camera, 
  Upload, 
  Download, 
  Trash2, 
  Settings, 
  Moon, 
  Sun, 
  Palette, 
  Maximize2, 
  Minimize2, 
  RefreshCw, 
  Image as ImageIcon,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  Plus,
  Minus,
  Mail,
  Info,
  Sparkles,
  Zap,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { Language, ImageItem, RestoreParams, GradingPreset } from './types';
import { translations } from './i18n';
import { processImageLocally, fileToBase64 } from './services/restorationService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';

const DEFAULT_PARAMS: RestoreParams = {
  temp: 15,
  saturation: 1.25,
  contrast: 1.15,
  intensity: 1.0,
  grading: 'none'
};

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>('en');
  const [theme, setTheme] = useState<'dark' | 'light' | 'colorful'>(() => {
    return (localStorage.getItem('chroma-theme') as any) || 'dark';
  });
  const [images, setImages] = useState<ImageItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [tuningParams, setTuningParams] = useState<RestoreParams>(DEFAULT_PARAMS);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [previewItem, setPreviewItem] = useState<ImageItem | null>(null);
  const [showOriginalPreview, setShowOriginalPreview] = useState(false);
  
  const [processingIndex, setProcessingIndex] = useState<number>(0);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    containerRef.current.style.setProperty('--x', `${x}px`);
    containerRef.current.style.setProperty('--y', `${y}px`);
  };

  const openCamera = async () => {
    setIsCameraOpen(true);
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      setCameraError(t.cameraPermissionDenied);
    }
  };

  const closeCamera = () => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
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
          addFiles([file]);
          closeCamera();
        }
      }, 'image/jpeg');
    }
  };

  const t = translations[lang];

  useEffect(() => {
    localStorage.setItem('chroma-theme', theme);
    document.documentElement.className = theme;
  }, [theme]);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f => (f as File).type.startsWith('image/')) as File[];
    addFiles(files);
  }, []);

  const addFiles = (files: File[]) => {
    const newImages: ImageItem[] = files.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'pending'
    }));
    setImages(prev => [...newImages, ...prev]);
  };

  const processSingle = useCallback(async (item: ImageItem, params: RestoreParams, index: number) => {
    try {
      setProcessingIndex(index + 1);
      setImages(prev => prev.map(img => img.id === item.id ? { ...img, status: 'processing' } : img));
      const base64 = await fileToBase64(item.file);
      
      const resultUrl = await processImageLocally(base64, item.file.type, params);

      setImages(prev => prev.map(img => img.id === item.id ? { ...img, status: 'completed', resultUrl } : img));
      toast.success(t.completed);
    } catch (err: any) {
      setImages(prev => prev.map(img => img.id === item.id ? { ...img, status: 'error', error: err.message } : img));
      toast.error(err.message || t.error);
    }
  }, [t]);

  useEffect(() => {
    const pendingIndex = images.findIndex(img => img.status === 'pending');
    if (pendingIndex !== -1 && !isProcessing) {
      setIsProcessing(true);
      processSingle(images[pendingIndex], tuningParams, pendingIndex).finally(() => setIsProcessing(false));
    }
  }, [images, isProcessing, processSingle, tuningParams]);

  const removeImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
    if (selectedIndex !== null && images[selectedIndex]?.id === id) {
      setSelectedIndex(null);
    }
  };

  const downloadImage = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
  };

  const shareImage = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t.shareSuccess);
    } catch (err) {
      toast.error("Failed to copy link");
    }
  };

  return (
    <TooltipProvider>
      <div 
        ref={containerRef}
        onMouseMove={handleMouseMove}
        className="min-h-screen relative overflow-hidden flex flex-col spotlight"
      >
        {/* Animated Background */}
        <div className="fixed inset-0 -z-10 mesh-bg opacity-30" />
        
        {/* Header */}
        <header className="glass sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Sparkles className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">ChromaRestore Pro</h1>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">{t.subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="rounded-full" />}>
                <Palette className="w-5 h-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="glass">
                <DropdownMenuItem onClick={() => setTheme('light')}>
                  <Sun className="w-4 h-4 mr-2" /> Light
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('dark')}>
                  <Moon className="w-4 h-4 mr-2" /> Dark
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('colorful')}>
                  <Sparkles className="w-4 h-4 mr-2" /> Colorful
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="font-bold uppercase tracking-tighter" />}>
                {lang}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="glass">
                {(Object.keys(translations) as Language[]).map(l => (
                  <DropdownMenuItem key={l} onClick={() => setLang(l)}>
                    {l.toUpperCase()}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 bento-grid max-w-7xl mx-auto w-full">
          {/* Dropzone / Upload Area */}
          <Card 
            className={cn(
              "bento-item bento-item-large glass flex flex-col items-center justify-center border-dashed border-2 transition-all duration-500 relative overflow-hidden",
              isProcessing ? "opacity-50 pointer-events-none" : "hover:border-primary/50",
              isDragging ? "border-primary bg-primary/5 scale-[0.99]" : "border-muted/20"
            )}
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            {isDragging && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 bg-primary/10 backdrop-blur-sm flex items-center justify-center z-10 pointer-events-none"
              >
                <div className="bg-background/80 p-6 rounded-full shadow-2xl border border-primary/20">
                  <Upload className="w-12 h-12 text-primary animate-bounce" />
                </div>
              </motion.div>
            )}
            <div className="text-center space-y-4">
              <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <Upload className="w-10 h-10 text-primary" />
              </div>
              <h2 className="text-3xl font-extrabold tracking-tight">{t.dropzoneTitle}</h2>
              <p className="text-muted-foreground max-w-md mx-auto">{t.dropzoneSub}</p>
              
              <div className="flex items-center justify-center gap-4 pt-4">
                <Button 
                  size="lg" 
                  className="rounded-full px-8 font-bold shadow-xl shadow-primary/20"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImageIcon className="w-5 h-5 mr-2" /> {t.colorizeBtn}
                </Button>
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="rounded-full px-8 glass font-bold"
                  onClick={openCamera}
                >
                  <Camera className="w-5 h-5 mr-2" /> {t.openCamera}
                </Button>
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                multiple 
                accept="image/*" 
                onChange={(e) => e.target.files && addFiles(Array.from(e.target.files))}
              />
            </div>
          </Card>

          {/* Settings / Tuning Panel */}
          <Card className="bento-item glass">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-primary" />
                <CardTitle className="text-lg">{t.tuning}</CardTitle>
              </div>
              <CardDescription>{t.settingsSaved}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <Label className="text-xs font-bold uppercase tracking-wider">{t.colorGrading}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(['none', 'cinematic', 'vintage', 'vibrant', 'sepia', 'artistic', 'stable'] as GradingPreset[]).map(p => (
                    <Button
                      key={p}
                      variant={tuningParams.grading === p ? "default" : "outline"}
                      size="sm"
                      className="text-[10px] font-bold uppercase tracking-tighter h-8 rounded-lg glass"
                      onClick={() => setTuningParams(prev => ({ ...prev, grading: p }))}
                    >
                      {t[p] || p}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-6 pt-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                      <span>{t.temperature}</span>
                      <span>{tuningParams.temp}°</span>
                    </div>
                    <Slider 
                      value={[tuningParams.temp]} 
                      min={-100} max={100} step={1}
                      onValueChange={(v: number[]) => setTuningParams(p => ({ ...p, temp: v[0] }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                      <span>{t.saturation}</span>
                      <span>{tuningParams.saturation}x</span>
                    </div>
                    <Slider 
                      value={[tuningParams.saturation]} 
                      min={0} max={3} step={0.1}
                      onValueChange={(v: number[]) => setTuningParams(p => ({ ...p, saturation: v[0] }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                      <span>{t.contrast}</span>
                      <span>{tuningParams.contrast}x</span>
                    </div>
                    <Slider 
                      value={[tuningParams.contrast]} 
                      min={0.5} max={2} step={0.1}
                      onValueChange={(v: number[]) => setTuningParams(p => ({ ...p, contrast: v[0] }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                      <span>{t.intensity}</span>
                      <span>{Math.round(tuningParams.intensity * 100)}%</span>
                    </div>
                    <Slider 
                      value={[tuningParams.intensity]} 
                      min={0} max={1} step={0.01}
                      onValueChange={(v: number[]) => setTuningParams(p => ({ ...p, intensity: v[0] }))}
                    />
                  </div>
                </div>
            </CardContent>
          </Card>

          {/* Gallery / Results */}
          <Card className="bento-item bento-item-large glass">
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="space-y-1">
                  <CardTitle className="text-xl">
                    {isProcessing 
                      ? t.imageCount.replace('{current}', processingIndex.toString()).replace('{total}', images.length.toString())
                      : t.totalImages.replace('{count}', images.length.toString())
                    }
                  </CardTitle>
                  <CardDescription>
                    {isProcessing ? (
                      <span className="flex items-center gap-2 text-primary animate-pulse font-bold">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        {t.processingDesc}
                      </span>
                    ) : (
                      t.completedCount.replace('{count}', images.filter(i => i.status === 'completed').length.toString())
                    )}
                  </CardDescription>
                </div>
              </div>
              {images.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setImages([])} className="text-destructive hover:text-destructive/80 font-bold uppercase text-[10px]">
                  <Trash2 className="w-4 h-4 mr-2" /> {t.clearBtn}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] pr-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <AnimatePresence mode="popLayout">
                    {images.map((item, idx) => (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, x: -20 }}
                        className="group relative rounded-2xl overflow-hidden glass aspect-square spotlight cursor-zoom-in"
                        onClick={() => {
                          setPreviewItem(item);
                          setShowOriginalPreview(false);
                        }}
                        onDoubleClick={() => {
                          setPreviewItem(item);
                          setShowOriginalPreview(false);
                        }}
                      >
                        <div className="relative w-full h-full flex items-stretch">
                          {item.status === 'completed' && item.resultUrl ? (
                            <>
                              <div className="flex-1 relative overflow-hidden border-r border-white/10">
                                <img 
                                  src={item.previewUrl} 
                                  alt="Original" 
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                                <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md text-[8px] font-bold text-white uppercase tracking-tighter z-10">
                                  {t.original}
                                </div>
                              </div>
                              <div className="flex-1 relative overflow-hidden">
                                <img 
                                  src={item.resultUrl} 
                                  alt="Restored" 
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                                <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-primary/80 backdrop-blur-md text-[8px] font-bold text-white uppercase tracking-tighter z-10">
                                  {t.result}
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="w-full h-full relative">
                              <img 
                                src={item.previewUrl} 
                                alt="Preview" 
                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                referrerPolicy="no-referrer"
                              />
                              {item.status === 'processing' && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-20">
                                  <RefreshCw className="w-8 h-8 text-white animate-spin" />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                          <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                              <Badge className={cn(
                                "font-bold uppercase text-[8px]",
                                item.status === 'completed' ? "bg-green-500" : 
                                item.status === 'processing' ? "bg-blue-500 animate-pulse" : 
                                item.status === 'error' ? "bg-red-500" : "bg-slate-500"
                              )}>
                                {t[item.status]}
                              </Badge>
                              <Button 
                                size="icon" 
                                variant="destructive" 
                                className="w-7 h-7 rounded-full" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeImage(item.id);
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <p className="text-[8px] font-bold text-white/50 uppercase tracking-wider">{t.original}</p>
                                <div className="flex gap-1">
                                  <Button 
                                    size="icon" 
                                    variant="secondary" 
                                    className="w-7 h-7 rounded-lg glass" 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      downloadImage(item.previewUrl, `original_${item.file.name}`);
                                    }}
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button 
                                    size="icon" 
                                    variant="secondary" 
                                    className="w-7 h-7 rounded-lg glass" 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      shareImage(item.previewUrl);
                                    }}
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </div>

                              {item.status === 'completed' && item.resultUrl && (
                                <div className="space-y-1">
                                  <p className="text-[8px] font-bold text-primary uppercase tracking-wider">{t.result}</p>
                                  <div className="flex gap-1">
                                    <Button 
                                      size="icon" 
                                      variant="default" 
                                      className="w-7 h-7 rounded-lg shadow-lg shadow-primary/20" 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        downloadImage(item.resultUrl!, `restored_${item.file.name}`);
                                      }}
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button 
                                      size="icon" 
                                      variant="default" 
                                      className="w-7 h-7 rounded-lg shadow-lg shadow-primary/20" 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        shareImage(item.resultUrl!);
                                      }}
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {images.length === 0 && (
                    <div className="col-span-full h-64 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-3xl border-muted/20">
                      <ImageIcon className="w-12 h-12 mb-4 opacity-20" />
                      <p className="font-medium">{t.noResults}</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </main>

        {/* Camera Dialog */}
        <Dialog open={isCameraOpen} onOpenChange={(open) => !open && closeCamera()}>
          <DialogContent className="glass sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t.openCamera}</DialogTitle>
              <DialogDescription>{t.capture}</DialogDescription>
            </DialogHeader>
            <div className="relative aspect-video rounded-2xl overflow-hidden bg-black">
              {cameraError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                  <AlertCircle className="w-12 h-12 text-destructive mb-4" />
                  <p className="text-sm font-medium">{cameraError}</p>
                </div>
              ) : (
                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
              )}
              <canvas ref={canvasRef} className="hidden" />
            </div>
            <DialogFooter className="sm:justify-center">
              {!cameraError && (
                <Button size="lg" className="rounded-full px-8 font-bold" onClick={capturePhoto}>
                  <Camera className="w-5 h-5 mr-2" /> {t.capture}
                </Button>
              )}
              <Button variant="ghost" className="rounded-full" onClick={closeCamera}>{t.close}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Preview Dialog */}
        <Dialog open={!!previewItem} onOpenChange={(open) => !open && setPreviewItem(null)}>
          <DialogContent className="glass sm:max-w-[90vw] h-[90vh] p-0 overflow-hidden border-none">
            <div className="relative w-full h-full flex flex-col">
              <div className="absolute top-4 right-4 z-50 flex gap-2">
                <Button 
                  variant="secondary" 
                  size="icon" 
                  className="rounded-full glass"
                  onClick={() => previewItem && downloadImage(previewItem.resultUrl || previewItem.previewUrl, `preview_${previewItem.file.name}`)}
                >
                  <Download className="w-4 h-4" />
                </Button>
                <Button 
                  variant="secondary" 
                  size="icon" 
                  className="rounded-full glass"
                  onClick={() => setPreviewItem(null)}
                >
                  <Minimize2 className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex-1 relative overflow-hidden bg-black/20 flex items-center justify-center p-4">
                {previewItem && (
                  <ZoomableImage 
                    src={showOriginalPreview ? previewItem.previewUrl : (previewItem.resultUrl || previewItem.previewUrl)} 
                    alt="Preview"
                  />
                )}
              </div>

              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 glass px-6 py-3 rounded-full flex items-center gap-4 z-50">
                {previewItem?.status === 'completed' && previewItem.resultUrl ? (
                  <div className="flex items-center gap-3">
                    <Button 
                      variant={showOriginalPreview ? "default" : "ghost"} 
                      size="sm" 
                      className="rounded-full text-[10px] font-bold uppercase"
                      onClick={() => setShowOriginalPreview(true)}
                    >
                      {t.original}
                    </Button>
                    <Button 
                      variant={!showOriginalPreview ? "default" : "ghost"} 
                      size="sm" 
                      className="rounded-full text-[10px] font-bold uppercase"
                      onClick={() => setShowOriginalPreview(false)}
                    >
                      {t.result}
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">{t.original}</span>
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Footer */}
        <footer className="glass mt-auto px-6 py-8">
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                <span className="font-bold">ChromaRestore Pro</span>
              </div>
              <p className="text-xs text-muted-foreground">© 2026 Noam Gold AI. All rights reserved.</p>
            </div>

            <div className="flex justify-center gap-6">
              <a href="https://www.linkedin.com/in/noamgold" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                <ExternalLink className="w-5 h-5" />
              </a>
              <a href="https://noamgoldai.vercel.app/" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                <ExternalLink className="w-5 h-5" />
              </a>
              <a href="https://noam-gold-games.vercel.app/" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                <Zap className="w-5 h-5" />
              </a>
            </div>

            <div className="text-right space-y-1">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Send Feedback</p>
              <a href="mailto:goldnoamai@gmail.com" className="text-sm font-medium hover:text-primary transition-colors">goldnoamai@gmail.com</a>
            </div>
          </div>
        </footer>

        <Toaster position="bottom-right" theme={theme === 'colorful' ? 'dark' : theme} />
      </div>
    </TooltipProvider>
  );
};

const ZoomableImage: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale(prev => Math.min(Math.max(prev + delta, 0.5), 5));
  };

  const reset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  return (
    <div 
      ref={containerRef}
      className="w-full h-full overflow-hidden flex items-center justify-center cursor-move touch-none"
      onWheel={handleWheel}
      onDoubleClick={reset}
    >
      <motion.div
        drag
        dragConstraints={containerRef}
        dragElastic={0.1}
        animate={{ scale, x: position.x, y: position.y }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="relative"
      >
        {src ? (
          <img 
            src={src} 
            alt={alt} 
            className="max-w-full max-h-[80vh] object-contain pointer-events-none select-none rounded-lg shadow-2xl"
            referrerPolicy="no-referrer"
          />
        ) : null}
      </motion.div>
      
      <div className="absolute bottom-4 right-4 flex flex-col gap-2">
        <Button variant="secondary" size="icon" className="rounded-full glass w-8 h-8" onClick={() => setScale(s => Math.min(s + 0.5, 5))}>
          <Plus className="w-4 h-4" />
        </Button>
        <Button variant="secondary" size="icon" className="rounded-full glass w-8 h-8" onClick={() => setScale(s => Math.max(s - 0.5, 0.5))}>
          <Minus className="w-4 h-4" />
        </Button>
        <Button variant="secondary" size="icon" className="rounded-full glass w-8 h-8" onClick={reset}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

export default App;

