// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
/// <reference path="./turtle.d.ts" />

turtle.registerMetadata({
  description: "Exports the path as a comma-separated values (CSV) file.",
});

turtle.registerExporter("Custom CSV", async (data) => {
  const isTelemetry = await turtle.ui.confirm({
    title: "CSV Export Mode",
    message:
      "Would you like to export this data formatted as a Telemetry Mockup (with simulated times)?",
    confirmText: "Telemetry Mode",
    cancelText: "Standard Mode",
  });

  if (isTelemetry) {
    let csv = "time,x,y,heading\n";
    let time = 0.0;

    if (data.startPoint) {
      const h =
        data.startPoint.heading === "constant" ? data.startPoint.degrees : 0;
      csv += `${time.toFixed(2)},${data.startPoint.x},${data.startPoint.y},${h}\n`;
    }

    if (data.lines) {
      let prevPoint = data.startPoint;
      data.lines.forEach((line) => {
        if (prevPoint) {
          const distance = Math.hypot(
            line.endPoint.x - prevPoint.x,
            line.endPoint.y - prevPoint.y,
          );
          // Simulate 20 inches/sec for reasonable telemetry times
          time += distance / 20.0;
        } else {
          time += 1.0;
        }

        const h =
          line.endPoint.heading === "constant" ? line.endPoint.degrees : 0;
        csv += `${time.toFixed(2)},${line.endPoint.x},${line.endPoint.y},${h}\n`;
        prevPoint = line.endPoint;
      });
    }
    return csv;
  } else {
    let csv = "Type,X,Y,Heading\n";
    if (data.startPoint) {
      const h =
        data.startPoint.heading === "constant"
          ? data.startPoint.degrees
          : "Tangential";
      csv += `Start,${data.startPoint.x},${data.startPoint.y},${h}\n`;
    }
    if (data.lines) {
      data.lines.forEach((line) => {
        const h =
          line.endPoint.heading === "constant"
            ? line.endPoint.degrees
            : "Tangential";
        csv += `Point,${line.endPoint.x},${line.endPoint.y},${h}\n`;
      });
    }
    return csv;
  }
});
