interface BasePoint {
  x: number;
  y: number;
  locked?: boolean;
}

export type TimelineEventType = "travel" | "wait";

export interface TimelineEvent {
  type: TimelineEventType;
  duration: number;
  startTime: number;
  endTime: number;

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
  endPoint: Point;
  controlPoints: ControlPoint[];
  color: string;
  name?: string;
  eventMarkers?: EventMarker[];
  locked?: boolean;
}

interface Settings {
  xVelocity: number;
  yVelocity: number;
  aVelocity: number;
  kFriction: number;
  rWidth: number;
  rHeight: number;
  safetyMargin: number;
  maxVelocity: number; // inches/sec
  maxAcceleration: number; // inches/sec²
  maxDeceleration?: number; // inches/sec²
  fieldMap: string;
  robotImage?: string;
  theme: "light" | "dark" | "auto";
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
