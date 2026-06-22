export type LayerRole = "background" | "hero" | "text" | "decor" | "info_layer";

export type ExportTarget = "powerpoint-rich" | "wps-compatible";

export interface DeckSpec {
  version: string;
  title: string;
  description?: string;
  slideSize?: "LAYOUT_WIDE" | "LAYOUT_4X3";
  theme: ThemeSpec;
  outputs?: {
    directory?: string;
  };
  slides: SlideSpec[];
  animationClusters?: AnimationClusterSpec[];
}

export interface ThemeSpec {
  fonts: {
    heading: string;
    body: string;
  };
  colors: Record<string, string>;
}

export interface SlideSpec {
  id: string;
  title?: string;
  background?: string;
  layers: LayerSpec[];
  sceneBeats?: SceneBeatSpec[];
}

export interface LayerSpec {
  id: string;
  role: LayerRole;
  elements: ElementSpec[];
}

export type ElementSpec = TextElementSpec | ShapeElementSpec | ImageElementSpec;

export interface BaseElementSpec {
  id: string;
  kind: "text" | "shape" | "image";
  role?: LayerRole;
  hiddenUntilBeat?: string;
}

export interface TextElementSpec extends BaseElementSpec {
  kind: "text";
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize?: number;
  fontFace?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  valign?: "top" | "mid" | "bottom";
  fit?: "shrink" | "resize";
}

export interface ShapeElementSpec extends BaseElementSpec {
  kind: "shape";
  shape: "rect" | "roundRect" | "ellipse" | "line";
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  transparency?: number;
  line?: {
    color?: string;
    width?: number;
    transparency?: number;
  };
  radius?: number;
}

export interface ImageElementSpec extends BaseElementSpec {
  kind: "image";
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  transparency?: number;
}

export interface SceneBeatSpec {
  id: string;
  label: string;
  description?: string;
  revealElements?: string[];
}

export interface AnimationClusterSpec {
  id: string;
  target: ExportTarget;
  slideId: string;
  beatId: string;
  strategy: "reserved-object-timing" | "state-page";
  members: string[];
  notes?: string;
}

export interface GenerationResult {
  outputDir: string;
  files: {
    powerpointRich: string;
    wpsCompatible: string;
    motionPlan: string;
    visualQa: string;
    playbackQa: string;
    deliveryNote: string;
    previewParity: string;
  };
}
