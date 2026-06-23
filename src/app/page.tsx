"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import {
  IconAlertTriangle,
  IconArrowRight,
  IconChartDots3,
  IconDownload,
  IconEye,
  IconEyeOff,
  IconFileText,
  IconKey,
  IconLoader2,
  IconMenu2,
  IconRefresh,
  IconUpload,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { BackgroundShader } from "@/components/ui/background-shader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  getDesignInputSections,
  getPrdProblemList,
  MAX_UPLOAD_MB,
  MAX_UPLOAD_BYTES,
  PrdAnalysis,
} from "@/lib/prd"
import { cn } from "@/lib/utils"

const severityClass = {
  致命: "bg-red-500/12 text-red-200 ring-red-400/22",
  严重: "bg-amber-400/12 text-amber-100 ring-amber-300/24",
  轻微: "bg-white/[0.07] text-white/68 ring-white/12",
  优秀: "bg-emerald-400/12 text-emerald-100 ring-emerald-300/22",
} as const

const depthOptions = ["快速", "标准", "深入"]
const analysisTabs = ["priorities", "brief", "problems"] as const

type AnalysisTab = (typeof analysisTabs)[number]
type ProblemSeverity = "致命" | "严重" | "轻微"
type SaveFilePicker = (options: {
  suggestedName?: string
  types?: Array<{
    description: string
    accept: Record<string, string[]>
  }>
}) => Promise<{
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>
    close: () => Promise<void>
  }>
}>

function isAnalysisTab(value: unknown): value is AnalysisTab {
  return typeof value === "string" && analysisTabs.includes(value as AnalysisTab)
}

function HeaderMetricJump({
  label,
  count,
  onClick,
  disabled,
}: {
  label: string
  count: number
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className="helix-metric-jump"
      onClick={onClick}
      disabled={disabled || count === 0}
      aria-label={`定位到首个${label}相关内容`}
    >
      <span>{label}</span>
      <strong>{count}</strong>
    </button>
  )
}

function UploadedCloudCheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 48"
      aria-hidden="true"
      className={className}
      fill="none"
    >
      <path
        d="M17.5 42C8.9 42 2 35.1 2 26.6C2 18.2 8.8 11.4 17.2 11.3C20.1 4.9 26.5 1 33.7 1C42.8 1 50.4 7.6 52 16.4C57.8 18 62 23.3 62 29.4C62 36.4 56.3 42 49.3 42H17.5Z"
        fill="currentColor"
        opacity="0.18"
      />
      <path
        d="M17.5 42C8.9 42 2 35.1 2 26.6C2 18.2 8.8 11.4 17.2 11.3C20.1 4.9 26.5 1 33.7 1C42.8 1 50.4 7.6 52 16.4C57.8 18 62 23.3 62 29.4C62 36.4 56.3 42 49.3 42H17.5Z"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path
        d="M25.2 25.2L30.4 30.4L41.5 19.3"
        stroke="currentColor"
        strokeWidth="3.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
const defaultModelConfig = {
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-5.5",
}

type ModelConfig = typeof defaultModelConfig

