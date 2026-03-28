// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Line, Point, BasePoint } from "../types";

export function getAlignmentMenuItems(
  multiSel: string[],
  startPoint: Point,
  lines: Line[],
  onUpdate: (newLines: Line[], newStartPoint: Point) => void,
  onRecordChange: (action?: string) => void
) {
  let menuItems: any[] = [];

  menuItems.push({ label: `Selected Points: ${multiSel.length}`, disabled: true });
  menuItems.push({ separator: true });

  menuItems.push({
    label: "Align Horizontal (Y)",
    onClick: () => {
      let sumY = 0;
      let count = 0;
      const pointsToUpdate: { point: BasePoint; isStart: boolean }[] = [];

      multiSel.forEach((id) => {
        const parts = id.split("-");
        const lineNum = Number(parts[1]);
        const ptIdx = Number(parts[2]);

        if (lineNum === 0 && ptIdx === 0) {
          if (!startPoint.locked) {
            sumY += startPoint.y;
            count++;
            pointsToUpdate.push({ point: startPoint, isStart: true });
          }
        } else {
          const line = lines[lineNum - 1];
          if (line && !line.locked) {
            let p: BasePoint;
            if (ptIdx === 0) p = line.endPoint;
            else p = line.controlPoints[ptIdx - 1];
            if (p) {
              sumY += p.y;
              count++;
              pointsToUpdate.push({ point: p, isStart: false });
            }
          }
        }
      });

      if (count > 0) {
        const avgY = sumY / count;
        pointsToUpdate.forEach((item) => {
          item.point.y = avgY;
        });
        onUpdate(lines, startPoint);
        onRecordChange("Align Horizontal");
      }
    },
  });

  menuItems.push({
    label: "Align Vertical (X)",
    onClick: () => {
      let sumX = 0;
      let count = 0;
      const pointsToUpdate: { point: BasePoint; isStart: boolean }[] = [];

      multiSel.forEach((id) => {
        const parts = id.split("-");
        const lineNum = Number(parts[1]);
        const ptIdx = Number(parts[2]);

        if (lineNum === 0 && ptIdx === 0) {
          if (!startPoint.locked) {
            sumX += startPoint.x;
            count++;
            pointsToUpdate.push({ point: startPoint, isStart: true });
          }
        } else {
          const line = lines[lineNum - 1];
          if (line && !line.locked) {
            let p: BasePoint;
            if (ptIdx === 0) p = line.endPoint;
            else p = line.controlPoints[ptIdx - 1];
            if (p) {
              sumX += p.x;
              count++;
              pointsToUpdate.push({ point: p, isStart: false });
            }
          }
        }
      });

      if (count > 0) {
        const avgX = sumX / count;
        pointsToUpdate.forEach((item) => {
          item.point.x = avgX;
        });
        onUpdate(lines, startPoint);
        onRecordChange("Align Vertical");
      }
    },
  });

  if (multiSel.length > 2) {
    menuItems.push({
      label: "Distribute Horizontally (X)",
      onClick: () => {
        const pointsToUpdate: { point: BasePoint; isStart: boolean }[] = [];

        multiSel.forEach((id) => {
          const parts = id.split("-");
          const lineNum = Number(parts[1]);
          const ptIdx = Number(parts[2]);

          if (lineNum === 0 && ptIdx === 0) {
            if (!startPoint.locked) {
              pointsToUpdate.push({ point: startPoint, isStart: true });
            }
          } else {
            const line = lines[lineNum - 1];
            if (line && !line.locked) {
              let p: BasePoint;
              if (ptIdx === 0) p = line.endPoint;
              else p = line.controlPoints[ptIdx - 1];
              if (p) {
                pointsToUpdate.push({ point: p, isStart: false });
              }
            }
          }
        });

        if (pointsToUpdate.length > 2) {
          pointsToUpdate.sort((a, b) => a.point.x - b.point.x);
          const minX = pointsToUpdate[0].point.x;
          const maxX = pointsToUpdate[pointsToUpdate.length - 1].point.x;
          const step = (maxX - minX) / (pointsToUpdate.length - 1);

          pointsToUpdate.forEach((item, index) => {
            if (index > 0 && index < pointsToUpdate.length - 1) {
              item.point.x = minX + step * index;
            }
          });

          onUpdate(lines, startPoint);
          onRecordChange("Distribute Horizontally");
        }
      },
    });

    menuItems.push({
      label: "Distribute Vertically (Y)",
      onClick: () => {
        const pointsToUpdate: { point: BasePoint; isStart: boolean }[] = [];

        multiSel.forEach((id) => {
          const parts = id.split("-");
          const lineNum = Number(parts[1]);
          const ptIdx = Number(parts[2]);

          if (lineNum === 0 && ptIdx === 0) {
            if (!startPoint.locked) {
              pointsToUpdate.push({ point: startPoint, isStart: true });
            }
          } else {
            const line = lines[lineNum - 1];
            if (line && !line.locked) {
              let p: BasePoint;
              if (ptIdx === 0) p = line.endPoint;
              else p = line.controlPoints[ptIdx - 1];
              if (p) {
                pointsToUpdate.push({ point: p, isStart: false });
              }
            }
          }
        });

        if (pointsToUpdate.length > 2) {
          pointsToUpdate.sort((a, b) => a.point.y - b.point.y);
          const minY = pointsToUpdate[0].point.y;
          const maxY = pointsToUpdate[pointsToUpdate.length - 1].point.y;
          const step = (maxY - minY) / (pointsToUpdate.length - 1);

          pointsToUpdate.forEach((item, index) => {
            if (index > 0 && index < pointsToUpdate.length - 1) {
              item.point.y = minY + step * index;
            }
          });

          onUpdate(lines, startPoint);
          onRecordChange("Distribute Vertically");
        }
      },
    });
  }

  return menuItems;
}
