<script lang="ts">
  import * as d3 from "d3";
  import { onMount, tick } from "svelte";
  import { currentFilePath, isUnsaved } from "./stores";
  import Two from "two.js";
  import type { Path } from "two.js/src/path";
  import type { Line as PathLine } from "two.js/src/shapes/line";
  import ControlTab from "./lib/ControlTab.svelte";
  import Navbar from "./lib/Navbar.svelte";
  import MathTools from "./lib/MathTools.svelte";
  import _ from "lodash";
  import hotkeys from "hotkeys-js";
  import { createAnimationController } from "./utils/animation";
  import { calculatePathTime, getAnimationDuration } from "./utils";

  import {
    easeInOutQuad,
    getCurvePoint,
    getMousePos,
    getRandomColor,
    quadraticToCubic,
    radiansToDegrees,
    shortestRotation,
    downloadTrajectory,
    loadTrajectoryFromFile,
    loadRobotImage,
    updateRobotImageDisplay,
  } from "./utils";
  import {
    POINT_RADIUS,
    LINE_WIDTH,
    DEFAULT_ROBOT_WIDTH,
    DEFAULT_ROBOT_HEIGHT,
    DEFAULT_FPA_SETTINGS,
    FIELD_SIZE,
    getDefaultStartPoint,
    getDefaultLines,
    getDefaultShapes,
  } from "./config";

  // Electron API type (defined in preload.js, attached to window)
  interface ElectronAPI {
    writeFile: (filePath: string, content: string) => Promise<boolean>;
  }

  // Access electron API from window (attached by preload script)
  const electronAPI = (window as any).electronAPI as ElectronAPI | undefined;

  // Canvas state
  let two: Two;
  let twoElement: HTMLDivElement;
  let width = 0;
  let height = 0;

  // Robot state
  let robotWidth = DEFAULT_ROBOT_WIDTH;
  let robotHeight = DEFAULT_ROBOT_HEIGHT;
  let robotXY: BasePoint = { x: 0, y: 0 };
  let robotHeading: number = 0;

  // Animation state
  let percent: number = 0;
  let playing = false;
  let animationFrame: number;
  let startTime: number | null = null;
  let previousTime: number | null = null;

  // Path data
  let settings: FPASettings = { ...DEFAULT_FPA_SETTINGS };
  let startPoint: Point = getDefaultStartPoint();
  let lines: Line[] = getDefaultLines();
  let shapes: Shape[] = getDefaultShapes();

  // Two.js groups
  let lineGroup = new Two.Group();
  lineGroup.id = "line-group";
  let pointGroup = new Two.Group();
  pointGroup.id = "point-group";
  let shapeGroup = new Two.Group();
  shapeGroup.id = "shape-group";

  // Coordinate converters
  let x: d3.ScaleLinear<number, number, number>;

  // Animation controller
  let loopAnimation = false;
  let animationController: ReturnType<typeof createAnimationController>;
  $: timePrediction = calculatePathTime(startPoint, lines, settings);
  $: animationDuration = getAnimationDuration(timePrediction.totalTime);

  /**
   * Converter for X axis from inches to pixels.
   */
  $: x = d3
    .scaleLinear()
    .domain([0, FIELD_SIZE])
    .range([0, width || FIELD_SIZE]);

  /**
   * Converter for Y axis from inches to pixels.
   */
  $: y = d3
    .scaleLinear()
    .domain([0, FIELD_SIZE])
    .range([height || FIELD_SIZE, 0]);

  $: points = (() => {
    let _points = [];
    let startPointElem = new Two.Circle(
      x(startPoint.x),
      y(startPoint.y),
      x(POINT_RADIUS),
    );
    startPointElem.id = `point-0-0`;
    startPointElem.fill = lines[0].color;
    startPointElem.noStroke();

    _points.push(startPointElem);

    lines.forEach((line, idx) => {
      [line.endPoint, ...line.controlPoints].forEach((point, idx1) => {
        if (idx1 > 0) {
          let pointGroup = new Two.Group();
          pointGroup.id = `point-${idx + 1}-${idx1}`;

          let pointElem = new Two.Circle(
            x(point.x),
            y(point.y),
            x(POINT_RADIUS),
          );
          pointElem.id = `point-${idx + 1}-${idx1}-background`;
          pointElem.fill = line.color;
          pointElem.noStroke();

          let pointText = new Two.Text(
            `${idx1}`,
            x(point.x),
            y(point.y - 0.15),
            x(POINT_RADIUS),
          );
          pointText.id = `point-${idx + 1}-${idx1}-text`;
          pointText.size = x(1.55);
          pointText.leading = 1;
          pointText.family = "ui-sans-serif, system-ui, sans-serif";
          pointText.alignment = "center";
          pointText.baseline = "middle";
          pointText.fill = "white";
          pointText.noStroke();

          pointGroup.add(pointElem, pointText);
          _points.push(pointGroup);
        } else {
          let pointElem = new Two.Circle(
            x(point.x),
            y(point.y),
            x(POINT_RADIUS),
          );
          pointElem.id = `point-${idx + 1}-${idx1}`;
          pointElem.fill = line.color;
          pointElem.noStroke();
          _points.push(pointElem);
        }
      });
    });

    // Add obstacle vertices as draggable points
    shapes.forEach((shape, shapeIdx) => {
      shape.vertices.forEach((vertex, vertexIdx) => {
        let pointGroup = new Two.Group();
        pointGroup.id = `obstacle-${shapeIdx}-${vertexIdx}`;

        let pointElem = new Two.Circle(
          x(vertex.x),
          y(vertex.y),
          x(POINT_RADIUS),
        );
        pointElem.id = `obstacle-${shapeIdx}-${vertexIdx}-background`;
        pointElem.fill = "#991b1b"; // Match obstacle color
        pointElem.noStroke();

        let pointText = new Two.Text(
          `${vertexIdx + 1}`,
          x(vertex.x),
          y(vertex.y - 0.15),
          x(POINT_RADIUS),
        );
        pointText.id = `obstacle-${shapeIdx}-${vertexIdx}-text`;
        pointText.size = x(1.55);
        pointText.leading = 1;
        pointText.family = "ui-sans-serif, system-ui, sans-serif";
        pointText.alignment = "center";
        pointText.baseline = "middle";
        pointText.fill = "white";
        pointText.noStroke();

        pointGroup.add(pointElem, pointText);
        _points.push(pointGroup);
      });
    });

    return _points;
  })();

  $: path = (() => {
    let _path: (Path | PathLine)[] = [];

    lines.forEach((line, idx) => {
      let _startPoint = idx === 0 ? startPoint : lines[idx - 1].endPoint;

      let lineElem: Path | PathLine;
      if (line.controlPoints.length > 2) {
        // Approximate an n-degree bezier curve by sampling it at 100 points
        const samples = 100;
        const cps = [_startPoint, ...line.controlPoints, line.endPoint];
        let points = [
          new Two.Anchor(
            x(_startPoint.x),
            y(_startPoint.y),
            0,
            0,
            0,
            0,
            Two.Commands.move,
          ),
        ];
        for (let i = 1; i <= samples; ++i) {
          const point = getCurvePoint(i / samples, cps);
          points.push(
            new Two.Anchor(
              x(point.x),
              y(point.y),
              0,
              0,
              0,
              0,
              Two.Commands.line,
            ),
          );
        }
        points.forEach((point) => (point.relative = false));

        lineElem = new Two.Path(points);
        lineElem.automatic = false;
      } else if (line.controlPoints.length > 0) {
        let cp1 = line.controlPoints[1]
          ? line.controlPoints[0]
          : quadraticToCubic(_startPoint, line.controlPoints[0], line.endPoint)
              .Q1;
        let cp2 =
          line.controlPoints[1] ??
          quadraticToCubic(_startPoint, line.controlPoints[0], line.endPoint)
            .Q2;

        let points = [
          new Two.Anchor(
            x(_startPoint.x),
            y(_startPoint.y),
            x(_startPoint.x),
            y(_startPoint.y),
            x(cp1.x),
            y(cp1.y),
            Two.Commands.move,
          ),
          new Two.Anchor(
            x(line.endPoint.x),
            y(line.endPoint.y),
            x(cp2.x),
            y(cp2.y),
            x(line.endPoint.x),
            y(line.endPoint.y),
            Two.Commands.curve,
          ),
        ];
        points.forEach((point) => (point.relative = false));

        lineElem = new Two.Path(points);
        lineElem.automatic = false;
      } else {
        lineElem = new Two.Line(
          x(_startPoint.x),
          y(_startPoint.y),
          x(line.endPoint.x),
          y(line.endPoint.y),
        );
      }

      lineElem.id = `line-${idx + 1}`;
      lineElem.stroke = line.color;
      lineElem.linewidth = x(LINE_WIDTH);
      lineElem.noFill();

      _path.push(lineElem);
    });

    return _path;
  })();

  $: shapeElements = (() => {
    let _shapes: Path[] = [];

    shapes.forEach((shape, idx) => {
      if (shape.vertices.length >= 3) {
        // Create polygon from vertices - properly format for Two.js
        let vertices = [];

        // Start with move command for first vertex
        vertices.push(
          new Two.Anchor(
            x(shape.vertices[0].x),
            y(shape.vertices[0].y),
            0,
            0,
            0,
            0,
            Two.Commands.move,
          ),
        );

        // Add line commands for remaining vertices
        for (let i = 1; i < shape.vertices.length; i++) {
          vertices.push(
            new Two.Anchor(
              x(shape.vertices[i].x),
              y(shape.vertices[i].y),
              0,
              0,
              0,
              0,
              Two.Commands.line,
            ),
          );
        }

        // Close the shape
        vertices.push(
          new Two.Anchor(
            x(shape.vertices[0].x),
            y(shape.vertices[0].y),
            0,
            0,
            0,
            0,
            Two.Commands.close,
          ),
        );

        vertices.forEach((point) => (point.relative = false));

        let shapeElement = new Two.Path(vertices);
        shapeElement.id = `shape-${idx}`;
        shapeElement.stroke = shape.color;
        shapeElement.fill = shape.color;
        shapeElement.opacity = 0.4;
        shapeElement.linewidth = x(0.8); // Make border more visible
        shapeElement.automatic = false;

        _shapes.push(shapeElement);
      }
    });

    return _shapes;
  })();

  let isLoaded = false;

  // Reactively trigger when any saveable data changes
  $: {
    if (isLoaded && (lines || shapes || startPoint || settings)) {
      isUnsaved.set(true);
    }
  }

  // Allow the app to stabilize before tracking changes
  onMount(() => {
    setTimeout(() => {
      isLoaded = true;
    }, 500);
  });

  // Initialize animation controller
  onMount(() => {
    animationController = createAnimationController(
      animationDuration,
      (newPercent) => {
        percent = newPercent;
      },
      () => {
        // Animation completed callback
        console.log("Animation completed");
        playing = false;
      },
    );
  });

  $: if (animationController) {
    animationController.setDuration(animationDuration);
  }

  // Update loop setting when it changes
  $: if (animationController) {
    animationController.setLoop(loopAnimation);
  }

  // Save Function
  async function saveProject() {
    if ($currentFilePath && electronAPI) {
      try {
        const jsonString = JSON.stringify({
          startPoint,
          lines,
          shapes,
          settings,
        });
        await electronAPI.writeFile($currentFilePath, jsonString);
        isUnsaved.set(false);
        console.log("Saved to", $currentFilePath);
      } catch (e) {
        console.error("Failed to save", e);
        alert("Failed to save file.");
      }
    } else {
      saveFile();
    }
  }

  // Keyboard shortcut for save
  hotkeys("cmd+s, ctrl+s", function (event, handler) {
    event.preventDefault();
    saveProject();
  });

  $: {
    let totalLineProgress =
      (lines.length * Math.min(percent, 99.999999999)) / 100;
    let currentLineIdx = Math.min(
      Math.trunc(totalLineProgress),
      lines.length - 1,
    );
    let currentLine = lines[currentLineIdx];

    let linePercent = easeInOutQuad(
      totalLineProgress - Math.floor(totalLineProgress),
    );
    let _startPoint =
      currentLineIdx === 0 ? startPoint : lines[currentLineIdx - 1].endPoint;
    let robotInchesXY = getCurvePoint(linePercent, [
      _startPoint,
      ...currentLine.controlPoints,
      currentLine.endPoint,
    ]);
    robotXY = { x: x(robotInchesXY.x), y: y(robotInchesXY.y) };

    switch (currentLine.endPoint.heading) {
      case "linear":
        robotHeading = -shortestRotation(
          currentLine.endPoint.startDeg,
          currentLine.endPoint.endDeg,
          linePercent,
        );
        break;
      case "constant":
        robotHeading = -currentLine.endPoint.degrees;
        break;
      case "tangential":
        const nextPointInches = getCurvePoint(
          linePercent + (currentLine.endPoint.reverse ? -0.01 : 0.01),
          [_startPoint, ...currentLine.controlPoints, currentLine.endPoint],
        );
        const nextPoint = { x: x(nextPointInches.x), y: y(nextPointInches.y) };

        const dx = nextPoint.x - robotXY.x;
        const dy = nextPoint.y - robotXY.y;

        if (dx !== 0 || dy !== 0) {
          const angle = Math.atan2(dy, dx);

          robotHeading = radiansToDegrees(angle);
        }

        break;
    }
  }

  $: (() => {
    if (!two) {
      return;
    }

    two.renderer.domElement.style["z-index"] = "30";
    two.renderer.domElement.style["position"] = "absolute";
    two.renderer.domElement.style["top"] = "0px";
    two.renderer.domElement.style["left"] = "0px";
    two.renderer.domElement.style["width"] = "100%";
    two.renderer.domElement.style["height"] = "100%";

    two.clear();

    two.add(...shapeElements);
    two.add(...path);
    two.add(...points);

    two.update();
  })();

  function animate(timestamp: number) {
    if (!startTime) {
      startTime = timestamp;
    }

    if (previousTime !== null) {
      const deltaTime = timestamp - previousTime;

      if (percent >= 100) {
        percent = 0;
      } else {
        percent += (0.65 / lines.length) * (deltaTime * 0.1);
      }
    }

    previousTime = timestamp;

    if (playing) {
      requestAnimationFrame(animate);
    }
  }

  function play() {
    animationController.play();
    playing = true;
  }

  function pause() {
    animationController.pause();
    playing = false;
  }

  function resetAnimation() {
    animationController.reset();
    playing = false;
  }

  // Handle slider changes
  function handleSeek(newPercent: number) {
    if (animationController) {
      animationController.seekToPercent(newPercent);
    }
  }

  onMount(() => {
    two = new Two({
      fitted: true,
      type: Two.Types.svg,
    }).appendTo(twoElement);

    updateRobotImageDisplay();

    let currentElem: string | null = null;
    let isDown = false;

    two.renderer.domElement.addEventListener("mousemove", (evt: MouseEvent) => {
      const elem = document.elementFromPoint(evt.clientX, evt.clientY);
      if (isDown && currentElem) {
        const { x: xPos, y: yPos } = getMousePos(evt, two.renderer.domElement);

        if (currentElem.startsWith("obstacle-")) {
          // Handle obstacle vertex dragging
          const parts = currentElem.split("-");
          const shapeIdx = Number(parts[1]);
          const vertexIdx = Number(parts[2]);

          shapes[shapeIdx].vertices[vertexIdx].x = x.invert(xPos);
          shapes[shapeIdx].vertices[vertexIdx].y = y.invert(yPos);
        } else {
          // Handle path point dragging
          const line = Number(currentElem.split("-")[1]) - 1;
          const point = Number(currentElem.split("-")[2]);

          if (line === -1) {
            startPoint.x = x.invert(xPos);
            startPoint.y = y.invert(yPos);
          } else {
            if (point === 0) {
              lines[line].endPoint.x = x.invert(xPos);
              lines[line].endPoint.y = y.invert(yPos);
            } else {
              lines[line].controlPoints[point - 1].x = x.invert(xPos);
              lines[line].controlPoints[point - 1].y = y.invert(yPos);
            }
          }
        }
      } else {
        if (elem?.id.startsWith("point") || elem?.id.startsWith("obstacle")) {
          two.renderer.domElement.style.cursor = "pointer";
          currentElem = elem.id;
        } else {
          two.renderer.domElement.style.cursor = "auto";
          currentElem = null;
        }
      }
    });
    two.renderer.domElement.addEventListener("mousedown", () => {
      isDown = true;
    });
    two.renderer.domElement.addEventListener("mouseup", () => {
      isDown = false;
    });
  });

  document.addEventListener("keydown", function (evt) {
    if (evt.code === "Space" && document.activeElement === document.body) {
      if (playing) {
        pause();
      } else {
        play();
      }
    }
  });

  function saveFile() {
    downloadTrajectory(startPoint, lines, shapes);
  }

  function loadFile(evt: Event) {
    loadTrajectoryFromFile(evt, (data) => {
      startPoint = data.startPoint;
      lines = data.lines;
      if (data.shapes) {
        shapes = data.shapes;
      }
    });
  }

  function loadRobot(evt: Event) {
    loadRobotImage(evt, () => updateRobotImageDisplay());
  }

  function addNewLine() {
    lines = [
      ...lines,
      {
        endPoint: {
          x: _.random(36, 108),
          y: _.random(36, 108),
          heading: "tangential",
          reverse: true,
        } as Point,
        controlPoints: [],
        color: getRandomColor(),
      },
    ];
  }

  function addControlPoint() {
    if (lines.length > 0) {
      const lastLine = lines[lines.length - 1];
      lastLine.controlPoints.push({
        x: _.random(36, 108),
        y: _.random(36, 108),
      });
    }
  }

  function removeControlPoint() {
    if (lines.length > 0) {
      const lastLine = lines[lines.length - 1];
      if (lastLine.controlPoints.length > 0) {
        lastLine.controlPoints.pop();
      }
    }
  }

  // Keyboard shortcuts for quick path editing
  hotkeys("w", function (event, handler) {
    event.preventDefault();
    addNewLine();
  });

  hotkeys("a", function (event, handler) {
    event.preventDefault();
    addControlPoint();
    two.update();
  });

  hotkeys("s", function (event, handler) {
    event.preventDefault();
    removeControlPoint();
    two.update();
  });
