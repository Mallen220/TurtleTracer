// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
declare global {
  interface Window {
    electronAPI: {
      getDirectory: () => Promise<string>;
      setDirectory: (path?: string) => Promise<string | null>;
      listFiles: (directory: string) => Promise<FileInfo[]>;
      readFile: (filePath: string) => Promise<string>;
      writeFile: (filePath: string, content: string) => Promise<boolean>;
      deleteFile: (filePath: string) => Promise<boolean>;
      fileExists: (filePath: string) => Promise<boolean>;
      getSavedDirectory: () => Promise<string>;
      createDirectory: (dirPath: string) => Promise<boolean>;
      getDirectoryStats: (dirPath: string) => Promise<any>;
      resolvePath: (base: string, relative: string) => Promise<string>;
      renameFile: (
        oldPath: string,
        newPath: string,
      ) => Promise<{ success: boolean; newPath: string }>;
      openExternal?: (url: string) => Promise<boolean>;
      onMenuAction?: (callback: (action: string) => void) => void;
      showSaveDialog?: (options: any) => Promise<string | null>;
      rendererReady?: () => Promise<void>;
      onOpenFilePath?: (callback: (path: string) => void) => void;
      saveFile?: (
        content: string,
        path?: string,
      ) => Promise<{ success: boolean; filepath: string; error?: string }>;
      copyFile?: (src: string, dest: string) => Promise<boolean>;
      gitShow?: (filePath: string) => Promise<string | null>;
    };
  }
}

interface BasePoint {
  x: number;
  y: number;
  locked?: boolean;
}

interface WaitSegment {
  name?: string;
  durationMs: number;
  position?: "before" | "after";
}

export type TimelineEventType = "travel" | "wait";

export interface TimelineEvent {
  type: TimelineEventType;
  duration: number;
  startTime: number;
  endTime: number;
  name?: string;
  waitPosition?: "before" | "after";

  // For 'travel' events
  lineIndex?: number;

  // For 'wait/rotate' events
  startHeading?: number;
  targetHeading?: number;
  atPoint?: BasePoint;
}

interface TimePrediction {
  totalTime: number;
  segmentTimes: number[];
  totalDistance: number;
  timeline: TimelineEvent[];
}

type Point = BasePoint &
  (
    | {
        heading: "linear";
        startDeg: number;
        endDeg: number;
        degrees?: never;
        reverse?: never;
      }
    | {
        heading: "constant";
        degrees: number;
        startDeg?: never;
        endDeg?: never;
        reverse?: never;
      }
    | {
        heading: "tangential";
        degrees?: never;
        startDeg?: never;
        endDeg?: never;
        reverse: boolean;
      }
  );

type ControlPoint = BasePoint;

interface Line {
  id?: string;
  endPoint: Point;
  controlPoints: ControlPoint[];
  color: string;
  name?: string;
  eventMarkers?: EventMarker[];
  locked?: boolean;
  waitBefore?: WaitSegment;
  waitAfter?: WaitSegment;
  waitBeforeMs?: number;
  waitAfterMs?: number;
  waitBeforeName?: string;
  waitAfterName?: string;
}

type SequencePathItem = {
  kind: "path";
  lineId: string;
};

type SequenceWaitItem = {
  kind: "wait";
  id: string;
  name: string;
  durationMs: number;
};

type SequenceRotateItem = {
  kind: "rotate";
  id: string;
  name: string;
  degrees: number;
  locked?: boolean;
};

type SequenceItem = SequencePathItem | SequenceWaitItem | SequenceRotateItem;

interface KeyBinding {
  id: string;
  key: string;
  description: string;
  action: string;
  category?: string;
}

interface Settings {
  xVelocity: number;
  yVelocity: number;
  aVelocity: number;
  kFriction: number;
  rWidth: number;
  rHeight: number;
  // added rLength for consistency with usage
  rLength?: number;
  safetyMargin: number;
  maxVelocity: number; // inches/sec
  maxAcceleration: number; // inches/sec²
  maxDeceleration?: number; // inches/sec²
  fieldMap: string;
  fieldRotation?: number; // degrees
  robotImage?: string;
  theme: "light" | "dark" | "auto";
  autosaveMode?: "time" | "change" | "close" | "never";
  autosaveInterval?: number; // minutes
  javaPackageName?: string;
  showVelocityHeatmap?: boolean;
  showOnionLayers?: boolean;
  onionLayerSpacing?: number;
  optimizationIterations?: number;
  optimizationPopulationSize?: number;
  optimizationMutationRate?: number;
  optimizationMutationStrength?: number;
  validateFieldBoundaries?: boolean;
  restrictDraggingToField?: boolean;
  keyBindings?: KeyBinding[];
  recentFiles?: string[];
  lastSeenVersion?: string;
  fileManagerSortMode?: "name" | "date";
}

function getDefaultSettings(): Settings {
  return {
    xVelocity: 10,
    yVelocity: 10,
    aVelocity: 5,
    kFriction: 0.1,
    rWidth: 18,
    rHeight: 18,
    safetyMargin: 2,
    maxVelocity: 50,
    maxAcceleration: 10,
    maxDeceleration: 8,
  };
}

function saveSettings(settings: Settings): void {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function loadSettings(): Settings {
  if (!fs.existsSync(SETTINGS_FILE)) {
    const defaultSettings = getDefaultSettings();
    saveSettings(defaultSettings);
    return defaultSettings;
  }

  const fileContent = fs.readFileSync(SETTINGS_FILE, "utf-8");
  const savedSettings = JSON.parse(fileContent) as Partial<Settings>;

  // Merge saved settings with defaults to include new settings
  return { ...getDefaultSettings(), ...savedSettings };
}

export const settings = loadSettings();

interface Shape {
  id: string;
  name?: string;
  vertices: BasePoint[];
  color: string;
  fillColor: string;
  locked?: boolean;
}

interface EventMarker {
  id: string;
  name: string;
  position: number; // 0-1 within the path segment
  lineIndex: number;
  parameters?: Record<string, any>; // Optional parameters for the command
}

interface NamedCommand {
  name: string;
  description?: string;
  parameters?: string[]; // Parameter names
}

interface DirectorySettings {
  autoPathsDirectory: string;
}

interface FileInfo {
  name: string;
  path: string;
  size: number;
  modified: Date;
  error?: string;
}
