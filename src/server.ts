import { createServer as createHttpServer } from "node:http";
import express from "express";
import { createServer as createViteServer } from "vite";
import { annotationTaskText, appendCodexBridgeEvent, appendCodexBridgeReceipt, codexBridgeConfigPath, codexBridgeEventsPath, codexBridgePendingTokensPath, codexBridgeReceiptsPath, consumeCodexBridgeToken, ensureCodexBridgeFiles, readCodexBridgeSummary, uploadTaskText } from "./lib/codexBridge.js";
import { dispatchCodexBridgeQueue } from "./lib/codexBridgeDispatcher.js";
import { appendCodexInboxEvent, codexInboxPath, deleteCodexInboxEvent, ensureCodexInboxFile, readCodexInbox } from "./lib/codexInbox.js";
import { processCodexQueue } from "./lib/codexQueue.js";
import { auditPptxBuffer, auditPptxFile, type PptxAuditReport } from "./lib/pptxAudit.js";
import { createLockedExport, defaultProjectName, exportRootDir, readLastExportHistory } from "./lib/exportManager.js";
import { appendPlaybackQaSession, playbackQaLogPath, playbackQaMarkdownPath, readPlaybackQaSummary } from "./lib/playbackQa.js";
import { resolveFromProject } from "./lib/paths.js";
import { generateDecks } from "./lib/renderDeck.js";
import { appendUserRevisionAction, createRevisionPlanFromAudit, deletePendingUserRevisionAction, readRevisionPlan, revisionPlanPath, syncRevisionPlanProject } from "./lib/revisionPlan.js";
import { defaultSpecPath, loadDeckSpec } from "./lib/specLoader.js";
import { readUndoState, redoLastChange, undoLastChange } from "./lib/undoManager.js";
import { appendUploadReference, readUploadRegistry, uploadRegistryPath, uploadModeForSize } from "./lib/uploadRegistry.js";
import { appendUploadIntent, uploadIntentPath } from "./lib/uploadIntent.js";

const port = Number(process.env.PORT ?? 5173);
const app = express();
const httpServer = createHttpServer(app);
app.use(express.json());
app.use("/assets", express.static(resolveFromProject("assets")));
let lastUploadedAudit: PptxAuditReport | null = null;
const designSystemPath = resolveFromProject("specs", "presentation-design-system.yaml");
await ensureCodexInboxFile();
await ensureCodexBridgeFiles();

app.get("/api/spec", async (_req, res, next) => {
  try {
    const spec = await loadDeckSpec(defaultSpecPath);
    res.json({ spec, specPath: defaultSpecPath });
  } catch (error) {
    next(error);
  }
});

