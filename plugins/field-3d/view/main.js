// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// The 3D view. Turtle Tracer sends the scene (the project, the timed plan
// and the field image) whenever it changes, and the robot's pose every frame
// it moves; three.js draws them. Field coordinates are inches with y up; in
// three.js the field lies flat in x/z with y pointing up out of it.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { connect } from "turtle:view";

const view = await connect();

const canvas = document.querySelector("#scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(globalThis.devicePixelRatio);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 1, 5000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(60, 140, 40);
scene.add(sun);

let field = { width: 144, height: 144 };

/** A field point (inches, y up) in three.js space, `up` inches above the floor. */
const toWorld = (x, y, up = 0) =>
  new THREE.Vector3(x - field.width / 2, up, field.height / 2 - y);

// Everything that comes from the scene; rebuilt when it changes.
const drawn = new THREE.Group();
scene.add(drawn);

// The robot: a box with a bright front edge so its heading shows.
const robot = new THREE.Group();
const body = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.6 }),
);
const front = new THREE.Mesh(
  new THREE.BoxGeometry(0.08, 1.02, 0.9),
  new THREE.MeshStandardMaterial({ color: 0xfacc15 }),
);
front.position.x = 0.5;
robot.add(body, front);
scene.add(robot);

const textures = new THREE.TextureLoader();
let cameraPlaced = false;

/** Frees the GPU memory of everything in `group` and empties it. */
function clear(group) {
  group.traverse((object) => {
    object.geometry?.dispose();
    const materials = [object.material].flat().filter(Boolean);
    for (const material of materials) {
      material.map?.dispose();
      material.dispose();
    }
  });
  group.clear();
}

function rebuild(sceneData) {
  const { project, plan, theme, fieldImage } = sceneData;
  field = project.field;
  clear(drawn);
  scene.background = new THREE.Color(theme === "dark" ? 0x171717 : 0xf5f5f5);

  // The floor, with the field image on it.
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x9ca3af });
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(field.width, field.height),
    floorMaterial,
  );
  floor.rotation.x = -Math.PI / 2;
  drawn.add(floor);
  if (fieldImage) {
    textures.load(fieldImage, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      floorMaterial.map = texture;
      floorMaterial.color.set(0xffffff);
      floorMaterial.needsUpdate = true;
    });
  }

  // Paths as tubes just above the floor, with a ball at each waypoint.
  for (const path of plan.paths) {
    const points = path.points.map((p) => toWorld(p.x, p.y, 0.6));
    if (points.length < 2) continue;
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        points.length * 2,
        0.5,
        8,
      ),
      new THREE.MeshStandardMaterial({ color: path.color }),
    );
    drawn.add(tube);
  }
  for (const path of project.paths) {
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 16, 12),
      new THREE.MeshStandardMaterial({ color: path.color }),
    );
    ball.position.copy(toWorld(path.to.x, path.to.y, 1.4));
    drawn.add(ball);
  }

  // Obstacles as translucent blocks; keep-in zones as low outlines.
  for (const shape of project.shapes) {
    const outline = new THREE.Shape(
      shape.vertices.map(
        (v) => new THREE.Vector2(v.x - field.width / 2, v.y - field.height / 2),
      ),
    );
    const keepIn = shape.kind === "keep-in";
    const block = new THREE.Mesh(
      new THREE.ExtrudeGeometry(outline, {
        depth: keepIn ? 0.5 : 8,
        bevelEnabled: false,
      }),
      new THREE.MeshStandardMaterial({
        color: shape.color,
        transparent: true,
        opacity: keepIn ? 0.25 : 0.5,
      }),
    );
    block.rotation.x = -Math.PI / 2;
    drawn.add(block);
  }

  const { length, width } = project.robot;
  const height = Math.min(length, width) * 0.6;
  robot.scale.set(length, height, width);

  if (!cameraPlaced) {
    camera.position.set(0, field.width * 0.9, field.height * 0.95);
    controls.target.set(0, 0, 0);
    cameraPlaced = true;
  }
}

function moveRobot({ pose }) {
  robot.position.copy(toWorld(pose.x, pose.y, robot.scale.y / 2));
  robot.rotation.y = (pose.heading * Math.PI) / 180;
}

function resize() {
  const { clientWidth: w, clientHeight: h } = document.body;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}

view.onScene(rebuild);
view.onFrame(moveRobot);
rebuild(view.scene);
// Until the first frame arrives.
moveRobot({ pose: view.scene.project.start });

new ResizeObserver(resize).observe(document.body);
resize();
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
