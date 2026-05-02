export interface MemoryPaths {
  sharedPath: string;
  taskPath: string;
}

export interface MemorySizeStatus {
  withinLimit: boolean;
  sizeBytes: number;
  thresholdBytes: number;
}