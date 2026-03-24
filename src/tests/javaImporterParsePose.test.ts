import { describe, it, expect } from "vitest";
import { importJavaProject } from "../utils/javaImporter";

describe("parsePoseCreation", () => {
  it("parses new Pose(56.000, 8.000, Math.toRadians(180.000))", () => {
    const javaCode = `
      package org.firstinspires.ftc.teamcode.Commands.AutoCommands;
      import com.pedropathing.follower.Follower;
      import com.pedropathing.geometry.Pose;

      public class TurtleTracerAutonomous extends OpMode {
        public void init() {
          follower.setStartingPose(new Pose(56.000, 8.000, Math.toRadians(180.000)));
        }
      }
    `;

    const data = importJavaProject(javaCode);
    expect(data.startPoint).toEqual(
      expect.objectContaining({
        x: 56,
        y: 8,
        heading: "constant",
        degrees: 180,
      }),
    );
  });
});
