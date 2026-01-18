// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
pedro.registerExporter("Custom CSV", (data) => {
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
});
