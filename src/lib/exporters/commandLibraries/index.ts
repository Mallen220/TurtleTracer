// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { CommandLibraryId } from "../../../types";
import type { CommandLibrary } from "./types";
import { solversLib } from "./solversLib";
import { nextFtc } from "./nextFtc";
import { ivy } from "./ivy";

export type {
  CommandLibrary,
  CommandVocabulary,
  SequentialClassParts,
} from "./types";

export const DEFAULT_COMMAND_LIBRARY: CommandLibraryId = "SolversLib";

/**
 * Every library the sequential exporter supports, in the order the UI lists
 * them. To add one, create a file beside this one, add its id to
 * CommandLibraryId in types/index.ts, and add it here. The Record type
 * makes the compiler flag a missing entry.
 */
const libraries: Record<CommandLibraryId, CommandLibrary> = {
  SolversLib: solversLib,
  NextFTC: nextFtc,
  Ivy: ivy,
};

export const COMMAND_LIBRARIES: readonly CommandLibrary[] =
  Object.values(libraries);

/**
 * The library for a stored setting. Unknown or missing values fall back to
 * the default, so settings saved with a since-removed library still export.
 */
export function getCommandLibrary(id?: string | null): CommandLibrary {
  return (
    COMMAND_LIBRARIES.find((library) => library.id === id) ??
    libraries[DEFAULT_COMMAND_LIBRARY]
  );
}

/**
 * The library for an action's export context. Plugins written before
 * targetLibrary existed only set isNextFTC.
 */
export function libraryForContext(context: {
  targetLibrary?: CommandLibraryId;
  isNextFTC?: boolean;
}): CommandLibrary {
  return getCommandLibrary(
    context.targetLibrary ?? (context.isNextFTC ? "NextFTC" : undefined),
  );
}
