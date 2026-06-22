import "./styles.css";

type InspectorTab = "status" | "motion" | "audit" | "codex";
type PreviewState = "rich-before" | "rich-after" | "wps-state-0" | "wps-state-1" | "diff";
type ThemeMode = "system" | "light" | "dark";
type OverlayKey = "alignmentGuides" | "safeFrame" | "objectBounds" | "stateBadge" | "revealDebug";
type PlaybackMode = "Rich" | "WPS";
type BottomTab = "comments" | "revision" | "qa";
type AnnotationMode = "object" | "region";
type WorkItemStatus = "todo" | "applied" | "skipped" | "needs-design" | "needs-codex" | "failed";
type CodexBridgeEventStatus = "queued" | "sent" | "waiting_codex" | "processing" | "applied" | "needs_codex" | "failed" | "bridge_unavailable";

interface ApiSpecResponse {
  specPath: string;
  spec: DeckSpecView;
}

interface DeckSpecView {
  title: string;
  description?: string;
  theme: {
    fonts: {
      heading: string;
      body: string;
    };
    colors: Record<string, string>;
  };
  slides: SlideView[];
  animationClusters?: AnimationClusterView[];
}

interface AnimationClusterView {
  id: string;
  target: string;
  strategy: string;
  slideId?: string;
  beatId?: string;
  members?: string[];
  units?: AnimationUnitView[];
}

interface AnimationUnitView {
  elementId: string;
  effect?: string;
  startOffsetMs?: number;
  durationMs?: number;
  startMode?: string;
}

interface SlideView {
  id: string;
  title?: string;
  transition?: SlideTransitionView;
  layers: LayerView[];
  sceneBeats?: SceneBeatView[];
}

interface SlideTransitionView {
  effect?: string;
  durationMs?: number;
  direction?: "left" | "right" | "up" | "down";
}

interface LayerView {
  id: string;
  role: string;
  elements: ElementView[];
}

interface ElementView {
  id: string;
  kind: string;
  text?: string;
  shape?: string;
  src?: string;
  hiddenUntilBeat?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  fontSize?: number;
  fontFace?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  valign?: "top" | "mid" | "bottom";
  fit?: "shrink" | "resize";
  fill?: string;
  transparency?: number;
  line?: {
    color?: string;
    width?: number;
    transparency?: number;
  };
  radius?: number;
}

interface SceneBeatView {
  id: string;
  label: string;
  description?: string;
  revealElements?: string[];
}

interface SelectedObject {
  element: ElementView;
  layer: LayerView;
  participatesInAnimation: boolean;
}

interface GenerateResponse {
  outputDir: string;
  files: Record<string, string>;
}

interface ExportResponse {
  rootDir: string;
  exportDir: string;
  folderName: string;
  projectName: string;
  files: {
    powerpoint: string;
    compatible: string;
  };
}

interface VerifyResponse {
  specSlides: number;
  sceneBeats: number;
  outputs: {
    rich: AuditReport;
    wps: AuditReport;
  };
  compatibility: {
    powerpointKeynote: string;
    wpsOrUnknown: string;
    singleFileDefault: string;
    wpsRichRecommendation: string;
  };
}

interface WorkbenchStateResponse {
  projectName: string;
  specTitle: string;
  specPath: string;
  slideCount: number;
  sceneBeatCount: number;
  outputs: {
    powerpointRich: string;
    wpsCompatible: string;
    revisionPlan?: string;
    playbackQaLog?: string;
    playbackQaMarkdown?: string;
    codexInbox?: string;
    codexBridgeEvents?: string;
    codexBridgeConfig?: string;
    codexBridgePendingTokens?: string;
  };
  export: {
    lockedRoot: string;
    lastExportDir: string | null;
    lastFolderName: string | null;
    historyPath: string;
    lastExportProjectName?: string | null;
    lastExportMatchesProject?: boolean;
    lastExportStatus?: "current-project" | "historical-export" | "none";
  };
  workflow: {
    currentStage: "preview" | "audit" | "export" | "revision";
    nextAction: string;
  };
  compatibility: {
    powerpointKeynote: string;
    wpsUnknown: string;
    singleFileDefault: string;
    wpsRichRecommendation: string;
  };
  revisionPlan?: {
    exists: boolean;
    actionCount: number;
    highPriorityCount: number;
    latestAction: RevisionAction | null;
  };
  codexInbox?: {
    path: string;
    eventCount: number;
    latestEvent: CodexInboxEvent | null;
  };
  codexBridge?: CodexBridgeSummary;
  codexQueue?: {
    pendingCount: number;
    appliedCount: number;
    status: "idle" | "running" | "needs-codex" | "failed";
    latestProcessed: CodexInboxEvent | null;
    undoCount: number;
    redoCount: number;
    maxUndo: number;
  };
  undo?: UndoStateSummary;
  uploads?: UploadRegistrySummary;
  currentPreview?: {
    modes: PreviewState[];
    defaultMode: PreviewState;
    overlayDefaults: Record<OverlayKey, boolean>;
  };
  playback?: {
    supported: boolean;
    modes: PlaybackMode[];
    controls: string[];
    writesDisk: boolean;
    animationPreflight?: boolean;
    simulatedEffects?: string[];
    latestSession?: PlaybackQaSession | null;
    sessionCount?: number;
    riskStats?: PlaybackQaRiskStats;
    logPath?: string;
    markdownPath?: string;
  };
  designSystem?: {
    exists: boolean;
    path: string;
    status: string;
    summary: string;
  };
}

interface AuditResponse {
  audit: AuditReport;
  recommendations?: AuditRecommendations;
}

interface AuditReport {
  fileName: string;
  fileSize: number;
  validZip: boolean;
  validPptx: boolean;
  slideCount: number;
  transitionCount: number;
  timingCount: number;
  animEffectCount: number;
  clickTriggerCount: number;
  withEffectCount: number;
  afterEffectCount: number;
  error?: string;
  slides: AuditSlide[];
  recommendations: AuditRecommendations;
}

interface AuditRecommendations {
  summary: string;
  overallRisk: "low" | "medium" | "high";
  pageIssues: PageIssue[];
  clickRisks: ClickRisk[];
  wpsCompatibilityRisks: WpsCompatibilityRisk[];
  revisionPlanDraft: RevisionPlanDraft;
}

interface PageIssue {
  slideNumber: number;
  severity: "info" | "warning" | "error";
  category: "structure" | "motion" | "compatibility" | "content";
  message: string;
  suggestion: string;
}

interface ClickRisk {
  slideNumber: number;
  risk: string;
  suggestion: string;
}

interface WpsCompatibilityRisk {
  slideNumber: number;
  risk: string;
  fallback: string;
}

interface RevisionPlanDraft {
  schema: "pptx-workbench.revision-plan.v1";
  sourceFile: string;
  goals: string[];
  actions: RevisionAction[];
}

interface RevisionAction {
  id?: string;
  slideId?: string;
  slideNumber: number;
  objectId?: string;
  objectRole?: string;
  type: "content" | "visual" | "structure" | "motion" | "compatibility" | "asset";
  instruction: string;
  priority: "low" | "medium" | "high";
  source?: "user-comment" | "audit-recommendation" | "manual";
  status?: WorkItemStatus;
  createdAt?: string;
}

interface RevisionPlanSummary {
  path: string;
  exists: boolean;
  plan: {
    schema: "pptx-workbench.revision-plan.v1";
    projectName: string;
    source: {
      specPath: string;
      auditFile: string | null;
      generatedAt: string;
    };
    status: "draft";
    goals: string[];
    actions: RevisionAction[];
  };
  actionCount: number;
  highPriorityCount: number;
  latestAction: RevisionAction | null;
}

interface AuditSlide {
  slideNumber: number;
  hasTransition: boolean;
  hasTiming: boolean;
  hasAnimEffect: boolean;
  transitionCount: number;
  timingCount: number;
  animEffectCount: number;
  clickTriggerCount: number;
  withEffectCount: number;
  afterEffectCount: number;
}

interface QaLogEntry {
  time: string;
  category: "playback-click" | "playback-session" | "user-comment" | "audit" | "export" | "system";
  action: string;
  status: "完成" | "提示" | "错误";
  summary: string;
  detail?: unknown;
}

interface PlaybackQaRecord {
  event_type: "scene-beat-click" | "slide-transition" | "exit";
  click_index: number;
  slideId: string;
  slideNumber: number;
  previewMode: PlaybackMode;
  scene_beat: string;
  visible_change: string;
  auto_completed: boolean;
  empty_wait_seconds: number;
  manual_extra_clicks_required: boolean;
  startedAt?: string;
  endedAt?: string;
  click_overrun?: boolean;
  invisible_change_risk?: boolean;
  animatedObjectIds?: string[];
  skippedStaticObjectIds?: string[];
  animationEffects?: Record<string, string>;
  fallbackUsed?: boolean;
  animationCompleted?: boolean;
  transitionEffect?: string;
  transitionDirection?: string;
  transitionDurationMs?: number;
  transitionFallbackUsed?: boolean;
  transitionCompleted?: boolean;
}

interface PlaybackQaSession {
  sessionId: string;
  projectName: string;
  startedAt: string;
  endedAt: string;
  mode: PlaybackMode;
  slideCount: number;
  coveredSlides: number[];
  expectedSlides: number;
  totalClicks: number;
  sceneBeatClicks: number;
  clickOverrunCount: number;
  invisibleChangeRiskCount: number;
  emptyWaitTotalSeconds: number;
  slideTransitions: number;
  manualExtraClicks: number;
  records: PlaybackQaRecord[];
  conclusion: string;
}

interface PlaybackAnimationTarget {
  elementId: string;
  effect: string;
  delayMs: number;
  durationMs: number;
  fallbackUsed: boolean;
}

interface PlaybackAnimationRun {
  animatedObjectIds: string[];
  skippedStaticObjectIds: string[];
  animationEffects: Record<string, string>;
  fallbackUsed: boolean;
  animationCompleted: boolean;
}

interface PlaybackSlideTransitionState {
  fromSlideIndex: number;
  toSlideIndex: number;
  fromStep: number;
  toStep: number;
  effect: string;
  direction: "forward" | "backward";
  durationMs: number;
  fallbackUsed: boolean;
}

interface PlaybackSlideTransitionRun {
  effect: string;
  direction: "forward" | "backward";
  durationMs: number;
  fallbackUsed: boolean;
  transitionCompleted: boolean;
}

interface PlaybackQaRiskStats {
  clickOverrunCount: number;
  invisibleChangeRiskCount: number;
  emptyWaitTotalSeconds: number;
}

interface PlaybackQaSummary {
  logPath: string;
  playbackQaPath: string;
  sessionCount: number;
  latestSession: PlaybackQaSession | null;
  riskStats: PlaybackQaRiskStats;
}

interface SelectionBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface CodexInboxEvent {
  id: string;
  selectedSlideId: string;
  selectedObjectId: string | null;
  selectedObjectType: string;
  objectRole?: string;
  selectionBounds: SelectionBounds;
  candidateObjectIds?: string[];
  userInstruction: string;
  scope: "object" | "region" | "slide";
  status: WorkItemStatus;
  createdAt: string;
}

interface CodexInboxSummary {
  path: string;
  eventCount: number;
  latestEvent: CodexInboxEvent | null;
  events: CodexInboxEvent[];
}

interface CodexInboxPostResponse {
  inbox: CodexInboxSummary;
  revision: RevisionPlanSummary;
  event: CodexInboxEvent;
  bridgeEvent?: CodexBridgeEvent;
}

interface CodexBridgeEvent {
  id: string;
  type: string;
  status: CodexBridgeEventStatus;
  createdAt: string;
  updatedAt?: string;
  source: "workbench" | "codex-thread-bridge";
  threadId?: string;
  targetThreadId?: string;
  sentAt?: string;
  attemptCount?: number;
  payload: Record<string, unknown>;
  taskText?: string;
  error?: string;
}

interface CodexBridgeSummary {
  configPath: string;
  eventsPath: string;
  pendingTokensPath: string;
  connected: boolean;
  status: "connected" | "missing_thread_id" | "bridge_unavailable" | "expired" | "not_configured" | "token_invalid" | "token_expired";
  threadId: string | null;
  workspace: string;
  source: string | null;
  connectedAt: string | null;
  expiresAt: string | null;
  expired: boolean;
  appServer: {
    available: boolean;
    transport: "auto" | "none" | "mock" | "stdio" | "unix" | "websocket";
    endpoint: string | null;
    reason?: string;
  };
  eventCount: number;
  queuedCount: number;
  waitingCount: number;
  bridgeUnavailableCount: number;
  latestEvent: CodexBridgeEvent | null;
}

interface CodexQueueProcessResponse {
  processedCount: number;
  skippedCount: number;
  status: "idle" | "processed" | "needs-design" | "needs-codex" | "failed";
  latestProcessed: CodexQueueResult | null;
  results: CodexQueueResult[];
  undo: UndoStateSummary;
  inbox: CodexInboxSummary;
  revision: RevisionPlanSummary;
}

interface CodexQueueResult {
  eventId: string;
  slideId: string;
  objectId: string | null;
  instruction: string;
  status: WorkItemStatus;
  reason?: string;
  diff?: {
    file: string;
    slideId: string;
    objectId: string | null;
    before: string;
    after: string;
  };
}

interface UndoStateSummary {
  undoCount: number;
  redoCount: number;
  maxUndo: number;
  undoDir: string;
  redoDir: string;
  latestUndo: {
    id: string;
    createdAt: string;
    summary: string;
    affectedSlides: string[];
    affectedObjects: string[];
    source: string;
    files: string[];
  } | null;
}

interface UploadReferenceResponse {
  mode: "quick-audit" | "large-file-audit";
  status: "waiting-purpose";
  note?: string;
  uploads: UploadRegistrySummary;
  intent?: UploadIntentRecord;
  bridgeEvent?: CodexBridgeEvent;
}

interface UploadRegistrySummary {
  path: string;
  uploads: UploadedReference[];
  latestUpload: UploadedReference | null;
}

interface UploadedReference {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  uploadedAt: string;
  status: "waiting-purpose";
  mode: "quick-audit" | "large-file-audit";
  prompt: string;
  relationshipPrompt?: string;
}

interface UploadIntentRecord {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  createdAt: string;
  status: "waiting-purpose";
  suggestedQuestion?: string;
  question: string;
  options: string[];
  note: string;
}

interface AnnotationSelection {
  slideId: string;
  objectId: string | null;
  objectType: string;
  objectRole?: string;
  scope: "object" | "region";
  bounds: SelectionBounds;
  candidateObjectIds?: string[];
  composerX: number;
  composerY: number;
  composerOpen: boolean;
  regionNumber?: number;
}

interface AnnotationDrag {
  slideId: string;
  start: { x: number; y: number };
  current: { x: number; y: number };
}

interface PreviewDescriptor {
  label: string;
  shortLabel: string;
  family: "Rich" | "WPS" | "差异";
  revealVisible: boolean;
  wpsStateLabel: string;
  summary: string;
}

const previewDescriptors: Record<PreviewState, PreviewDescriptor> = {
  "rich-before": {
    label: "Rich 点击前",
    shortLabel: "Rich 前",
    family: "Rich",
    revealVisible: false,
    wpsStateLabel: "不适用",
    summary: "模拟 PowerPoint-rich.pptx 放映初始态：hiddenUntilBeat 元素暂不显示。",
  },
  "rich-after": {
    label: "Rich 点击后",
    shortLabel: "Rich 后",
    family: "Rich",
    revealVisible: true,
    wpsStateLabel: "不适用",
    summary: "模拟一次点击后的 Rich 状态：callout 与 orange bar 通过同一 clickEffect cluster 自动出现。",
  },
  "wps-state-0": {
    label: "WPS 初始",
    shortLabel: "WPS 0",
    family: "WPS",
    revealVisible: false,
    wpsStateLabel: "State 0",
    summary: "模拟 WPS-compatible.pptx 的初始状态页：状态页展开前，reveal 元素隐藏。",
  },
  "wps-state-1": {
    label: "WPS 点击后",
    shortLabel: "WPS 1",
    family: "WPS",
    revealVisible: true,
    wpsStateLabel: "State 1",
    summary: "模拟 WPS-compatible.pptx 的点击后状态页：通过额外页面和 fade transition 展示 reveal 元素。",
  },
  diff: {
    label: "差异视图",
    shortLabel: "差异",
    family: "差异",
    revealVisible: true,
    wpsStateLabel: "State 0 → State 1",
    summary: "对比交付策略：Rich 是对象动画簇，WPS 是状态页降级；单文件默认给 WPS-compatible.pptx。",
  },
};

const lockedExportRoot = "/Users/bruce/Desktop/PPT";
const defaultProjectName = "测试-v1.6.11.1";
const codexInboxPath = "/Users/bruce/Documents/PPT/pptx-workbench/events/codex-inbox.jsonl";
const revisionPlanPath = "/Users/bruce/Documents/PPT/pptx-workbench/outputs/revision-plan.yaml";
const playbackQaLogPath = "/Users/bruce/Documents/PPT/pptx-workbench/outputs/playback-qa-log.jsonl";
const playbackQaMarkdownPath = "/Users/bruce/Documents/PPT/pptx-workbench/outputs/playback-qa.md";
const designSystemPath = "/Users/bruce/Documents/PPT/pptx-workbench/specs/presentation-design-system.yaml";
const largePptxThresholdBytes = 50 * 1024 * 1024;

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("Missing #app root");
}

let specResponse: ApiSpecResponse;
let selectedSlideIndex = 0;
let selectedTab: InspectorTab = "status";
let previewState: PreviewState = "rich-after";
let projectName = defaultProjectName;
let exportFolderName = defaultExportFolderName(projectName);
let lastGenerate: GenerateResponse | undefined;
let lastVerify: VerifyResponse | undefined;
let lastAudit: AuditReport | undefined;
let lastExport: ExportResponse | undefined;
let lastUpload: UploadedReference | undefined;
let lastUploadIntent: UploadIntentRecord | undefined;
let revisionPlan: RevisionPlanSummary | undefined;
let codexInbox: CodexInboxSummary | undefined;
let workbenchState: WorkbenchStateResponse | undefined;
let slideNavCollapsed = false;
let inspectorCollapsed = true;
let dockOpen = false;
let themeMode: ThemeMode = "system";
let bottomTab: BottomTab = "qa";
let annotationActive = false;
let annotationMode: AnnotationMode = "object";
let annotationSelection: AnnotationSelection | undefined;
let annotationDrag: AnnotationDrag | undefined;
let ignoreNextCanvasClick = false;
let regionAnnotationCounter = 1;
let playbackActive = false;
let playbackMode: PlaybackMode = "Rich";
let playbackStep = 0;
let playbackAnimationState: "待播放" | "动画播放中" | "页面切换中" | "已完成" = "待播放";
let playbackAnimating = false;
let playbackSlideTransition: PlaybackSlideTransitionState | null = null;
let playbackSessionStartedAt: string | null = null;
let playbackSessionStartRecordIndex = 0;
let playbackLastPersistStatus: "未落盘" | "已落盘" | "落盘失败" = "未落盘";
let playbackQaSummary: PlaybackQaSummary | undefined;
let currentPlaybackSessionRecords: PlaybackQaRecord[] = [];
let currentPlaybackSlideTransitions = 0;
const currentPlaybackClickCountsBySlide = new Map<string, number>();
const currentPlaybackCoveredSlideIds = new Set<string>();
let activePopover: { element: HTMLElement; trigger: HTMLElement } | undefined;
const overlaySettings: Record<OverlayKey, boolean> = {
  alignmentGuides: false,
  safeFrame: false,
  objectBounds: false,
  stateBadge: false,
  revealDebug: false,
};
const playbackQaRecords: PlaybackQaRecord[] = [];
const qaEntries: QaLogEntry[] = [
  {
    time: currentTimeLabel(),
    category: "system",
    action: "初始化",
    status: "提示",
    summary: "工作台已打开，等待读取 deck-spec。",
  },
];

