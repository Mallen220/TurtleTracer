// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// The team's Pedro constants class, as the exported code refers to it: its
// import, its name, and the static method that builds the Follower. Teams keep
// it in different places (Pedro 3's quickstart has `pedro.Constants` with
// `create`, older projects `pedroPathing.Constants` with `createFollower`),
// and code that names the wrong one doesn't compile. The app sets this from
// the team's override or from what it found in their robot project.

export interface PedroConstantsRef {
  /** The class's full name, for the import line. */
  qualifiedName: string;
  /** Its name in code. */
  className: string;
  /** The static method that builds the Follower. */
  followerFactory: string;
}

/** Pedro 3's quickstart: used when nothing better is known. */
export const QUICKSTART_CONSTANTS: PedroConstantsRef = {
  qualifiedName: "org.firstinspires.ftc.teamcode.pedro.Constants",
  className: "Constants",
  followerFactory: "create",
};

let current: PedroConstantsRef = QUICKSTART_CONSTANTS;

/** The constants class exported code uses now. */
export function pedroConstants(): PedroConstantsRef {
  return current;
}

/** Sets the constants class exported code uses; null goes back to the quickstart's. */
export function setPedroConstants(ref: PedroConstantsRef | null) {
  current = ref ?? QUICKSTART_CONSTANTS;
}

/**
 * The constants class to use, from what the team typed (a full class name,
 * and optionally a factory) and what was found in their project.
 */
export function resolvePedroConstants(
  override: { qualifiedName?: string; followerFactory?: string },
  detected: {
    qualifiedName: string;
    className: string;
    followerFactory: string | null;
  } | null,
): PedroConstantsRef {
  const name = override.qualifiedName?.trim();
  const factory = override.followerFactory?.trim();
  if (name) {
    const sameAsFound = detected?.qualifiedName === name;
    return {
      qualifiedName: name,
      className: name.split(".").pop()!,
      followerFactory:
        factory ||
        (sameAsFound ? detected.followerFactory : null) ||
        QUICKSTART_CONSTANTS.followerFactory,
    };
  }
  if (detected) {
    return {
      qualifiedName: detected.qualifiedName,
      className: detected.className,
      followerFactory:
        factory ||
        detected.followerFactory ||
        QUICKSTART_CONSTANTS.followerFactory,
    };
  }
  return factory
    ? { ...QUICKSTART_CONSTANTS, followerFactory: factory }
    : QUICKSTART_CONSTANTS;
}
