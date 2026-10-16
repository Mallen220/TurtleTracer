// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
/// <reference path="../turtle.d.ts" />
// A new kind of step. Turtle Tracer draws its settings, times it from the
// "seconds" field, and asks for its code when the routine is exported.

turtle.actions.register({
  name: "intake",
  label: "Intake",
  color: "#0d9488",
  fields: [
    {
      key: "seconds",
      type: "number",
      unit: "time",
      label: "Run for",
      min: 0,
      step: 0.1,
      default: 0.8,
    },
    {
      key: "power",
      type: "number",
      label: "Power",
      help: "From -1 (backwards) to 1.",
      min: -1,
      max: 1,
      step: 0.05,
      default: 1,
    },
  ],
  timing: { secondsFrom: "seconds" },
  code: {
    // For the command-based exporter: one command.
    sequential({ step }) {
      const ms = Math.round(Number(step.data.seconds) * 1000);
      return `new RunIntake(intake, ${Number(step.data.power)}).withTimeout(${ms})`;
    },
    // For the state-machine exporter: start the intake, then stop it once
    // the time is up.
    java({ step, state }) {
      const ms = Math.round(Number(step.data.seconds) * 1000);
      const code = `
        case ${state}:
          intake.setPower(${Number(step.data.power)});
          setPathState(${state + 1});
          break;

        case ${state + 1}:
          if (pathTimer.milliseconds() > ${ms}) {
            intake.setPower(0);
            setPathState(${state + 2});
          }
          break;`;
      return { code, states: 2 };
    },
  },
});