app.innerHTML = `
  <section class="app-shell tech-console" data-theme-mode="system">
    <header class="app-top">
      <section class="production-toolbar codex-toolbar" aria-label="PPTX 生产工具栏">
        <div class="toolbar-group primary-actions toolbar-left">
          <button id="upload-reference-trigger" type="button">上传</button>
          <button id="playback-top" type="button">播放</button>
          <button id="export" type="button">导出</button>
          <button id="more-actions" type="button">更多</button>
        </div>
        <div class="toolbar-center">
          <button id="edit-project-name" class="project-name-button" type="button" title="修改项目名">
            <b id="project-name-label">测试-v1.6.11.1</b>
          </button>
          <span aria-hidden="true">·</span>
          <span id="top-slide-position">当前页：1 / 1</span>
          <span id="codex-bridge-status" class="codex-bridge-status disconnected">未连接 Codex</span>
        </div>
        <div class="toolbar-right">
          <div class="annotation-toolbar">
            <button id="annotation-mode-toggle" class="annotation-mode-toggle hidden" type="button" title="切换批注模式"></button>
            <button id="annotation-toggle" class="annotation-button" type="button" title="添加批注或修改要求">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 5.75h10.5a3 3 0 0 1 3 3v4.5a3 3 0 0 1-3 3H10l-4.25 3v-3H5a3 3 0 0 1-3-3v-4.5a3 3 0 0 1 3-3Z"></path>
                <path d="M17.5 2.5v5M15 5h5"></path>
              </svg>
              <span>批注</span>
            </button>
          </div>
          <button id="undo-action" class="history-action" type="button" disabled>撤销 0 / 100</button>
          <button id="redo-action" class="history-action" type="button" disabled>返回 0</button>
        </div>
        <span id="deck-title" class="sr-only">正在读取 deck-spec…</span>
        <code id="status" class="sr-only">待操作</code>
      </section>
    </header>

    <section class="editor-frame">
      <button id="restore-slide-nav" class="restore-tab restore-left" type="button" aria-label="展开幻灯片栏" title="展开幻灯片栏">◫</button>
      <aside id="slide-nav" class="slide-nav">
        <div class="pane-title">
          <span>幻灯片</span>
          <strong id="slide-count">0</strong>
          <button id="toggle-slide-nav" type="button" aria-label="折叠左侧幻灯片栏">收起</button>
        </div>
        <div id="slide-list" class="slide-list"></div>
      </aside>

      <main class="workspace">
        <div class="pasteboard">
          <section id="slide-canvas" class="slide-canvas"></section>
        </div>
      </main>

      <button id="restore-inspector" class="restore-tab restore-right" type="button" aria-label="展开协作面板" title="展开协作面板">☷</button>
      <aside class="inspector">
        <div class="inspector-title">
          <strong>协作面板</strong>
          <button id="toggle-inspector" type="button" aria-label="折叠右侧面板">收起</button>
        </div>
        <div class="tabs compact-tabs" role="tablist">
          <button type="button" data-tab="status" class="active">页面状态</button>
          <button type="button" data-tab="motion">动画与兼容</button>
          <button type="button" data-tab="audit">审计建议</button>
          <button type="button" data-tab="codex">Codex 任务</button>
        </div>
        <div id="inspector-body" class="inspector-body"></div>
      </aside>
    </section>

    <footer class="bottom-statusbar">
      <span id="last-operation">最近操作：初始化</span>
      <span id="last-export-status">最近导出：无</span>
      <span id="revision-status">revision-plan：读取中</span>
      <span id="qa-count">QA：1</span>
      <button id="toggle-dock" type="button">展开 QA 抽屉</button>
    </footer>
    <section id="bottom-drawer" class="bottom-drawer hidden">
      <header class="bottom-drawer-header">
        <div id="bottom-tabs" class="bottom-tabs" role="tablist">
          <button type="button" data-bottom-tab="comments">批注</button>
          <button type="button" data-bottom-tab="revision">改稿计划</button>
          <button type="button" data-bottom-tab="qa">QA 记录</button>
        </div>
      </header>
      <div class="bottom-tab-panel" data-panel="comments">
        <h2>批注</h2>
        <p class="bottom-empty-hint">点击顶部「批注」，再选择页面对象或空白区域添加修改要求。</p>
        <div id="codex-inbox-list" class="codex-inbox-list"></div>
      </div>
      <div class="bottom-tab-panel" data-panel="revision">
        <h2>改稿计划</h2>
        <p id="revision-plan-dock-summary">批注会同步生成 revision-plan action；网站不自动修改 deck-spec。</p>
        <div id="revision-actions-list" class="revision-actions-list"></div>
      </div>
      <div class="bottom-tab-panel" data-panel="qa">
        <h2>QA 记录</h2>
        <div id="qa-log" class="qa-log-list"></div>
      </div>
    </section>
    <div id="export-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-label="锁定导出">
      <section class="export-dialog">
        <header>
          <h2>锁定导出</h2>
          <button id="export-cancel-x" type="button">×</button>
        </header>
        <div id="export-preview"></div>
        <footer>
          <button id="export-cancel" type="button">取消</button>
          <button id="export-confirm" type="button">导出</button>
        </footer>
      </section>
    </div>
    <div id="project-name-popover" class="project-name-popover hidden" role="dialog" aria-modal="false" aria-label="修改项目名">
      <section class="project-name-panel">
        <header>
          <strong>修改项目名</strong>
          <button id="project-name-cancel-x" type="button" aria-label="关闭项目名编辑">×</button>
        </header>
        <label for="project-name-input">项目名</label>
        <input id="project-name-input" type="text" autocomplete="off" />
        <p>用于导出弹窗、PPTX 文件名和 Codex 状态摘要；为空时回退默认项目名。</p>
        <footer>
          <button id="project-name-cancel" type="button">取消</button>
          <button id="project-name-save" type="button">保存</button>
        </footer>
      </section>
    </div>
    <div id="playback-overlay" class="playback-overlay hidden" aria-label="播放 QA 模式"></div>
    <div id="toast-region" class="toast-region" aria-live="polite"></div>
    <input id="audit-file" class="hidden-file-input" type="file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" hidden aria-hidden="true" tabindex="-1" />
    <input id="upload-reference-file" class="hidden-file-input" type="file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" multiple hidden aria-hidden="true" tabindex="-1" />
    <div id="more-actions-popover" class="floating-popover hidden" role="dialog" aria-label="更多操作">
      <section>
        <header>
          <strong>更多操作</strong>
          <button id="more-actions-close" type="button" aria-label="关闭更多操作">×</button>
        </header>
        <button id="preview-settings" type="button">预览设置</button>
        <button id="verify" type="button">兼容性检查</button>
        <button id="view-deck-spec" type="button">查看 deck-spec</button>
        <button id="view-revision-plan" type="button">查看 revision-plan</button>
        <button id="view-playback-qa" type="button">查看 playback QA</button>
        <button id="open-outputs" type="button">打开输出目录</button>
        <div class="more-theme-row">
          <span>主题</span>
          <div id="theme-segments" class="theme-segments"></div>
        </div>
      </section>
    </div>
    <div id="preview-settings-popover" class="floating-popover hidden" role="dialog" aria-label="预览设置">
      <section>
        <header>
          <strong>预览设置</strong>
          <button id="preview-settings-close" type="button" aria-label="关闭预览设置">×</button>
        </header>
        <div class="preview-settings-section">
          <span>交付预览</span>
          <div id="preview-segments" class="segmented-control"></div>
        </div>
        <div id="overlay-toggles" class="overlay-toggles" aria-label="调试 overlay 开关"></div>
        <p class="preview-limit">Web preview 是 deck-spec 同源预览，不解析 PPTX，也不替代真实 PowerPoint / Keynote / WPS 放映验收。</p>
      </section>
    </div>
    <div id="detail-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-label="详情">
      <section class="detail-dialog">
        <header>
          <h2 id="detail-title">详情</h2>
          <button id="detail-close" type="button">×</button>
        </header>
        <div id="detail-body" class="detail-body"></div>
      </section>
    </div>
    <div id="timeline-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-label="完整动画时间轴">
      <section class="timeline-dialog">
        <header>
          <h2>完整动画时间轴</h2>
          <button id="timeline-close" type="button">×</button>
        </header>
        <div id="timeline-dialog-body"></div>
      </section>
    </div>
  </section>
`;

const deckTitle = mustElement(document.querySelector<HTMLElement>("#deck-title"));
const statusEl = mustElement(document.querySelector<HTMLElement>("#status"));
const appShell = mustElement(document.querySelector<HTMLElement>(".app-shell"));
const themeSegments = mustElement(document.querySelector<HTMLElement>("#theme-segments"));
const overlayToggles = mustElement(document.querySelector<HTMLElement>("#overlay-toggles"));
const slideCount = mustElement(document.querySelector<HTMLElement>("#slide-count"));
const slideList = mustElement(document.querySelector<HTMLElement>("#slide-list"));
const topSlidePosition = mustElement(document.querySelector<HTMLElement>("#top-slide-position"));
const codexBridgeStatus = mustElement(document.querySelector<HTMLElement>("#codex-bridge-status"));
const previewSegments = mustElement(document.querySelector<HTMLElement>("#preview-segments"));
const slideCanvas = mustElement(document.querySelector<HTMLElement>("#slide-canvas"));
const pasteboard = mustElement(document.querySelector<HTMLElement>(".pasteboard"));
const inspectorBody = mustElement(document.querySelector<HTMLElement>("#inspector-body"));
const uploadReferenceTrigger = mustElement(document.querySelector<HTMLButtonElement>("#upload-reference-trigger"));
const verifyButton = mustElement(document.querySelector<HTMLButtonElement>("#verify"));
const exportButton = mustElement(document.querySelector<HTMLButtonElement>("#export"));
const playbackTopButton = mustElement(document.querySelector<HTMLButtonElement>("#playback-top"));
const moreActionsButton = mustElement(document.querySelector<HTMLButtonElement>("#more-actions"));
const moreActionsPopover = mustElement(document.querySelector<HTMLElement>("#more-actions-popover"));
const moreActionsClose = mustElement(document.querySelector<HTMLButtonElement>("#more-actions-close"));
const openOutputsButton = mustElement(document.querySelector<HTMLButtonElement>("#open-outputs"));
const viewDeckSpecButton = mustElement(document.querySelector<HTMLButtonElement>("#view-deck-spec"));
const viewRevisionPlanButton = mustElement(document.querySelector<HTMLButtonElement>("#view-revision-plan"));
const viewPlaybackQaButton = mustElement(document.querySelector<HTMLButtonElement>("#view-playback-qa"));
const previewSettingsButton = mustElement(document.querySelector<HTMLButtonElement>("#preview-settings"));
const previewSettingsPopover = mustElement(document.querySelector<HTMLElement>("#preview-settings-popover"));
const previewSettingsClose = mustElement(document.querySelector<HTMLButtonElement>("#preview-settings-close"));
const timelineModal = mustElement(document.querySelector<HTMLElement>("#timeline-modal"));
const timelineDialogBody = mustElement(document.querySelector<HTMLElement>("#timeline-dialog-body"));
const timelineClose = mustElement(document.querySelector<HTMLButtonElement>("#timeline-close"));
const detailModal = mustElement(document.querySelector<HTMLElement>("#detail-modal"));
const detailTitle = mustElement(document.querySelector<HTMLElement>("#detail-title"));
const detailBody = mustElement(document.querySelector<HTMLElement>("#detail-body"));
const detailClose = mustElement(document.querySelector<HTMLButtonElement>("#detail-close"));
const projectNameLabel = mustElement(document.querySelector<HTMLElement>("#project-name-label"));
const editProjectNameButton = mustElement(document.querySelector<HTMLButtonElement>("#edit-project-name"));
const annotationToggle = mustElement(document.querySelector<HTMLButtonElement>("#annotation-toggle"));
const annotationModeToggle = mustElement(document.querySelector<HTMLButtonElement>("#annotation-mode-toggle"));
const projectNamePopover = mustElement(document.querySelector<HTMLElement>("#project-name-popover"));
const projectNameInput = mustElement(document.querySelector<HTMLInputElement>("#project-name-input"));
const projectNameCancelX = mustElement(document.querySelector<HTMLButtonElement>("#project-name-cancel-x"));
const projectNameCancel = mustElement(document.querySelector<HTMLButtonElement>("#project-name-cancel"));
const projectNameSave = mustElement(document.querySelector<HTMLButtonElement>("#project-name-save"));
const exportModal = mustElement(document.querySelector<HTMLElement>("#export-modal"));
const exportPreview = mustElement(document.querySelector<HTMLElement>("#export-preview"));
const exportCancelX = mustElement(document.querySelector<HTMLButtonElement>("#export-cancel-x"));
const exportCancel = mustElement(document.querySelector<HTMLButtonElement>("#export-cancel"));
const exportConfirm = mustElement(document.querySelector<HTMLButtonElement>("#export-confirm"));
const auditFile = mustElement(document.querySelector<HTMLInputElement>("#audit-file"));
const uploadReferenceFile = mustElement(document.querySelector<HTMLInputElement>("#upload-reference-file"));
const qaLog = mustElement(document.querySelector<HTMLElement>("#qa-log"));
const toggleSlideNav = mustElement(document.querySelector<HTMLButtonElement>("#toggle-slide-nav"));
const toggleInspector = mustElement(document.querySelector<HTMLButtonElement>("#toggle-inspector"));
const restoreSlideNav = mustElement(document.querySelector<HTMLButtonElement>("#restore-slide-nav"));
const restoreInspector = mustElement(document.querySelector<HTMLButtonElement>("#restore-inspector"));
const toggleDock = mustElement(document.querySelector<HTMLButtonElement>("#toggle-dock"));
const bottomDrawer = mustElement(document.querySelector<HTMLElement>("#bottom-drawer"));
const lastOperation = mustElement(document.querySelector<HTMLElement>("#last-operation"));
const lastExportStatus = mustElement(document.querySelector<HTMLElement>("#last-export-status"));
const revisionStatus = mustElement(document.querySelector<HTMLElement>("#revision-status"));
const undoActionButton = mustElement(document.querySelector<HTMLButtonElement>("#undo-action"));
const redoActionButton = mustElement(document.querySelector<HTMLButtonElement>("#redo-action"));
const qaCount = mustElement(document.querySelector<HTMLElement>("#qa-count"));
const revisionPlanDockSummary = mustElement(document.querySelector<HTMLElement>("#revision-plan-dock-summary"));
const revisionActionsList = mustElement(document.querySelector<HTMLElement>("#revision-actions-list"));
const codexInboxList = mustElement(document.querySelector<HTMLElement>("#codex-inbox-list"));
const bottomTabs = mustElement(document.querySelector<HTMLElement>("#bottom-tabs"));
const playbackOverlay = mustElement(document.querySelector<HTMLElement>("#playback-overlay"));
const toastRegion = mustElement(document.querySelector<HTMLElement>("#toast-region"));

specResponse = await fetchJson<ApiSpecResponse>("/api/spec");
await connectBridgeFromUrlToken();
try {
  workbenchState = await fetchJson<WorkbenchStateResponse>("/api/workbench-state");
  projectName = workbenchState.projectName || defaultProjectName;
  exportFolderName = defaultExportFolderName(projectName);
} catch (error) {
  addQaLog("system", "读取状态失败", "错误", errorMessage(error));
}
await refreshRevisionPlan();
await refreshCodexInbox();
await refreshPlaybackQaSummary();
addQaLog("system", "读取 spec", "完成", `${specResponse.spec.slides.length} 页 demo deck 已载入。`, {
  specPath: specResponse.specPath,
  title: specResponse.spec.title,
});
renderWorkbench();

async function connectBridgeFromUrlToken(): Promise<void> {
  const url = new URL(window.location.href);
  const bridgeToken = url.searchParams.get("bridgeToken")?.trim();
  if (!bridgeToken) {
    return;
  }
  url.searchParams.delete("bridgeToken");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  try {
    const response = await fetchJson<{ ok: boolean; status: string; message: string; bridge?: CodexBridgeSummary }>("/api/codex-bridge/connect-token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bridgeToken }),
    });
    showToast("Codex Bridge", response.message);
    addQaLog("system", "Codex Bridge", "完成", response.message);
  } catch (error) {
    const message = errorMessage(error).includes("token")
      ? errorMessage(error)
      : "连接 token 已失效，请重新连接。";
    showToast("Codex Bridge", message, true);
    addQaLog("system", "Codex Bridge", "错误", message);
  }
}

uploadReferenceTrigger.addEventListener("click", () => {
  uploadReferenceFile.click();
});

verifyButton.addEventListener("click", async () => {
  closeFloatingPopovers();
  await withBusy(verifyButton, "验证中", async () => {
    lastVerify = await fetchJson<VerifyResponse>("/api/verify", { method: "POST" });
    selectedTab = "motion";
    inspectorCollapsed = false;
    addQaLog(
      "system",
      "验证通过",
      "完成",
      `Rich ${lastVerify.outputs.rich.slideCount} 页，WPS ${lastVerify.outputs.wps.slideCount} 页。`,
      lastVerify,
    );
    renderWorkbench();
    statusEl.textContent = "已验证";
  });
});

exportButton.addEventListener("click", () => {
  closeFloatingPopovers();
  openExportDialog();
});

moreActionsButton.addEventListener("click", () => {
  toggleAnchoredPopover(moreActionsPopover, moreActionsButton);
});

moreActionsClose.addEventListener("click", () => {
  closeFloatingPopovers();
});

previewSettingsButton.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleAnchoredPopover(previewSettingsPopover, previewSettingsButton);
});

previewSettingsClose.addEventListener("click", () => {
  closeFloatingPopovers();
});

openOutputsButton.addEventListener("click", () => {
  closeFloatingPopovers();
  showToast("导出目录", lockedExportRoot);
  addQaLog("system", "打开导出目录", "提示", `锁定导出目录：${lockedExportRoot}`);
});

viewDeckSpecButton.addEventListener("click", () => {
  openDetailDialog("deck-spec", JSON.stringify(specResponse.spec, null, 2));
});

viewRevisionPlanButton.addEventListener("click", () => {
  openDetailDialog("revision-plan", revisionPlan ? JSON.stringify(revisionPlan.plan, null, 2) : "尚未读取 revision-plan。");
});

viewPlaybackQaButton.addEventListener("click", () => {
  openDetailDialog("playback QA", playbackQaSummary ? JSON.stringify(playbackQaSummary, null, 2) : "尚无 playback QA 记录。");
});

editProjectNameButton.addEventListener("click", () => {
  closeFloatingPopovers();
  openProjectNameEditor();
});

projectNameCancel.addEventListener("click", closeProjectNameEditor);
projectNameCancelX.addEventListener("click", closeProjectNameEditor);
projectNameSave.addEventListener("click", saveProjectName);
projectNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    saveProjectName();
  }
  if (event.key === "Escape") {
    closeProjectNameEditor();
  }
});

exportCancel.addEventListener("click", closeExportDialog);
exportCancelX.addEventListener("click", closeExportDialog);
exportConfirm.addEventListener("click", async () => {
  await withBusy(exportConfirm, "生成并导出中", async () => {
    const response = await fetchJson<ExportResponse>("/api/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectName,
        folderName: exportFolderName,
      }),
    });
    lastExport = response;
    projectName = response.projectName;
    exportFolderName = response.folderName;
    workbenchState = await fetchJson<WorkbenchStateResponse>("/api/workbench-state");
    closeExportDialog();
    renderWorkbench();
    addQaLog("export", "导出完成", "完成", `已导出到 ${response.exportDir}，文件夹名：${response.folderName}。`, {
      rootDir: response.rootDir,
      exportDir: response.exportDir,
      folderName: response.folderName,
      projectName: response.projectName,
      files: {
        powerpoint: response.files.powerpoint.split("/").at(-1),
        compatible: response.files.compatible.split("/").at(-1),
      },
    });
  });
});

undoActionButton.addEventListener("click", async () => {
  await runHistoryAction("undo", undoActionButton);
});

redoActionButton.addEventListener("click", async () => {
  await runHistoryAction("redo", redoActionButton);
});

toggleSlideNav.addEventListener("click", () => {
  slideNavCollapsed = !slideNavCollapsed;
  closeFloatingPopovers();
  renderWorkbench();
});

restoreSlideNav.addEventListener("click", () => {
  slideNavCollapsed = false;
  closeFloatingPopovers();
  renderWorkbench();
});

toggleInspector.addEventListener("click", () => {
  inspectorCollapsed = !inspectorCollapsed;
  closeFloatingPopovers();
  renderWorkbench();
});

restoreInspector.addEventListener("click", () => {
  inspectorCollapsed = false;
  closeFloatingPopovers();
  renderWorkbench();
});

toggleDock.addEventListener("click", () => {
  dockOpen = !dockOpen;
  renderWorkbench();
});

playbackTopButton.addEventListener("click", () => {
  enterPlayback("Rich");
});

annotationToggle.addEventListener("click", () => {
  annotationActive = !annotationActive;
  if (!annotationActive) {
    annotationSelection = undefined;
    annotationDrag = undefined;
    annotationMode = "object";
  }
  closeFloatingPopovers();
  renderWorkbench();
  if (annotationActive) {
    showToast("批注中", "默认对象批注。点击旁边模式按钮可切换自由批注。");
  }
});

annotationModeToggle.addEventListener("click", () => {
  if (!annotationActive) {
    return;
  }
  annotationMode = annotationMode === "object" ? "region" : "object";
  annotationSelection = undefined;
  annotationDrag = undefined;
  ignoreNextCanvasClick = false;
  showToast(
    annotationMode === "region" ? "自由批注" : "对象批注",
    annotationMode === "region" ? "拖拽框选任意区域后描述修改要求。" : "点击 PPT 对象后使用 Ask Codex。",
  );
  renderWorkbench();
});

timelineClose.addEventListener("click", () => {
  closeTimelineDialog();
});

detailClose.addEventListener("click", closeDetailDialog);

timelineModal.addEventListener("click", (event) => {
  if (event.target === timelineModal) {
    closeTimelineDialog();
  }
});

detailModal.addEventListener("click", (event) => {
  if (event.target === detailModal) {
    closeDetailDialog();
  }
});

exportModal.addEventListener("click", (event) => {
  if (event.target === exportModal) {
    closeExportDialog();
  }
});

document.addEventListener("click", (event) => {
  if (!activePopover) {
    return;
  }
  const target = event.target;
  if (!(target instanceof Node)) {
    return;
  }
  if (activePopover.element.contains(target) || activePopover.trigger.contains(target)) {
    return;
  }
  closeFloatingPopovers();
});

window.addEventListener("resize", () => {
  repositionActivePopover();
});

document.addEventListener("scroll", () => {
  repositionActivePopover();
}, true);

auditFile.addEventListener("change", async () => {
  const file = auditFile.files?.[0];
  if (!file) {
    return;
  }
  await auditUploadedFile(file);
});

