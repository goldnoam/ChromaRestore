export type Language = 'en' | 'he' | 'zh' | 'hi' | 'de' | 'es' | 'fr';

export type GradingPreset = 'none' | 'cinematic' | 'vintage' | 'vibrant' | 'sepia' | 'artistic' | 'stable';

export type EngineType = 'local' | 'opencv' | 'paddlehub';

export interface ImageItem {
  id: string;
  file: File;
  previewUrl: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  resultUrl?: string;
  error?: string;
  destination?: string;
}

export interface RestoreParams {
  temp: number;
  saturation: number;
  contrast: number;
  intensity: number;
  grading: GradingPreset;
  engine: EngineType;
}

export interface Translation {
  title: string;
  subtitle: string;
  dropzoneTitle: string;
  dropzoneSub: string;
  colorizeBtn: string;
  clearBtn: string;
  downloadAll: string;
  processing: string;
  completed: string;
  pending: string;
  error: string;
  targetFolder: string;
  targetFolderPlaceholder: string;
  pickFolder: string;
  languageName: string;
  languageSelect: string;
  themeToggle: string;
  offlineReady: string;
  adPlaceholder: string;
  confirmDownload: string;
  dropNow: string;
  close: string;
  original: string;
  result: string;
  export: string;
  share: string;
  shareTitle: string;
  shareSuccess: string;
  fullScreen: string;
  resetView: string;
  zoomLevel: string;
  zoomIn: string;
  zoomOut: string;
  remove: string;
  search: string;
  imageCount: string;
  tryExample: string;
  searchPlaceholder: string;
  exportSearch: string;
  noResults: string;
  exportCompleted: string;
  completedCount: string;
  totalImages: string;
  tuning: string;
  temperature: string;
  saturation: string;
  contrast: string;
  intensity: string;
  reprocess: string;
  beforeAfter: string;
  resetTuning: string;
  feelingLucky: string;
  showOriginal: string;
  hideControls: string;
  showControls: string;
  settingsSaved: string;
  colorGrading: string;
  cinematic: string;
  vintage: string;
  vibrant: string;
  sepia: string;
  artistic: string;
  stable: string;
  none: string;
  sendFeedback: string;
  openCamera: string;
  capture: string;
  cameraPermissionDenied: string;
  pendingDesc: string;
  processingDesc: string;
  completedDesc: string;
  errorDesc: string;
  artisticDesc: string;
  stableDesc: string;
  cinematicDesc: string;
  vintageDesc: string;
  vibrantDesc: string;
  sepiaDesc: string;
  noneDesc: string;
  engineType: string;
  localEngine: string;
  opencvEngine: string;
  paddlehubEngine: string;
  localDesc: string;
  opencvDesc: string;
  paddlehubDesc: string;
}