app.post("/api/generate", async (_req, res, next) => {
  try {
    const spec = await loadDeckSpec(defaultSpecPath);
    const result = await generateDecks(spec);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/export", async (req, res, next) => {
  try {
    if (isObjectRecord(req.body) && "rootPath" in req.body) {
      res.status(400).json({ error: "rootPath is not supported; exports are locked to /Users/bruce/Desktop/PPT" });
      return;
    }
    const spec = await loadDeckSpec(defaultSpecPath);
    const result = await generateDecks(spec);
    const exported = await createLockedExport(isObjectRecord(req.body) ? req.body : {}, result);
    await appendCodexBridgeEvent({
      type: "export_completed",
      payload: {
        projectName: exported.projectName,
        exportDir: exported.exportDir,
        files: exported.files,
      },
    });
    await appendCodexBridgeReceipt({
      kind: "export",
      status: "queued",
      message: "导出完成事件已进入 bridge 队列。",
      payload: { exportDir: exported.exportDir, files: exported.files },
    });
    res.json(exported);
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/audit-pptx",
  express.raw({
    type: [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/octet-stream",
    ],
    limit: "50mb",
  }),
  async (req, res, next) => {
    try {
      if (!Buffer.isBuffer(req.body)) {
        res.status(400).json({ error: "Expected raw PPTX upload body" });
        return;
      }
      const encodedFileName = req.header("x-file-name") ?? "uploaded.pptx";
      const fileName = decodeURIComponent(encodedFileName);
      const audit = await auditPptxBuffer(fileName, req.body);
      lastUploadedAudit = audit;
      res.json({ audit, recommendations: audit.recommendations });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/upload-reference",
  express.raw({
    type: [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/octet-stream",
    ],
    limit: "50mb",
  }),
  async (req, res, next) => {
    try {
      if (!Buffer.isBuffer(req.body)) {
        res.status(400).json({ error: "Expected raw PPTX upload body" });
        return;
      }
      const encodedFileName = req.header("x-file-name") ?? "uploaded.pptx";
      const fileName = decodeURIComponent(encodedFileName);
      const fileType = req.header("content-type") ?? "application/octet-stream";
      const mode = uploadModeForSize(req.body.byteLength);
      const uploads = await appendUploadReference({
        fileName,
        fileSize: req.body.byteLength,
        fileType,
      });
      const latestUpload = uploads.latestUpload;
      const intent = await appendUploadIntent({
        uploadId: latestUpload?.id,
        fileName,
        fileSize: req.body.byteLength,
        fileType,
        note: "已记录上传事件，等待当前 Codex 对话确认用途。",
      });
      const bridgeEvent = await appendCodexBridgeEvent({
        type: "upload_reference",
        payload: {
          fileName,
          fileSize: req.body.byteLength,
          fileType,
          uploadMode: mode,
          suggestedQuestion: "这个 PPTX 是用来参考风格、修改原文件、整合进当前作品，还是蒸馏知识？",
        },
        taskText: uploadTaskText({ fileName, fileSize: req.body.byteLength, uploadMode: mode }),
      });
      const dispatch = await dispatchCodexBridgeQueue({ limit: 1, eventIds: [bridgeEvent.id] });
      await appendCodexBridgeReceipt({
        kind: "upload",
        status: dispatch.status,
        bridgeEventId: bridgeEvent.id,
        message: dispatch.message,
        payload: { fileName, fileSize: req.body.byteLength, dispatch },
      });
      res.json({
        mode,
        status: "waiting-purpose",
        note: bridgeUploadNote(dispatch.status === "waiting_codex" ? "waiting_codex" : bridgeEvent.status, bridgeEvent.error),
        uploads,
        intent,
        bridgeEvent,
        dispatch,
      });
    } catch (error) {
      next(error);
    }
  },
);

app.post("/api/upload-reference/metadata", async (req, res, next) => {
  try {
    const input = isObjectRecord(req.body) ? req.body : {};
    const fileName = typeof input.fileName === "string" ? input.fileName : "uploaded.pptx";
    const fileSize = typeof input.fileSize === "number" ? input.fileSize : 0;
    const fileType = typeof input.fileType === "string" ? input.fileType : "application/octet-stream";
    const mode = uploadModeForSize(fileSize);
    const uploads = await appendUploadReference({ fileName, fileSize, fileType });
    const latestUpload = uploads.latestUpload;
    const intent = await appendUploadIntent({
      uploadId: latestUpload?.id,
      fileName,
      fileSize,
      fileType,
      note: mode === "large-file-audit"
        ? "大文件已记录，等待当前 Codex 对话确认用途；未整包上传，未完成结构审计。"
        : "已记录上传事件，等待当前 Codex 对话确认用途。",
    });
    const bridgeEvent = await appendCodexBridgeEvent({
      type: "upload_reference",
      payload: {
        fileName,
        fileSize,
        fileType,
        uploadMode: mode,
        suggestedQuestion: "这个 PPTX 是用来参考风格、修改原文件、整合进当前作品，还是蒸馏知识？",
      },
      taskText: uploadTaskText({ fileName, fileSize, uploadMode: mode }),
    });
    const dispatch = await dispatchCodexBridgeQueue({ limit: 1, eventIds: [bridgeEvent.id] });
    await appendCodexBridgeReceipt({
      kind: "upload",
      status: dispatch.status,
      bridgeEventId: bridgeEvent.id,
      message: dispatch.message,
      payload: { fileName, fileSize, dispatch },
    });
    res.json({
      mode,
      status: "waiting-purpose",
      note: bridgeUploadNote(dispatch.status === "waiting_codex" ? "waiting_codex" : bridgeEvent.status, bridgeEvent.error),
      uploads,
      intent,
      bridgeEvent,
      dispatch,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/verify", async (_req, res, next) => {
  try {
    const spec = await loadDeckSpec(defaultSpecPath);
    const rich = await auditPptxFile(resolveFromProject("outputs", "PowerPoint-rich.pptx"), "PowerPoint-rich.pptx");
    const wps = await auditPptxFile(resolveFromProject("outputs", "WPS-compatible.pptx"), "WPS-compatible.pptx");
    res.json({
      specSlides: spec.slides.length,
      sceneBeats: spec.slides.reduce((sum, slide) => sum + (slide.sceneBeats?.length ?? 0), 0),
      outputs: { rich, wps },
      compatibility: {
        powerpointKeynote: "PowerPoint-rich.pptx",
        wpsOrUnknown: "WPS-compatible.pptx",
        singleFileDefault: "WPS-compatible.pptx",
        wpsRichRecommendation: "not-recommended",
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/revision-plan", async (_req, res, next) => {
  try {
    res.json(await syncRevisionPlanProject(defaultProjectName));
  } catch (error) {
    next(error);
  }
});

app.post("/api/revision-plan/from-audit", async (_req, res, next) => {
  try {
    const audit = lastUploadedAudit ?? await auditPptxFile(resolveFromProject("outputs", "PowerPoint-rich.pptx"), "PowerPoint-rich.pptx");
    const spec = await loadDeckSpec(defaultSpecPath);
    const summary = await createRevisionPlanFromAudit(spec, audit.recommendations, audit.fileName, defaultProjectName);
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

app.post("/api/revision-plan/action", async (req, res, next) => {
  try {
    const spec = await loadDeckSpec(defaultSpecPath);
    const summary = await appendUserRevisionAction(isObjectRecord(req.body) ? req.body : {}, spec, defaultProjectName);
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

app.get("/api/codex-inbox", async (_req, res, next) => {
  try {
    res.json(await readCodexInbox());
  } catch (error) {
    next(error);
  }
});

app.get("/api/codex-bridge", async (_req, res, next) => {
  try {
    res.json(await readCodexBridgeSummary());
  } catch (error) {
    next(error);
  }
});

app.post("/api/codex-bridge/dispatch", async (req, res, next) => {
  try {
    const input = isObjectRecord(req.body) ? req.body : {};
    const limit = typeof input.limit === "number" ? input.limit : 5;
    const dispatch = await dispatchCodexBridgeQueue({ limit });
    await appendCodexBridgeReceipt({
      kind: "dispatch",
      status: dispatch.status,
      message: dispatch.message,
      payload: { processed: dispatch.processed, failed: dispatch.failed, queued: dispatch.queued },
    });
    res.json(dispatch);
  } catch (error) {
    next(error);
  }
});

app.post("/api/codex-bridge/connect-token", async (req, res, next) => {
  try {
    const input = isObjectRecord(req.body) ? req.body : {};
    const token = typeof input.bridgeToken === "string" ? input.bridgeToken : "";
    const result = await consumeCodexBridgeToken(token);
    res.status(result.ok ? 200 : 400).json({
      ...result,
      bridge: await readCodexBridgeSummary(),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/codex-inbox", async (req, res, next) => {
  try {
    const input = isObjectRecord(req.body) ? req.body : {};
    const spec = await loadDeckSpec(defaultSpecPath);
    const selectedSlideId = typeof input.selectedSlideId === "string" ? input.selectedSlideId : "";
    const slideIndex = spec.slides.findIndex((slide) => slide.id === selectedSlideId);
    if (slideIndex < 0) {
      res.status(400).json({ error: `Unknown slideId: ${selectedSlideId || "missing"}` });
      return;
    }
    const inbox = await appendCodexInboxEvent(input);
    const latestEvent = inbox.latestEvent;
    if (!latestEvent) {
      throw new Error("Codex inbox append did not return the new event");
    }
    const foundElement = findElementText(spec, latestEvent.selectedSlideId, latestEvent.selectedObjectId);
    const bridgePayload = {
      inboxEventId: latestEvent.id,
      slideId: latestEvent.selectedSlideId,
      objectId: latestEvent.selectedObjectId,
      region: {
        x: latestEvent.selectionBounds.x,
        y: latestEvent.selectionBounds.y,
        width: latestEvent.selectionBounds.w,
        height: latestEvent.selectionBounds.h,
      },
      selectedText: foundElement.text,
      instruction: latestEvent.userInstruction,
      context: {
        projectName: defaultProjectName,
        currentSlideTitle: spec.slides[slideIndex]?.title ?? latestEvent.selectedSlideId,
      },
    };
    const bridgeEvent = await appendCodexBridgeEvent({
      type: "annotation_submitted",
      payload: bridgePayload,
      taskText: annotationTaskText({
        eventId: latestEvent.id,
        slideId: latestEvent.selectedSlideId,
        objectId: latestEvent.selectedObjectId,
        selectedText: foundElement.text,
        instruction: latestEvent.userInstruction,
      }),
    });
    const revision = await appendUserRevisionAction({
      slideId: latestEvent.selectedSlideId,
      slideNumber: slideIndex + 1,
      objectId: latestEvent.selectedObjectId ?? undefined,
      objectRole: typeof input.objectRole === "string" ? input.objectRole : undefined,
      type: revisionTypeForSelection(latestEvent.scope, latestEvent.selectedObjectType),
      priority: "medium",
      instruction: latestEvent.userInstruction,
    }, spec, defaultProjectName);
    res.json({ inbox, revision, event: latestEvent, bridgeEvent });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/codex-inbox/:id", async (req, res, next) => {
  try {
    const before = await readCodexInbox();
    const event = before.events.find((item) => item.id === req.params.id);
    const inbox = await deleteCodexInboxEvent(req.params.id);
    let revision = await readRevisionPlan();
    if (event && event.status === "todo") {
      revision = await deletePendingUserRevisionAction({
        slideId: event.selectedSlideId,
        objectId: event.selectedObjectId,
        instruction: event.userInstruction,
      });
    }
    res.json({ inbox, revision, deleted: Boolean(event) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/codex-queue/process", async (req, res, next) => {
  try {
    const limit = isObjectRecord(req.body) && typeof req.body.limit === "number" ? req.body.limit : 1;
    const result = await processCodexQueue(limit);
    const dispatch = result.status === "needs-codex" && result.latestProcessed?.eventId
      ? await dispatchCodexBridgeQueue({ limit: 1, inboxEventId: result.latestProcessed.eventId })
      : null;
    if (dispatch) {
      await appendCodexBridgeReceipt({
        kind: "dispatch",
        status: dispatch.status,
        eventId: result.latestProcessed?.eventId,
        message: `开放式批注已尝试发送到当前 Codex 对话：${dispatch.message}`,
        payload: { dispatch },
      });
    }
    res.json({ ...result, dispatch });
  } catch (error) {
    next(error);
  }
});

app.get("/api/undo-state", async (_req, res, next) => {
  try {
    res.json(await readUndoState());
  } catch (error) {
    next(error);
  }
});

app.post("/api/undo", async (_req, res, next) => {
  try {
    const undo = await undoLastChange();
    await appendCodexBridgeEvent({
      type: "undo_completed",
      payload: { undoCount: undo.undoCount, redoCount: undo.redoCount, latestUndo: undo.latestUndo },
    });
    res.json(undo);
  } catch (error) {
    next(error);
  }
});

app.post("/api/redo", async (_req, res, next) => {
  try {
    const redo = await redoLastChange();
    await appendCodexBridgeEvent({
      type: "redo_completed",
      payload: { undoCount: redo.undoCount, redoCount: redo.redoCount, latestUndo: redo.latestUndo },
    });
    res.json(redo);
  } catch (error) {
    next(error);
  }
});

app.get("/api/playback-qa", async (_req, res, next) => {
  try {
    res.json(await readPlaybackQaSummary());
  } catch (error) {
    next(error);
  }
});

app.post("/api/playback-qa/session", async (req, res, next) => {
  try {
    const summary = await appendPlaybackQaSession(isObjectRecord(req.body) ? req.body : {});
    await appendCodexBridgeEvent({
      type: "playback_qa_recorded",
      payload: {
        latestSession: summary.latestSession,
        sessionCount: summary.sessionCount,
        riskStats: summary.riskStats,
      },
    });
    await appendCodexBridgeReceipt({
      kind: "playback",
      status: "queued",
      message: "播放 QA 已记录并进入 bridge 队列。",
      payload: { latestSession: summary.latestSession?.sessionId },
    });
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

app.get("/api/workbench-state", async (_req, res, next) => {
  try {
    const spec = await loadDeckSpec(defaultSpecPath);
    const sceneBeatCount = spec.slides.reduce((sum, slide) => sum + (slide.sceneBeats?.length ?? 0), 0);
    const lastExport = await readLastExportHistory();
    const lastExportMatchesProject = lastExport?.projectName === defaultProjectName;
    const revision = await syncRevisionPlanProject(defaultProjectName);
    const playbackQa = await readPlaybackQaSummary();
    const codexInbox = await readCodexInbox();
    const undo = await readUndoState();
    const uploads = await readUploadRegistry();
    const codexBridge = await readCodexBridgeSummary();
    const todoCount = codexInbox.events.filter((event) => event.status === "todo").length;
    const appliedCount = codexInbox.events.filter((event) => event.status === "applied").length;
    const latestQueueEvent = codexInbox.events.filter((event) => event.status !== "todo").at(-1) ?? null;
    const queueStatus = latestQueueEvent?.status === "failed"
      ? "failed"
      : latestQueueEvent?.status === "needs-design" || latestQueueEvent?.status === "needs-codex"
        ? "needs-codex"
        : "idle";
    res.json({
      projectName: defaultProjectName,
      specTitle: spec.title,
      specPath: defaultSpecPath,
      slideCount: spec.slides.length,
      sceneBeatCount,
      outputs: {
        powerpointRich: resolveFromProject("outputs", "PowerPoint-rich.pptx"),
        wpsCompatible: resolveFromProject("outputs", "WPS-compatible.pptx"),
        revisionPlan: revisionPlanPath,
        playbackQaLog: playbackQaLogPath,
        playbackQaMarkdown: playbackQaMarkdownPath,
        codexInbox: codexInboxPath,
        uploadIntent: uploadIntentPath,
        uploadRegistry: uploadRegistryPath,
        codexBridgeEvents: codexBridgeEventsPath,
        codexBridgeConfig: codexBridgeConfigPath,
        codexBridgePendingTokens: codexBridgePendingTokensPath,
        codexBridgeReceipts: codexBridgeReceiptsPath,
        nativeAnimationCatalog: resolveFromProject("specs", "native-animation-catalog.yaml"),
        referenceStyle: resolveFromProject("specs", "reference-style.yaml"),
      },
      export: {
        lockedRoot: exportRootDir,
        lastExportDir: lastExport?.exportDir ?? null,
        lastFolderName: lastExport?.folderName ?? null,
        historyPath: resolveFromProject("outputs", "export-history.jsonl"),
        lastExportProjectName: lastExport?.projectName ?? null,
        lastExportMatchesProject,
        lastExportStatus: lastExport ? (lastExportMatchesProject ? "current-project" : "historical-export") : "none",
      },
      workflow: {
        currentStage: lastExport ? "export" : "preview",
        nextAction: lastExport
          ? "请根据录屏 QA 或审计建议继续改稿。"
          : "请确认视觉预览，生成 PPTX 后进行审计和导出。",
      },
      compatibility: {
        powerpointKeynote: "PowerPoint-rich.pptx",
        wpsUnknown: "WPS-compatible.pptx",
        singleFileDefault: "WPS-compatible.pptx",
        wpsRichRecommendation: "not-recommended",
      },
      revisionPlan: {
        exists: revision.exists,
        actionCount: revision.actionCount,
        highPriorityCount: revision.highPriorityCount,
        latestAction: revision.latestAction,
      },
      codexInbox: {
        path: codexInbox.path,
        eventCount: codexInbox.eventCount,
        latestEvent: codexInbox.latestEvent,
      },
      codexBridge,
      codexQueue: {
        pendingCount: todoCount,
        appliedCount,
        status: queueStatus,
        latestProcessed: latestQueueEvent,
        undoCount: undo.undoCount,
        redoCount: undo.redoCount,
        maxUndo: undo.maxUndo,
      },
      undo,
      uploads,
      currentPreview: {
        modes: ["rich-before", "rich-after", "wps-state-0", "wps-state-1", "diff"],
        defaultMode: "rich-after",
        overlayDefaults: {
          alignmentGuides: false,
          safeFrame: false,
          objectBounds: false,
          stateBadge: false,
          revealDebug: false,
        },
      },
      playback: {
        supported: true,
        modes: ["Rich", "WPS"],
        controls: ["mouse-left", "Space", "Enter", "ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Esc", "Home", "End"],
        writesDisk: true,
        animationPreflight: true,
        simulatedEffects: ["fade", "slide", "fly", "zoom", "wipe", "reveal", "scale emphasis", "motion path"],
        latestSession: playbackQa.latestSession,
        sessionCount: playbackQa.sessionCount,
        riskStats: playbackQa.riskStats,
        logPath: playbackQa.logPath,
        markdownPath: playbackQa.playbackQaPath,
      },
      designSystem: {
        exists: true,
        path: designSystemPath,
        status: "codex-editing-constraint",
        summary: "Codex-native deck artifact design rules for visual, layout, motion, and compatibility edits.",
      },
    });
  } catch (error) {
    next(error);
  }
});

const vite = await createViteServer({
  server: {
    middlewareMode: { server: httpServer },
    hmr: {
      server: httpServer,
      host: "127.0.0.1",
      clientPort: port,
    },
  },
  appType: "spa",
});

app.use(vite.middlewares);
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unknown server error";
  res.status(500).json({ error: message });
});

httpServer.listen(port, "127.0.0.1", () => {
  console.log(`pptx-workbench running at http://127.0.0.1:${port}`);
});

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function revisionTypeForSelection(scope: "object" | "region" | "slide", selectedObjectType: string): "content" | "visual" | "structure" {
  if (scope === "slide" || scope === "region") {
    return "structure";
  }
  return selectedObjectType === "text" ? "content" : "visual";
}

function bridgeUploadNote(status: string, error: string | undefined): string {
  if (status === "bridge_unavailable") {
    return error?.includes("过期")
      ? "已上传，但当前 Codex 连接已过期。请重新连接。"
      : "已上传，但缺少 threadId。请从 builder 启动或在当前 Codex 对话运行连接命令。";
  }
  if (status === "queued") {
    return "已上传，已注册会话但未发现 app-server；等待 Codex 对话读取。";
  }
  return "已上传，等待 Codex 在当前对话中确认用途。";
}

function findElementText(
  spec: Awaited<ReturnType<typeof loadDeckSpec>>,
  slideId: string,
  objectId: string | null,
): { text?: string } {
  if (!objectId) {
    return {};
  }
  const slide = spec.slides.find((item) => item.id === slideId);
  for (const layer of slide?.layers ?? []) {
    const element = layer.elements.find((item) => item.id === objectId);
    if (element && "text" in element && typeof element.text === "string") {
      return { text: element.text };
    }
  }
  return {};
}
