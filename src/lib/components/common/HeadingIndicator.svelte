<script lang="ts">
  import { settingsStore } from "../../projectStore";

  export let degrees: number = 0;
  export let size: number = 16;
  export let className: string = "";

  $: fieldRotation = $settingsStore.fieldRotation || 0;
  // If field is rotated, we want the arrow to point relative to the SCREEN.
  // A heading of 0 on field is "Right".
  // If field is rotated 0 deg, 0 deg heading points Right (screen).
  // If field is rotated 90 deg (visually CCW, so X+ is Up), 0 deg heading should point Up (screen).
  // Wait, if I rotate the field 90 deg, the "Right" side of the field is now at the top.
  // So the arrow for 0 degrees should point Up?
  // Let's verify rotation direction. CSS transform `rotate(Xdeg)` is CW.
  // If `fieldRotation` is 90, the field image is rotated 90 deg CW.
  // So "Right" (Field X+) is now "Down" (Screen Y+).
  // So 0 deg heading should point Down.
  // Currently: `-(degrees + fieldRotation)`.
  // If deg=0, rot=90 -> `rotate(-90deg)` -> CCW 90 -> Up.
  // Inverted!
  // If deg=0, rot=270 -> `rotate(-270deg)` -> CCW 270 -> CW 90 -> Down.
  // If user says "90 and 270 both are inverted", it implies my previous logic was backwards for rotation offset.
  // If rot=90 (CW), 0 deg heading should point Down (90 deg CW).
  // Formula should be: `-(degrees - fieldRotation)`?
  // Let's test:
  // deg=0, rot=90 -> `-(0 - 90)` = 90 deg (CW). Points Down. Correct?
  // deg=0, rot=270 -> `-(0 - 270)` = 270 deg (CW) = -90 (CCW). Points Up. Correct?
  // Wait, usually field rotation 180 (Red Alliance) means 0 deg (Right) becomes Left.
  // deg=0, rot=180 -> `-(0 - 180)` = 180. Points Left. Correct.
  //
  // However, the `degrees` prop comes from `endPoint.startDeg` which is standard math angle (0=Right, 90=Up).
  // SVG rotation is usually CW. So to point 90 (Up), we need `rotate(-90deg)`.
  // Hence the `-degrees` base.
  // If we add field rotation offset to the *visual* rotation:
  // We want `visualAngle = mathAngle + fieldRotationOffset`?
  // If field rotates 90 CW, the visual angle for "0 math" rotates 90 CW.
  // So `visualMathAngle = 0 - 90` (since math is CCW, CW rotation subtracts).
  // `svgRotation = -visualMathAngle = -(degrees - fieldRotation)`.
  // Let's try `rotate({-(degrees - fieldRotation)}deg)`.

  $: rotation = -(degrees - fieldRotation);
</script>

<div
  class="inline-flex items-center justify-center shrink-0 {className}"
  style="transform: rotate({rotation}deg); width: {size}px; height: {size}px; transition: transform 0.2s ease-out;"
  role="presentation"
  aria-hidden="true"
>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="w-full h-full text-purple-600 dark:text-purple-400"
  >
    <!-- Arrow pointing RIGHT (0 degrees) -->
    <!-- Line: (4, 12) -> (20, 12) -->
    <!-- Head: (14, 6) -> (20, 12) -> (14, 18) -->
    <path d="M4 12h16m-6-6l6 6-6 6" />
  </svg>
</div>
