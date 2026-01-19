export type Language = 'en' | 'he' | 'zh' | 'hi' | 'de' | 'es' | 'fr';

export interface ImageItem {
  id: string;
  file: File;
  previewUrl: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  resultUrl?: string;
  error?: string;
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
  languageName: string;
  languageSelect: string;
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
}