uploadReferenceFile.addEventListener("change", async () => {
  const files = [...(uploadReferenceFile.files ?? [])];
  if (files.length === 0) {
    return;
  }
  await uploadReferenceFiles(files);
  uploadReferenceFile.value = "";
});

pasteboard.addEventListener("pointerdown", handleCanvasAnnotationPointerDown);
pasteboard.addEventListener("pointermove", handleCanvasAnnotationPointerMove);
pasteboard.addEventListener("pointerup", handleCanvasAnnotationPointerUp);
pasteboard.addEventListener("pointercancel", () => {
  annotationDrag = undefined;
  renderWorkbench();
});

slideCanvas.addEventListener("click", async (event) => {
  await handleCanvasAnnotationClick(event);
});

document.addEventListener("click", (event) => {
  if (!annotationActive || (!annotationSelection && !annotationDrag)) {
    return;
  }
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  if (target.closest(".pasteboard") || target.closest(".annotation-toolbar")) {
    return;
  }
  annotationSelection = undefined;
  annotationDrag = undefined;
  ignoreNextCanvasClick = false;
  renderWorkbench();
});

bottomTabs.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement) || !target.dataset.bottomTab) {
    return;
  }
  bottomTab = target.dataset.bottomTab as BottomTab;
  closeFloatingPopovers();
  renderWorkbench();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (activePopover) {
      closeFloatingPopovers();
    }
    if (!timelineModal.classList.contains("hidden")) {
      closeTimelineDialog();
    }
    if (!exportModal.classList.contains("hidden")) {
      closeExportDialog();
    }
    if (!detailModal.classList.contains("hidden")) {
      closeDetailDialog();
    }
    if (annotationActive && !isTypingTarget(event.target)) {
      annotationActive = false;
      annotationSelection = undefined;
      annotationDrag = undefined;
      annotationMode = "object";
      renderWorkbench();
    }
  }
  handlePlaybackKeydown(event);
});

for (const tab of document.querySelectorAll<HTMLButtonElement>(".tabs button[data-tab]")) {
  tab.addEventListener("click", () => {
    selectedTab = tab.dataset.tab as InspectorTab;
    closeFloatingPopovers();
    renderWorkbench();
  });
}

renderThemeSegments();

async function auditUploadedFile(file: File): Promise<void> {
  statusEl.textContent = "审计中";
  try {
    const response = await fetchJson<AuditResponse>("/api/audit-pptx", {
      method: "POST",
      headers: {
        "content-type": file.type || "application/octet-stream",
        "x-file-name": encodeURIComponent(file.name),
      },
      body: await file.arrayBuffer(),
    });
    lastAudit = response.audit;
    selectedTab = "audit";
    statusEl.textContent = "审计完成";
    renderWorkbench();
    const recommendations = response.recommendations ?? response.audit.recommendations;
    addQaLog(
      "audit",
      "审计完成",
      "完成",
      `审计完成：发现 ${recommendations.pageIssues.length} 个逐页问题、${recommendations.clickRisks.length} 个点击风险、${recommendations.wpsCompatibilityRisks.length} 个 WPS 风险。`,
    );
  } catch (error) {
    statusEl.textContent = "错误";
    addQaLog("audit", "审计失败", "错误", errorMessage(error));
  }
}

async function uploadReferenceFiles(files: File[]): Promise<void> {
  statusEl.textContent = "上传中";
  for (const file of files) {
    try {
      const response = file.size > largePptxThresholdBytes
        ? await fetchJson<UploadReferenceResponse>("/api/upload-reference/metadata", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type || "application/octet-stream",
          }),
        })
        : await fetchJson<UploadReferenceResponse>("/api/upload-reference", {
          method: "POST",
          headers: {
            "content-type": file.type || "application/octet-stream",
            "x-file-name": encodeURIComponent(file.name),
          },
          body: await file.arrayBuffer(),
        });
      lastUpload = response.uploads.latestUpload ?? undefined;
      lastUploadIntent = response.intent;
      workbenchState = await fetchJson<WorkbenchStateResponse>("/api/workbench-state");
      statusEl.textContent = "等待用途确认";
      selectedTab = "codex";
      inspectorCollapsed = false;
      const uploadNote = response.note ?? "已上传，等待 Codex 在当前对话中确认用途。";
      addQaLog(
        "system",
        "上传已记录",
        "提示",
        `${file.name} · ${formatBytes(file.size)} · ${uploadNote}`,
        response,
      );
      showToast("已上传", uploadNote);
      renderWorkbench();
    } catch (error) {
      statusEl.textContent = "上传失败";
      addQaLog("system", "上传失败", "错误", `${file.name}：${errorMessage(error)}`);
      showToast("上传失败", errorMessage(error), true);
    }
  }
}

async function refreshRevisionPlan(): Promise<void> {
  try {
    revisionPlan = await fetchJson<RevisionPlanSummary>("/api/revision-plan");
  } catch (error) {
    addQaLog("system", "读取改稿计划失败", "错误", errorMessage(error));
  }
}

async function refreshCodexInbox(): Promise<void> {
  try {
    codexInbox = await fetchJson<CodexInboxSummary>("/api/codex-inbox");
  } catch (error) {
    addQaLog("system", "读取批注记录失败", "错误", errorMessage(error));
  }
}

async function refreshPlaybackQaSummary(): Promise<void> {
  try {
    playbackQaSummary = await fetchJson<PlaybackQaSummary>("/api/playback-qa");
  } catch (error) {
    playbackLastPersistStatus = "落盘失败";
    addQaLog("system", "读取播放 QA 失败", "错误", errorMessage(error));
  }
}

async function refreshWorkbenchState(): Promise<void> {
  try {
    workbenchState = await fetchJson<WorkbenchStateResponse>("/api/workbench-state");
    await refreshRevisionPlan();
    await refreshCodexInbox();
    await refreshPlaybackQaSummary();
    addQaLog("system", "读取状态", "完成", `当前项目：${workbenchState.projectName}；最近导出：${workbenchState.export.lastExportStatus ?? "none"}。`);
    renderWorkbench();
  } catch (error) {
    addQaLog("system", "读取状态失败", "错误", errorMessage(error));
  }
}

async function reloadWorkbenchData(action: string): Promise<void> {
  specResponse = await fetchJson<ApiSpecResponse>("/api/spec");
  workbenchState = await fetchJson<WorkbenchStateResponse>("/api/workbench-state");
  projectName = workbenchState.projectName || projectName || defaultProjectName;
  await refreshRevisionPlan();
  await refreshCodexInbox();
  await refreshPlaybackQaSummary();
  addQaLog("system", action, "完成", "已重新读取 deck-spec、revision-plan、Codex inbox 和 workbench-state。");
  renderWorkbench();
}

async function runHistoryAction(kind: "undo" | "redo", button: HTMLButtonElement): Promise<void> {
  await withBusy(button, kind === "undo" ? "撤销中" : "返回中", async () => {
    await fetchJson<UndoStateSummary>(kind === "undo" ? "/api/undo" : "/api/redo", { method: "POST" });
    await reloadWorkbenchData(kind === "undo" ? "撤销并刷新" : "返回并刷新");
    showToast(kind === "undo" ? "已撤销" : "已返回", "文件状态和预览已刷新。");
  });
}

async function processCodexQueue(): Promise<void> {
  const result = await fetchJson<CodexQueueProcessResponse>("/api/codex-queue/process", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ limit: 1 }),
  });
  codexInbox = result.inbox;
  revisionPlan = result.revision;
  await reloadWorkbenchData("Codex 队列自动处理");
  const latest = result.latestProcessed;
  if (latest?.status === "applied" && latest.diff) {
    showToast("批注已自动处理", "deck-spec 已修改，预览已刷新。");
    addQaLog(
      "user-comment",
      "自动处理批注",
      "完成",
      `修改 ${latest.diff.file} · ${latest.diff.slideId} / ${latest.diff.objectId ?? "页面"} · ${latest.diff.before} -> ${latest.diff.after}`,
      latest,
    );
    return;
  }
  const message = latest?.reason ?? "未产生可应用的 deck-spec 修改。";
  const needsCodex = latest?.status === "needs-codex" || latest?.status === "needs-design";
  showToast(needsCodex ? "需要 Codex 处理" : "处理失败", message, latest?.status === "failed");
  addQaLog("user-comment", needsCodex ? "需要 Codex 处理" : "自动处理失败", latest?.status === "failed" ? "错误" : "提示", message, latest);
}

async function generateRevisionPlanFromAudit(): Promise<void> {
  statusEl.textContent = "生成改稿计划";
  try {
    revisionPlan = await fetchJson<RevisionPlanSummary>("/api/revision-plan/from-audit", { method: "POST" });
    selectedTab = "codex";
    statusEl.textContent = "改稿计划已生成";
    addQaLog(
      "audit",
      "生成改稿计划",
      "完成",
      `已写入 ${revisionPlan.path}，共 ${revisionPlan.actionCount} 个 action，高优先级 ${revisionPlan.highPriorityCount} 个。`,
    );
    renderWorkbench();
  } catch (error) {
    statusEl.textContent = "错误";
    addQaLog("audit", "生成改稿计划失败", "错误", errorMessage(error));
  }
}

async function handleCanvasAnnotationClick(event: MouseEvent): Promise<void> {
  if (!annotationActive || playbackActive) {
    return;
  }
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  if (target.closest("#annotation-submit")) {
    const input = slideCanvas.querySelector<HTMLTextAreaElement>("#annotation-instruction");
    await submitAnnotation(input?.value ?? "");
    return;
  }
  if (target.closest("#annotation-open-composer")) {
    if (annotationSelection?.scope === "object") {
      annotationSelection = { ...annotationSelection, composerOpen: true };
      renderWorkbench();
      requestAnimationFrame(() => {
        slideCanvas.querySelector<HTMLTextAreaElement>("#annotation-instruction")?.focus();
      });
    }
    return;
  }
  if (target.closest(".annotation-composer")) {
    return;
  }
  if (ignoreNextCanvasClick) {
    ignoreNextCanvasClick = false;
    return;
  }

  const slide = specResponse.spec.slides[selectedSlideIndex] ?? specResponse.spec.slides[0];
  const surface = target.closest<HTMLElement>(".slide-surface");
  if (!surface) {
    if (annotationSelection || annotationDrag) {
      annotationSelection = undefined;
      annotationDrag = undefined;
      ignoreNextCanvasClick = false;
      renderWorkbench();
    }
    return;
  }
  if (annotationMode !== "object") {
    annotationSelection = undefined;
    renderWorkbench();
    return;
  }
  const objectNode = target.closest<HTMLElement>("[data-object-id]");
  if (objectNode && objectNode.dataset.objectRole !== "background") {
    const objectId = objectNode.dataset.objectId ?? "";
    const found = findElement(slide, objectId);
    if (!found) {
      return;
    }
    const bounds = elementBounds(found.element);
    annotationSelection = {
      slideId: slide.id,
      objectId,
      objectType: found.element.kind,
      objectRole: found.layer.role,
      scope: "object",
      bounds,
      composerX: annotationComposerX(bounds.x, bounds.w),
      composerY: Math.min(6.2, bounds.y + bounds.h + 0.12),
      composerOpen: false,
    };
    renderWorkbench();
    return;
  }
  annotationSelection = undefined;
  annotationDrag = undefined;
  renderWorkbench();
}

function handleCanvasAnnotationPointerDown(event: PointerEvent): void {
  if (!annotationActive || playbackActive || event.button !== 0 || isTypingTarget(event.target)) {
    return;
  }
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  if (target.closest("#annotation-open-composer")) {
    event.preventDefault();
    event.stopPropagation();
    if (annotationSelection?.scope === "object") {
      annotationSelection = { ...annotationSelection, composerOpen: true };
      renderWorkbench();
      requestAnimationFrame(() => {
        slideCanvas.querySelector<HTMLTextAreaElement>("#annotation-instruction")?.focus();
      });
    }
    return;
  }
  if (target.closest(".annotation-composer") || target.closest(".annotation-ask-codex")) {
    return;
  }
  if (annotationMode === "object") {
    const slide = specResponse.spec.slides[selectedSlideIndex] ?? specResponse.spec.slides[0];
    const objectNode = target.closest<HTMLElement>("[data-object-id]");
    if (!objectNode || objectNode.dataset.objectRole === "background") {
      return;
    }
    const objectId = objectNode.dataset.objectId ?? "";
    const found = findElement(slide, objectId);
    if (!found) {
      return;
    }
    const bounds = elementBounds(found.element);
    annotationSelection = {
      slideId: slide.id,
      objectId,
      objectType: found.element.kind,
      objectRole: found.layer.role,
      scope: "object",
      bounds,
      composerX: annotationComposerX(bounds.x, bounds.w),
      composerY: Math.min(6.2, bounds.y + bounds.h + 0.12),
      composerOpen: false,
    };
    annotationDrag = undefined;
    renderWorkbench();
    return;
  }
  if (annotationMode !== "region") {
    return;
  }
  if (target.closest(".annotation-composer") || target.closest(".annotation-ask-codex")) {
    return;
  }
  const surface = slideCanvas.querySelector<HTMLElement>(".slide-surface");
  if (!surface || !isFreeAnnotationPointerTarget(target)) {
    return;
  }
  const slide = specResponse.spec.slides[selectedSlideIndex] ?? specResponse.spec.slides[0];
  const point = pointerToExtendedSlidePoint(event, surface);
  annotationDrag = { slideId: slide.id, start: point, current: point };
  annotationSelection = undefined;
  pasteboard.setPointerCapture(event.pointerId);
  renderWorkbench();
}

function handleCanvasAnnotationPointerMove(event: PointerEvent): void {
  if (!annotationDrag) {
    return;
  }
  const surface = slideCanvas.querySelector<HTMLElement>(".slide-surface");
  if (!surface) {
    return;
  }
  annotationDrag = {
    ...annotationDrag,
    current: pointerToExtendedSlidePoint(event, surface),
  };
  renderWorkbench();
}

function handleCanvasAnnotationPointerUp(event: PointerEvent): void {
  if (!annotationDrag) {
    return;
  }
  const surface = slideCanvas.querySelector<HTMLElement>(".slide-surface");
  const drag = annotationDrag;
  annotationDrag = undefined;
  if (!surface) {
    renderWorkbench();
    return;
  }
  const end = pointerToExtendedSlidePoint(event, surface);
  const bounds = normalizeDragBounds(drag.start, end);
  const surfaceRect = surface.getBoundingClientRect();
  const dragPixelWidth = (bounds.w / 13.333) * surfaceRect.width;
  const dragPixelHeight = (bounds.h / 7.5) * surfaceRect.height;
  if (Math.hypot(dragPixelWidth, dragPixelHeight) < 10) {
    annotationSelection = undefined;
    renderWorkbench();
    return;
  }
  const slide = specResponse.spec.slides[selectedSlideIndex] ?? specResponse.spec.slides[0];
  annotationSelection = {
    slideId: slide.id,
    objectId: null,
    objectType: "region",
    scope: "region",
    bounds,
    candidateObjectIds: candidateObjectsForRegion(slide, bounds),
    composerX: annotationComposerX(bounds.x, bounds.w),
    composerY: Math.min(6.2, bounds.y + bounds.h + 0.12),
    composerOpen: true,
    regionNumber: regionAnnotationCounter,
  };
  ignoreNextCanvasClick = true;
  renderWorkbench();
  requestAnimationFrame(() => {
    slideCanvas.querySelector<HTMLTextAreaElement>("#annotation-instruction")?.focus();
  });
}

async function submitAnnotation(rawInstruction: string): Promise<void> {
  const instruction = rawInstruction.trim();
  if (!instruction) {
    showToast("批注未提交", "请先填写修改要求。", true);
    return;
  }
  if (!annotationSelection) {
    showToast("批注未提交", "请先选择对象或页面空白区域。", true);
    return;
  }
  try {
    const response = await fetchJson<CodexInboxPostResponse>("/api/codex-inbox", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        selectedSlideId: annotationSelection.slideId,
        selectedObjectId: annotationSelection.objectId,
        selectedObjectType: annotationSelection.objectType,
        selectionBounds: annotationSelection.bounds,
        candidateObjectIds: annotationSelection.candidateObjectIds,
        userInstruction: instruction,
        scope: annotationSelection.scope,
        status: "todo",
        objectRole: annotationSelection.objectRole,
      }),
    });
    codexInbox = response.inbox;
    revisionPlan = response.revision;
    const event = response.event;
    if (annotationSelection.scope === "region") {
      regionAnnotationCounter += 1;
    }
    annotationSelection = undefined;
    annotationDrag = undefined;
    ignoreNextCanvasClick = false;
    const bridgeStatus = response.bridgeEvent?.status;
    const bridgeText = bridgeStatus === "bridge_unavailable"
      ? "已写入 bridge 队列；未连接 Codex，等待 builder 注册当前会话。"
      : "已写入 bridge 队列，等待 Codex 当前对话读取。";
    showToast("批注已记录", bridgeText);
    addQaLog("user-comment", "提交批注", "提示", `${event.selectedSlideId} / ${event.selectedObjectId ?? "页面"} / ${instruction} · ${bridgeText}`, response);
    renderWorkbench();
    await processCodexQueue();
  } catch (error) {
    showToast("批注提交失败", errorMessage(error), true);
    addQaLog("user-comment", "提交批注失败", "错误", errorMessage(error));
  }
}

function renderWorkbench(): void {
  const { spec } = specResponse;
  const selectedSlide = spec.slides[selectedSlideIndex] ?? spec.slides[0];
  const preview = previewDescriptors[previewState];
  const latestQa = qaEntries[0];
  document.title = `${spec.title} · PPTX Workbench`;
  appShell.classList.toggle("nav-collapsed", slideNavCollapsed);
  appShell.classList.toggle("inspector-collapsed", inspectorCollapsed);
  appShell.classList.toggle("dock-open", dockOpen);
  appShell.classList.toggle("annotating", annotationActive);
  appShell.classList.toggle("annotation-object-mode", annotationActive && annotationMode === "object");
  appShell.classList.toggle("annotation-region-mode", annotationActive && annotationMode === "region");
  appShell.dataset.themeMode = themeMode;
  document.documentElement.dataset.themeMode = themeMode;
  bottomDrawer.classList.toggle("hidden", !dockOpen);
  toggleSlideNav.textContent = slideNavCollapsed ? "展开" : "收起";
  toggleInspector.textContent = inspectorCollapsed ? "展开" : "收起";
  toggleDock.textContent = dockOpen ? "收起底部面板" : "展开底部面板";
  deckTitle.textContent = spec.title;
  projectNameLabel.textContent = projectName;
  topSlidePosition.textContent = `当前页：${selectedSlideIndex + 1} / ${spec.slides.length}`;
  renderCodexBridgeStatus();
  annotationToggle.classList.toggle("active", annotationActive);
  annotationToggle.querySelector("span")!.textContent = annotationActive ? "批注中" : "批注";
  annotationToggle.setAttribute("aria-pressed", String(annotationActive));
  renderAnnotationModeButton();
  slideCount.textContent = String(spec.slides.length);
  renderThemeSegments();
  renderOverlayToggles();
  lastOperation.textContent = `最近操作：${latestQa.action} / ${latestQa.status} / ${latestQa.summary}`;
  lastExportStatus.textContent = `最近导出：${exportStatusLabel()}`;
  revisionStatus.textContent = `改稿计划：${revisionPlan ? `${revisionPlan.actionCount} 条` : "读取中"}`;
  const undo = workbenchState?.undo;
  undoActionButton.textContent = `撤销 ${undo?.undoCount ?? 0} / ${undo?.maxUndo ?? 100}`;
  redoActionButton.textContent = `返回 ${undo?.redoCount ?? 0}`;
  undoActionButton.disabled = (undo?.undoCount ?? 0) <= 0;
  redoActionButton.disabled = (undo?.redoCount ?? 0) <= 0;
  qaCount.textContent = `QA：${qaEntries.length + playbackQaRecords.length} · ${playbackLastPersistStatus}`;
  revisionPlanDockSummary.textContent = revisionPlan
    ? `共 ${revisionPlan.actionCount} 条 action，高优先级 ${revisionPlan.highPriorityCount} 条。`
    : "正在读取 revision-plan。";

  slideList.innerHTML = spec.slides.map(renderSlideThumb).join("");
  for (const button of slideList.querySelectorAll<HTMLButtonElement>("button[data-slide-index]")) {
    button.addEventListener("click", () => {
      selectedSlideIndex = Number(button.dataset.slideIndex ?? "0");
      annotationSelection = undefined;
      annotationDrag = undefined;
      closeFloatingPopovers();
      renderWorkbench();
    });
  }

  renderPreviewSegments();
  renderBottomTabs();
  renderCodexInboxList();
  renderRevisionActionsList();

  for (const tab of document.querySelectorAll<HTMLButtonElement>(".tabs button[data-tab]")) {
    tab.classList.toggle("active", tab.dataset.tab === selectedTab);
  }

  renderSlideCanvas(selectedSlide);
  renderInspector(selectedSlide);
  renderPlaybackOverlay();
  const generateRevisionPlanButton = document.querySelector<HTMLButtonElement>("#generate-revision-plan");
  generateRevisionPlanButton?.addEventListener("click", async () => {
    await generateRevisionPlanFromAudit();
  });
  renderExportPreview();
  renderQaLog();
  repositionActivePopover();
}

