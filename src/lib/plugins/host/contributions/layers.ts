// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Field layers: shapes a plugin draws on the field (api/field.ts).
import type { FieldPrimitive, PoseTrack } from "../../api";
import { fieldLayerRegistry } from "../../../registries";
import {
  check,
  layerSchema,
  poseTrackSchema,
  primitivesSchema,
} from "../schemas";
import type { ContributionFactory } from "./types";

/** A layer may keep this many tracks. */
const MAX_TRACKS = 32;
const trackSchema = poseTrackSchema();

export const layerFactory: ContributionFactory = (
  plugin,
  registrationId,
  definition,
  callbacks,
) => {
  check(layerSchema, definition, "layer");
  const entryId = `plugin:${plugin.id}:${registrationId}`;
  let tracks: Record<string, PoseTrack> = {};
  let primitives: FieldPrimitive[] = [];

  const publish = () =>
    fieldLayerRegistry.register({
      id: entryId,
      owner: plugin.id,
      primitives,
      tracks,
      onClick: callbacks.includes("onClick")
        ? (primitiveId, at) => {
            plugin
              .invoke(registrationId, "onClick", [primitiveId, at], 5000)
              .catch(() => {});
          }
        : undefined,
    });
  publish();

  return {
    update(method, args) {
      if (method === "draw") {
        primitives = check(primitivesSchema, args[0], "drawing");
      } else if (method === "track") {
        const [name, track] = args as [unknown, unknown];
        if (typeof name !== "string" || name.length > 100) {
          throw new Error("A track needs a name.");
        }
        const next = { ...tracks };
        if (track === null) delete next[name];
        else next[name] = check(trackSchema, track, "track");
        if (Object.keys(next).length > MAX_TRACKS) {
          throw new Error(`A layer can have at most ${MAX_TRACKS} tracks.`);
        }
        tracks = next;
      }
      publish();
    },
    dispose: () => fieldLayerRegistry.unregister(entryId),
  };
};