</script>

<Navbar
  bind:lines
  bind:startPoint
  bind:shapes
  bind:settings
  bind:robotWidth
  bind:robotHeight
  {saveFile}
  {loadFile}
  {loadRobot}
/>
<div
  class="w-screen h-screen pt-20 p-2 flex flex-row justify-center items-center gap-2"
>
  <div class="flex h-full justify-center items-center">
    <div
      bind:this={twoElement}
      bind:clientWidth={width}
      bind:clientHeight={height}
      class="h-full aspect-square rounded-lg shadow-md bg-neutral-50 dark:bg-neutral-900 relative overflow-clip"
    >
      <img
        src="/fields/decode.webp"
        alt="Field"
        class="absolute top-0 left-0 w-full h-full rounded-lg z-10 pointer-events-none"
      />
      <MathTools {x} {y} {twoElement} {robotXY} {robotHeading} />
      <img
        src={"/robot.png"}
        alt="Robot"
        style={`position: absolute; top: ${robotXY.y}px; left: ${robotXY.x}px; transform: translate(-50%, -50%) rotate(${robotHeading}deg); z-index: 20; width: ${x(robotWidth)}px; height: ${x(robotHeight)}px;`}
      />
    </div>
  </div>
  <ControlTab
    bind:playing
    {play}
    {pause}
    bind:startPoint
    bind:lines
    bind:robotWidth
    bind:robotHeight
    bind:settings
    bind:percent
    bind:robotXY
    bind:robotHeading
    bind:shapes
    {x}
    {y}
    {animationDuration}
    {handleSeek}
    bind:loopAnimation
    {resetAnimation}
  />
</div>