function renderAnnotationModeButton(): void {
  annotationModeToggle.classList.toggle("hidden", !annotationActive);
  annotationModeToggle.classList.toggle("active", annotationMode === "region");
  annotationModeToggle.setAttribute("aria-pressed", String(annotationMode === "region"));
  annotationModeToggle.title = annotationMode === "region" ? "切回对象批注" : "切换为自由批注";
  annotationModeToggle.innerHTML = annotationMode === "region"
    ? `<span>自由批注</span>`
    : `<svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 6.2h9.8a3.1 3.1 0 0 1 3.1 3.1v3.5a3.1 3.1 0 0 1-3.1 3.1H10l-4.4 3.2v-3.2H5a3.1 3.1 0 0 1-3.1-3.1V9.3A3.1 3.1 0 0 1 5 6.2Z"></path>
        <path d="M17.7 2.8v5.4M15 5.5h5.4"></path>
      </svg>`;
}

function renderCodexBridgeStatus(): void {
  const bridge = workbenchState?.codexBridge;
  const connected = Boolean(bridge?.connected);
  codexBridgeStatus.classList.toggle("connected", connected);
  codexBridgeStatus.classList.toggle("disconnected", !connected);
  codexBridgeStatus.classList.toggle("unavailable", bridge?.status === "bridge_unavailable" || bridge?.status === "expired" || (bridge?.bridgeUnavailableCount ?? 0) > 0);
  if (connected) {
    if (!bridge?.appServer.available) {
      codexBridgeStatus.textContent = "已注册会话，未发现 app-server";
      codexBridgeStatus.title = bridge?.appServer.reason ?? "已注册 threadId，但未发现可用 Codex app-server transport。";
      return;
    }
    codexBridgeStatus.textContent = "已连接 Codex";
    codexBridgeStatus.title = bridge?.threadId ? `threadId: ${bridge.threadId}` : "已连接 Codex";
    return;
  }
  if (bridge?.status === "expired" || bridge?.expired) {
    codexBridgeStatus.textContent = "连接 token 已失效，请重新连接";
    codexBridgeStatus.title = "当前 threadId 已过期；请从 builder 或当前 Codex 对话重新连接。";
    return;
  }
  if (bridge?.status === "bridge_unavailable" || (bridge?.bridgeUnavailableCount ?? 0) > 0) {
    codexBridgeStatus.textContent = "Codex 桥接不可用，事件已排队";
    codexBridgeStatus.title = "事件已排队；当前没有可用 Codex bridge。";
    return;
  }
  codexBridgeStatus.textContent = "未连接 Codex";
  codexBridgeStatus.title = "未连接 Codex，请从 builder 启动或在当前 Codex 对话运行连接命令";
}

function toggleAnchoredPopover(popover: HTMLElement, trigger: HTMLElement): void {
  if (activePopover?.element === popover && !popover.classList.contains("hidden")) {
    closeFloatingPopovers();
    return;
  }
  closeFloatingPopovers();
  popover.classList.remove("hidden");
  activePopover = { element: popover, trigger };
  positionPopover(popover, trigger);
}

function closeFloatingPopovers(): void {
  moreActionsPopover.classList.add("hidden");
  previewSettingsPopover.classList.add("hidden");
  projectNamePopover.classList.add("hidden");
  moreActionsPopover.removeAttribute("data-anchor-ready");
  previewSettingsPopover.removeAttribute("data-anchor-ready");
  projectNamePopover.removeAttribute("data-anchor-ready");
  activePopover = undefined;
}

function repositionActivePopover(): void {
  if (!activePopover || activePopover.element.classList.contains("hidden")) {
    return;
  }
  if (!isElementVisible(activePopover.trigger)) {
    closeFloatingPopovers();
    return;
  }
  positionPopover(activePopover.element, activePopover.trigger);
}

function positionPopover(popover: HTMLElement, trigger: HTMLElement): void {
  const triggerRect = trigger.getBoundingClientRect();
  const popoverRect = popover.getBoundingClientRect();
  const margin = 10;
  let top = triggerRect.bottom + margin;
  let left = triggerRect.left;
  if (top + popoverRect.height > window.innerHeight - margin) {
    top = triggerRect.top - popoverRect.height - margin;
  }
  if (left + popoverRect.width > window.innerWidth - margin) {
    left = triggerRect.right - popoverRect.width;
  }
  top = Math.max(margin, Math.min(top, window.innerHeight - popoverRect.height - margin));
  left = Math.max(margin, Math.min(left, window.innerWidth - popoverRect.width - margin));
  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;
  popover.style.right = "auto";
  popover.dataset.anchorReady = "true";
}

function isElementVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
}

function renderWorkflowSteps(): string {
  const steps = ["内容", "视觉", "生成", "审计", "导出", "录屏", "改稿"];
  const activeIndex = workflowActiveIndex();
  return steps
    .map((step, index) => {
      const state = index < activeIndex ? "done" : index === activeIndex ? "active" : "pending";
      return `<span class="${state}"><i></i>${escapeHtml(step)}</span>`;
    })
    .join("");
}

function renderThemeSegments(): void {
  const themes: Array<{ mode: ThemeMode; label: string }> = [
    { mode: "system", label: "跟随系统" },
    { mode: "light", label: "浅色" },
    { mode: "dark", label: "深色" },
  ];
  themeSegments.innerHTML = themes
    .map(
      (theme) => `
        <button class="${theme.mode === themeMode ? "active" : ""}" type="button" data-theme-mode="${theme.mode}">
          ${theme.label}
        </button>
      `,
    )
    .join("");
  for (const button of themeSegments.querySelectorAll<HTMLButtonElement>("button[data-theme-mode]")) {
    button.addEventListener("click", () => {
      const nextMode = button.dataset.themeMode as ThemeMode;
      if (nextMode === themeMode) {
        return;
      }
      themeMode = nextMode;
      appShell.dataset.themeMode = themeMode;
      document.documentElement.dataset.themeMode = themeMode;
      addQaLog("system", "切换主题", "提示", `已切换为${themeLabel(themeMode)}。`);
      renderWorkbench();
    });
  }
}

function themeLabel(mode: ThemeMode): string {
  if (mode === "light") {
    return "浅色模式";
  }
  if (mode === "dark") {
    return "深色模式";
  }
  return "跟随系统";
}

function workflowActiveIndex(): number {
  if (lastExport || workbenchState?.export.lastExportDir) {
    return 5;
  }
  if (lastAudit) {
    return 4;
  }
  if (lastVerify) {
    return 3;
  }
  if (lastGenerate) {
    return 2;
  }
  return 1;
}

function currentNeedConfirmation(): string {
  if (!lastGenerate) {
    return "请确认当前视觉预览；暂无阻塞，Codex 可继续修改 deck-spec 或先生成 PPTX。";
  }
  if (!lastVerify) {
    return "PPTX 已生成，请运行验证，确认 Rich/WPS 输出没有回退。";
  }
  if (!lastAudit) {
    return "验证已完成，可通过顶部上传 PPTX 作为检查输入，或确认导出文件夹名后交付。";
  }
  if (!lastExport && !workbenchState?.export.lastExportDir) {
    return "请确认审计建议和导出文件夹名；确认后导出到锁定桌面目录。";
  }
  return "暂无阻塞，Codex 可继续根据录屏 QA 或审计建议改稿。";
}

function compactNeedConfirmation(): string {
  if (!lastGenerate) {
    return "确认视觉预览，可继续生成。";
  }
  if (!lastVerify) {
    return "已生成，等待验证。";
  }
  if (!lastAudit) {
    return "已验证，可审计或导出。";
  }
  if (!lastExport && !workbenchState?.export.lastExportDir) {
    return "确认审计建议与导出文件夹。";
  }
  return "暂无阻塞，可继续改稿。";
}

function exportStatusLabel(): string {
  const exportDir = lastExport?.exportDir ?? workbenchState?.export.lastExportDir;
  if (!exportDir) {
    return "无";
  }
  const matches = lastExport ? lastExport.projectName === projectName : workbenchState?.export.lastExportMatchesProject !== false;
  return `${matches ? "当前项目" : "历史导出"} · ${exportDir}`;
}

function renderPreviewSegments(): void {
  previewSegments.innerHTML = (Object.keys(previewDescriptors) as PreviewState[])
    .map(
      (state) => `
        <button class="${state === previewState ? "active" : ""}" type="button" data-preview-state="${state}">
          ${escapeHtml(previewDescriptors[state].label)}
        </button>
      `,
    )
    .join("");
  for (const button of previewSegments.querySelectorAll<HTMLButtonElement>("button[data-preview-state]")) {
    button.addEventListener("click", () => {
      const nextState = button.dataset.previewState as PreviewState;
      if (nextState === previewState) {
        return;
      }
      previewState = nextState;
      annotationSelection = undefined;
      closeFloatingPopovers();
      const descriptor = previewDescriptors[previewState];
      addQaLog("system", "切换预览", "提示", `切换到 ${descriptor.label}。`);
      renderWorkbench();
    });
  }
}

function renderOverlayToggles(): void {
  const overlays: Array<{ key: OverlayKey; label: string }> = [
    { key: "alignmentGuides", label: "对齐线" },
    { key: "safeFrame", label: "安全框" },
    { key: "objectBounds", label: "对象边界" },
    { key: "stateBadge", label: "状态标签" },
    { key: "revealDebug", label: "Reveal 调试" },
  ];
  overlayToggles.innerHTML = `
    <span>调试图层</span>
    ${overlays
      .map(
        (overlay) => `
          <button class="${overlaySettings[overlay.key] ? "active" : ""}" type="button" data-overlay-key="${overlay.key}">
            ${escapeHtml(overlay.label)}
          </button>
        `,
      )
      .join("")}
  `;
  for (const button of overlayToggles.querySelectorAll<HTMLButtonElement>("button[data-overlay-key]")) {
    button.addEventListener("click", () => {
      const key = button.dataset.overlayKey as OverlayKey;
      overlaySettings[key] = !overlaySettings[key];
      addQaLog("system", "切换 overlay", "提示", `${button.textContent?.trim() ?? key}：${overlaySettings[key] ? "开启" : "关闭"}。`);
      renderWorkbench();
    });
  }
}

function renderBottomTabs(): void {
  for (const button of bottomTabs.querySelectorAll<HTMLButtonElement>("button[data-bottom-tab]")) {
    button.classList.toggle("active", button.dataset.bottomTab === bottomTab);
  }
  for (const panel of bottomDrawer.querySelectorAll<HTMLElement>(".bottom-tab-panel[data-panel]")) {
    panel.classList.toggle("active", panel.dataset.panel === bottomTab);
  }
}

function renderSlideThumb(slide: SlideView, index: number): string {
  const beat = slide.sceneBeats?.[0];
  const activeClass = index === selectedSlideIndex ? " active" : "";
  return `
    <button class="slide-thumb${activeClass}" type="button" data-slide-index="${index}" title="${escapeHtml(slide.title ?? slide.id)}">
      <span class="thumb-index">${index + 1}</span>
      <span class="thumb-art real-slide-thumb">
        ${renderSlideSurface(slide, {
          preview: previewDescriptors["rich-after"],
          thumbnail: true,
          debug: {
            alignmentGuides: false,
            safeFrame: false,
            objectBounds: false,
            stateBadge: false,
            revealDebug: false,
          },
        })}
      </span>
      <span class="thumb-meta">
        <strong>${escapeHtml(slide.title ?? slide.id)}</strong>
        <small>${escapeHtml(beat?.label ?? "静态页")}</small>
      </span>
    </button>
  `;
}

function renderSlideCanvas(slide: SlideView): void {
  const preview = previewDescriptors[previewState];
  const stateClass = preview.revealVisible ? "reveals-visible" : "reveals-hidden";
  const debugActive = Object.values(overlaySettings).some(Boolean);
  slideCanvas.className = `slide-canvas ${stateClass} preview-${previewState} ${debugActive ? "slide-debug-enabled" : "slide-clean"}`;
  slideCanvas.innerHTML = `
    ${renderSlideSurface(slide, {
      preview,
      thumbnail: false,
      debug: overlaySettings,
    })}
    <div class="annotation-stage-overlay">
      ${annotationActive && annotationDrag?.slideId === slide.id ? renderAnnotationDragOverlay(annotationDrag) : ""}
      ${annotationActive && annotationSelection?.slideId === slide.id ? renderAnnotationOverlay(slide, annotationSelection) : ""}
    </div>
  `;
  bindAnnotationComposerControls();
}

function renderSlideSurface(
  slide: SlideView,
  options: {
    preview: PreviewDescriptor;
    thumbnail: boolean;
    debug: Record<OverlayKey, boolean>;
  },
): string {
  const selected = selectedObjectForSlide(slide);
  const elements = orderedSlideElements(slide);
  const background = colorToken(slideBackground(slide));
  return `
    <div class="${options.thumbnail ? "thumb-slide-surface" : "slide-surface"}" style="background:${escapeHtml(background)};">
      ${options.debug.safeFrame ? `<div class="safe-margin"></div>` : ""}
      ${options.debug.alignmentGuides ? `<div class="guide-line guide-line-v"></div><div class="guide-line guide-line-h"></div>` : ""}
      ${
        options.debug.stateBadge
          ? `<div class="preview-badge ${options.preview.family.toLowerCase()}">
              <strong>${escapeHtml(options.preview.label)}</strong>
              <span>${escapeHtml(options.preview.family)} · ${escapeHtml(options.preview.wpsStateLabel)}</span>
            </div>`
          : ""
      }
      ${elements.map(({ layer, element }) => renderSpecElement(slide, layer, element, options)).join("")}
      ${options.preview.family === "差异" && !options.thumbnail ? renderDiffOverlay() : ""}
      ${options.debug.revealDebug && !options.thumbnail ? renderRevealDebug(slide, options.preview) : ""}
      ${options.debug.objectBounds ? renderSelectionBox(selected) : ""}
    </div>
  `;
}

function orderedSlideElements(slide: SlideView): Array<{ layer: LayerView; element: ElementView }> {
  const order = ["background", "decor", "hero", "text", "info_layer"];
  return [...slide.layers]
    .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role))
    .flatMap((layer) => layer.elements.map((element) => ({ layer, element })));
}

function renderSpecElement(
  slide: SlideView,
  layer: LayerView,
  element: ElementView,
  options: {
    preview: PreviewDescriptor;
    thumbnail: boolean;
    debug: Record<OverlayKey, boolean>;
  },
): string {
  if (!shouldShowElement(slide, element, options.preview)) {
    return "";
  }
  const selectableClass = annotationActive && !options.thumbnail ? " annotation-selectable" : "";
  const baseClass = `spec-element spec-${escapeHtml(element.kind)} layer-${escapeHtml(layer.role)}${selectableClass}`;
  const style = elementStyle(element, layer);
  const title = `${element.id} · ${layer.role}`;
  if (element.kind === "text") {
    return `<div class="${baseClass}" data-object-id="${escapeHtml(element.id)}" data-object-type="text" data-object-role="${escapeHtml(layer.role)}" data-slide-id="${escapeHtml(slide.id)}" title="${escapeHtml(title)}" style="${style}">${formatText(element.text ?? "")}</div>`;
  }
  if (element.kind === "shape") {
    const lineClass = element.shape === "line" ? " spec-line" : "";
    return `<div class="${baseClass}${lineClass}" data-object-id="${escapeHtml(element.id)}" data-object-type="shape" data-object-role="${escapeHtml(layer.role)}" data-slide-id="${escapeHtml(slide.id)}" title="${escapeHtml(title)}" style="${style}"></div>`;
  }
  const src = element.src ? `/${element.src.replace(/^\/+/, "")}` : "";
  return `<img class="${baseClass}" data-object-id="${escapeHtml(element.id)}" data-object-type="image" data-object-role="${escapeHtml(layer.role)}" data-slide-id="${escapeHtml(slide.id)}" title="${escapeHtml(title)}" src="${escapeHtml(src)}" alt="${escapeHtml(element.id)}" style="${style}" />`;
}

function renderAnnotationOverlay(slide: SlideView, selection: AnnotationSelection): string {
  const boxStyle = boundsStyle(selection.bounds);
  const composerPosition = annotationComposerPosition(selection);
  const selectionLabel = selection.scope === "region"
    ? `第 ${selectedSlideIndex + 1} 页 · 自由区域`
    : `第 ${selectedSlideIndex + 1} 页 · ${selection.objectId ?? selection.objectType}`;
  const askLeft = toSlidePercent(Math.min(12, selection.bounds.x + selection.bounds.w + 0.12), 13.333);
  const askTop = toSlidePercent(Math.max(0.15, selection.bounds.y), 7.5);
  return `
    <div class="annotation-selection ${selection.scope}" style="${boxStyle}">
      <span>${escapeHtml(selectionLabel)}</span>
      ${selection.scope === "region" ? `<i title="提交后编号">${selection.regionNumber ?? regionAnnotationCounter}</i>` : ""}
    </div>
    ${
      selection.scope === "object" && !selection.composerOpen
        ? `<button id="annotation-open-composer" class="annotation-ask-codex" type="button" style="left:${askLeft}%;top:${askTop}%;">Ask Codex</button>`
        : renderAnnotationComposer(slide, selection, composerPosition)
    }
  `;
}

function renderAnnotationComposer(slide: SlideView, selection: AnnotationSelection, position: { left: string; top: string; anchor: string }): string {
  const context = selection.scope === "region" ? `区域批注 · ${slide.title ?? slide.id}` : `对象批注 · ${selection.objectId ?? slide.id}`;
  return `
    <div class="annotation-composer anchor-${position.anchor}" style="left:${position.left};top:${position.top};">
      <span class="annotation-composer-context">${escapeHtml(context)}</span>
      <div class="annotation-composer-input">
        <textarea id="annotation-instruction" rows="1" placeholder="描述要修改的内容，或提出问题。"></textarea>
        <button id="annotation-submit" class="annotation-composer-submit" type="button" aria-label="提交批注" disabled>↑</button>
      </div>
    </div>
  `;
}

function bindAnnotationComposerControls(): void {
  const textarea = slideCanvas.querySelector<HTMLTextAreaElement>("#annotation-instruction");
  const submit = slideCanvas.querySelector<HTMLButtonElement>("#annotation-submit");
  if (!textarea || !submit) {
    return;
  }
  const update = (): void => {
    const hasText = textarea.value.trim().length > 0;
    const lineCount = hasText ? annotationComposerLineCount(textarea) : 1;
    const isMultiline = hasText && lineCount > 1;
    textarea.style.height = isMultiline ? `${Math.min(68, Math.max(56, lineCount * 22))}px` : "32px";
    submit.disabled = !hasText;
    submit.classList.toggle("is-ready", hasText);
    submit.textContent = isMultiline ? "✓" : "↑";
    textarea.closest(".annotation-composer-input")?.classList.toggle("is-multiline", isMultiline);
    textarea.classList.toggle("is-scrollable", lineCount > 3);
    requestAnimationFrame(positionAnnotationComposerWithinWorkspace);
  };
  textarea.addEventListener("input", update);
  textarea.addEventListener("keydown", async (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (textarea.value.trim()) {
        await submitAnnotation(textarea.value);
      }
    }
  });
  update();
  requestAnimationFrame(positionAnnotationComposerWithinWorkspace);
}

function positionAnnotationComposerWithinWorkspace(): void {
  if (!annotationSelection) {
    return;
  }
  const composer = slideCanvas.querySelector<HTMLElement>(".annotation-composer");
  const pasteboard = slideCanvas.closest<HTMLElement>(".pasteboard");
  const surface = slideCanvas.querySelector<HTMLElement>(".slide-surface");
  if (!composer || !pasteboard || !surface) {
    return;
  }

  const pasteboardRect = pasteboard.getBoundingClientRect();
  const canvasRect = slideCanvas.getBoundingClientRect();
  const surfaceRect = surface.getBoundingClientRect();
  const composerRect = composer.getBoundingClientRect();
  const margin = 10;
  const gap = 12;
  const targetLeft = surfaceRect.left + (annotationSelection.bounds.x / 13.333) * surfaceRect.width;
  const targetTop = surfaceRect.top + (annotationSelection.bounds.y / 7.5) * surfaceRect.height;
  const targetWidth = (annotationSelection.bounds.w / 13.333) * surfaceRect.width;
  const targetHeight = (annotationSelection.bounds.h / 7.5) * surfaceRect.height;
  const targetCenterX = targetLeft + targetWidth / 2;
  const targetCenterY = targetTop + targetHeight / 2;
  const surfaceCenterX = surfaceRect.left + surfaceRect.width / 2;
  const surfaceCenterY = surfaceRect.top + surfaceRect.height / 2;
  const width = composerRect.width;
  const height = composerRect.height;
  const space = {
    top: targetTop - pasteboardRect.top,
    bottom: pasteboardRect.bottom - (targetTop + targetHeight),
    right: pasteboardRect.right - (targetLeft + targetWidth),
    left: targetLeft - pasteboardRect.left,
  };
  const seed = annotationPlacementSeed(annotationSelection);
  const relativeTargetY = (targetCenterY - surfaceCenterY) / (surfaceRect.height / 2);
  const directionOrder = annotationPlacementDirections(
    (targetCenterX - surfaceCenterX) / (surfaceRect.width / 2),
    relativeTargetY,
    seed,
  );
  const crossJitterX = (seededFraction(seed, 1) - 0.5) * 28;
  const crossJitterY = (seededFraction(seed, 2) - 0.5) * 20;
  const gapJitter = seededFraction(seed, 3) * 6;
  const adjustedGap = gap + gapJitter;
  const lowerTargetGap = 2 + seededFraction(seed, 5) * 2;
  const bottomGap = relativeTargetY > 0.16 ? lowerTargetGap : adjustedGap;
  const candidates = directionOrder.map((direction, index) => {
    if (direction === "right") {
      return {
        direction,
        left: targetLeft + targetWidth + adjustedGap,
        top: targetCenterY - height / 2 + crossJitterY,
        fits: space.right >= width + adjustedGap,
        priority: index,
      };
    }
    if (direction === "left") {
      return {
        direction,
        left: targetLeft - width - adjustedGap,
        top: targetCenterY - height / 2 + crossJitterY,
        fits: space.left >= width + adjustedGap,
        priority: index,
      };
    }
    if (direction === "bottom") {
      return {
        direction,
        left: targetCenterX - width / 2 + crossJitterX,
        top: targetTop + targetHeight + bottomGap,
        fits: space.bottom >= height + bottomGap,
        priority: index,
      };
    }
    return {
      direction,
      left: targetCenterX - width / 2 + crossJitterX,
      top: targetTop - height - adjustedGap,
      fits: space.top >= height + adjustedGap,
      priority: index,
    };
  });
  const minLeft = pasteboardRect.left + margin;
  const maxLeft = pasteboardRect.right - width - margin;
  const minTop = pasteboardRect.top + margin;
  const maxTop = pasteboardRect.bottom - height - margin;
  const ranked = candidates
    .map((candidate) => {
      const left = clampToRange(candidate.left, minLeft, maxLeft);
      const top = clampToRange(candidate.top, minTop, maxTop);
      const clampPenalty = Math.abs(left - candidate.left) + Math.abs(top - candidate.top);
      return {
        left,
        top,
        direction: candidate.direction,
        score: (candidate.fits ? 0 : 10000) + candidate.priority * 100 + clampPenalty,
      };
    })
    .sort((a, b) => a.score - b.score);
  const best = ranked[0];
  if (!best) {
    return;
  }
  composer.style.left = `${Math.round(best.left - canvasRect.left)}px`;
  composer.style.top = `${Math.round(best.top - canvasRect.top)}px`;
  composer.dataset.anchor = best.direction;
  composer.dataset.positioned = "true";
}

