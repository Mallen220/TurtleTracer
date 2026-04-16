import type { Line, Point, SequenceItem, TurtleData } from "../../types";
import { SequencePreprocessor } from "./SequencePreprocessor";
import { SpatialAggregator } from "./SpatialAggregator";
import { KinematicIntegrator } from "./KinematicIntegrator";
import { TimelineGenerator } from "./TimelineGenerator";
import { HeadingInterpolator, TangentialStrategy, LinearStrategy, ConstantStrategy, FacingPointStrategy, PiecewiseStrategy } from "./HeadingInterpolator";

export * from "./SequencePreprocessor";
export * from "./SpatialAggregator";
export * from "./HeadingInterpolator";
export * from "./KinematicIntegrator";
export * from "./TimelineGenerator";

export function calculatePipelineTimePrediction(
  startPoint: Point,
  lines: Line[],
  settings: any,
  sequence?: SequenceItem[],
  macros?: Map<string, TurtleData>
): any {
  const activeSequence = (sequence && sequence.length > 0) ? sequence : lines.map((l, i) => ({ type: "travel", lineIndices: [i], isChain: l.isChain } as any));
  const preprocessor = new SequencePreprocessor(macros);
  const items = preprocessor.process(activeSequence, false);
  const aggregator = new SpatialAggregator();
  const { clusters, waitRotateItems } = aggregator.aggregate(items, startPoint, lines);
  const maxVel = Math.max(Number(settings?.maxVelocity) || 60, 0.1);
  const maxAccel = Math.max(Number(settings?.maxAcceleration) || 40, 0.1);
  const maxAngVel = Math.max(Number(settings?.maxAngularVelocity) || 2.0, 0.1);
  const maxAngAccel = Math.max(Number(settings?.maxAngularAcceleration) || 2.0, 0.1);
  const trackWidth = Number(settings?.trackWidth) || 16;
  const kFriction = Number(settings?.friction) || 1.0;
  const integrator = new KinematicIntegrator(maxVel, maxAccel, maxAngVel, maxAngAccel, trackWidth, kFriction);
  const clusterOutputs = [];
  for (const cluster of clusters) {
    let strat: HeadingInterpolator = new TangentialStrategy();
    if (cluster.lines.length > 0) {
       const end = cluster.lines[cluster.lines.length - 1].endPoint;
       if (end.heading === "tangential") strat = new TangentialStrategy(end.reverse);
       else if (end.heading === "constant") strat = new ConstantStrategy(end.degrees || 0);
       else if (end.heading === "linear") strat = new LinearStrategy(end.startDeg || 0, end.endDeg || 0);
       else if (end.heading === "facingPoint") strat = new FacingPointStrategy(end.reverse);
    }
    const states = integrator.integrate(cluster, strat);
    clusterOutputs.push({ states, events: cluster.events });
  }
  const generator = new TimelineGenerator(10);
  const timeline = generator.generate(clusterOutputs, waitRotateItems);
  let totalTime = 0;
  if (timeline.states.length > 0) {
    totalTime = timeline.states[timeline.states.length - 1].time * 1000;
  }
  return {
    totalTime,
    segmentTimes: clusters.map(() => 0),
    totalDistance: clusters.reduce((acc, c) => acc + c.totalLength, 0),
    timeline: timeline.states.length > 0 ? timeline.events : [],
    continuousTimeline: timeline
  };
}