function fileKind(filename: string) {
  const lower = filename.toLowerCase()
  if (lower.endsWith(".pdf")) return "pdf"
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown"
  return "text"
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function reportFilename(filename: string, extension: string) {
  const baseName = filename
    .replace(/\.[^/.]+$/, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .trim()

  return `${baseName || "prd-analysis"}.${extension}`
}

async function saveBlobWithPicker({
  blob,
  filename,
  description,
  accept,
}: {
  blob: Blob
  filename: string
  description: string
  accept: Record<string, string[]>
}) {
  const saveFilePicker = (
    window as Window & typeof globalThis & { showSaveFilePicker?: SaveFilePicker }
  ).showSaveFilePicker

  if (!saveFilePicker) {
    downloadBlob(blob, filename)
    return "download" as const
  }

  const handle = await saveFilePicker({
    suggestedName: filename,
    types: [
      {
        description,
        accept,
      },
    ],
  })
  const writable = await handle.createWritable()
  await writable.write(blob)
  await writable.close()
  return "saved" as const
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function createHtmlReport(analysis: PrdAnalysis) {
  const brief = analysis.designBrief
  const designInput = getDesignInputSections(analysis)
  const problemList = getPrdProblemList(analysis)
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(analysis.source.filename)} PRD 分析报告</title>
  <style>
    body { margin: 0; background: #f5f7fa; color: #1f2937; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { max-width: 1080px; margin: 0 auto; padding: 40px 24px; }
    section { background: white; border: 1px solid #e5e7eb; border-radius: 18px; padding: 24px; margin-bottom: 16px; }
    h1 { font-size: 28px; margin: 0 0 10px; }
    h2 { font-size: 20px; margin: 0 0 12px; }
    h3 { font-size: 16px; margin: 18px 0 8px; }
    p, li { line-height: 1.7; }
    .score { display: inline-flex; margin: 6px 8px 6px 0; padding: 8px 12px; border-radius: 999px; background: #eef2ff; }
    .finding { border-left: 5px solid var(--color); }
    .meta { color: #64748b; }
  </style>
</head>
<body>
  <main>
    <section>
      <h1>${escapeHtml(analysis.source.filename)} PRD 分析报告</h1>
      <p>综合评分：${analysis.metrics.overallScore}/10</p>
      ${analysis.scores.map((score) => `<span class="score">${escapeHtml(score.label)} ${score.value}/10</span>`).join("")}
    </section>
    <section>
      <h2>设计待办</h2>
      ${analysis.designPriorities
        .map(
          (item) => `<article class="finding" style="--color:#b7ff5a; padding-left: 16px; margin-bottom: 18px;">
            <h3>${item.id}. ${escapeHtml(item.title)}</h3>
            <p class="meta">${escapeHtml(item.priority)} · ${escapeHtml(item.impactedUser)}</p>
            <p><strong>设计对象：</strong>${escapeHtml(item.problem)}</p>
            <p><strong>设计重点：</strong>${escapeHtml(item.reason)}</p>
            <p><strong>建议产物：</strong>${escapeHtml(item.artifact)}</p>
          </article>`
        )
        .join("")}
    </section>
    <section>
      <h2>设计依据</h2>
      <p><strong>业务目标：</strong>${escapeHtml(brief.businessGoal)}</p>
      <p><strong>设计目标：</strong>${escapeHtml(brief.designGoal)}</p>
      <h3>用户与场景</h3>
      <ul>${brief.usersAndScenarios.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      <h3>体验机会</h3>
      <ul>${brief.opportunities.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      <h3>需求输入</h3>
      ${designInput
        .map(
          (section) => `<article>
            <h3>${escapeHtml(section.title)}</h3>
            <p>${escapeHtml(section.summary)}</p>
            <ul>${section.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          </article>`
        )
        .join("")}
    </section>
    <section>
      <h2>PRD 问题清单</h2>
      ${problemList
        .map(
          (item) => `<article>
            <h3>${escapeHtml(item.title)}</h3>
            <p class="meta">${escapeHtml(item.type)} · ${escapeHtml(item.severity)}</p>
            <p>${escapeHtml(item.summary)}</p>
            <p><strong>建议：</strong>${escapeHtml(item.recommendation)}</p>
          </article>`
        )
        .join("")}
    </section>
  </main>
</body>
</html>`
}

function readStoredModelConfig(): ModelConfig {
  if (typeof window === "undefined") return defaultModelConfig

  return {
    apiKey: sessionStorage.getItem("openai-api-key") || "",
    baseUrl:
      sessionStorage.getItem("openai-base-url") || defaultModelConfig.baseUrl,
    model: sessionStorage.getItem("openai-model") || defaultModelConfig.model,
  }
}

function saveModelConfig(config: ModelConfig) {
  if (config.apiKey) {
    sessionStorage.setItem("openai-api-key", config.apiKey)
  } else {
    sessionStorage.removeItem("openai-api-key")
  }
  sessionStorage.setItem("openai-base-url", config.baseUrl)
  sessionStorage.setItem("openai-model", config.model)
}

function clearModelConfigStorage() {
  sessionStorage.removeItem("openai-api-key")
  sessionStorage.removeItem("openai-base-url")
  sessionStorage.removeItem("openai-model")
}

async function readJsonResponse<T>(response: Response, fallbackMessage: string) {
  const contentType = response.headers.get("content-type") || ""
  const text = await response.text()

  if (!contentType.includes("application/json")) {
    const isHtml = /^\s*</.test(text)
    const htmlTitle =
      text.match(/<title>(.*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ||
      text
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120)
    throw new Error(
      isHtml
        ? `${fallbackMessage}：接口返回错误页面（HTTP ${response.status}${
            htmlTitle ? `，${htmlTitle}` : ""
          }）。`
        : text.trim() || fallbackMessage
    )
  }

  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`${fallbackMessage}：服务端返回内容不是合法 JSON。`)
  }
}

function ModelConfigDialog({
  config,
  setConfig,
}: {
  config: ModelConfig
  setConfig: (value: ModelConfig) => void
}) {
  const safeConfig = config || defaultModelConfig
  const [draft, setDraft] = React.useState<ModelConfig>(safeConfig)
  const [open, setOpen] = React.useState(false)
  const [visible, setVisible] = React.useState(false)
  const [testing, setTesting] = React.useState(false)
  const [testMessage, setTestMessage] = React.useState("")

  const updateDraft = (patch: Partial<ModelConfig>) => {
    setDraft((current) => ({ ...current, ...patch }))
    setTestMessage("")
  }

  const testConnection = async () => {
    setTesting(true)
    setTestMessage("")

    try {
      const response = await fetch("/api/test-model-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          openaiApiKey: draft.apiKey,
          openaiBaseUrl: draft.baseUrl,
          openaiModel: draft.model,
        }),
      })
      const payload = await readJsonResponse<{
        ok: boolean
        message?: string
        latencyMs?: number
      }>(response, "连接测试失败")
      if (!response.ok) throw new Error(payload.message || "连接测试失败")
      setTestMessage(`${payload.message} 延迟 ${payload.latencyMs}ms`)
      toast.success("模型连接测试成功")
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "连接测试失败，请检查配置。"
      setTestMessage(message)
      toast.error(message)
    } finally {
      setTesting(false)
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="helix-line-button rounded-full border-white/10 bg-white/5 text-[color:var(--helix-text)] hover:bg-white/10"
        onClick={() => {
          setDraft(safeConfig)
          setTestMessage("")
          setOpen(true)
        }}
      >
        <IconKey data-icon="inline-start" />
        模型配置
      </Button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
          className="helix-app fixed inset-0 z-[9999] grid place-items-center overflow-y-auto bg-black/60 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="model-config-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false)
          }}
          >
            <section className="helix-panel relative grid max-h-[calc(100vh-3rem)] w-full max-w-xl gap-6 overflow-y-auto rounded-[28px] p-6 text-sm text-[color:var(--helix-text)] shadow-2xl">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="helix-line-button absolute right-4 top-4 rounded-full bg-white/5 text-white/70 hover:bg-white/10"
              aria-label="关闭模型配置"
              onClick={() => setOpen(false)}
            >
              ×
            </Button>
            <header className="grid gap-2 pr-10">
              <h2
                id="model-config-title"
                className="font-heading text-lg font-semibold text-[color:var(--helix-text)]"
              >
                模型配置
              </h2>
              <p className="helix-muted leading-6">
                参考竞品分析工具配置方式，支持 API Key、Base URL 和模型名称。本页只保存到当前浏览器会话。
              </p>
            </header>
            <div className="grid gap-4">
              <Label htmlFor="openai-key">API Key</Label>
              <div className="flex gap-2">
                <Input
                  id="openai-key"
                  type={visible ? "text" : "password"}
                  value={draft.apiKey}
                  placeholder="sk-..."
                  onChange={(event) =>
                    updateDraft({ apiKey: event.target.value })
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="helix-line-button border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                  onClick={() => setVisible((value) => !value)}
                  aria-label={visible ? "隐藏 API Key" : "显示 API Key"}
                >
                  {visible ? <IconEyeOff /> : <IconEye />}
                </Button>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="openai-base-url">Base URL</Label>
                <Input
                  id="openai-base-url"
                  value={draft.baseUrl}
                  placeholder="https://api.openai.com/v1"
                  onChange={(event) =>
                    updateDraft({ baseUrl: event.target.value })
                  }
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  OpenAI 使用 `https://api.openai.com/v1`。兼容服务只填到 `/v1` 或供应商 API 根路径，不要填具体 `/chat/completions`。
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="openai-model">模型名称</Label>
                <Input
                  id="openai-model"
                  value={draft.model}
                  placeholder="gpt-5.5"
                  onChange={(event) =>
                    updateDraft({ model: event.target.value })
                  }
                />
              </div>
              {testMessage && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/70">
                  {testMessage}
                </div>
              )}
              <p className="text-xs leading-5 text-muted-foreground">
                API Key 不填写时会尝试使用服务端环境变量 `OPENAI_API_KEY`；都不可用时自动生成规则草稿。
              </p>
            </div>
            <footer className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                className="helix-line-button border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                onClick={() => {
                  setDraft(defaultModelConfig)
                  setConfig(defaultModelConfig)
                  clearModelConfigStorage()
                  setTestMessage("")
                  toast.success("已重置模型配置")
                }}
              >
                重置
              </Button>
              <Button
                variant="outline"
                className="helix-line-button border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                onClick={testConnection}
                disabled={testing}
              >
                {testing && (
                  <IconLoader2
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                )}
                测试连接
              </Button>
              <Button
                className="bg-[color:var(--helix-accent)] text-black hover:bg-[color:var(--helix-accent)]/90"
                onClick={() => {
                  const normalized = {
                    apiKey: draft.apiKey.trim(),
                    baseUrl:
                      draft.baseUrl.trim() || defaultModelConfig.baseUrl,
                    model: draft.model.trim() || defaultModelConfig.model,
                  }
                  setConfig(normalized)
                  saveModelConfig(normalized)
                  setOpen(false)
                  toast.success("模型配置已保存到本次会话")
                }}
              >
                保存本次会话
              </Button>
            </footer>
            </section>
          </div>,
          document.body
        )}
    </>
  )
}

function UploadPanel({
  file,
  setFile,
  onAnalyze,
  analyzing,
  modelConfig,
  setModelConfig,
  industry,
  setIndustry,
  targetReader,
  setTargetReader,
  prdDepth,
  setPrdDepth,
}: {
  file: File | null
  setFile: (file: File | null) => void
  onAnalyze: () => void
  analyzing: boolean
  modelConfig: ModelConfig
  setModelConfig: (value: ModelConfig) => void
  industry: string
  setIndustry: (value: string) => void
  targetReader: string
  setTargetReader: (value: string) => void
  prdDepth: string
  setPrdDepth: (value: string) => void
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)

  const acceptFile = React.useCallback(
    (nextFile?: File) => {
      if (!nextFile) return
      if (nextFile.size > MAX_UPLOAD_BYTES) {
        toast.error(
          `当前文件 ${formatFileSize(nextFile.size)}，单文件最大 ${MAX_UPLOAD_MB}MB`
        )
        return
      }
      const lower = nextFile.name.toLowerCase()
      if (
        !lower.endsWith(".pdf") &&
        !lower.endsWith(".md") &&
        !lower.endsWith(".markdown") &&
        !lower.endsWith(".txt")
      ) {
        toast.error("仅支持 PDF / Markdown / TXT")
        return
      }
      setFile(nextFile)
    },
    [setFile]
  )

  return (
    <main className="helix-app relative min-h-screen overflow-hidden">
      <BackgroundShader
        scale={0.92}
        speed={0.36}
        offsetX={-0.22}
        offsetY={-0.02}
        className="helix-shader-bg"
      />
      <div className="helix-grid pointer-events-none absolute inset-x-0 top-0 h-[520px]" />
      <nav className="helix-nav sticky top-0 z-40">
        <div className="mx-auto flex w-[min(1180px,calc(100%-40px))] items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[color:var(--helix-accent)]">
              <IconChartDots3 className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-[color:var(--helix-text)]">
                PRD Sentinel
              </p>
              <p className="helix-muted text-xs">Requirement intelligence</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <ModelConfigDialog
              config={modelConfig}
              setConfig={setModelConfig}
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="helix-line-button rounded-full border-white/10 bg-white/5 text-white md:hidden"
            aria-label="打开模型配置菜单"
            onClick={() => setMenuOpen((value) => !value)}
          >
            <IconMenu2 />
          </Button>
          {menuOpen && (
            <div className="absolute left-5 right-5 top-[68px] z-50 rounded-3xl border border-white/10 bg-[rgb(9,16,13)] p-4 shadow-2xl backdrop-blur-xl md:hidden">
              <div className="grid gap-2">
                <div>
                  <ModelConfigDialog
                    config={modelConfig}
                    setConfig={setModelConfig}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </nav>

      <section className="relative z-10 mx-auto grid w-[min(1180px,calc(100%-40px))] gap-10 py-14 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:py-20">
        <div>
          <p className="helix-label">Institutional PRD Review</p>
          <h1 className="mt-5 max-w-[15ch] font-heading text-[clamp(2.5rem,5.4vw,4.8rem)] font-semibold leading-[1.12] tracking-normal text-[color:var(--helix-text)]">
            PRD 可视化评审
          </h1>
          <p className="helix-muted mt-6 max-w-2xl text-base leading-[1.65]">
            上传 PDF / Markdown / TXT，快速生成面向设计决策的结构化评审报告。
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["4D", "Scoring"],
              [`${MAX_UPLOAD_MB}MB`, "Max file"],
              ["9", "Core sections"],
              ["0", "Storage"],
            ].map(([value, label]) => (
              <div key={label} className="helix-panel-soft rounded-3xl p-4">
                <p className="text-2xl font-semibold text-[color:var(--helix-text)]">
                  {value}
                </p>
                <p className="helix-muted mt-1 text-xs">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="helix-panel rounded-[30px] p-4 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="helix-label">Document ingest</p>
              <h2 className="mt-2 text-xl font-semibold text-[color:var(--helix-text)]">
                PRD 文件输入
              </h2>
            </div>
            <div className="rounded-full border border-[color:var(--helix-line)] bg-white/5 px-3 py-1 text-xs text-white/50">
              Scanned PDF unsupported
            </div>
          </div>

        <button
          type="button"
          className={cn(
            "helix-upload flex min-h-72 w-full flex-col items-center justify-center gap-5 rounded-[28px] p-8 text-center transition",
            dragging && "border-[color:var(--helix-accent)]",
            file && "border-[color:var(--helix-accent)]"
          )}
          onClick={() => inputRef.current?.click()}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            event.currentTarget.style.setProperty(
              "--mx",
              `${event.clientX - rect.left}px`
            )
            event.currentTarget.style.setProperty(
              "--my",
              `${event.clientY - rect.top}px`
            )
          }}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            acceptFile(event.dataTransfer.files[0])
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.md,.markdown,.txt"
            className="hidden"
            onChange={(event) => acceptFile(event.target.files?.[0])}
          />
          <div
            className={cn(
              "flex size-16 items-center justify-center text-[color:var(--helix-accent)]",
              file
                ? "border-0 bg-transparent"
                : "rounded-2xl border border-[color:var(--helix-accent)] bg-[color:var(--helix-accent-soft)]"
            )}
          >
            {file ? (
              <UploadedCloudCheckIcon className="size-16" />
            ) : (
              <IconUpload className="size-9" />
            )}
          </div>
          <div>
            <p className="text-2xl font-medium text-[color:var(--helix-text)]">
              {file
                ? file.name
                : "点击或拖拽 PDF / Markdown / TXT 文件到此上传"}
            </p>
            <p className="helix-muted mt-3 text-base">
              {file
                ? `当前文件 ${formatFileSize(file.size)} · 单文件最大 ${MAX_UPLOAD_MB}MB`
                : `单文件最大 ${MAX_UPLOAD_MB}MB · 扫描件 PDF 暂不支持`}
            </p>
          </div>
        </button>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="industry" className="text-white/70">
              业务域
            </Label>
            <Input
              id="industry"
              value={industry}
              placeholder="例如：医疗、金融、教育"
              onChange={(event) => setIndustry(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="reader" className="text-white/70">
              目标读者
            </Label>
            <Input
              id="reader"
              value={targetReader}
              placeholder="产品、研发、测试、业务方"
              onChange={(event) => setTargetReader(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label className="text-white/70">分析深度</Label>
            <div className="grid grid-cols-3 gap-2">
              {depthOptions.map((option) => (
                <Button
                  key={option}
                  type="button"
                  variant="outline"
                  className={cn(
                    "helix-line-button rounded-full border-white/10 bg-white/5 text-white/70 hover:bg-white/10",
                    prdDepth === option &&
                      "helix-line-button-active border-[color:var(--helix-accent)] bg-[color:var(--helix-accent-soft)] text-[color:var(--helix-accent)]"
                  )}
                  onClick={() => setPrdDepth(option)}
                >
                  {option}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            size="lg"
            className="helix-line-button rounded-full border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
            onClick={() => setFile(null)}
            disabled={analyzing}
          >
            取消
          </Button>
          <Button
            size="lg"
            className="rounded-full bg-[color:var(--helix-accent)] text-black hover:bg-[color:var(--helix-accent)]/90"
            onClick={onAnalyze}
            disabled={!file || analyzing}
          >
            {analyzing ? (
              <IconLoader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <IconArrowRight data-icon="inline-start" />
            )}
            开始分析
          </Button>
        </div>
        </div>
      </section>
    </main>
  )
}

function DocumentPreview({
  file,
  fileUrl,
  sourceText,
}: {
  file: File | null
  fileUrl: string
  sourceText: string
}) {
  if (!file) return null

  if (fileKind(file.name) === "pdf") {
    return (
      <iframe
        title="PDF 预览"
        src={fileUrl}
        className="h-full min-h-[620px] w-full rounded-[24px] border border-white/10 bg-white"
      />
    )
  }

  return (
    <article className="helix-panel min-h-[620px] rounded-[24px] p-8">
      <div className="helix-muted mb-6 flex items-center gap-2 text-sm">
        <IconFileText className="size-4" />
        原文预览
      </div>
      <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-7 text-white/78">
        {sourceText}
      </pre>
    </article>
  )
}

function DesignPriorityCard({
  priority,
  active,
}: {
  priority: PrdAnalysis["designPriorities"][number]
  active?: boolean
}) {
  return (
    <article
      id={`priority-${priority.id}`}
      className={cn(
        "helix-card rounded-[24px] p-5",
        active && "border-[color:var(--helix-accent)]"
      )}
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="helix-priority-badge">
              {priority.priority}
            </span>
            <h3 className="font-heading text-base font-semibold text-[color:var(--helix-text)]">
              {priority.title}
            </h3>
            <span className="helix-chip rounded-full px-2 py-0.5 text-xs">
              {priority.impactedUser}
            </span>
          </div>
          <p className="mt-3 leading-7 text-white/68">
            <span className="font-semibold text-white/90">设计对象：</span>
            {priority.problem}
          </p>
          <div className="helix-focus-block mt-4">
            <p className="text-base font-bold text-[color:var(--helix-accent)]">
              设计重点
            </p>
            <p className="mt-2 text-sm font-medium leading-6 text-white/72">
              {priority.reason}
            </p>
          </div>
          <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-sm leading-6 text-white/72">
              <span className="font-semibold text-white/90">需求输入：</span>
              {priority.entryPoint}
            </p>
            <p className="text-sm leading-6 text-white/72">
              <span className="font-semibold text-white/90">建议产物：</span>
              {priority.artifact}
            </p>
          </div>
          {priority.evidence.length > 0 && (
            <div className="mt-4 border-t border-dashed border-white/10 pt-4">
              <p className="mb-2 text-xs font-semibold uppercase text-white/42">
                轻量证据
              </p>
              <ul className="space-y-2">
                {priority.evidence.map((item, index) => (
                  <li key={index} className="text-sm leading-6 text-white/48">
                    {index + 1}. {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

function BriefBlock({
  id,
  title,
  items,
}: {
  id: string
  title: string
  items: string[]
}) {
  if (!items.length) return null

  return (
    <section id={id} className="helix-panel-soft rounded-[22px] p-5">
      <div className="flex items-center gap-2">
        <p className="helix-label">{title}</p>
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item} className="text-sm leading-6 text-white/70">
            {item}
          </li>
        ))}
      </ul>
    </section>
  )
}

function RequirementSectionCard({
  section,
  index,
}: {
  section: PrdAnalysis["requirementStructure"][number]
  index: number
}) {
  return (
    <section id={`brief-input-${index}`} className="helix-card rounded-[24px] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="font-heading text-lg font-semibold text-[color:var(--helix-text)]">
            {section.title}
          </h3>
        </div>
      </div>
      <p className="mt-3 leading-7 text-white/64">{section.summary}</p>
      {section.bullets.length > 0 && (
        <ul className="mt-4 space-y-2">
          {section.bullets.map((item, index) => (
            <li key={index} className="text-sm leading-6 text-white/72">
              {item}
            </li>
          ))}
        </ul>
      )}
      {section.missing.length > 0 && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/48">
          {section.missing.map((item) => (
            <p key={item}>待补充：{item}</p>
          ))}
        </div>
      )}
    </section>
  )
}

function PrdProblemCard({
  item,
  index,
}: {
  item: ReturnType<typeof getPrdProblemList>[number]
  index: number
}) {
  return (
    <section id={`problem-${index}`} className="helix-card rounded-[24px] p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-heading text-base font-semibold text-[color:var(--helix-text)]">
          {item.title}
        </h3>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium ring-1",
            severityClass[item.severity]
          )}
        >
          {item.severity}
        </span>
        <span className="helix-chip rounded-full px-2 py-0.5 text-xs">
          {item.type}
        </span>
      </div>
      <p className="mt-3 leading-7 text-white/66">{item.summary}</p>
      <p className="mt-4 text-sm leading-6 text-white/72">
        <span className="font-semibold text-white/90">建议处理：</span>
        {item.recommendation}
      </p>
      {item.evidence.length > 0 && (
        <div className="mt-4 border-t border-dashed border-white/10 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase text-white/42">
            关联证据
          </p>
          <ul className="space-y-2">
            {item.evidence.map((evidence, index) => (
              <li key={index} className="text-sm leading-6 text-white/48">
                {index + 1}. {evidence}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function AnalysisPanel({
  analysis,
  activeFinding,
  setActiveFinding,
  activeTab,
  setActiveTab,
}: {
  analysis: PrdAnalysis
  activeFinding: number | null
  setActiveFinding: (id: number) => void
  activeTab: AnalysisTab
  setActiveTab: (tab: AnalysisTab) => void
}) {
  const designInput = getDesignInputSections(analysis)
  const problemList = getPrdProblemList(analysis)

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => {
        if (isAnalysisTab(value)) setActiveTab(value)
      }}
      className="flex h-full min-h-0 flex-col gap-0"
    >
      <div className="helix-result-header shrink-0 border-b border-white/10 px-5 py-4">
        <TabsList className="helix-tabs-strong">
          <TabsTrigger value="priorities">设计待办</TabsTrigger>
          <TabsTrigger value="brief">设计依据</TabsTrigger>
          <TabsTrigger value="problems">PRD 问题清单</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="priorities" className="min-h-0">
        <ScrollArea className="h-full">
          <div className="grid gap-4 p-5">
            <p className="helix-muted text-sm">
              共 {analysis.designPriorities.length} 项待设计对象，聚焦流程、功能、页面和状态。
            </p>
            {analysis.warnings.map((warning, index) => (
              <div
                key={index}
                className="flex gap-3 rounded-2xl border border-[color:var(--helix-accent)]/30 bg-[color:var(--helix-accent-soft)] px-4 py-3 text-sm text-[color:var(--helix-accent)]"
              >
                <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
                {warning}
              </div>
            ))}
            {analysis.designPriorities.map((priority) => (
              <button
                key={priority.id}
                type="button"
                className="block w-full text-left"
                onClick={() => setActiveFinding(priority.id)}
              >
                <DesignPriorityCard
                  priority={priority}
                  active={activeFinding === priority.id}
                />
              </button>
            ))}
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="brief" className="min-h-0">
        <ScrollArea className="h-full">
          <div className="grid gap-4 p-5">
            <p className="helix-muted text-sm">
              共 {designInput.length} 类设计依据，用于理解目标、用户、场景与落地口径。
            </p>
            <section id="brief-summary" className="helix-card rounded-[24px] p-5">
              <div className="flex items-center gap-2">
                <p className="helix-label">Business to design</p>
              </div>
              <h3 className="mt-3 font-heading text-lg font-semibold text-[color:var(--helix-text)]">
                设计启动摘要
              </h3>
              <div className="mt-4 grid gap-4">
                <p className="leading-7 text-white/70">
                  <span className="font-semibold text-white/90">业务目标：</span>
                  {analysis.designBrief.businessGoal}
                </p>
                <p className="leading-7 text-white/70">
                  <span className="font-semibold text-white/90">设计目标：</span>
                  {analysis.designBrief.designGoal}
                </p>
              </div>
            </section>
            <BriefBlock
              id="brief-users"
              title="用户与场景"
              items={analysis.designBrief.usersAndScenarios}
            />
            <BriefBlock
              id="brief-opportunities"
              title="体验机会"
              items={analysis.designBrief.opportunities}
            />
            <section id="brief-inputs" className="helix-card rounded-[24px] p-5">
              <p className="helix-label">需求输入</p>
              <h3 className="mt-3 font-heading text-lg font-semibold text-[color:var(--helix-text)]">
                设计落地所需的需求输入
              </h3>
              <div className="mt-4 space-y-4">
                {designInput.map((section, index) => (
                  <RequirementSectionCard
                    key={section.title}
                    section={section}
                    index={index}
                  />
                ))}
              </div>
            </section>
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="problems" className="min-h-0">
        <ScrollArea className="h-full">
          <div className="grid gap-4 p-5">
            <p className="helix-muted text-sm">
              共 {problemList.length} 项 PRD 问题，用于同步产品经理或业务方补充材料。
            </p>
            {problemList.map((item, index) => (
              <PrdProblemCard key={item.id} item={item} index={index} />
            ))}
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  )
}

export default function Home() {
  const [file, setFile] = React.useState<File | null>(null)
  const [fileUrl, setFileUrl] = React.useState("")
  const [sourceText, setSourceText] = React.useState("")
  const [modelConfig, setModelConfig] =
    React.useState<ModelConfig>(readStoredModelConfig)
  const [industry, setIndustry] = React.useState("")
  const [targetReader, setTargetReader] = React.useState("")
  const [prdDepth, setPrdDepth] = React.useState("标准")
  const [analysis, setAnalysis] = React.useState<PrdAnalysis | null>(null)
  const [activeFinding, setActiveFinding] = React.useState<number | null>(null)
  const [activeAnalysisTab, setActiveAnalysisTab] =
    React.useState<AnalysisTab>("priorities")
  const [analyzing, setAnalyzing] = React.useState(false)
  const [error, setError] = React.useState("")

  const updateFile = React.useCallback((nextFile: File | null) => {
    setFileUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl)
      return nextFile ? URL.createObjectURL(nextFile) : ""
    })
    setFile(nextFile)

    if (!nextFile) {
      setSourceText("")
      return
    }

    if (fileKind(nextFile.name) !== "pdf") {
      setSourceText("正在读取原文...")
      nextFile
        .text()
        .then((text) => setSourceText(text))
        .catch(() => setSourceText("原文读取失败，请重新上传。"))
    } else {
      setSourceText("")
    }
  }, [])

  React.useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl)
    }
  }, [fileUrl])

  const analyze = async () => {
    if (!file) return
    setAnalyzing(true)
    setError("")

    const formData = new FormData()
    formData.append("file", file)
    formData.append("industry", industry)
    formData.append("targetReader", targetReader)
    formData.append("prdDepth", prdDepth)
    formData.append("language", "中文")
    if (modelConfig.apiKey) formData.append("openaiApiKey", modelConfig.apiKey)
    if (modelConfig.baseUrl) {
      formData.append("openaiBaseUrl", modelConfig.baseUrl)
    }
    if (modelConfig.model) formData.append("openaiModel", modelConfig.model)

    try {
      const response = await fetch("/api/analyze-prd", {
        method: "POST",
        body: formData,
      })
      const payload = await readJsonResponse<PrdAnalysis>(response, "分析失败")
      if (!response.ok) {
        throw new Error(
          "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "分析失败"
        )
      }
      setAnalysis(payload)
      setActiveAnalysisTab("priorities")
      setActiveFinding(payload.findings?.[0]?.id ?? null)
      toast.success("分析完成")
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "分析失败，请稍后重试。"
      setError(message)
      toast.error(message)
    } finally {
      setAnalyzing(false)
    }
  }

  const exportReport = async (
    type: "md" | "json" | "html" | "docx" | "copy"
  ) => {
    if (!analysis) return

    if (type === "copy") {
      await navigator.clipboard.writeText(analysis.markdown)
      toast.success("已复制 Markdown")
      return
    }

    if (type === "md") {
      downloadBlob(
        new Blob([analysis.markdown], { type: "text/markdown;charset=utf-8" }),
        "prd-analysis.md"
      )
      return
    }

    if (type === "json") {
      downloadBlob(
        new Blob([JSON.stringify(analysis, null, 2)], {
          type: "application/json;charset=utf-8",
        }),
        "prd-analysis.json"
      )
      return
    }

    if (type === "html") {
      const htmlBlob = new Blob([createHtmlReport(analysis)], {
          type: "text/html;charset=utf-8",
        })

      try {
        const saveMode = await saveBlobWithPicker({
          blob: htmlBlob,
          filename: reportFilename(analysis.source.filename, "html"),
          description: "HTML 报告",
          accept: { "text/html": [".html"] },
        })
        toast.success(saveMode === "saved" ? "HTML 报告已保存" : "HTML 报告已开始下载")
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          toast.info("已取消保存")
          return
        }
        toast.error("HTML 导出失败")
      }
      return
    }

    const response = await fetch("/api/export/docx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(analysis),
    })
    if (!response.ok) {
      toast.error("DOCX 导出失败")
      return
    }
    downloadBlob(await response.blob(), "prd-analysis.docx")
  }

  if (!analysis) {
    return (
      <>
        <UploadPanel
          file={file}
          setFile={updateFile}
          onAnalyze={analyze}
          analyzing={analyzing}
          modelConfig={modelConfig}
          setModelConfig={setModelConfig}
          industry={industry}
          setIndustry={setIndustry}
          targetReader={targetReader}
          setTargetReader={setTargetReader}
          prdDepth={prdDepth}
          setPrdDepth={setPrdDepth}
        />
        {error && (
          <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-red-600 px-4 py-2 text-sm text-white shadow-lg">
            {error}
          </div>
        )}
      </>
    )
  }

  const designInputSections = getDesignInputSections(analysis)
  const prdProblemList = getPrdProblemList(analysis)
  const scrollToElement = (id: string) => {
    window.setTimeout(() => {
      document
        .getElementById(id)
        ?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 80)
  }
  const jumpToFirstProblemBySeverity = (severity: ProblemSeverity) => {
    const problemIndex = prdProblemList.findIndex(
      (item) => item.severity === severity
    )
    if (problemIndex < 0) return

    setActiveAnalysisTab("problems")
    scrollToElement(`problem-${problemIndex}`)
  }
  const jumpToFirstHighlight = () => {
    const highlightPriority = analysis.designPriorities.find(
      (priority) => priority.severity === "优秀"
    )

    if (highlightPriority) {
      setActiveAnalysisTab("priorities")
      setActiveFinding(highlightPriority.id)
      scrollToElement(`priority-${highlightPriority.id}`)
      return
    }

    setActiveAnalysisTab("brief")
    scrollToElement("brief-opportunities")
  }
  const footerAnchors =
    activeAnalysisTab === "priorities"
      ? analysis.designPriorities
          .filter((priority) => priority.title !== "验收标准设计")
          .map((priority) => ({
            id: priority.id,
            key: `priority-${priority.id}`,
            label: `${priority.id}. ${priority.title}`,
            marker: priority.priority,
            active: activeFinding === priority.id,
            onClick: () => {
              setActiveFinding(priority.id)
              document
                .getElementById(`priority-${priority.id}`)
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            },
          }))
      : activeAnalysisTab === "brief"
        ? [
            {
              id: "summary",
              key: "brief-summary",
              label: "设计启动摘要",
              marker: "依据",
            },
            {
              id: "users",
              key: "brief-users",
              label: "用户与场景",
              marker: "依据",
            },
            {
              id: "opportunities",
              key: "brief-opportunities",
              label: "体验机会",
              marker: "依据",
            },
            ...designInputSections.map((section, index) => ({
              id: section.title,
              key: `brief-input-${index}`,
              label: section.title,
              marker: "输入",
            })),
          ].map((item, index) => ({
            ...item,
            label: `${index + 1}. ${item.label}`,
            active: false,
            onClick: () =>
              document
                .getElementById(item.key)
                ?.scrollIntoView({ behavior: "smooth", block: "start" }),
          }))
        : prdProblemList.map((item, index) => ({
            id: item.id,
            key: `problem-${index}`,
            label: `${index + 1}. ${item.title}`,
            marker: item.type,
            active: false,
            onClick: () =>
              document
                .getElementById(`problem-${index}`)
                ?.scrollIntoView({ behavior: "smooth", block: "start" }),
          }))

  return (
    <main className="helix-app relative flex h-screen flex-col overflow-hidden">
      <BackgroundShader
        scale={1}
        speed={0.3}
        offsetX={-0.22}
        offsetY={-0.04}
        className="helix-shader-bg"
      />
      <div className="helix-grid pointer-events-none absolute inset-x-0 top-0 h-[360px]" />
      <header className="helix-nav relative z-20 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-white/44">
              <span className="helix-accent">PRD Sentinel</span>
              <span>/</span>
              <span className="truncate">{analysis.source.filename}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h1 className="font-heading text-xl font-semibold tracking-normal text-[color:var(--helix-text)]">
                PRD 可视化走查 · {analysis.source.filename}
              </h1>
            </div>
            <p className="helix-muted mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
              综合评分{" "}
              <strong className="text-[color:var(--helix-text)]">
                {analysis.metrics.overallScore}
              </strong>{" "}
              / 10 <span aria-hidden="true">·</span>
              <HeaderMetricJump
                label="致命"
                count={analysis.metrics.fatalCount}
                onClick={() => jumpToFirstProblemBySeverity("致命")}
              />
              <span aria-hidden="true">·</span>
              <HeaderMetricJump
                label="严重"
                count={analysis.metrics.severeCount}
                onClick={() => jumpToFirstProblemBySeverity("严重")}
              />
              <span aria-hidden="true">·</span>
              <HeaderMetricJump
                label="轻微"
                count={analysis.metrics.minorCount}
                onClick={() => jumpToFirstProblemBySeverity("轻微")}
              />
              <span aria-hidden="true">·</span>
              <HeaderMetricJump
                label="亮点"
                count={analysis.metrics.highlightCount}
                onClick={jumpToFirstHighlight}
              />
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ModelConfigDialog
              config={modelConfig}
              setConfig={setModelConfig}
            />
            <Button
              variant="outline"
              className="helix-line-button rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10"
              onClick={() => exportReport("html")}
            >
              <IconDownload data-icon="inline-start" />
              导出 HTML
            </Button>
            <Button
              variant="outline"
              className="helix-line-button rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10"
              onClick={() => {
                setAnalysis(null)
                updateFile(null)
                setActiveFinding(null)
                setActiveAnalysisTab("priorities")
              }}
            >
              <IconRefresh data-icon="inline-start" />
              重新上传
            </Button>
          </div>
        </div>
      </header>

      <section className="relative z-10 grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(280px,0.62fr)_minmax(520px,1fr)]">
        <div className="min-h-0 border-r border-white/10 bg-black/10">
          <ScrollArea className="h-full">
            <div className="p-5">
              <DocumentPreview
                file={file}
                fileUrl={fileUrl}
                sourceText={sourceText}
              />
            </div>
          </ScrollArea>
        </div>
        <div className="min-h-0 bg-black/20">
          <AnalysisPanel
            analysis={analysis}
            activeFinding={activeFinding}
            setActiveFinding={setActiveFinding}
            activeTab={activeAnalysisTab}
            setActiveTab={setActiveAnalysisTab}
          />
        </div>
      </section>

      <footer className="relative z-20 hidden shrink-0 items-center gap-3 overflow-x-auto border-t border-white/10 bg-[#090b0f]/90 px-5 py-3 text-sm text-white/52 backdrop-blur-xl lg:flex">
        {footerAnchors.map((anchor) => (
          <button
            key={`${activeAnalysisTab}-${anchor.id}`}
            type="button"
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full px-2 py-1 transition hover:bg-white/5",
              anchor.active && "text-[color:var(--helix-accent)]"
            )}
            onClick={anchor.onClick}
          >
            <span className="helix-priority-badge helix-priority-badge-sm">
              {anchor.marker}
            </span>
            {anchor.label}
          </button>
        ))}
      </footer>
    </main>
  )
}