type AnnotationComposerDirection = "left" | "right" | "top" | "bottom";

function annotationPlacementDirections(dx: number, dy: number, seed: string): AnnotationComposerDirection[] {
  const horizontalThreshold = 0.32;
  const verticalThreshold = 0.16;
  const horizontal: AnnotationComposerDirection | undefined = dx < -horizontalThreshold ? "right" : dx > horizontalThreshold ? "left" : undefined;
  const vertical: AnnotationComposerDirection | undefined = dy < -verticalThreshold ? "bottom" : dy > verticalThreshold ? "bottom" : undefined;
  const preferred: AnnotationComposerDirection[] = [];

  if (horizontal && vertical) {
    const axisGap = Math.abs(Math.abs(dx) - Math.abs(dy));
    const horizontalFirst = axisGap < 0.12 ? seededFraction(seed, 4) >= 0.5 : Math.abs(dx) >= Math.abs(dy);
    preferred.push(horizontalFirst ? horizontal : vertical, horizontalFirst ? vertical : horizontal);
  } else if (horizontal || vertical) {
    preferred.push(horizontal ?? vertical!);
  } else {
    preferred.push("bottom");
  }

  const fallback = seededDirectionOrder(`${seed}:fallback`);
  for (const direction of fallback) {
    if (!preferred.includes(direction)) {
      preferred.push(direction);
    }
  }
  return preferred;
}

function seededDirectionOrder(seed: string): AnnotationComposerDirection[] {
  return (["right", "left", "bottom", "top"] as AnnotationComposerDirection[])
    .map((direction, index) => ({ direction, rank: seededFraction(seed, index + 10) }))
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.direction);
}

function annotationPlacementSeed(selection: AnnotationSelection): string {
  return [
    selection.slideId,
    selection.scope,
    selection.objectId ?? "region",
    selection.objectType,
    selection.regionNumber ?? 0,
    selection.bounds.x.toFixed(2),
    selection.bounds.y.toFixed(2),
    selection.bounds.w.toFixed(2),
    selection.bounds.h.toFixed(2),
  ].join(":");
}

