export interface PathStep {
  deltaLength: number;
  radius: number;
  rotation: number; // Absolute rotation change in this step (degrees)
  heading: number; // Unwrapped heading at END of step
}

export interface PathAnalysis {
  length: number;
  minRadius: number;
  tangentRotation: number;
  netRotation: number; // Signed net rotation
  steps: PathStep[];
  startHeading: number; // Unwrapped
}
