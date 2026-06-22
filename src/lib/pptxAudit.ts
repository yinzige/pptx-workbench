import fs from "node:fs/promises";
import { inspectPptxBuffer, inspectPptxPackage } from "./pptxPackage.js";

export interface PptxAuditReport {
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
  slides: PptxAuditSlide[];
  recommendations: PptxAuditRecommendations;
}

export interface PptxAuditSlide {
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

export type AuditRisk = "low" | "medium" | "high";
export type RecommendationSeverity = "info" | "warning" | "error";
export type RecommendationCategory = "structure" | "motion" | "compatibility" | "content";
export type RevisionActionType = "content" | "visual" | "structure" | "motion" | "compatibility" | "asset";
export type RevisionPriority = "low" | "medium" | "high";

export interface PptxAuditRecommendations {
  summary: string;
  overallRisk: AuditRisk;
  pageIssues: PageIssue[];
  clickRisks: ClickRisk[];
  wpsCompatibilityRisks: WpsCompatibilityRisk[];
  revisionPlanDraft: RevisionPlanDraft;
}

export interface PageIssue {
  slideNumber: number;
  severity: RecommendationSeverity;
  category: RecommendationCategory;
  message: string;
  suggestion: string;
}

export interface ClickRisk {
  slideNumber: number;
  risk: string;
  suggestion: string;
}

export interface WpsCompatibilityRisk {
  slideNumber: number;
  risk: string;
  fallback: string;
}

export interface RevisionPlanDraft {
  schema: "pptx-workbench.revision-plan.v1";
  sourceFile: string;
  goals: string[];
  actions: RevisionAction[];
}

export interface RevisionAction {
  slideNumber: number;
  type: RevisionActionType;
  instruction: string;
  priority: RevisionPriority;
}

export async function auditPptxFile(filePath: string, fileName = filePath): Promise<PptxAuditReport> {
  const stat = await fs.stat(filePath);
  try {
    const inspection = await inspectPptxPackage(filePath);
    return inspectionToAuditReport(fileName, stat.size, true, inspection);
  } catch (error) {
    return emptyAuditReport(fileName, stat.size, error);
  }
}

export async function auditPptxBuffer(fileName: string, buffer: Buffer): Promise<PptxAuditReport> {
  try {
    const inspection = await inspectPptxBuffer(buffer, fileName);
    return inspectionToAuditReport(fileName, buffer.byteLength, true, inspection);
  } catch (error) {
    return emptyAuditReport(fileName, buffer.byteLength, error);
  }
}

function inspectionToAuditReport(
  fileName: string,
  fileSize: number,
  validZip: boolean,
  inspection: Awaited<ReturnType<typeof inspectPptxPackage>>,
): PptxAuditReport {
  const reportWithoutRecommendations = {
    fileName,
    fileSize,
    validZip,
    validPptx: inspection.slideCount > 0,
    slideCount: inspection.slideCount,
    transitionCount: inspection.transitionCount,
    timingCount: inspection.timingCount,
    animEffectCount: inspection.animEffectCount,
    clickTriggerCount: inspection.clickTriggerCount,
    withEffectCount: inspection.withEffectCount,
    afterEffectCount: inspection.afterEffectCount,
    slides: inspection.slides.map((slide) => ({
      slideNumber: slide.slideNumber,
      hasTransition: slide.transitionCount > 0,
      hasTiming: slide.timingCount > 0,
      hasAnimEffect: slide.animEffectCount > 0,
      transitionCount: slide.transitionCount,
      timingCount: slide.timingCount,
      animEffectCount: slide.animEffectCount,
      clickTriggerCount: slide.clickTriggerCount,
      withEffectCount: slide.withEffectCount,
      afterEffectCount: slide.afterEffectCount,
    })),
  };
  return {
    ...reportWithoutRecommendations,
    recommendations: buildRecommendations(reportWithoutRecommendations),
  };
}

function emptyAuditReport(fileName: string, fileSize: number, error: unknown): PptxAuditReport {
  const reportWithoutRecommendations = {
    fileName,
    fileSize,
    validZip: false,
    validPptx: false,
    slideCount: 0,
    transitionCount: 0,
    timingCount: 0,
    animEffectCount: 0,
    clickTriggerCount: 0,
    withEffectCount: 0,
    afterEffectCount: 0,
    error: error instanceof Error ? error.message : "Unknown PPTX audit error",
    slides: [],
  };
  return {
    ...reportWithoutRecommendations,
    recommendations: buildRecommendations(reportWithoutRecommendations),
  };
}

function buildRecommendations(report: Omit<PptxAuditReport, "recommendations">): PptxAuditRecommendations {
  const pageIssues: PageIssue[] = [];
  const clickRisks: ClickRisk[] = [];
  const wpsCompatibilityRisks: WpsCompatibilityRisk[] = [];
  const actions: RevisionAction[] = [];

  const addPageIssue = (
    slideNumber: number,
    severity: RecommendationSeverity,
    category: RecommendationCategory,
    message: string,
    suggestion: string,
    actionType: RevisionActionType,
    priority: RevisionPriority,
  ): void => {
    pageIssues.push({ slideNumber, severity, category, message, suggestion });
    actions.push({ slideNumber, type: actionType, instruction: suggestion, priority });
  };

  const addClickRisk = (slideNumber: number, risk: string, suggestion: string, priority: RevisionPriority): void => {
    clickRisks.push({ slideNumber, risk, suggestion });
    actions.push({ slideNumber, type: "motion", instruction: suggestion, priority });
  };

  const addWpsRisk = (slideNumber: number, risk: string, fallback: string, priority: RevisionPriority): void => {
    wpsCompatibilityRisks.push({ slideNumber, risk, fallback });
    actions.push({ slideNumber, type: "compatibility", instruction: fallback, priority });
  };

  if (!report.validPptx) {
    addPageIssue(
      0,
      "error",
      "structure",
      "文件不是有效 PPTX 或无法读取 slide 结构。",
      "先确认文件能在 PowerPoint/WPS 中无修复打开，再进入 spec 化改稿。",
      "structure",
      "high",
    );
  }

  if (report.slideCount === 0) {
    addPageIssue(
      0,
      "error",
      "structure",
      "未检测到任何幻灯片。",
      "重新导出包含幻灯片内容的 PPTX，或检查上传文件是否损坏。",
      "structure",
      "high",
    );
  }

  if (report.validPptx && report.timingCount === 0 && report.animEffectCount === 0) {
    addPageIssue(
      1,
      "info",
      "motion",
      "未检测到对象级 timing / animEffect。",
      "如果目标是 Rich 版本，需要为每个 scene beat 规划 clickEffect parent 和 withEffect children；如果目标是稳定交付，可保留 WPS-compatible 状态页路线。",
      "motion",
      "medium",
    );
  }

  for (const slide of report.slides) {
    if (!slide.hasTransition) {
      addPageIssue(
        slide.slideNumber,
        "warning",
        "structure",
        "本页没有 transition。",
        "补充 fade transition 或明确状态页降级标记，提升 PowerPoint/WPS/Keynote 播放一致性。",
        "structure",
        "medium",
      );
    }

    if ((slide.timingCount > 0 || slide.animEffectCount > 0) && slide.clickTriggerCount === 0) {
      addClickRisk(
        slide.slideNumber,
        "存在 timing / animEffect，但没有 clickEffect 触发。",
        "检查是否为自动播放；若是演示点击节奏，应改成一次点击触发一个 scene beat cluster。",
        "high",
      );
    }

    if (slide.clickTriggerCount > 2) {
      addClickRisk(
        slide.slideNumber,
        `本页 clickEffect 数量为 ${slide.clickTriggerCount}，可能需要过多点击。`,
        "合并为 1-2 个语义 scene beat cluster，内部动画使用 withEffect / 自动延迟完成。",
        "high",
      );
    }

    if (slide.afterEffectCount > 0) {
      addPageIssue(
        slide.slideNumber,
        "warning",
        "motion",
        "本页存在 afterEffect 分支。",
        "检查 afterEffect 是否会被 PowerPoint/WPS/Keynote 解释成额外点击；建议并入同一个 clickEffect parent 下的 withEffect children。",
        "motion",
        "medium",
      );
      addWpsRisk(
        slide.slideNumber,
        "afterEffect 在 WPS/兼容环境中可能退化为跳结尾或额外触发。",
        "为 WPS-compatible 生成状态页展开版本，用 fade transition 表达同一 scene beat。",
        "medium",
      );
    }

    if (slide.animEffectCount >= 4 && slide.withEffectCount < Math.ceil(slide.animEffectCount / 2)) {
      addClickRisk(
        slide.slideNumber,
        "animEffect 较多但 withEffect 较少，可能是逐对象触发。",
        "把相关对象绑定到同一个 clickEffect parent 下，并使用 withEffect + start offset 表达并行/错峰。",
        "medium",
      );
    }

    if (looksLikeRichFile(report.fileName) && slide.clickTriggerCount !== 1) {
      addClickRisk(
        slide.slideNumber,
        `Rich 工作流要求每页 1 个 clickEffect parent，本页为 ${slide.clickTriggerCount}。`,
        "按当前 workbench 硬门槛重构为每页 1 个 clickEffect parent，callout + orange bar 作为 withEffect children 自动跑完。",
        "high",
      );
    }
  }

  if (actions.length === 0) {
    actions.push({
      slideNumber: 0,
      type: "structure",
      instruction: "当前包结构风险较低；若要进入改稿，可先补充内容目标、视觉参考和逐页 scene beat。",
      priority: "low",
    });
  }

  const hasError = pageIssues.some((issue) => issue.severity === "error");
  const hasHighRisk = clickRisks.some((risk) => risk.suggestion.length > 0) || pageIssues.some((issue) => issue.severity === "warning") || wpsCompatibilityRisks.length > 0;
  const overallRisk: AuditRisk = hasError ? "high" : hasHighRisk ? "medium" : "low";
  const summary = report.validPptx
    ? `审计完成：${report.slideCount} 页，发现 ${pageIssues.length} 个逐页问题、${clickRisks.length} 个点击风险、${wpsCompatibilityRisks.length} 个 WPS 兼容风险。`
    : `审计失败：${report.error ?? "文件无法作为有效 PPTX 读取"}。`;

  return {
    summary,
    overallRisk,
    pageIssues,
    clickRisks,
    wpsCompatibilityRisks,
    revisionPlanDraft: {
      schema: "pptx-workbench.revision-plan.v1",
      sourceFile: report.fileName,
      goals: [
        "将上传 PPTX 转成可由 deck-spec 驱动的可改稿结构。",
        "每页建立清晰 scene beat，并控制 Rich 点击数。",
        "为 WPS / 不确定环境保留状态页降级策略。",
      ],
      actions,
    },
  };
}

function looksLikeRichFile(fileName: string): boolean {
  return /rich|powerpoint/i.test(fileName);
}
