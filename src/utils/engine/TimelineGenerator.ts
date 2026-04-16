import type { ContinuousTimeline, KinematicState, TimelineEvent, EventMarker } from "../../types";
import type { IntegratedState } from "./KinematicIntegrator";
import type { PreprocessedItem } from "./SequencePreprocessor";

export class TimelineGenerator {
  constructor(private samplingIntervalMs: number = 10) {}

  public generate(
    clustersData: Array<{ states: IntegratedState[], events: Array<{t: number, marker: EventMarker, lineIndex: number}> }>,
    waitRotateItems: PreprocessedItem[]
  ): ContinuousTimeline {
    const timeline: ContinuousTimeline = { states: [], events: [] };
    let globalTime = 0;
    for (const cluster of clustersData) {
      if (cluster.states.length === 0) continue;
      const startTime = globalTime;
      const lastState = cluster.states[cluster.states.length - 1];
      const clusterDuration = lastState.time;
      for (let t = 0; t <= clusterDuration; t += (this.samplingIntervalMs / 1000)) {
        let matched = cluster.states[cluster.states.length - 1];
        for (let i = 0; i < cluster.states.length - 1; i++) {
          if (t >= cluster.states[i].time && t <= cluster.states[i+1].time) {
             matched = cluster.states[i];
             break;
          }
        }
        timeline.states.push({
          time: globalTime + t,
          position: { x: matched.x, y: matched.y } as any,
          velocity: matched.velocity,
          acceleration: matched.acceleration,
          heading: matched.heading,
          angularVelocity: matched.angularVelocity
        });
      }
      for (const e of cluster.events) {
         let eventTime = 0;
         for (const st of cluster.states) {
            if (st.lineIndex === e.lineIndex && st.spatialPercent >= e.t) { eventTime = st.time; break; }
         }
         timeline.events.push({
            type: "travel", startTime: startTime + eventTime, duration: 0, endTime: startTime + eventTime, startHeading: 0
         } as any);
      }
      // Create travel events for each line in the cluster
      let currentLineStart = startTime;
      let lastLineIdx = -1;
      for (const st of cluster.states) {
         if (st.lineIndex !== lastLineIdx) {
            if (lastLineIdx !== -1) {
               timeline.events.push({
                 type: "travel",
                 startTime: currentLineStart,
                 endTime: startTime + st.time,
                 duration: (startTime + st.time) - currentLineStart,
                 lineIndex: lastLineIdx
               } as any);
            }
            lastLineIdx = st.lineIndex;
            currentLineStart = startTime + st.time;
         }
      }
      if (lastLineIdx !== -1) {
         timeline.events.push({
           type: "travel",
           startTime: currentLineStart,
           endTime: startTime + clusterDuration,
           duration: (startTime + clusterDuration) - currentLineStart,
           lineIndex: lastLineIdx
         } as any);
      }
      globalTime += clusterDuration;
    }
    for (const item of waitRotateItems) {
       if ((item as any).type === "wait") {
          const dur = (item as any).duration || 0;
          const end = globalTime + (dur / 1000);
          const lastState = timeline.states.length > 0 ? timeline.states[timeline.states.length - 1] : null;
          for (let t = globalTime; t <= end; t += (this.samplingIntervalMs / 1000)) {
            timeline.states.push({
              time: t,
              position: lastState ? lastState.position : { x: 0, y: 0 } as any,
              velocity: 0, acceleration: 0, heading: lastState ? lastState.heading : 0, angularVelocity: 0
            });
          }
          timeline.events.push({
            type: "wait", startTime: globalTime, endTime: end, duration: dur / 1000,
            atPoint: lastState ? { ...lastState.position } as any : undefined,
            startHeading: lastState ? lastState.heading : 0
          } as any);
          globalTime = end;
       }
    }
    timeline.events.sort((a, b) => (a as any).startTime - (b as any).startTime);
    return timeline;
  }
}