interface BasePoint {
  x: number;
  y: number;
  locked?: boolean;
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

interface FPALine {
  startPoint: Point;
  endPoint: Point;
  controlPoints: ControlPoint[];
  interpolation: String;
  color: string;
  name?: string;
}

interface FPASettings {
  xVelocity: number;
  yVelocity: number;
  aVelocity: number;
  kFriction: number;
  rWidth: number;
  rHeight: number;
  safetyMargin: number;
  
}

interface Shape {
  id: string;
  name?: string;
  vertices: BasePoint[];
  color: string;
  fillColor: string;
}

interface FileInfo {
  name: string;
  path: string;
  size: number;
  modified: Date;
}

interface TimePrediction {
  totalTime: number;
  segmentTimes: number[];
  totalDistance: number;
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