function seededFraction(seed: string, salt: number): number {
  let hash = 2166136261;
  const input = `${seed}:${salt}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function clampToRange(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function annotationComposerLineCount(textarea: HTMLTextAreaElement): number {
  const width = Math.max(1, textarea.clientWidth);
  const styles = window.getComputedStyle(textarea);
  const probe = document.createElement("div");
  probe.style.position = "fixed";
  probe.style.left = "-10000px";
  probe.style.top = "-10000px";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.boxSizing = "border-box";
  probe.style.width = `${width}px`;
  probe.style.padding = "0";
  probe.style.border = "0";
  probe.style.whiteSpace = "pre-wrap";
  probe.style.overflowWrap = "break-word";
  probe.style.wordBreak = "normal";
  probe.style.fontFamily = styles.fontFamily;
  probe.style.fontSize = styles.fontSize;
  probe.style.fontWeight = styles.fontWeight;
  probe.style.letterSpacing = styles.letterSpacing;
  probe.style.lineHeight = "22px";
  probe.textContent = textarea.value.endsWith("\n") ? `${textarea.value}\u00a0` : textarea.value || "\u00a0";
  document.body.appendChild(probe);
  const lineCount = Math.max(1, Math.ceil(probe.scrollHeight / 22));
  probe.remove();
  return lineCount;
}

function renderAnnotationDragOverlay(drag: AnnotationDrag): string {
  const bounds = normalizeDragBounds(drag.start, drag.current);
  return `<div class="annotation-drag-region" style="${boundsStyle(bounds)}"></div>`;
}

function shouldShowElement(slide: SlideView, element: ElementView, preview: PreviewDescriptor): boolean {
  if (!element.hiddenUntilBeat) {
    return true;
  }
  if (!preview.revealVisible) {
    return false;
  }
  const revealElements = slide.sceneBeats?.flatMap((beat) => beat.revealElements ?? []) ?? [];
  return revealElements.includes(element.id);
}

function elementStyle(element: ElementView, layer: LayerView): string {
  const base = [
    `left:${toSlidePercent(element.x, 13.333)}%`,
    `top:${toSlidePercent(element.y, 7.5)}%`,
    `width:${toSlidePercent(element.w, 13.333)}%`,
    `height:${toSlidePercent(element.h, 7.5)}%`,
    `z-index:${layerZIndex(layer.role)}`,
    element.transparency !== undefined ? `opacity:${Math.max(0, Math.min(1, 1 - element.transparency / 100))}` : "",
  ];
  if (element.kind === "text") {
    base.push(
      `font-family:${cssFont(element.fontFace ?? defaultFontForElement(element))}`,
      `font-size:${fontSizeCss(element.fontSize ?? 20)}`,
      `color:${escapeHtml(colorToken(element.color ?? "ink"))}`,
      `font-weight:${element.bold ? 800 : 500}`,
      `font-style:${element.italic ? "italic" : "normal"}`,
      `text-align:${element.align ?? "left"}`,
      `align-items:${valignToFlex(element.valign)}`,
      `justify-content:${alignToFlex(element.align)}`,
    );
  }
  if (element.kind === "shape") {
    if (element.shape === "line") {
      base.push(
        `background:${escapeHtml(colorToken(element.line?.color ?? "ink"))}`,
        `height:${Math.max(1, element.line?.width ?? 1)}px`,
        `opacity:${Math.max(0, Math.min(1, 1 - (element.line?.transparency ?? element.transparency ?? 0) / 100))}`,
      );
    } else {
      base.push(
        `background:${escapeHtml(colorToken(element.fill ?? "paper"))}`,
        `border:${element.line?.width ?? 0}px solid ${escapeHtml(colorToken(element.line?.color ?? "transparent"))}`,
        `border-radius:${shapeRadius(element)}`,
      );
    }
  }
  if (element.kind === "image") {
    base.push("object-fit:contain");
  }
  return base.filter(Boolean).join(";");
}

function renderRevealDebug(slide: SlideView, preview: PreviewDescriptor): string {
  const revealElements = slide.sceneBeats?.[0]?.revealElements ?? [];
  return `
    <div class="reveal-debug">
      <strong>${escapeHtml(preview.label)}</strong>
      <span>可见：${escapeHtml(preview.revealVisible ? revealElements.join(" + ") : "无")}</span>
      <span>隐藏：${escapeHtml(preview.revealVisible ? "无" : revealElements.join(" + "))}</span>
    </div>
  `;
}
function renderDiffOverlay(): string {
  return `
    <div class="diff-overlay">
      <div>
        <b>Rich</b>
        <span>1 次点击触发对象动画簇</span>
        <code>clickEffect parent + withEffect children</code>
      </div>
      <div>
        <b>WPS</b>
        <span>展开为状态页切换</span>
        <code>State 0 → State 1 · fade transition</code>
      </div>
      <div>
        <b>单文件默认</b>
        <span>WPS-compatible.pptx</span>
        <code>更稳的外发交付</code>
      </div>
    </div>
  `;
}

function renderSelectionBox(selected: SelectedObject): string {
  const style = selectedBoxStyle(selected.element);
  return `
    <div class="selection-box" style="${style}">
      <span class="object-label">${escapeHtml(objectLabel(selected.element))}</span>
      <span class="selection-handle nw"></span>
      <span class="selection-handle n"></span>
      <span class="selection-handle ne"></span>
      <span class="selection-handle e"></span>
      <span class="selection-handle se"></span>
      <span class="selection-handle s"></span>
      <span class="selection-handle sw"></span>
      <span class="selection-handle w"></span>
    </div>
  `;
}

function renderInspector(slide: SlideView): void {
  if (selectedTab === "status") {
    renderPageStatusPanel(slide);
    return;
  }
  if (selectedTab === "motion") {
    renderMotionPanel(slide);
    return;
  }
  if (selectedTab === "audit") {
    renderAuditPanel();
    return;
  }
  renderCodexPanel(slide);
}

function renderPageStatusPanel(slide: SlideView): void {
  inspectorBody.innerHTML = `
    <h2>页面摘要</h2>
    ${renderStatePreviewCard(slide)}
    ${renderSelectedObjectCard(slide)}
    <p class="hint">Web preview 基于 deck-spec 同源渲染；像素级结果仍以导出的 PPTX 和真实放映验收为准。</p>
  `;
}

function renderContentPanel(slide: SlideView): void {
  const beat = slide.sceneBeats?.[0];
  inspectorBody.innerHTML = `
    <h2>内容</h2>
    ${renderStatePreviewCard(slide)}
    ${renderSelectedObjectCard(slide)}
    <dl class="compact section-dl">
      <dt>页面 ID</dt><dd>${escapeHtml(slide.id)}</dd>
      <dt>标题</dt><dd>${escapeHtml(slide.title ?? slide.id)}</dd>
      <dt>Scene beat</dt><dd>${escapeHtml(beat?.label ?? "无")}</dd>
      <dt>Reveal 元素</dt><dd>${escapeHtml(beat?.revealElements?.join(" + ") ?? "无")}</dd>
    </dl>
  `;
}

function renderStatePreviewCard(slide: SlideView): string {
  const beat = slide.sceneBeats?.[0];
  const revealElements = beat?.revealElements ?? [];
  const preview = previewDescriptors[previewState];
  return `
    <section class="state-card">
      <div class="panel-heading">
        <strong>状态预览</strong>
        <span>${escapeHtml(preview.label)}</span>
      </div>
      <dl class="compact">
        <dt>当前 preview state</dt><dd>${escapeHtml(previewState)}</dd>
        <dt>scene beat</dt><dd>${escapeHtml(beat?.label ?? "无")}</dd>
        <dt>可见 reveal elements</dt><dd>${escapeHtml(preview.revealVisible ? revealElements.join(" + ") || "无" : "无")}</dd>
        <dt>隐藏 reveal elements</dt><dd>${escapeHtml(preview.revealVisible ? "无" : revealElements.join(" + ") || "无")}</dd>
        <dt>Rich 点击</dt><dd>1 次</dd>
        <dt>WPS 状态</dt><dd>${escapeHtml(wpsStateShortDescription(slide))}</dd>
      </dl>
    </section>
  `;
}

function renderSelectedObjectCard(slide: SlideView): string {
  if (!annotationSelection || annotationSelection.slideId !== slide.id) {
    return `
      <section class="object-card">
        <div class="panel-heading">
          <strong>当前选择</strong>
          <span>未选择</span>
        </div>
        <p class="hint">点击顶部「批注」，可选择对象或拖拽框选区域。</p>
      </section>
    `;
  }
  if (annotationSelection.scope === "region") {
    return `
      <section class="object-card">
        <div class="panel-heading">
          <strong>当前选择</strong>
          <span>区域批注</span>
        </div>
        <dl class="compact">
          <dt>slideId</dt><dd>${escapeHtml(slide.id)}</dd>
          <dt>scope</dt><dd>region</dd>
          <dt>selectedObjectType</dt><dd>region</dd>
          <dt>selectionBounds</dt><dd>x ${formatNumber(annotationSelection.bounds.x)} · y ${formatNumber(annotationSelection.bounds.y)} · w ${formatNumber(annotationSelection.bounds.w)} · h ${formatNumber(annotationSelection.bounds.h)}</dd>
          <dt>candidateObjectIds</dt><dd>${escapeHtml(annotationSelection.candidateObjectIds?.join(" + ") || "无")}</dd>
        </dl>
      </section>
    `;
  }
  const selected = selectedObjectForSlide(slide);
  const element = selected.element;
  return `
    <section class="object-card">
      <div class="panel-heading">
        <strong>当前选中对象</strong>
        <span>${escapeHtml(objectLabel(element))}</span>
      </div>
      <dl class="compact">
        <dt>对象 ID</dt><dd>${escapeHtml(element.id)}</dd>
        <dt>类型</dt><dd>${escapeHtml(element.kind)}</dd>
        <dt>objectId</dt><dd>${escapeHtml(element.id)}</dd>
        <dt>layerRole</dt><dd>${escapeHtml(selected.layer.role)}</dd>
        <dt>图层角色</dt><dd>${escapeHtml(selected.layer.role)}</dd>
        <dt>位置</dt><dd>x ${formatNumber(element.x)} · y ${formatNumber(element.y)}</dd>
        <dt>尺寸</dt><dd>w ${formatNumber(element.w)} · h ${formatNumber(element.h)}</dd>
        <dt>是否参与动画</dt><dd>${selected.participatesInAnimation ? "是，属于当前 scene beat" : "否，静态对象"}</dd>
      </dl>
    </section>
  `;
}

function renderLayersPanel(slide: SlideView): void {
  inspectorBody.innerHTML = `
    <h2>图层</h2>
    <div class="layer-list">
      ${slide.layers
        .map(
          (layer) => `
            <section class="layer-group">
              <div class="layer-row">
                <strong>${escapeHtml(layer.role)}</strong>
                <span>${escapeHtml(layer.id)} · ${layer.elements.length} 个元素</span>
              </div>
              <div class="layer-elements">
                ${layer.elements
                  .map(
                    (element) => `
                      <div class="layer-element">
                        <span>${escapeHtml(element.id)}</span>
                        <code>${escapeHtml(element.kind)}</code>
                      </div>
                    `,
                  )
                  .join("")}
              </div>
            </section>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderMotionPanel(slide: SlideView): void {
  const beat = slide.sceneBeats?.[0];
  const preview = previewDescriptors[previewState];
  const auditRisk = lastAudit?.recommendations.overallRisk ?? "low";
  const rows = animationRowsForSlide(slide);
  inspectorBody.innerHTML = `
    <h2>动画与兼容</h2>
    <section class="motion-summary-card" aria-label="动画簇摘要">
      <div class="panel-heading">
        <strong>点击 1 · ${escapeHtml(beat?.label ?? "scene beat")}</strong>
        <span>预计 1100ms</span>
      </div>
      <dl class="compact section-dl">
        <dt>对象数量</dt><dd>${rows.length}</dd>
        <dt>触发方式</dt><dd>clickEffect parent</dd>
        <dt>并行动画</dt><dd>${rows.filter((row) => row.start === "withPrevious").length} 个 withPrevious children</dd>
        <dt>WPS 状态页映射</dt><dd>${escapeHtml(wpsStateShortDescription(slide))}</dd>
        <dt>风险状态</dt><dd><span class="risk-badge risk-${auditRisk}">${lastAudit ? `${riskLabel(auditRisk)} · 点击风险 ${lastAudit.recommendations.clickRisks.length}` : "未审计"}</span></dd>
      </dl>
      <button id="open-timeline" class="inline-action" type="button">查看时间轴</button>
    </section>
    <p class="hint">右侧只保留摘要；完整对象行、delay、duration 和时间条在二级窗口中查看。</p>
  `;
  const openTimelineButton = inspectorBody.querySelector<HTMLButtonElement>("#open-timeline");
  openTimelineButton?.addEventListener("click", () => {
    openTimelineDialog(slide);
  });
}

function animationRowsForSlide(slide: SlideView): Array<{ name: string; role: string; effect: string; start: "onClick" | "withPrevious" | "afterPrevious" | "loop"; delay: number; duration: number }> {
  const beat = slide.sceneBeats?.[0];
  const revealElements = beat?.revealElements ?? [];
  return revealElements.map((elementId, index) => {
    const found = findElement(slide, elementId);
    return {
      name: objectLabel(found?.element ?? { id: elementId, kind: "unknown" }),
      role: found?.layer.role ?? "info_layer",
      effect: "fade",
      start: index === 0 ? "onClick" : "withPrevious",
      delay: index === 0 ? 0 : 120,
      duration: 1100,
    };
  });
}

function openTimelineDialog(slide: SlideView): void {
  closeFloatingPopovers();
  timelineDialogBody.innerHTML = renderTimelineDetail(slide);
  timelineModal.classList.remove("hidden");
}

function closeTimelineDialog(): void {
  timelineModal.classList.add("hidden");
  timelineDialogBody.innerHTML = "";
}

function openDetailDialog(title: string, content: string): void {
  closeFloatingPopovers();
  detailTitle.textContent = title;
  detailBody.innerHTML = `<pre>${escapeHtml(content)}</pre>`;
  detailModal.classList.remove("hidden");
}

function closeDetailDialog(): void {
  detailModal.classList.add("hidden");
  detailBody.innerHTML = "";
}

function renderTimelineDetail(slide: SlideView): string {
  const beat = slide.sceneBeats?.[0];
  const rows = animationRowsForSlide(slide);
  return `
    <section class="animation-timeline timeline-dialog-content" aria-label="完整 PowerPoint-style animation timeline">
      <div class="timeline-cluster expanded">
        <div class="timeline-dialog-title">
          <strong>点击 1 · ${escapeHtml(beat?.label ?? "scene beat")} · 预计 1100ms</strong>
          <span>同一 clickEffect parent；callout + orange bar 自动跑完。</span>
        </div>
        <div class="timeline-scroll">
          <div class="timeline-grid timeline-grid-head">
            <span>对象</span>
            <span>图层</span>
            <span>动画类型</span>
            <span>开始方式</span>
            <span>delay</span>
            <span>duration</span>
            <span>时间条</span>
          </div>
          ${rows
            .map(
              (row) => `
                <div class="timeline-grid timeline-row">
                  <b title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</b>
                  <span><i class="layer-role-dot role-${escapeHtml(row.role)}"></i>${escapeHtml(row.role)}</span>
                  <span title="${escapeHtml(row.effect)}">${escapeHtml(row.effect)}</span>
                  <span class="timeline-start-mode">${escapeHtml(row.start)}</span>
                  <span>${row.delay}ms</span>
                  <span>${row.duration}ms</span>
                  <span class="timeline-track">
                    <i class="timeline-bar" style="--delay:${row.delay};--duration:${row.duration};"></i>
                  </span>
                </div>
              `,
            )
            .join("")}
        </div>
        <div class="timeline-wps-mapping">
          <b>WPS-compatible 状态页映射</b>
          <span>${escapeHtml(wpsStateDescription(slide))} · state-page expansion · fade transition</span>
          <span class="timeline-track"><i class="timeline-bar wps" style="--delay:0;--duration:900;"></i></span>
        </div>
      </div>
    </section>
  `;
}

function renderCompatibilityPanel(slide: SlideView): void {
  inspectorBody.innerHTML = `
    <h2>兼容性</h2>
    ${renderStatePreviewCard(slide)}
    <ul class="check-list compact-checks section-list">
      <li><strong>✓ PowerPoint / Keynote</strong><span>使用 PowerPoint-rich.pptx；一次点击触发对象动画簇。</span></li>
      <li><strong>✓ WPS / 不确定环境</strong><span>使用 WPS-compatible.pptx；scene beat 展开为状态页。</span></li>
      <li><strong>✓ 只交付一个文件</strong><span>默认 WPS-compatible.pptx</span></li>
      <li><strong>! WPS Rich</strong><span>不推荐打开 PowerPoint-rich.pptx</span></li>
    </ul>
    ${lastVerify ? `<p class="hint">最近验证：Rich ${lastVerify.outputs.rich.slideCount} 页，WPS ${lastVerify.outputs.wps.slideCount} 页。</p>` : ""}
  `;
}

function renderCodexPanel(slide: SlideView): void {
  const recommendations = lastAudit?.recommendations;
  const exportMatches = lastExport ? lastExport.projectName === projectName : workbenchState?.export.lastExportMatchesProject !== false;
  const queue = workbenchState?.codexQueue;
  const undo = workbenchState?.undo;
  const upload = lastUpload ?? workbenchState?.uploads?.latestUpload ?? null;
  const bridge = workbenchState?.codexBridge;
  inspectorBody.innerHTML = `
    <h2>Codex 任务</h2>
    <section class="codex-card command-card">
      <div class="panel-heading">
        <strong>Codex Bridge</strong>
        <span>${escapeHtml(codexBridgeLabel(bridge))}</span>
      </div>
      <dl class="compact">
        <dt>连接</dt><dd>${escapeHtml(codexBridgeLabel(bridge))}</dd>
        <dt>事件队列</dt><dd>${bridge?.eventCount ?? 0} 条</dd>
        <dt>待发送</dt><dd>${(bridge?.queuedCount ?? 0) + (bridge?.waitingCount ?? 0)} 条</dd>
        <dt>最近事件</dt><dd>${escapeHtml(bridge?.latestEvent ? `${bridge.latestEvent.type} / ${bridge.latestEvent.status}` : "无")}</dd>
      </dl>
    </section>
    <section class="codex-card command-card">
      <div class="panel-heading">
        <strong>改稿队列</strong>
        <span>${queue?.status === "failed" ? "失败" : queue?.pendingCount ? "待处理" : "空闲"}</span>
      </div>
      <dl class="compact">
        <dt>当前项目</dt><dd>${escapeHtml(projectName)}</dd>
        <dt>待处理</dt><dd>${queue?.pendingCount ?? codexInbox?.events.filter((event) => event.status === "todo").length ?? 0} 条</dd>
        <dt>已处理</dt><dd>${queue?.appliedCount ?? codexInbox?.events.filter((event) => event.status === "applied").length ?? 0} 条</dd>
        <dt>最近处理</dt><dd>${escapeHtml(queue?.latestProcessed ? `${queue.latestProcessed.selectedSlideId} / ${queue.latestProcessed.selectedObjectId ?? queue.latestProcessed.scope}` : "无")}</dd>
        <dt>可撤销</dt><dd>${undo?.undoCount ?? queue?.undoCount ?? 0} / ${undo?.maxUndo ?? queue?.maxUndo ?? 100}</dd>
        <dt>可返回</dt><dd>${undo?.redoCount ?? queue?.redoCount ?? 0}</dd>
        <dt>导出匹配</dt><dd><span class="risk-badge risk-${exportMatches ? "low" : "medium"}">${exportMatches ? "当前项目" : "历史导出"}</span></dd>
        <dt>审计风险</dt><dd><span class="risk-badge risk-${recommendations?.overallRisk ?? "low"}">${recommendations ? riskLabel(recommendations.overallRisk) : "未审计"}</span></dd>
      </dl>
    </section>
    ${upload ? renderUploadReferenceCard(upload) : ""}
    ${renderDeliveryControlCard()}
  `;
}

function codexBridgeLabel(bridge: CodexBridgeSummary | undefined): string {
  if (bridge?.connected) {
    if (!bridge.appServer.available) {
      return "已注册会话，未发现 app-server";
    }
    return "已连接 Codex";
  }
  if (bridge?.status === "expired" || bridge?.expired) {
    return "连接 token 已失效，请重新连接";
  }
  if (bridge?.status === "bridge_unavailable" || (bridge?.bridgeUnavailableCount ?? 0) > 0) {
    return "Codex 桥接不可用，事件已排队";
  }
  return "未连接 Codex，请从 builder 启动或在当前 Codex 对话运行连接命令";
}

function renderUploadReferenceCard(upload: UploadedReference): string {
  return `
    <section class="codex-card command-card">
      <div class="panel-heading">
        <strong>上传来源</strong>
        <span>${upload.mode === "large-file-audit" ? "大文件已记录" : "已上传"}</span>
      </div>
      <dl class="compact">
        <dt>文件名</dt><dd title="${escapeHtml(upload.fileName)}">${escapeHtml(upload.fileName)}</dd>
        <dt>大小</dt><dd>${formatBytes(upload.fileSize)}</dd>
        <dt>状态</dt><dd>已上传，等待 Codex 在对话中确认用途</dd>
      </dl>
    </section>
  `;
}

function renderDeliveryControlCard(): string {
  const files = pptxFileNames(projectName);
  const exportDir = lastExport?.exportDir ?? workbenchState?.export.lastExportDir ?? "尚未导出";
  const exportStatus = lastExport
    ? (lastExport.projectName === projectName ? "当前项目" : "历史导出")
    : (workbenchState?.export.lastExportMatchesProject === false ? "历史导出" : "当前项目");
  return `
    <section class="codex-card delivery-control">
      <div class="panel-heading">
        <strong>交付摘要</strong>
        <span>双 PPTX</span>
      </div>
      <dl class="compact">
        <dt>锁定目录</dt><dd><code title="${lockedExportRoot}">/Desktop/PPT</code></dd>
        <dt>导出文件夹</dt><dd title="${escapeHtml(exportFolderName || defaultExportFolderName(projectName))}">${escapeHtml(exportStatus)}</dd>
        <dt>输出</dt><dd title="${escapeHtml(files.powerpoint)} / ${escapeHtml(files.compatible)}">PowerPoint + 兼容版本</dd>
        <dt>最近结果</dt><dd title="${escapeHtml(exportDir)}">${escapeHtml(exportDir === "尚未导出" ? exportDir : "已导出")}</dd>
      </dl>
    </section>
  `;
}

function latestPlaybackQaLabel(): string {
  const latest = playbackQaSummary?.latestSession ?? workbenchState?.playback?.latestSession;
  const sessionCount = playbackQaSummary?.sessionCount ?? workbenchState?.playback?.sessionCount ?? 0;
  const currentClicks = currentPlaybackSessionRecords.length;
  if (!latest) {
    return `本次 ${currentClicks} · 历史 ${sessionCount} · ${playbackLastPersistStatus}`;
  }
  const risks = latest.clickOverrunCount + latest.invisibleChangeRiskCount;
  return `本次 ${currentClicks} · 历史 ${sessionCount} · 最近风险 ${risks} · ${playbackLastPersistStatus}`;
}

function renderRevisionPlanInlineSummary(): string {
  if (!revisionPlan) {
    return "读取中";
  }
  const state = revisionPlan.exists ? "已生成" : "空草案";
  return `${state} · ${revisionPlan.actionCount} actions · 高 ${revisionPlan.highPriorityCount}`;
}

function latestRevisionActionLabel(): string {
  const action = revisionPlan?.latestAction;
  if (!action) {
    return "无";
  }
  return `${action.id ?? "action"} · ${action.slideId ?? `slide ${action.slideNumber}`} · ${priorityLabel(action.priority)} · ${action.instruction}`;
}

function codexNextActions(): string[] {
  if (revisionPlan?.exists && revisionPlan.actionCount > 0) {
    return ["复制 Codex 改稿提示词，让 Codex 读取 outputs/revision-plan.yaml。", "Codex 改稿后再生成两个 PPTX、运行 npm run verify 并导出到锁定目录。"];
  }
  if (!lastGenerate) {
    return ["确认当前多状态预览是否符合方向。", "如需改稿，让 Codex 修改 specs/example.deck-spec.yaml 后重新生成。"];
  }
  if (!lastVerify) {
    return ["运行 npm run verify 或点击验证。", "确认 Rich 仍是每页 1 个 clickEffect parent，WPS 仍是状态页降级。"];
  }
  if (!lastAudit) {
    return ["上传 PowerPoint-rich.pptx 或客户 PPTX 做结构审计。", "根据 recommendations 判断是否需要生成 revision-plan。"];
  }
  if (!revisionPlan?.exists || revisionPlan.actionCount === 0) {
    return ["点击「生成改稿计划」把审计 recommendations 写入 outputs/revision-plan.yaml。", "也可以在底部批注区手动添加当前页 action。"];
  }
  if (!lastExport && !workbenchState?.export.lastExportDir) {
    return ["确认导出文件夹名。", "点击导出，生成只含两个 PPTX 的桌面交付文件夹。"];
  }
  return ["等待或记录 PowerPoint/WPS/Keynote 录屏 QA。", "把录屏结论交给 Codex，按 revision-plan 继续改 deck-spec。"];
}

function workflowStageLabel(): string {
  return ["内容确认", "视觉预览", "PPTX 生成", "审计", "导出", "录屏 QA", "改稿"][workflowActiveIndex()] ?? "视觉预览";
}

function generateCodexPrompt(slide: SlideView): string {
  const recommendations = lastAudit?.recommendations;
  return [
    "请继续开发 /Users/bruce/Documents/PPT/pptx-workbench。",
    `当前项目：${projectName}`,
    `当前阶段：${workflowStageLabel()}`,
    `当前 spec：${specResponse.spec.title}`,
    `当前 slide：${slide.id} / ${slide.title ?? slide.id}`,
    `当前 preview state：${previewState}`,
    `最近导出：${lastExport?.exportDir ?? workbenchState?.export.lastExportDir ?? "无"}`,
    `审计风险：${recommendations ? riskLabel(recommendations.overallRisk) : "未审计"}`,
    `revision-plan 状态：${revisionPlan?.exists ? "已生成" : "未生成"} / ${revisionPlan?.actionCount ?? 0} actions`,
    "",
    "请读取：",
    codexInboxPath,
    revisionPlanPath,
    designSystemPath,
    playbackQaLogPath,
    playbackQaMarkdownPath,
    "",
    "然后：",
    "1. 先读取 Codex inbox 和 design system，再根据 revision-plan 修改 specs/example.deck-spec.yaml",
    "2. 参考 playback QA 判断点击过量、不可见变化、空等风险",
    "3. 重新生成两个 PPTX",
    "4. 运行 npm run verify",
    "5. 导出到锁定目录 /Users/bruce/Desktop/PPT",
    "6. 最终报告哪些 actions 已处理、哪些跳过、跳过原因",
    "",
    "注意：v1.6.11.1 只记录结构化批注和生成提示词，不自动执行这些步骤。",
  ].join("\n");
}

function renderAuditPanel(): void {
  if (!lastAudit) {
    inspectorBody.innerHTML = `
      <h2>审计</h2>
      <p class="hint">请从顶部「上传」添加 PPTX；上传后由 Codex 确认用途，可用于兼容性、动画或结构检查。</p>
    `;
    return;
  }

  const recommendations = lastAudit.recommendations;
  inspectorBody.innerHTML = `
    <h2>审计</h2>
    <section class="recommendation-summary risk-${recommendations.overallRisk}">
      <strong><span class="risk-badge risk-${recommendations.overallRisk}">${riskLabel(recommendations.overallRisk)}</span> 风险摘要</strong>
      <p>${escapeHtml(recommendations.summary)}</p>
      <button id="generate-revision-plan" class="inline-action" type="button">生成改稿计划</button>
    </section>
    <dl class="compact">
      <dt>文件名</dt><dd>${escapeHtml(lastAudit.fileName)}</dd>
      <dt>有效 PPTX</dt><dd>${lastAudit.validPptx ? "是" : "否"}</dd>
      <dt>页数</dt><dd>${lastAudit.slideCount}</dd>
      <dt>逐页问题</dt><dd>${recommendations.pageIssues.length}</dd>
      <dt>点击风险</dt><dd>${recommendations.clickRisks.length}</dd>
      <dt>WPS 风险</dt><dd>${recommendations.wpsCompatibilityRisks.length}</dd>
    </dl>
    ${lastAudit.error ? `<p class="error">${escapeHtml(lastAudit.error)}</p>` : ""}
    <button id="view-audit-detail" class="inline-action" type="button">查看完整审计</button>
  `;
  inspectorBody.querySelector<HTMLButtonElement>("#view-audit-detail")?.addEventListener("click", () => {
    openDetailDialog("PPTX 审计详情", JSON.stringify(lastAudit, null, 2));
  });
}

function renderPageIssues(issues: PageIssue[]): string {
  return `
    <section class="audit-section">
      <h3>逐页问题</h3>
      ${issues.length === 0 ? `<p class="hint"><span class="severity-badge severity-info">info</span> 未发现逐页结构问题。</p>` : `
        <ul class="audit-list">
          ${issues
            .map(
              (issue) => `
                <li>
                  <b>Slide ${issue.slideNumber} <span class="severity-badge severity-${issue.severity}">${escapeHtml(issue.severity)}</span> <span class="severity-badge category">${escapeHtml(issue.category)}</span></b>
                  <span>${escapeHtml(issue.message)}</span>
                  <small>${escapeHtml(issue.suggestion)}</small>
                </li>
              `,
            )
            .join("")}
        </ul>
      `}
    </section>
  `;
}

function renderClickRisks(risks: ClickRisk[]): string {
  return `
    <section class="audit-section">
      <h3>动画点击风险</h3>
      ${risks.length === 0 ? `<p class="hint"><span class="severity-badge severity-info">info</span> 未发现明显点击风险。</p>` : `
        <ul class="audit-list">
          ${risks
            .map(
              (risk) => `
                <li>
                  <b>Slide ${risk.slideNumber} <span class="severity-badge severity-warning">warning</span></b>
                  <span>${escapeHtml(risk.risk)}</span>
                  <small>${escapeHtml(risk.suggestion)}</small>
                </li>
              `,
            )
            .join("")}
        </ul>
      `}
    </section>
  `;
}

function renderWpsRisks(risks: WpsCompatibilityRisk[]): string {
  return `
    <section class="audit-section">
      <h3>WPS 兼容风险</h3>
      ${risks.length === 0 ? `<p class="hint"><span class="severity-badge severity-info">info</span> 未发现明显 WPS 兼容风险。</p>` : `
        <ul class="audit-list">
          ${risks
            .map(
              (risk) => `
                <li>
                  <b>Slide ${risk.slideNumber} <span class="severity-badge severity-warning">WPS</span></b>
                  <span>${escapeHtml(risk.risk)}</span>
                  <small>${escapeHtml(risk.fallback)}</small>
                </li>
              `,
            )
            .join("")}
        </ul>
      `}
    </section>
  `;
}

function renderRevisionPlanDraft(plan: RevisionPlanDraft): string {
  const yaml = [
    `schema: ${plan.schema}`,
    `sourceFile: ${plan.sourceFile}`,
    "goals:",
    ...plan.goals.map((goal) => `  - ${goal}`),
    "actions:",
    ...plan.actions.flatMap((action) => [
      `  - slideNumber: ${action.slideNumber}`,
      `    type: ${action.type}`,
      `    priority: ${action.priority}`,
      `    instruction: ${action.instruction}`,
    ]),
  ].join("\n");
  return `
    <section class="audit-section">
      <h3>改稿计划草案</h3>
      <pre class="revision-plan-preview">${escapeHtml(yaml)}</pre>
    </section>
  `;
}

function renderAuditTable(slides: AuditSlide[]): string {
  return `
    <table>
      <thead>
        <tr>
          <th>页</th>
          <th>切换</th>
          <th>动画</th>
          <th>效果</th>
          <th>点击</th>
        </tr>
      </thead>
      <tbody>
        ${slides
          .map(
            (slide) => `
              <tr>
                <td>${slide.slideNumber}</td>
                <td>${slide.transitionCount}</td>
                <td>${slide.timingCount}</td>
                <td>${slide.animEffectCount}</td>
                <td>${slide.clickTriggerCount}</td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function openProjectNameEditor(): void {
  closeFloatingPopovers();
  projectNameInput.value = projectName;
  projectNamePopover.classList.remove("hidden");
  activePopover = { element: projectNamePopover, trigger: editProjectNameButton };
  positionPopover(projectNamePopover, editProjectNameButton);
  requestAnimationFrame(() => {
    projectNameInput.focus();
    projectNameInput.select();
  });
}

function closeProjectNameEditor(): void {
  projectNamePopover.classList.add("hidden");
  projectNamePopover.removeAttribute("data-anchor-ready");
  if (activePopover?.element === projectNamePopover) {
    activePopover = undefined;
  }
}

function saveProjectName(): void {
  const nextProjectName = sanitizeFileName(projectNameInput.value, defaultProjectName);
  const changed = nextProjectName !== projectName;
  projectName = nextProjectName;
  exportFolderName = defaultExportFolderName(projectName);
  closeProjectNameEditor();
  renderWorkbench();
  if (changed) {
    addQaLog("system", "项目名更新", "提示", `项目名已更新为 ${projectName}，导出弹窗、PPTX 文件名和 Codex 面板已同步。`);
  } else {
    addQaLog("system", "项目名确认", "提示", `项目名保持为 ${projectName}。`);
  }
}

function openExportDialog(): void {
  exportFolderName = exportFolderName.trim().length > 0 ? exportFolderName : defaultExportFolderName(projectName);
  exportModal.classList.remove("hidden");
  renderExportPreview();
}

function closeExportDialog(): void {
  exportModal.classList.add("hidden");
}

function renderExportPreview(): void {
  if (!exportPreview) {
    return;
  }
  const safeProjectName = sanitizeFileName(projectName, defaultProjectName);
  const safeFolderName = sanitizeFileName(exportFolderName, defaultExportFolderName(safeProjectName));
  const files = pptxFileNames(safeProjectName);
  exportPreview.innerHTML = `
    <dl class="export-preview-grid">
      <dt>锁定根目录</dt><dd><code>${lockedExportRoot}</code></dd>
      <dt>当前项目名</dt><dd>${escapeHtml(safeProjectName)}</dd>
      <dt>导出文件夹名</dt>
      <dd><input id="export-folder-name" value="${escapeHtml(exportFolderName)}" placeholder="${escapeHtml(defaultExportFolderName(safeProjectName))}" /></dd>
      <dt>最终导出路径</dt><dd><code>${lockedExportRoot}/${escapeHtml(safeFolderName)}</code></dd>
      <dt>PowerPoint 文件</dt><dd>${escapeHtml(files.powerpoint)}</dd>
      <dt>兼容文件</dt><dd>${escapeHtml(files.compatible)}</dd>
      <dt>交付包内容</dt><dd>只包含两个 PPTX，不包含 QA/spec 文件。</dd>
    </dl>
    <p class="hint">如果文件夹已存在，后端会自动使用 ${escapeHtml(safeFolderName)}(1)、${escapeHtml(safeFolderName)}(2) 这类递增名称。</p>
  `;
  const folderInput = exportPreview.querySelector<HTMLInputElement>("#export-folder-name");
  folderInput?.addEventListener("input", () => {
    exportFolderName = folderInput.value;
    renderExportPreview();
    folderInput.focus();
    folderInput.setSelectionRange(folderInput.value.length, folderInput.value.length);
  });
}

function enterPlayback(mode: PlaybackMode): void {
  closeFloatingPopovers();
  annotationActive = false;
  annotationSelection = undefined;
  playbackActive = true;
  playbackMode = mode;
  playbackStep = 0;
  playbackAnimationState = "待播放";
  playbackSessionStartedAt = new Date().toISOString();
  playbackSessionStartRecordIndex = playbackQaRecords.length;
  playbackLastPersistStatus = "未落盘";
  currentPlaybackSessionRecords = [];
  currentPlaybackSlideTransitions = 0;
  currentPlaybackClickCountsBySlide.clear();
  currentPlaybackCoveredSlideIds.clear();
  const slide = specResponse.spec.slides[selectedSlideIndex] ?? specResponse.spec.slides[0];
  currentPlaybackCoveredSlideIds.add(slide.id);
  addQaLog("playback-session", "进入播放模式", "提示", `${playbackMode} 预览：鼠标左键 / Space / Enter / ArrowRight 推进，Esc 退出。`);
  renderWorkbench();
}

async function exitPlayback(): Promise<void> {
  if (!playbackActive) {
    return;
  }
  recordPlaybackExit();
  playbackActive = false;
  playbackAnimating = false;
  const session = buildPlaybackQaSession();
  addQaLog("playback-session", "退出播放模式", "完成", session.conclusion, session);
  await persistPlaybackQaSession(session);
  renderWorkbench();
}

function recordPlaybackExit(): void {
  const slide = specResponse.spec.slides[selectedSlideIndex] ?? specResponse.spec.slides[0];
  const now = new Date().toISOString();
  const record: PlaybackQaRecord = {
    event_type: "exit",
    click_index: playbackQaRecords.length + 1,
    slideId: slide.id,
    slideNumber: selectedSlideIndex + 1,
    previewMode: playbackMode,
    scene_beat: "exit",
    visible_change: "exit",
    auto_completed: true,
    empty_wait_seconds: 0,
    manual_extra_clicks_required: false,
    startedAt: playbackSessionStartedAt ?? now,
    endedAt: now,
    click_overrun: false,
    invisible_change_risk: false,
  };
  playbackQaRecords.unshift(record);
  currentPlaybackSessionRecords.push(record);
  currentPlaybackCoveredSlideIds.add(slide.id);
}

async function playbackNext(source = "keyboard"): Promise<void> {
  if (!playbackActive) {
    return;
  }
  if (playbackAnimating) {
    addQaLog("playback-click", "动画播放中", "提示", "当前 scene beat 尚未完成，已忽略连续点击。");
    return;
  }
  if (playbackStep === 0) {
    playbackStep = 1;
    playbackAnimationState = "动画播放中";
    playbackAnimating = true;
    renderWorkbench();
    const animationRun = await playPlaybackPreflightAnimations();
    if (!playbackActive) {
      playbackAnimating = false;
      return;
    }
    playbackAnimationState = "已完成";
    playbackAnimating = false;
    recordPlaybackClick(source, "scene beat reveal", animationRun);
    addQaLog("playback-click", "动画完整播放", "完成", "当前 scene beat 已收到动画完成信号并停留在最终状态。");
    renderWorkbench();
    return;
  }
  if (selectedSlideIndex < specResponse.spec.slides.length - 1) {
    const fromSlideIndex = selectedSlideIndex;
    const toSlideIndex = selectedSlideIndex + 1;
    playbackSlideTransition = createPlaybackSlideTransition(fromSlideIndex, toSlideIndex, 1, 0, "forward");
    playbackAnimationState = "页面切换中";
    playbackAnimating = true;
    renderWorkbench();
    const transitionRun = await playPlaybackSlideTransition();
    if (!playbackActive) {
      playbackAnimating = false;
      playbackSlideTransition = null;
      return;
    }
    selectedSlideIndex = toSlideIndex;
    playbackStep = 0;
    playbackSlideTransition = null;
    playbackAnimationState = "待播放";
    playbackAnimating = false;
    recordPlaybackTransition(source, `slide transition · ${transitionRun.effect}`, transitionRun);
    renderWorkbench();
  } else {
    addQaLog("playback-session", "播放完成", "完成", playbackQaConclusion(currentPlaybackSessionRecords));
  }
}

async function playbackPrevious(): Promise<void> {
  if (!playbackActive) {
    return;
  }
  if (playbackAnimating) {
    addQaLog("playback-click", "动画播放中", "提示", "当前动画或页面切换尚未完成，已忽略后退。");
    return;
  }
  if (playbackStep === 1) {
    playbackStep = 0;
    playbackAnimationState = "待播放";
    addQaLog("playback-click", "播放后退", "提示", "回到当前页初始状态。");
    renderWorkbench();
    return;
  }
  if (selectedSlideIndex > 0) {
    const fromSlideIndex = selectedSlideIndex;
    const toSlideIndex = selectedSlideIndex - 1;
    playbackSlideTransition = createPlaybackSlideTransition(fromSlideIndex, toSlideIndex, 0, 1, "backward");
    playbackAnimationState = "页面切换中";
    playbackAnimating = true;
    renderWorkbench();
    const transitionRun = await playPlaybackSlideTransition();
    if (!playbackActive) {
      playbackAnimating = false;
      playbackSlideTransition = null;
      return;
    }
    selectedSlideIndex = toSlideIndex;
    playbackStep = 1;
    playbackSlideTransition = null;
    playbackAnimationState = "已完成";
    playbackAnimating = false;
    recordPlaybackTransition("previous", `slide transition · ${transitionRun.effect}`, transitionRun);
    renderWorkbench();
  }
}

function setPlaybackStep(step: number): void {
  if (playbackAnimating) {
    addQaLog("playback-click", "动画播放中", "提示", "动画完成前不能跳转播放状态。");
    return;
  }
  playbackStep = Math.max(0, Math.min(1, step));
  playbackAnimationState = playbackStep === 0 ? "待播放" : "已完成";
  addQaLog("playback-click", "播放定位", "提示", playbackStep === 0 ? "当前页初始状态。" : "当前页最终状态。");
  renderWorkbench();
}

function recordPlaybackClick(source: string, visibleChange: string, animationRun?: PlaybackAnimationRun): void {
  const slide = specResponse.spec.slides[selectedSlideIndex] ?? specResponse.spec.slides[0];
  const beat = slide.sceneBeats?.[0];
  const clickKey = `${playbackMode}:${slide.id}`;
  const clickCount = (currentPlaybackClickCountsBySlide.get(clickKey) ?? 0) + 1;
  currentPlaybackClickCountsBySlide.set(clickKey, clickCount);
  const now = new Date().toISOString();
  const clickOverrun = clickCount > Math.max(1, slide.sceneBeats?.length ?? 1);
  const invisibleRisk = visibleChange.trim().length === 0 || playbackStep === 0;
  const record: PlaybackQaRecord = {
    event_type: "scene-beat-click",
    click_index: playbackQaRecords.length + 1,
    slideId: slide.id,
    slideNumber: selectedSlideIndex + 1,
    previewMode: playbackMode,
    scene_beat: beat?.label ?? "无",
    visible_change: visibleChange,
    auto_completed: true,
    empty_wait_seconds: 0,
    manual_extra_clicks_required: clickOverrun,
    startedAt: playbackSessionStartedAt ?? now,
    endedAt: now,
    click_overrun: clickOverrun,
    invisible_change_risk: invisibleRisk,
    animatedObjectIds: animationRun?.animatedObjectIds ?? [],
    skippedStaticObjectIds: animationRun?.skippedStaticObjectIds ?? [],
    animationEffects: animationRun?.animationEffects ?? {},
    fallbackUsed: Boolean(animationRun?.fallbackUsed),
    animationCompleted: Boolean(animationRun?.animationCompleted),
  };
  playbackQaRecords.unshift(record);
  currentPlaybackSessionRecords.push(record);
  currentPlaybackCoveredSlideIds.add(slide.id);
  const animatedSummary = record.animatedObjectIds?.length
    ? `动画对象：${record.animatedObjectIds.join(", ")}`
    : "无配置动画对象";
  addQaLog("playback-click", "播放 QA 点击", "完成", `${source}：第 ${record.slideNumber} 页 ${record.previewMode} / ${record.scene_beat} 可见变化已触发；${animatedSummary}。`, record);
}

function recordPlaybackTransition(source: string, visibleChange: string, transitionRun?: PlaybackSlideTransitionRun): void {
  const slide = specResponse.spec.slides[selectedSlideIndex] ?? specResponse.spec.slides[0];
  const now = new Date().toISOString();
  currentPlaybackSlideTransitions += 1;
  currentPlaybackCoveredSlideIds.add(slide.id);
  const record: PlaybackQaRecord = {
    event_type: "slide-transition",
    click_index: playbackQaRecords.length + 1,
    slideId: slide.id,
    slideNumber: selectedSlideIndex + 1,
    previewMode: playbackMode,
    scene_beat: "slide-transition",
    visible_change: visibleChange,
    auto_completed: true,
    empty_wait_seconds: 0,
    manual_extra_clicks_required: false,
    startedAt: playbackSessionStartedAt ?? now,
    endedAt: now,
    click_overrun: false,
    invisible_change_risk: false,
    animatedObjectIds: [],
    skippedStaticObjectIds: orderedSlideElements(slide).map(({ element }) => element.id),
    animationEffects: transitionRun ? { "__slide-transition": transitionRun.effect } : {},
    fallbackUsed: Boolean(transitionRun?.fallbackUsed),
    animationCompleted: transitionRun?.transitionCompleted ?? true,
    transitionEffect: transitionRun?.effect ?? "fade",
    transitionDirection: transitionRun?.direction ?? "forward",
    transitionDurationMs: transitionRun?.durationMs ?? 900,
    transitionFallbackUsed: Boolean(transitionRun?.fallbackUsed),
    transitionCompleted: transitionRun?.transitionCompleted ?? true,
  };
  playbackQaRecords.unshift(record);
  currentPlaybackSessionRecords.push(record);
  addQaLog("playback-click", "播放翻页", "提示", `${source}：进入第 ${selectedSlideIndex + 1} 页；页面切换 ${record.transitionEffect} ${record.transitionCompleted ? "已完整播放" : "未确认完成"}。`, record);
}

function playbackQaConclusion(records = currentPlaybackSessionRecords): string {
  const recent = records;
  const needsExtraClick = recent.some((record) => record.manual_extra_clicks_required);
  const emptyWait = recent.some((record) => record.empty_wait_seconds > 0);
  const coveredSlides = new Set(recent.map((record) => record.slideNumber));
  const expectedSlides = specResponse.spec.slides.length;
  if (recent.length === 0) {
    return "本次未产生点击记录；网页播放器只做 deck-spec 驱动 QA，不替代真实 PowerPoint/WPS 播放验证。";
  }
  if (coveredSlides.size < expectedSlides) {
    return `仅覆盖部分页面：coveredSlides=${coveredSlides.size}/${expectedSlides}；不能判定“点击逻辑正确”。sceneBeatClicks=${recent.filter((record) => record.event_type === "scene-beat-click").length}，slideTransitions=${recent.filter((record) => record.event_type === "slide-transition").length}。`;
  }
  return `已覆盖全部页面：coveredSlides=${coveredSlides.size}/${expectedSlides}；点击逻辑${needsExtraClick ? "需复查" : "未发现额外连点"}，空等${emptyWait ? "存在" : "未发现"}。`;
}

function buildPlaybackQaSession(): PlaybackQaSession {
  const endedAt = new Date().toISOString();
  const records = currentPlaybackSessionRecords.slice();
  const coveredSlides = [...new Set(records.map((record) => record.slideNumber))].sort((a, b) => a - b);
  const sceneBeatClicks = records.filter((record) => record.event_type === "scene-beat-click").length;
  const manualExtraClicks = records.filter((record) => record.manual_extra_clicks_required).length;
  return {
    sessionId: `playback-${endedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${Math.max(1, playbackSessionStartRecordIndex + 1)}`,
    projectName,
    startedAt: playbackSessionStartedAt ?? endedAt,
    endedAt,
    mode: playbackMode,
    slideCount: specResponse.spec.slides.length,
    coveredSlides,
    expectedSlides: specResponse.spec.slides.length,
    totalClicks: records.length,
    sceneBeatClicks,
    clickOverrunCount: records.filter((record) => record.click_overrun || record.manual_extra_clicks_required).length,
    invisibleChangeRiskCount: records.filter((record) => record.invisible_change_risk || record.visible_change.trim().length === 0).length,
    emptyWaitTotalSeconds: records.reduce((sum, record) => sum + record.empty_wait_seconds, 0),
    slideTransitions: currentPlaybackSlideTransitions,
    manualExtraClicks,
    records,
    conclusion: playbackQaConclusion(records),
  };
}

async function persistPlaybackQaSession(session: PlaybackQaSession): Promise<void> {
  try {
    playbackQaSummary = await fetchJson<PlaybackQaSummary>("/api/playback-qa/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(session),
    });
    playbackLastPersistStatus = "已落盘";
    showToast("播放 QA 已落盘", "已写入 outputs/playback-qa-log.jsonl；已更新 outputs/playback-qa.md。");
    addQaLog("playback-session", "播放 QA 已落盘", "完成", `已写入 outputs/playback-qa-log.jsonl；已更新 outputs/playback-qa.md。`, session);
  } catch (error) {
    playbackLastPersistStatus = "落盘失败";
    showToast("播放 QA 落盘失败", errorMessage(error), true);
    addQaLog("playback-session", "播放 QA 落盘失败", "错误", errorMessage(error), session);
  }
}

function showToast(title: string, message: string, isError = false): void {
  toastRegion.innerHTML = `
    <article class="toast ${isError ? "error" : ""}">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(message)}</span>
    </article>
  `;
  window.setTimeout(() => {
    toastRegion.innerHTML = "";
  }, 4200);
}

function renderPlaybackOverlay(): void {
  playbackOverlay.classList.toggle("hidden", !playbackActive);
  if (!playbackActive) {
    playbackOverlay.innerHTML = "";
    return;
  }
  const slide = specResponse.spec.slides[selectedSlideIndex] ?? specResponse.spec.slides[0];
  const preview = playbackMode === "Rich"
    ? previewDescriptors[playbackStep === 0 ? "rich-before" : "rich-after"]
    : previewDescriptors[playbackStep === 0 ? "wps-state-0" : "wps-state-1"];
  const stageContent = playbackSlideTransition
    ? renderPlaybackTransitionStack(playbackSlideTransition)
    : renderPlaybackSlideSection(slide, preview, "playback-slide");
  playbackOverlay.innerHTML = `
    <section class="playback-chrome" role="presentation">
      <header class="playback-header">
        <div>
          <strong>播放 QA · ${escapeHtml(playbackMode)}</strong>
          <span>${selectedSlideIndex + 1} / ${specResponse.spec.slides.length} · click_index ${currentPlaybackSessionRecords.length + 1} · ${escapeHtml(slide.sceneBeats?.[0]?.label ?? "静态")} · ${playbackAnimationState}</span>
        </div>
        <div class="playback-actions">
          <button type="button" data-playback-mode="Rich" class="${playbackMode === "Rich" ? "active" : ""}">Rich</button>
          <button type="button" data-playback-mode="WPS" class="${playbackMode === "WPS" ? "active" : ""}">WPS</button>
          <button type="button" id="playback-home">重播当前页</button>
          <button type="button" id="playback-prev">上一步</button>
          <button type="button" id="playback-next">下一步</button>
          <button type="button" id="playback-exit">退出</button>
        </div>
      </header>
      <main class="playback-stage ${playbackSlideTransition ? "transitioning" : ""}" id="playback-click-target">
        ${stageContent}
      </main>
      <footer class="playback-footer">
        鼠标左键 / Space / Enter / ArrowRight：下一步 · ArrowLeft：上一步 · Home：初始 · End：最终 · Esc：退出
      </footer>
    </section>
  `;
  playbackOverlay.querySelector("#playback-click-target")?.addEventListener("click", () => { void playbackNext("mouse-left"); });
  playbackOverlay.querySelector("#playback-next")?.addEventListener("click", () => { void playbackNext("button"); });
  playbackOverlay.querySelector("#playback-prev")?.addEventListener("click", () => { void playbackPrevious(); });
  playbackOverlay.querySelector("#playback-home")?.addEventListener("click", () => setPlaybackStep(0));
  playbackOverlay.querySelector("#playback-exit")?.addEventListener("click", () => exitPlayback());
  for (const button of playbackOverlay.querySelectorAll<HTMLButtonElement>("button[data-playback-mode]")) {
    button.addEventListener("click", () => {
      playbackMode = button.dataset.playbackMode as PlaybackMode;
      playbackStep = 0;
      addQaLog("playback-session", "切换播放策略", "提示", `已切换到 ${playbackMode} 播放预览。`);
      renderWorkbench();
    });
  }
}

function renderPlaybackSlideSection(slide: SlideView, preview: PreviewDescriptor, className: string): string {
  return `
    <section class="${className} slide-canvas ${preview.revealVisible ? "reveals-visible" : "reveals-hidden"} ${playbackAnimationState === "动画播放中" ? "animation-preflight-playing" : "animation-preflight-complete"}">
      ${renderSlideSurface(slide, {
        preview,
        thumbnail: false,
        debug: {
          alignmentGuides: false,
          safeFrame: false,
          objectBounds: false,
          stateBadge: false,
          revealDebug: false,
        },
      })}
    </section>
  `;
}

function renderPlaybackTransitionStack(transition: PlaybackSlideTransitionState): string {
  const fromSlide = specResponse.spec.slides[transition.fromSlideIndex] ?? specResponse.spec.slides[0];
  const toSlide = specResponse.spec.slides[transition.toSlideIndex] ?? specResponse.spec.slides[0];
  const fromPreview = playbackMode === "Rich"
    ? previewDescriptors[transition.fromStep === 0 ? "rich-before" : "rich-after"]
    : previewDescriptors[transition.fromStep === 0 ? "wps-state-0" : "wps-state-1"];
  const toPreview = playbackMode === "Rich"
    ? previewDescriptors[transition.toStep === 0 ? "rich-before" : "rich-after"]
    : previewDescriptors[transition.toStep === 0 ? "wps-state-0" : "wps-state-1"];
  return `
    <div class="playback-transition-stack" data-transition-effect="${escapeHtml(transition.effect)}" data-transition-direction="${escapeHtml(transition.direction)}">
      ${renderPlaybackSlideSection(fromSlide, fromPreview, "playback-transition-slide playback-transition-from")}
      ${renderPlaybackSlideSection(toSlide, toPreview, "playback-transition-slide playback-transition-to")}
    </div>
  `;
}

function createPlaybackSlideTransition(
  fromSlideIndex: number,
  toSlideIndex: number,
  fromStep: number,
  toStep: number,
  direction: "forward" | "backward",
): PlaybackSlideTransitionState {
  const targetSlide = specResponse.spec.slides[toSlideIndex] ?? specResponse.spec.slides[fromSlideIndex] ?? specResponse.spec.slides[0];
  const configuredEffect = targetSlide.transition?.effect ?? "fade";
  const effect = normalizePlaybackTransitionEffect(configuredEffect);
  return {
    fromSlideIndex,
    toSlideIndex,
    fromStep,
    toStep,
    effect,
    direction,
    durationMs: Math.max(800, targetSlide.transition?.durationMs ?? 900),
    fallbackUsed: false,
  };
}

async function playPlaybackSlideTransition(): Promise<PlaybackSlideTransitionRun> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const transition = playbackSlideTransition;
  if (!transition) {
    await delay(900);
    return {
      effect: "fade",
      direction: "forward",
      durationMs: 900,
      fallbackUsed: true,
      transitionCompleted: false,
    };
  }
  const fromSlide = playbackOverlay.querySelector<HTMLElement>(".playback-transition-from");
  const toSlide = playbackOverlay.querySelector<HTMLElement>(".playback-transition-to");
  if (!fromSlide || !toSlide) {
    await delay(transition.durationMs);
    return { ...transition, transitionCompleted: false };
  }

  const { fromKeyframes, toKeyframes } = playbackTransitionKeyframes(transition.effect, transition.direction);
  const timing: KeyframeAnimationOptions = {
    duration: transition.durationMs,
    easing: transition.effect === "push" ? "cubic-bezier(0.2, 0.82, 0.2, 1)" : "ease-in-out",
    fill: "both",
  };
  const animations = [
    fromSlide.animate(fromKeyframes, timing).finished.catch(() => undefined),
    toSlide.animate(toKeyframes, timing).finished.catch(() => undefined),
  ];
  await Promise.all(animations);
  return { ...transition, transitionCompleted: true };
}

function normalizePlaybackTransitionEffect(effect: string): string {
  const normalized = effect.trim().toLowerCase();
  if (normalized.includes("push")) {
    return "push";
  }
  if (normalized.includes("wipe") || normalized.includes("reveal")) {
    return "wipe";
  }
  if (normalized.includes("morph")) {
    return "morph";
  }
  if (normalized.includes("zoom")) {
    return "zoom";
  }
  if (normalized.includes("none") || normalized.includes("cut")) {
    return "none";
  }
  return "fade";
}

function playbackTransitionKeyframes(
  effect: string,
  direction: "forward" | "backward",
): { fromKeyframes: Keyframe[]; toKeyframes: Keyframe[] } {
  const horizontal = direction === "forward" ? 1 : -1;
  if (effect === "push") {
    return {
      fromKeyframes: [
        { opacity: 1, transform: "translateX(0)" },
        { opacity: 0.98, transform: `translateX(${-horizontal * 7}%)` },
      ],
      toKeyframes: [
        { opacity: 0.98, transform: `translateX(${horizontal * 7}%)` },
        { opacity: 1, transform: "translateX(0)" },
      ],
    };
  }
  if (effect === "wipe") {
    return {
      fromKeyframes: [
        { opacity: 1 },
        { opacity: 1 },
      ],
      toKeyframes: [
        { opacity: 1, clipPath: direction === "forward" ? "inset(0 100% 0 0)" : "inset(0 0 0 100%)" },
        { opacity: 1, clipPath: "inset(0 0 0 0)" },
      ],
    };
  }
  if (effect === "morph" || effect === "zoom") {
    return {
      fromKeyframes: [
        { opacity: 1, transform: "scale(1)" },
        { opacity: 0, transform: effect === "zoom" ? "scale(1.018)" : "scale(0.992)" },
      ],
      toKeyframes: [
        { opacity: 0, transform: effect === "zoom" ? "scale(0.982)" : "scale(1.008)" },
        { opacity: 1, transform: "scale(1)" },
      ],
    };
  }
  if (effect === "none") {
    return {
      fromKeyframes: [
        { opacity: 0 },
        { opacity: 0 },
      ],
      toKeyframes: [
        { opacity: 1 },
        { opacity: 1 },
      ],
    };
  }
  return {
    fromKeyframes: [
      { opacity: 1 },
      { opacity: 0 },
    ],
    toKeyframes: [
      { opacity: 0 },
      { opacity: 1 },
    ],
  };
}

async function playPlaybackPreflightAnimations(): Promise<PlaybackAnimationRun> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const slide = playbackOverlay.querySelector<HTMLElement>(".playback-slide");
  const specSlide = specResponse.spec.slides[selectedSlideIndex] ?? specResponse.spec.slides[0];
  const targets = playbackAnimationTargetsForSlide(specSlide);
  const targetIds = new Set(targets.map((target) => target.elementId));
  const visibleElements = slide
    ? [...slide.querySelectorAll<HTMLElement>(".spec-element[data-object-id]")]
    : [];
  const skippedStaticObjectIds = visibleElements
    .map((element) => element.dataset.objectId)
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .filter((id) => !targetIds.has(id));
  const animationEffects = Object.fromEntries(targets.map((target) => [target.elementId, target.effect]));
  const fallbackUsed = targets.some((target) => target.fallbackUsed);
  const emptyRun: PlaybackAnimationRun = {
    animatedObjectIds: [],
    skippedStaticObjectIds,
    animationEffects: {},
    fallbackUsed: false,
    animationCompleted: true,
  };
  if (!slide) {
    await delay(1200);
    return { ...emptyRun, animationCompleted: false };
  }
  const animatedElements = targets
    .map((target) => {
      const element = slide.querySelector<HTMLElement>(`.spec-element[data-object-id="${cssEscape(target.elementId)}"]`);
      return element ? { element, target } : undefined;
    })
    .filter((item): item is { element: HTMLElement; target: PlaybackAnimationTarget } => Boolean(item));
  if (animatedElements.length === 0) {
    await delay(900);
    return { ...emptyRun, animationEffects, fallbackUsed };
  }
  const animations = animatedElements.map(({ element, target }) => {
    const keyframes = playbackKeyframesForEffect(target.effect, element);
    return element.animate(keyframes, {
      duration: Math.max(800, target.durationMs),
      delay: target.delayMs,
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      fill: "both",
    }).finished.catch(() => undefined);
  });
  await Promise.all(animations);
  return {
    animatedObjectIds: animatedElements.map(({ target }) => target.elementId),
    skippedStaticObjectIds,
    animationEffects,
    fallbackUsed,
    animationCompleted: true,
  };
}

function playbackAnimationTargetsForSlide(slide: SlideView): PlaybackAnimationTarget[] {
  const beat = slide.sceneBeats?.[0];
  if (!beat) {
    return [];
  }
  const richTarget = playbackMode === "Rich" ? "powerpoint-rich" : "wps-compatible";
  const cluster = specResponse.spec.animationClusters?.find(
    (item) => item.slideId === slide.id && item.beatId === beat.id && item.target === richTarget,
  ) ?? specResponse.spec.animationClusters?.find(
    (item) => item.slideId === slide.id && item.beatId === beat.id,
  );
  const configuredMembers = cluster?.units?.map((unit) => unit.elementId) ?? cluster?.members ?? beat.revealElements ?? [];
  return configuredMembers
    .map((elementId, index) => {
      const unit = cluster?.units?.find((item) => item.elementId === elementId);
      const effect = normalizePlaybackEffect(unit?.effect ?? "fade");
      return {
        elementId,
        effect,
        delayMs: unit?.startOffsetMs ?? (index === 0 ? 0 : 120),
        durationMs: unit?.durationMs ?? (effect === "scale emphasis" ? 950 : 1100),
        fallbackUsed: !unit?.effect,
      };
    })
    .filter((target) => Boolean(findElement(slide, target.elementId)));
}

function normalizePlaybackEffect(effect: string): string {
  const normalized = effect.trim().toLowerCase();
  if (normalized.includes("fade")) {
    return "fade";
  }
  if (normalized.includes("motion")) {
    return "motion path";
  }
  if (normalized.includes("scale") || normalized.includes("emphasis") || normalized.includes("highlight")) {
    return "scale emphasis";
  }
  if (normalized.includes("wipe") || normalized.includes("reveal")) {
    return "wipe";
  }
  if (normalized.includes("slide") || normalized.includes("fly") || normalized.includes("float")) {
    return "slide";
  }
  if (normalized.includes("zoom")) {
    return "zoom";
  }
  return "fade";
}

function playbackKeyframesForEffect(effect: string, element: HTMLElement): Keyframe[] {
  if (effect === "wipe") {
    return [
      { opacity: 0.2, clipPath: "inset(0 100% 0 0)", transform: "translateX(-10px)" },
      { opacity: 1, clipPath: "inset(0 0 0 0)", transform: "translateX(0)" },
    ];
  }
  if (effect === "zoom") {
    return [
      { opacity: 0.25, transform: "scale(0.92) translateY(14px)" },
      { opacity: 1, transform: "scale(1.02) translateY(0)", offset: 0.78 },
      { opacity: 1, transform: "scale(1) translateY(0)" },
    ];
  }
  if (effect === "slide") {
    return [
      { opacity: 0, transform: "translateY(22px)" },
      { opacity: 1, transform: "translateY(0)" },
    ];
  }
  if (effect === "scale emphasis") {
    return [
      { opacity: 0.75, transform: "scale(0.98)" },
      { opacity: 1, transform: "scale(1.035)", offset: 0.64 },
      { opacity: 1, transform: "scale(1)" },
    ];
  }
  if (effect === "motion path") {
    return [
      { opacity: 0.35, transform: "translate(-18px, 10px)" },
      { opacity: 1, transform: "translate(0, 0)" },
    ];
  }
  if (element.classList.contains("spec-line")) {
    return [
      { opacity: 0.2, clipPath: "inset(0 100% 0 0)" },
      { opacity: 1, clipPath: "inset(0 0 0 0)" },
    ];
  }
  return [
    { opacity: 0 },
    { opacity: 1 },
  ];
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function handlePlaybackKeydown(event: KeyboardEvent): void {
  if (!playbackActive || isTypingTarget(event.target)) {
    return;
  }
  const nextKeys = [" ", "Enter", "ArrowRight", "ArrowDown"];
  const previousKeys = ["ArrowLeft", "ArrowUp"];
  if (nextKeys.includes(event.key)) {
    event.preventDefault();
    void playbackNext(event.key === " " ? "Space" : event.key);
    return;
  }
  if (previousKeys.includes(event.key)) {
    event.preventDefault();
    void playbackPrevious();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    exitPlayback();
    return;
  }
  if (event.key === "Home") {
    event.preventDefault();
    setPlaybackStep(0);
    return;
  }
  if (event.key === "End") {
    event.preventDefault();
    setPlaybackStep(1);
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

async function withBusy(button: HTMLButtonElement, status: string, action: () => Promise<void>): Promise<void> {
  button.disabled = true;
  statusEl.textContent = status;
  try {
    await action();
    if (statusEl.textContent !== "已验证") {
      statusEl.textContent = "完成";
    }
  } catch (error) {
    statusEl.textContent = "错误";
    addQaLog("system", "操作失败", "错误", errorMessage(error));
  } finally {
    button.disabled = false;
  }
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text);
  }
  return JSON.parse(text) as T;
}

function selectedObjectForSlide(slide: SlideView): SelectedObject {
  if (annotationSelection?.slideId === slide.id && annotationSelection.objectId) {
    const selected = findElement(slide, annotationSelection.objectId);
    if (selected) {
      return {
        ...selected,
        participatesInAnimation: Boolean(selected.element.hiddenUntilBeat),
      };
    }
  }
  const beat = slide.sceneBeats?.[0];
  const revealElementId = beat?.revealElements?.[0];
  const animated = revealElementId ? findElement(slide, revealElementId) : undefined;
  if (animated) {
    return { ...animated, participatesInAnimation: true };
  }

  const title = slide.layers
    .flatMap((layer) => layer.elements.map((element) => ({ layer, element })))
    .find(({ element }) => element.id.includes("title"));
  if (title) {
    return { ...title, participatesInAnimation: false };
  }

  const firstLayer = slide.layers[0];
  const firstElement = firstLayer?.elements[0];
  if (firstLayer && firstElement) {
    return { layer: firstLayer, element: firstElement, participatesInAnimation: false };
  }

  return {
    layer: { id: "unknown", role: "text", elements: [] },
    element: { id: "unknown", kind: "text", x: 1, y: 1, w: 3, h: 1 },
    participatesInAnimation: false,
  };
}

function findElement(slide: SlideView, elementId: string): { layer: LayerView; element: ElementView } | undefined {
  for (const layer of slide.layers) {
    const element = layer.elements.find((candidate) => candidate.id === elementId);
    if (element) {
      return { layer, element };
    }
  }
  return undefined;
}

function selectedBoxStyle(element: ElementView): string {
  const x = clampPercent(((element.x ?? 5.4) / 13.333) * 100);
  const y = clampPercent(((element.y ?? 3.4) / 7.5) * 100);
  const w = clampPercent(((element.w ?? 2.7) / 13.333) * 100, 8, 72);
  const h = clampPercent(((element.h ?? 1.1) / 7.5) * 100, 8, 56);
  return `left:${x}%;top:${y}%;width:${w}%;height:${h}%;`;
}

function elementBounds(element: ElementView): SelectionBounds {
  return {
    x: element.x ?? 0,
    y: element.y ?? 0,
    w: element.w ?? 0,
    h: element.h ?? 0,
  };
}

function pointerToSlidePoint(event: PointerEvent | MouseEvent, surface: HTMLElement): { x: number; y: number } {
  const rect = surface.getBoundingClientRect();
  return {
    x: clampNumber(((event.clientX - rect.left) / rect.width) * 13.333, 0, 13.333),
    y: clampNumber(((event.clientY - rect.top) / rect.height) * 7.5, 0, 7.5),
  };
}

function pointerToExtendedSlidePoint(event: PointerEvent | MouseEvent, surface: HTMLElement): { x: number; y: number } {
  const surfaceRect = surface.getBoundingClientRect();
  const pasteboardRect = pasteboard.getBoundingClientRect();
  const clientX = clampNumber(event.clientX, pasteboardRect.left, pasteboardRect.right);
  const clientY = clampNumber(event.clientY, pasteboardRect.top, pasteboardRect.bottom);
  return {
    x: Number((((clientX - surfaceRect.left) / surfaceRect.width) * 13.333).toFixed(3)),
    y: Number((((clientY - surfaceRect.top) / surfaceRect.height) * 7.5).toFixed(3)),
  };
}

function isFreeAnnotationPointerTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  if (!target.closest(".pasteboard")) {
    return false;
  }
  return !target.closest(".slide-nav, .inspector, .bottom-statusbar, .bottom-drawer, .app-top, .modal-backdrop, .floating-popover");
}

function normalizeDragBounds(start: { x: number; y: number }, end: { x: number; y: number }): SelectionBounds {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const w = Math.abs(end.x - start.x);
  const h = Math.abs(end.y - start.y);
  return {
    x: Number(x.toFixed(3)),
    y: Number(y.toFixed(3)),
    w: Number(w.toFixed(3)),
    h: Number(h.toFixed(3)),
  };
}

function candidateObjectsForRegion(slide: SlideView, region: SelectionBounds): string[] {
  return orderedSlideElements(slide)
    .filter(({ layer }) => layer.role !== "background")
    .filter(({ element }) => boundsIntersect(region, elementBounds(element)))
    .map(({ element }) => element.id);
}

function boundsIntersect(a: SelectionBounds, b: SelectionBounds): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function boundsStyle(bounds: SelectionBounds): string {
  return [
    `left:${toSlidePercent(bounds.x, 13.333)}%`,
    `top:${toSlidePercent(bounds.y, 7.5)}%`,
    `width:${toSlidePercent(bounds.w, 13.333)}%`,
    `height:${toSlidePercent(bounds.h, 7.5)}%`,
  ].join(";");
}

function annotationComposerX(x: number, w: number): number {
  const preferredRight = x + w + 0.18;
  if (preferredRight <= 7.25) {
    return preferredRight;
  }
  return Math.max(0.45, x - 5.1);
}

function annotationComposerClampedX(x: number): number {
  return clampNumber(x, 0.45, 7.25);
}

function annotationComposerPosition(selection: AnnotationSelection): { left: string; top: string; anchor: string } {
  const centerY = selection.bounds.y + selection.bounds.h / 2;
  const centerX = selection.bounds.x + selection.bounds.w / 2;
  const composerWidth = "clamp(300px, 24cqw, 460px)";
  const anchor = centerY > 3.75 ? "bottom" : "top";
  const left = `clamp(8px, calc(${toSlidePercent(centerX, 13.333)}% - (${composerWidth} / 2)), calc(100% - ${composerWidth} - 8px))`;
  const top = anchor === "bottom" ? "calc(100% + 10px)" : `calc(0px - 104px - 10px)`;
  return { left, top, anchor };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampPercent(value: number, min = 1, max = 92): number {
  return Math.min(max, Math.max(min, value));
}

function objectLabel(element: ElementView): string {
  if (element.id.includes("callout")) {
    return "callout-card";
  }
  if (element.id.includes("title")) {
    return "标题文本";
  }
  if (element.id.includes("pill")) {
    return "orange-bar";
  }
  return element.id;
}

function wpsStateDescription(slide: SlideView): string {
  const beatCount = slide.sceneBeats?.length ?? 0;
  const stateZeroPage = wpsStatePageForSlide(selectedSlideIndex, -1);
  const stateOnePage = beatCount > 0 ? wpsStatePageForSlide(selectedSlideIndex, 0) : stateZeroPage;
  return `State 0: 页 ${stateZeroPage} / State 1: 页 ${stateOnePage}`;
}

function wpsStateShortDescription(slide: SlideView): string {
  const beatCount = slide.sceneBeats?.length ?? 0;
  const stateZeroPage = wpsStatePageForSlide(selectedSlideIndex, -1);
  const finalStatePage = beatCount > 0 ? wpsStatePageForSlide(selectedSlideIndex, beatCount - 1) : stateZeroPage;
  return `State 0 → State ${beatCount || 0} · 页 ${stateZeroPage}-${finalStatePage}`;
}

function slideBackground(slide: SlideView): string {
  const backgroundShape = orderedSlideElements(slide).find(({ element }) => element.kind === "shape" && element.id.endsWith("-bg"));
  return backgroundShape?.element.fill ?? "paper";
}

function colorToken(tokenOrHex: string): string {
  if (tokenOrHex === "transparent") {
    return "transparent";
  }
  const value = specResponse.spec.theme.colors[tokenOrHex] ?? tokenOrHex;
  return value.startsWith("#") ? value : `#${value}`;
}

function toSlidePercent(value: number | undefined, total: number): string {
  return (((value ?? 0) / total) * 100).toFixed(4);
}

function layerZIndex(role: string): number {
  const order = ["background", "decor", "hero", "text", "info_layer"];
  return Math.max(1, order.indexOf(role) + 1);
}

function defaultFontForElement(element: ElementView): string {
  return element.bold ? specResponse.spec.theme.fonts.heading : specResponse.spec.theme.fonts.body;
}

function cssFont(font: string): string {
  return `'${font}', 'Microsoft YaHei', system-ui, sans-serif`;
}

function fontSizeCss(fontSize: number): string {
  return `${(fontSize / 9.6).toFixed(3)}cqw`;
}

function alignToFlex(align: ElementView["align"]): string {
  if (align === "center") {
    return "center";
  }
  if (align === "right") {
    return "flex-end";
  }
  return "flex-start";
}

function valignToFlex(valign: ElementView["valign"]): string {
  if (valign === "mid") {
    return "center";
  }
  if (valign === "bottom") {
    return "flex-end";
  }
  return "flex-start";
}

function shapeRadius(element: ElementView): string {
  if (element.shape === "ellipse") {
    return "9999px";
  }
  if (element.shape === "roundRect") {
    return `${Math.max(10, (element.radius ?? 0.16) * 60)}px`;
  }
  return "0";
}

function formatText(text: string): string {
  return escapeHtml(text).replace(/\n/g, "<br />");
}

function wpsStatePageForSlide(slideIndex: number, beatIndex: number): number {
  let page = 1;
  for (let index = 0; index < slideIndex; index += 1) {
    page += 1 + (specResponse.spec.slides[index]?.sceneBeats?.length ?? 0);
  }
  return page + 1 + beatIndex;
}

function addQaLog(category: QaLogEntry["category"], action: string, status: QaLogEntry["status"], summary: string, detail?: unknown): void {
  qaEntries.unshift({
    time: currentTimeLabel(),
    category,
    action,
    status,
    summary,
    detail,
  });
  renderQaLog();
}

function renderQaLog(): void {
  const playbackRows = playbackQaRecords.slice(0, 12).map((record) => `
    <article class="qa-row playback-qa-row">
      <time>#${record.click_index}</time>
      <strong>播放 QA</strong>
      <span>${escapeHtml(record.previewMode)}</span>
      <p>${escapeHtml(`Slide ${record.slideNumber} / ${record.scene_beat} / animatedObjectIds=${record.animatedObjectIds?.join(", ") || "none"} / animationEffects=${JSON.stringify(record.animationEffects ?? {})} / skippedStaticObjectIds=${record.skippedStaticObjectIds?.length ?? 0} / fallbackUsed=${record.fallbackUsed ?? false} / animationCompleted=${record.animationCompleted ?? record.auto_completed} / empty_wait_seconds=${record.empty_wait_seconds} / manual_extra_clicks_required=${record.manual_extra_clicks_required}`)}</p>
    </article>
  `);
  qaLog.innerHTML = [
    ...playbackRows,
    ...qaEntries
      .slice(0, 20)
      .map(
        (entry) => `
          <article class="qa-row ${entry.status === "错误" ? "is-error" : ""}">
            <time>${escapeHtml(entry.time)}</time>
            <strong>${escapeHtml(entry.action)}</strong>
            <span>${escapeHtml(entry.category)} · ${escapeHtml(entry.status)}</span>
            <p>${escapeHtml(entry.summary)}</p>
            ${
              entry.detail
                ? `<details><summary>展开详情</summary><pre>${escapeHtml(JSON.stringify(entry.detail, null, 2))}</pre></details>`
                : ""
            }
          </article>
        `,
      ),
  ].join("");
}

function renderCodexInboxList(): void {
  const events = codexInbox?.events ?? [];
  if (events.length === 0) {
    codexInboxList.innerHTML = `
      <div class="empty-state">
        <strong>暂无批注</strong>
        <span>点击顶部「批注」，选择对象或页面空白区域后提交修改要求。</span>
      </div>
    `;
    return;
  }
  codexInboxList.innerHTML = events
    .slice()
    .reverse()
    .map(
      (event) => `
        <article class="codex-inbox-row">
          <div>
            <strong>${escapeHtml(event.scope === "object" ? event.selectedObjectId ?? "对象" : event.scope === "region" ? "区域批注" : "页面级批注")}</strong>
            <span>${escapeHtml(event.selectedSlideId)} · ${escapeHtml(event.scope)} · ${escapeHtml(event.selectedObjectType)} · ${escapeHtml(workItemStatusLabel(event.status))}</span>
          </div>
          <p>${escapeHtml(event.userInstruction)}</p>
          <div class="codex-inbox-row-actions">
            <time>${escapeHtml(formatDateTime(event.createdAt))}</time>
            ${event.status === "todo" ? `<button type="button" data-delete-inbox-event="${escapeHtml(event.id)}">删除</button>` : ""}
          </div>
        </article>
      `,
    )
    .join("");
  for (const button of codexInboxList.querySelectorAll<HTMLButtonElement>("button[data-delete-inbox-event]")) {
    button.addEventListener("click", async () => {
      await deleteCodexInboxEvent(button.dataset.deleteInboxEvent ?? "");
    });
  }
}

async function deleteCodexInboxEvent(id: string): Promise<void> {
  if (!id) {
    return;
  }
  try {
    const response = await fetchJson<{ inbox: CodexInboxSummary; revision: RevisionPlanSummary; deleted: boolean }>(`/api/codex-inbox/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    codexInbox = response.inbox;
    revisionPlan = response.revision;
    showToast(response.deleted ? "批注已删除" : "未找到批注", response.deleted ? "已同步更新 revision-plan。" : "记录可能已被处理或删除。");
    addQaLog("user-comment", "删除批注", response.deleted ? "完成" : "提示", id);
    renderWorkbench();
  } catch (error) {
    showToast("删除批注失败", errorMessage(error), true);
  }
}

function renderRevisionActionsList(): void {
  const actions = revisionPlan?.plan.actions ?? [];
  if (actions.length === 0) {
    revisionActionsList.innerHTML = `<p class="hint">暂无 actions。可从审计建议生成，或在「批注」tab 手动添加。</p>`;
    return;
  }
  revisionActionsList.innerHTML = actions
    .slice()
    .reverse()
    .map(
      (action) => `
        <article class="revision-action-row priority-${action.priority}">
          <span class="revision-target" title="${escapeHtml(action.slideId ?? `slide ${action.slideNumber}`)} / ${escapeHtml(action.objectId ?? action.objectRole ?? "区域/整页")}">
            ${escapeHtml(action.objectId ?? action.objectRole ?? action.slideId ?? `slide ${action.slideNumber}`)}
          </span>
          <p title="${escapeHtml(action.instruction)}">${escapeHtml(action.instruction)}</p>
          <span class="revision-priority">${priorityLabel(action.priority)}</span>
          <span class="revision-status">${escapeHtml(workItemStatusLabel(action.status ?? "todo"))}</span>
          <span class="revision-source">${escapeHtml(action.source ?? "manual")}</span>
        </article>
      `,
    )
    .join("");
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function workItemStatusLabel(status: WorkItemStatus): string {
  if (status === "needs-design" || status === "needs-codex") {
    return "needs-codex";
  }
  return status;
}

function currentTimeLabel(): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatNumber(value: number | undefined): string {
  return value === undefined ? "—" : value.toFixed(2);
}

function sanitizeFileName(value: string, fallback: string): string {
  const base = value.trim().length > 0 ? value.trim() : fallback;
  const sanitized = base
    .replace(/[\/\\:*?"<>|]/g, "")
    .replace(/\.\.+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized.length > 0 ? sanitized : fallback;
}

function defaultExportFolderName(name: string): string {
  return `${sanitizeFileName(name, defaultProjectName)}-${dateStamp()}`;
}

function dateStamp(date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

function pptxFileNames(name: string): { powerpoint: string; compatible: string } {
  const safeName = sanitizeFileName(name, defaultProjectName);
  return {
    powerpoint: `${safeName}-PowerPoint.pptx`,
    compatible: `${safeName}-兼容.pptx`,
  };
}

function riskLabel(risk: AuditRecommendations["overallRisk"]): string {
  if (risk === "high") {
    return "高";
  }
  if (risk === "medium") {
    return "中";
  }
  return "低";
}

function priorityLabel(priority: RevisionAction["priority"] | undefined): string {
  if (priority === "high") {
    return "高";
  }
  if (priority === "low") {
    return "低";
  }
  return "中";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function mustElement<T extends Element>(element: T | null): T {
  if (!element) {
    throw new Error("Workbench DOM failed to initialize");
  }
  return element;
}
