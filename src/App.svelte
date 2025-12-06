<script lang="ts">
  import * as d3 from "d3";
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

  import { calculateRobotState } from "./utils";
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
    DEFAULT_SETTINGS,
    FIELD_SIZE,
    getDefaultStartPoint,
    getDefaultLines,
    getDefaultShapes,
  } from "./config";
  import { loadSettings, saveSettings } from "./utils/settingsPersistence";
  import { onMount, tick } from "svelte";
  import { debounce } from "lodash";

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
  $: robotWidth = settings?.rWidth || DEFAULT_ROBOT_WIDTH;
  $: robotHeight = settings?.rHeight || DEFAULT_ROBOT_HEIGHT;
  let robotXY: BasePoint = { x: 0, y: 0 };
  let robotHeading: number = 0;

  // Animation state
  let percent: number = 0;
  let playing = false;
  let animationFrame: number;
  let startTime: number | null = null;
  let previousTime: number | null = null;

  // Path data
  let settings: Settings = { ...DEFAULT_SETTINGS };
  let startPoint: Point = getDefaultStartPoint();
  let lines: Line[] = getDefaultLines();
  let shapes: Shape[] = getDefaultShapes();

  $: {
    // Ensure arrays are reactive when items are added/removed
    lines = lines;
    shapes = shapes;
  }

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
  let loopAnimation = true;
  let animationController: ReturnType<typeof createAnimationController>;
  $: timePrediction = calculatePathTime(startPoint, lines, settings);
  $: animationDuration = getAnimationDuration(timePrediction.totalTime / 1000);

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

  $: {
    // Calculate robot state using the Timeline
    if (timePrediction && timePrediction.timeline && lines.length > 0) {
      const state = calculateRobotState(
        percent,
        timePrediction.timeline,
        lines,
        startPoint,
        x,
        y,
      );

      robotXY = { x: state.x, y: state.y };
      robotHeading = state.heading;
    } else {
      // Fallback for initialization
      robotXY = { x: x(startPoint.x), y: y(startPoint.y) };
      robotHeading = 0;
    }
  }

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

      // Add a dashed line for locked paths
      if (line.locked) {
        lineElem.dashes = [x(2), x(2)];
        lineElem.opacity = 0.7;
      } else {
        lineElem.dashes = [];
        lineElem.opacity = 1;
      }

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

  onMount(async () => {
    // Load saved settings
    const savedSettings = await loadSettings();
    settings = { ...savedSettings };

    // Update robot dimensions from loaded settings
    robotWidth = settings.rWidth;
    robotHeight = settings.rHeight;
  });

  // Debounced save function
  const debouncedSaveSettings = debounce(async (settingsToSave: Settings) => {
    await saveSettings(settingsToSave);
  }, 1000); // Save after 1 second of inactivity

  // Watch for settings changes and save
  $: {
    if (settings) {
      debouncedSaveSettings(settings);
    }
  }

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

  $: if (animationController) {
    animationController.setLoop(loopAnimation);
    // Sync UI state with controller
    playing = animationController.isPlaying();
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
    // This handles both 'travel' (movement) and 'wait' (stationary rotation) events.
    if (timePrediction && timePrediction.timeline && lines.length > 0) {
      const state = calculateRobotState(
        percent,
        timePrediction.timeline,
        lines,
        startPoint,
        x,
        y,
      );

      robotXY = { x: state.x, y: state.y };
      robotHeading = state.heading;
    } else {
      // Fallback for initialization or empty state
      robotXY = { x: x(startPoint.x), y: y(startPoint.y) };
      // Calculate initial heading based on start point settings
      if (startPoint.heading === "linear") robotHeading = -startPoint.startDeg;
      else if (startPoint.heading === "constant")
        robotHeading = -startPoint.degrees;
      else robotHeading = 0;
    }
  }

  $: eventMarkers = (() => {
    const markers = [];

    lines.forEach((line, lineIdx) => {
      if (line.eventMarkers && line.eventMarkers.length > 0) {
        line.eventMarkers.forEach((event, eventIdx) => {
          // Get the correct start point for this line
          const lineStart =
            lineIdx === 0 ? startPoint : lines[lineIdx - 1].endPoint;
          const curvePoints = [lineStart, ...line.controlPoints, line.endPoint];
          const eventPosition = getCurvePoint(event.position, curvePoints);

          // Create marker visualization
          const markerGroup = new Two.Group();
          markerGroup.id = `event-${lineIdx}-${eventIdx}`;

          // Create a circle for the marker
          const markerCircle = new Two.Circle(
            x(eventPosition.x),
            y(eventPosition.y),
            x(POINT_RADIUS * 1.3), // Slightly larger than normal points
          );
          markerCircle.id = `event-circle-${lineIdx}-${eventIdx}`;
          markerCircle.fill = "#8b5cf6"; // Purple color
          markerCircle.stroke = "#ffffff";
          markerCircle.linewidth = x(0.3);

          // Create a flag/icon inside
          const flagSize = x(1);
          const flagPoints = [
            new Two.Anchor(
              x(eventPosition.x),
              y(eventPosition.y) - flagSize / 2,
            ),
            new Two.Anchor(
              x(eventPosition.x) + flagSize / 2,
              y(eventPosition.y),
            ),
            new Two.Anchor(
              x(eventPosition.x),
              y(eventPosition.y) + flagSize / 2,
            ),
          ];
          const flag = new Two.Path(flagPoints, true);
          flag.fill = "#ffffff";
          flag.stroke = "none";
          flag.id = `event-flag-${lineIdx}-${eventIdx}`;

          markerGroup.add(markerCircle, flag);
          markers.push(markerGroup);
        });
      }
    });

    return markers;
  })();

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
    two.add(...eventMarkers);

    two.update();
  })();

  function saveFileAs() {
    downloadTrajectory(startPoint, lines, shapes);
  }

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
        const line = Number(currentElem.split("-")[1]) - 1;

        // Skip dragging if the line is locked
        if (line >= 0 && lines[line]?.locked) {
          return;
        }

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
            // This is the starting point
            if (startPoint.locked) return;
            startPoint.x = x.invert(xPos);
            startPoint.y = y.invert(yPos);
          } else {
            if (point === 0) {
              lines[line].endPoint.x = x.invert(xPos);
              lines[line].endPoint.y = y.invert(yPos);
            } else {
              if (lines[line]?.locked) return;
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

  async function loadFile(evt: Event) {
    const elem = evt.target as HTMLInputElement;
    const file = elem.files?.[0];

    if (!file) return;

    // Check if file is a .pp file
    if (!file.name.endsWith(".pp")) {
      alert("Please select a .pp file");
      // Reset the file input
      elem.value = "";
      return;
    }

    // If we're in Electron environment and have a current directory, copy the file
    if (electronAPI && $currentFilePath) {
      await loadFileWithCopy(file);
    } else {
      // Use the original load function for web or when no directory is set
      loadTrajectoryFromFile(evt, (data) => {
        startPoint = data.startPoint;
        lines = data.lines;
        if (data.shapes) {
          shapes = data.shapes;
        }
      });
    }

    // Reset the file input
    elem.value = "";
  }

  // New function to handle file copying in Electron
  async function loadFileWithCopy(file: File) {
    try {
      // Read the file content
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string;
          const data = JSON.parse(content);

          // Get the current directory from the current file path
          const currentDir = $currentFilePath
            ? $currentFilePath.substring(0, $currentFilePath.lastIndexOf("/"))
            : await electronAPI.getDirectory();

          // Create the destination path
          const destPath = currentDir + "/" + file.name;

          // Check if file already exists in the directory
          const exists = await electronAPI.fileExists(destPath);

          if (exists) {
            // Ask for confirmation to overwrite
            const overwrite = confirm(
              `File "${file.name}" already exists in the current directory. Overwrite?`,
            );
            if (!overwrite) {
              // User cancelled - just load without copying
              loadData(data);
              return;
            }
          }

          // Copy the file to the current directory
          await electronAPI.writeFile(destPath, content);

          // Load the data into the app
          loadData(data);

          // Update the current file path to the newly loaded file
          currentFilePath.set(destPath);

          console.log(`File copied to: ${destPath}`);
        } catch (error) {
          console.error("Error processing file:", error);
          alert("Error loading file: " + error.message);
        }
      };

      reader.onerror = () => {
        alert("Error reading file");
      };

      reader.readAsText(file);
    } catch (error) {
      console.error("Error in loadFileWithCopy:", error);
      alert("Error loading file: " + error.message);
    }
  }

  // Helper function to load data into app state
  function loadData(data: any) {
    startPoint = data.startPoint;
    lines = data.lines;
    if (data.shapes) {
      shapes = data.shapes;
    }
    isUnsaved.set(false);
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
        locked: false,
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
  {saveProject}
  {saveFileAs}
  {loadFile}
  {loadRobot}
/>
<!--   {saveFile} -->
<div
  class="w-screen h-screen pt-20 p-2 flex flex-row justify-center items-center gap-2"
>
  <div class="flex h-full justify-center items-center">
    <div
      bind:this={twoElement}
      bind:clientWidth={width}
      bind:clientHeight={height}
      class="h-full aspect-square rounded-lg shadow-md bg-neutral-50 dark:bg-neutral-900 relative overflow-clip"
      style="
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    user-drag: none;
    -webkit-user-drag: none;
  "
    >
      <img
        src={settings.fieldMap
          ? `/fields/${settings.fieldMap}`
          : "/fields/decode.webp"}
        alt="Field"
        class="absolute top-0 left-0 w-full h-full rounded-lg z-10 pointer-events-none"
        style="
    background: transparent; 
    pointer-events: none; 
    user-select: none; 
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
  "
        draggable="false"
        on:error={(e) => {
          console.error("Failed to load field map:", settings.fieldMap);
          e.target.src = "/fields/decode.webp"; // Fallback
        }}
      />
      <MathTools {x} {y} {twoElement} {robotXY} {robotHeading} />
      <img
        src={settings.robotImage || "/robot.png"}
        alt="Robot"
        style={`position: absolute; top: ${robotXY.y}px; left: ${robotXY.x}px; transform: translate(-50%, -50%) rotate(${robotHeading}deg); z-index: 20; width: ${x(robotWidth)}px; height: ${x(robotHeight)}px;user-select: none; -webkit-user-select: none; -moz-user-select: none;-ms-user-select: none; pointer-events: none;`}
        draggable="false"
        on:error={(e) => {
          console.error("Failed to load robot image:", settings.robotImage);
          e.target.src = "/robot.png"; // Fallback to default
        }}
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
