export * from "./draw";
export * from "./math";
export * from "./codeExporter";
export * from "./geometry";
export * from "./file";
export * from "./animation";
export * from "./shapes";
export * from "./timeCalculator";

export const DPI = 96 / 5;

export const titleCase = (str: string) =>
  `${str[0].toUpperCase()}${str.slice(1).toLowerCase()}`;
