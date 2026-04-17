// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
export interface PathStep {
  deltaLength: number;
  radius: number;
  rotation: number;
  heading: number;
}

export interface PathAnalysis {
  length: number;
  minRadius: number;
  tangentRotation: number;
  netRotation: number;
  steps: PathStep[];
  startHeading: number;
}
