import picocolors from "picocolors";

export interface ColorOptions {
  noColor?: boolean;
  env?: NodeJS.ProcessEnv;
  isTTY?: boolean;
}

export interface RendererColors {
  readonly enabled: boolean;
  plain(text: string): string;
  bold(text: string): string;
  dim(text: string): string;
  muted(text: string): string;
  accent(text: string): string;
  info(text: string): string;
  success(text: string): string;
  warning(text: string): string;
  error(text: string): string;
  task(text: string): string;
  phase(text: string): string;
  tool(text: string): string;
}

const identity = (text: string): string => text;

export function shouldUseColor(options: ColorOptions = {}): boolean {
  const env = options.env ?? process.env;
  const isTTY = options.isTTY ?? Boolean(process.stdout.isTTY);

  return !options.noColor && env.NO_COLOR === undefined && isTTY;
}

export function createColors(options: ColorOptions = {}): RendererColors {
  const enabled = shouldUseColor(options);
  const palette = picocolors.createColors(enabled);

  return {
    enabled,
    plain: identity,
    bold: palette.bold,
    dim: palette.dim,
    muted: palette.gray,
    accent: palette.blue,
    info: palette.cyan,
    success: palette.green,
    warning: palette.yellow,
    error: palette.red,
    task: palette.magenta,
    phase: palette.cyan,
    tool: palette.blue
  };
}