import { z } from "zod"

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

export const acceptedFileExtensions = [".pdf", ".md", ".markdown", ".txt"]

export const dimensions = [
  { key: "viability", label: "立得住", color: "#e2574c" },
  { key: "clarity", label: "讲得清", color: "#eba438" },
  { key: "resilience", label: "扛得住", color: "#4e84ee" },
  { key: "operability", label: "跑得通", color: "#17a88b" },
] as const

export const findingCategories = [
  "目标与价值归因",
  "关键阈值量化",
  "交互一致性",
  "回滚与应急机制",
  "合规与风险",
  "值得保留的亮点",
  "数据闭环与上线验证",
] as const

export const prdSectionTitles = [
  "业务背景",
  "战略目标",
  "项目预期收益",
  "产品定位",
  "目标用户与使用场景",
  "核心功能与流程",
  "关键体验要求",
  "技术实现说明",
  "验收标准",
  "范围边界",
  "风险与依赖",
  "待确认问题",
] as const

export const requirementStructureTitles = [
  "业务背景",
  "战略目标",
  "项目预期收益",
  "产品定位",
  "目标用户与使用场景",
  "核心功能与流程",
  "关键体验要求",
  "技术实现说明",
  "验收标准",
] as const

export const PrdSectionSchema = z.object({
  title: z.string(),
  summary: z.string(),
  bullets: z.array(z.string()),
  evidence: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  missing: z.array(z.string()),
})

export const ScoreSchema = z.object({
  key: z.enum(["viability", "clarity", "resilience", "operability"]),
  label: z.string(),
  value: z.number().min(0).max(10),
  summary: z.string(),
})

export const FindingSchema = z.object({
  id: z.number(),
  title: z.string(),
  category: z.enum(findingCategories),
  severity: z.enum(["致命", "严重", "轻微", "优秀"]),
  dimension: z.string(),
  evidenceCount: z.number().int().min(0),
  summary: z.string(),
  evidence: z.array(z.string()),
  recommendation: z.string(),
  color: z.string(),
})

export const DesignPrioritySchema = z.object({
  id: z.number(),
  priority: z.enum(["P0", "P1", "P2"]),
  title: z.string(),
  problem: z.string(),
  impactedUser: z.string(),
  reason: z.string(),
  entryPoint: z.string(),
  artifact: z.string(),
  evidence: z.array(z.string()).max(2),
  severity: z.enum(["致命", "严重", "轻微", "优秀"]),
})

export const DesignBriefSchema = z.object({
  businessGoal: z.string(),
  designGoal: z.string(),
  usersAndScenarios: z.array(z.string()),
  painPoints: z.array(z.string()),
  opportunities: z.array(z.string()),
  constraints: z.array(z.string()),
  openQuestions: z.array(z.string()),
})

export const PrdAnalysisSchema = z.object({
  mode: z.enum(["ai", "fallback"]),
  source: z.object({
    filename: z.string(),
    fileType: z.string(),
    characterCount: z.number().int().min(0),
    generatedAt: z.string(),
  }),
  scores: z.array(ScoreSchema).length(4),
  findings: z.array(FindingSchema),
  sections: z.array(PrdSectionSchema),
  metrics: z.object({
    overallScore: z.number().min(0).max(10),
    fatalCount: z.number().int().min(0),
    severeCount: z.number().int().min(0),
    minorCount: z.number().int().min(0),
    highlightCount: z.number().int().min(0),
  }),
  gaps: z.array(z.string()),
  warnings: z.array(z.string()),
  designPriorities: z.array(DesignPrioritySchema),
  designBrief: DesignBriefSchema,
  requirementStructure: z.array(PrdSectionSchema).length(9),
  markdown: z.string(),
})

export type PrdAnalysis = z.infer<typeof PrdAnalysisSchema>
export type PrdSection = z.infer<typeof PrdSectionSchema>
export type PrdFinding = z.infer<typeof FindingSchema>
export type DesignPriority = z.infer<typeof DesignPrioritySchema>
type FindingCategory = (typeof findingCategories)[number]
type FindingSeverity = PrdFinding["severity"]
export type PriorityLabel = "P0" | "P1" | "P2"

const designInputTitles = ["核心功能与流程", "技术实现说明", "验收标准"]

export function getFileExtension(filename: string) {
  const dotIndex = filename.lastIndexOf(".")
  return dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : ""
}

export function isAcceptedFile(filename: string) {
  return acceptedFileExtensions.includes(getFileExtension(filename))
}

export function normalizeText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
}

export function clampScore(value: number) {
  return Math.max(0, Math.min(10, Number(value.toFixed(1))))
}

export function createMarkdown(analysis: Omit<PrdAnalysis, "markdown">) {
  const designInput = getDesignInputSections(analysis)
  const problemList = getPrdProblemList(analysis)
  const priorityLines = analysis.designPriorities
    .map(
      (item) =>
        `### ${item.id}. ${item.title}\n\n- 优先级: ${item.priority}\n- 设计对象: ${item.problem}\n- 涉及场景: ${item.impactedUser}\n- 设计重点: ${item.reason}\n- 产物建议: ${item.artifact}\n\n${item.evidence
          .map((item) => `> ${item}`)
          .join("\n")}`
    )
    .join("\n\n")

  const briefLines = [
    `- 业务目标: ${analysis.designBrief.businessGoal}`,
    `- 设计目标: ${analysis.designBrief.designGoal}`,
    ...analysis.designBrief.usersAndScenarios.map((item) => `- 用户与场景: ${item}`),
    ...analysis.designBrief.opportunities.map((item) => `- 体验机会: ${item}`),
  ].join("\n")

  const designInputLines = designInput
    .map((section) => {
      return `### ${section.title}\n\n${section.summary}\n\n${section.bullets
          .map((item) => `- ${item}`)
          .join("\n")}`
    })
    .join("\n\n")

  const problemLines = problemList
    .map(
      (item) =>
        `### ${item.title}\n\n- 类型: ${item.type}\n- 等级: ${item.severity}\n- 说明: ${item.summary}\n- 建议: ${item.recommendation}`
    )
    .join("\n\n")

  return `# ${analysis.source.filename} PRD 分析报告

生成时间: ${analysis.source.generatedAt}
综合评分: ${analysis.metrics.overallScore}/10

## 设计待办

${priorityLines}

## 设计依据

${briefLines}

## 需求输入

${designInputLines}

## PRD 问题清单

${problemLines}
`
}

function countHits(text: string, words: string[]) {
  return words.reduce((count, word) => count + (text.includes(word) ? 1 : 0), 0)
}

function findEvidence(text: string, words: string[], fallback: string) {
  const paragraphs = text
    .split(/\n{2,}|。|；|;/)
    .map((item) => item.trim())
    .filter(Boolean)

  const matches = paragraphs.filter((paragraph) =>
    words.some((word) => paragraph.includes(word))
  )

  return (matches.length ? matches : [fallback])
    .slice(0, 3)
    .map((item) => item.slice(0, 160))
}

function sectionSummary(text: string, title: string) {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  const directIndex = lines.findIndex((line) => line.includes(title))
  if (directIndex >= 0) {
    return lines.slice(directIndex, directIndex + 4).join(" ").slice(0, 260)
  }

  return lines.slice(0, 3).join(" ").slice(0, 260)
}

function uniqueItems(items: string[]) {
  const seen = new Set<string>()
  return items
    .map((item) => item.trim())
    .filter((item) => {
      if (!item || seen.has(item)) return false
      seen.add(item)
      return true
    })
}

function getSection(sections: PrdSection[], title: string) {
  return sections.find((section) => section.title === title)
}

function hasDirectSection(section?: PrdSection) {
  return Boolean(section && section.confidence >= 0.5 && section.summary)
}

export function priorityLabelByTitle(title: string, index = 0): PriorityLabel {
  if (title === "核心功能与流程") return "P0"
  if (title === "战略目标" || title === "业务背景") return "P0"
  if (title === "设计目标" || title === "目标用户与使用场景") return "P1"
  if (title === "关键体验要求" || title === "技术实现说明") return "P1"
  if (title === "验收标准" || title === "体验机会") return "P2"
  return index < 3 ? "P1" : "P2"
}

function designArtifactForSection(title: string) {
  if (title === "核心功能与流程") return "主流程图、关键页面框架、任务路径原型"
  if (title === "目标用户与使用场景") return "用户场景卡、角色路径、场景优先级矩阵"
  if (title === "关键体验要求") return "体验原则、状态矩阵、关键交互规范"
  if (title === "验收标准") return "验收状态表、可用性检查清单、埋点验证口径"
  if (title === "产品定位") return "产品心智说明、信息架构草图、核心价值表达"
  return "页面清单、流程节点、低保真原型"
}

function designFocusForSection(title: string) {
  if (title === "核心功能与流程") return "先把核心任务链路、页面入口、成功/失败状态画清楚。"
  if (title === "目标用户与使用场景") return "明确不同角色在高频场景中的任务、判断依据和触发点。"
  if (title === "关键体验要求") return "把体验原则落到交互状态、信息层级和反馈机制。"
  if (title === "验收标准") return "把验收口径转成界面状态、操作结果和可验证检查点。"
  if (title === "产品定位") return "把产品价值和用户心智转成首屏信息架构与关键表达。"
  return "提取可设计的信息、入口、状态和页面边界。"
}

function impactedUserForSection(title: string) {
  if (title === "核心功能与流程") return "核心使用者与关键任务场景"
  if (title === "目标用户与使用场景") return "目标用户分层与高频场景"
  if (title === "关键体验要求") return "主要用户、运营与客服协同场景"
  if (title === "验收标准") return "产品、研发、测试与设计走查"
  if (title === "产品定位") return "首次接触用户与业务决策方"
  return "目标用户与核心业务场景"
}

export function buildDesignPriorities(sections: PrdSection[]) {
  const designTitles = [
    "核心功能与流程",
    "目标用户与使用场景",
    "关键体验要求",
    "验收标准",
    "产品定位",
  ]

  return designTitles
    .map((title) => getSection(sections, title))
    .filter((section): section is PrdSection => Boolean(section))
    .map((section, index) => ({
      id: index + 1,
      priority: priorityLabelByTitle(section.title, index),
      title: section.title === "核心功能与流程" ? "核心流程与功能设计" : `${section.title}设计`,
      problem: section.summary,
      impactedUser: impactedUserForSection(section.title),
      reason: designFocusForSection(section.title),
      entryPoint: section.bullets.slice(0, 2).join("；") || "从原文提取页面、流程和状态，形成低保真设计输入。",
      artifact: designArtifactForSection(section.title),
      evidence: section.evidence.slice(0, 2),
      severity: index === 0 ? ("严重" as const) : ("轻微" as const),
    }))
}

export function buildRequirementStructure(sections: PrdSection[]) {
  return requirementStructureTitles.map((title) => {
    const section = getSection(sections, title)
    return {
      title,
      summary:
        section?.summary ||
        `当前文档中未识别到完整的「${title}」描述，建议补充后再进入设计细化。`,
      bullets: uniqueItems(section?.bullets || []).slice(0, 3),
      evidence: uniqueItems(section?.evidence || []).slice(0, 2),
      confidence: section?.confidence ?? 0.35,
      missing: uniqueItems(section?.missing || [`补充「${title}」的明确章节或条目。`]).slice(0, 2),
    }
  })
}

export function buildDesignBrief({
  sections,
}: {
  sections: PrdSection[]
}) {
  const business = getSection(sections, "战略目标") || getSection(sections, "业务背景")
  const users = getSection(sections, "目标用户与使用场景")
  const experience = getSection(sections, "关键体验要求")

  return {
    businessGoal: hasDirectSection(business)
      ? business!.summary
      : "需要先把业务目标转译为清晰的设计目标和成功判断口径。",
    designGoal: hasDirectSection(experience)
      ? `围绕「${experience!.title}」建立一致、可验证、可落地的关键体验。`
      : "通过流程梳理、状态补全和验证口径定义，降低设计返工与评审歧义。",
    usersAndScenarios: uniqueItems([
      users?.summary || "目标用户与高频场景仍需补充，建议在设计启动前完成场景分层。",
    ]).slice(0, 3),
    painPoints: [],
    opportunities: uniqueItems([
      hasDirectSection(experience)
        ? "把体验要求转成页面层级、状态反馈和一致性规则。"
        : "先补齐关键体验原则，再进入交互细化。",
      "把业务指标、关键场景和验收口径转成可评审的体验假设。",
    ]).slice(0, 4),
    constraints: [],
    openQuestions: [],
  }
}

export function getDesignInputSections(analysis: Pick<PrdAnalysis, "requirementStructure">) {
  return designInputTitles
    .map((title) =>
      analysis.requirementStructure.find((section) => section.title === title)
    )
    .filter((section): section is PrdSection => Boolean(section))
}

export function getPrdProblemList(
  analysis: Pick<
    PrdAnalysis,
    "findings" | "gaps" | "designBrief" | "sections" | "requirementStructure"
  >
) {
  const riskSection = analysis.sections.find((section) => section.title === "风险与依赖")
  const questionSection = analysis.sections.find((section) => section.title === "待确认问题")

  return [
    ...analysis.findings
      .filter((finding) => finding.severity !== "优秀")
      .map((finding) => ({
        id: `finding-${finding.id}`,
        type: "PRD 缺口",
        title: finding.title,
        severity: finding.severity,
        summary: finding.summary,
        recommendation: finding.recommendation,
        evidence: finding.evidence.slice(0, 2),
      })),
    ...analysis.gaps.map((item, index) => ({
      id: `gap-${index}`,
      type: "待确认问题",
      title: `待确认问题 ${index + 1}`,
      severity: "严重" as const,
      summary: item,
      recommendation: "进入设计细化前补齐口径，避免设计方案反复回撤。",
      evidence: [item],
    })),
    ...(riskSection
      ? [
        {
          id: "risk-section",
          type: "风险与依赖",
          title: "风险与依赖",
            severity: "严重" as const,
            summary: riskSection.summary,
            recommendation: "明确风险边界、依赖方和兜底策略，再进入高保真设计。",
            evidence: riskSection.evidence.slice(0, 2),
          },
        ]
      : []),
    ...(questionSection
      ? questionSection.missing.map((item, index) => ({
          id: `question-missing-${index}`,
          type: "待确认问题",
          title: `待确认补充 ${index + 1}`,
          severity: "轻微" as const,
          summary: item,
          recommendation: "补充后再同步给设计侧更新对应流程或状态。",
          evidence: [item],
        }))
      : []),
  ]
}

export function enrichAnalysis(
  analysis: Omit<
    PrdAnalysis,
    "designPriorities" | "designBrief" | "requirementStructure" | "markdown"
  >
) {
  const designPriorities = buildDesignPriorities(analysis.sections)
  const requirementStructure = buildRequirementStructure(analysis.sections)
  const designBrief = buildDesignBrief({
    sections: analysis.sections,
  })

  const enriched = {
    ...analysis,
    designPriorities,
    designBrief,
    requirementStructure,
  }

  return {
    ...enriched,
    markdown: createMarkdown(enriched),
  }
}

export function createFallbackAnalysis({
  text,
  filename,
  fileType,
  warning,
}: {
  text: string
  filename: string
  fileType: string
  warning?: string
}): PrdAnalysis {
  const normalized = normalizeText(text)
  const generatedAt = new Date().toISOString()
  const totalSignals = Math.max(1, normalized.length / 1500)

  const viabilityHits = countHits(normalized, [
    "背景",
    "目标",
    "价值",
    "收益",
    "定位",
    "战略",
  ])
  const clarityHits = countHits(normalized, [
    "用户",
    "场景",
    "流程",
    "功能",
    "页面",
    "交互",
  ])
  const resilienceHits = countHits(normalized, [
    "风险",
    "合规",
    "权限",
    "异常",
    "回滚",
    "灰度",
  ])
  const operabilityHits = countHits(normalized, [
    "验收",
    "指标",
    "数据",
    "埋点",
    "上线",
    "测试",
  ])

  const scores = [
    {
      key: "viability" as const,
      label: "立得住",
      value: clampScore(5.6 + Math.min(2.4, viabilityHits / totalSignals)),
      summary: "检查业务背景、价值归因、战略目标与收益口径是否成立。",
    },
    {
      key: "clarity" as const,
      label: "讲得清",
      value: clampScore(5.4 + Math.min(2.6, clarityHits / totalSignals)),
      summary: "检查目标用户、使用场景、功能边界与关键流程是否讲清。",
    },
    {
      key: "resilience" as const,
      label: "扛得住",
      value: clampScore(4.8 + Math.min(2.8, resilienceHits / totalSignals)),
      summary: "检查风险、权限、合规、异常处理与回滚机制是否充分。",
    },
    {
      key: "operability" as const,
      label: "跑得通",
      value: clampScore(5.0 + Math.min(2.7, operabilityHits / totalSignals)),
      summary: "检查验收标准、数据闭环、上线计划与技术实现是否可执行。",
    },
  ]

  const checks = [
    {
      title: "目标值与价值归因",
      category: "目标与价值归因" as const,
      severity: (viabilityHits >= 3 ? "轻微" : "严重") as FindingSeverity,
      dimension: "立得住",
      words: ["目标", "价值", "收益", "战略"],
      summary:
        viabilityHits >= 3
          ? "文档包含目标与价值描述，但仍建议补充可量化口径。"
          : "业务目标、收益基线或价值归因不够明确，后续难以判断成败。",
      recommendation: "补充目标指标、当前基线、目标值、归因路径和复盘周期。",
      color: "#d84f45",
    },
    {
      title: "关键阈值未量化",
      category: "关键阈值量化" as const,
      severity: (operabilityHits >= 3 ? "轻微" : "严重") as FindingSeverity,
      dimension: "讲得清",
      words: ["指标", "阈值", "验收", "数据"],
      summary:
        operabilityHits >= 3
          ? "已有部分指标或验收描述，但阈值仍需统一量化。"
          : "触发条件、验收阈值和关键参数偏模糊，研发与测试难以对齐。",
      recommendation: "把验收标准改写为可检查条目，明确通过/失败判定。",
      color: "#eca535",
    },
    {
      title: "交互一致性问题",
      category: "交互一致性" as const,
      severity: (clarityHits >= 4 ? "轻微" : "严重") as FindingSeverity,
      dimension: "讲得清",
      words: ["交互", "页面", "流程", "状态"],
      summary:
        clarityHits >= 4
          ? "流程与交互信息较完整，建议继续补齐异常态与空态。"
          : "功能流程与交互状态定义不足，用户学习成本和返工风险偏高。",
      recommendation: "按主流程、异常分支、空态、失败态补充交互说明。",
      color: "#4e84ee",
    },
    {
      title: "回滚与应急机制缺失",
      category: "回滚与应急机制" as const,
      severity: (resilienceHits >= 3 ? "轻微" : "致命") as FindingSeverity,
      dimension: "跑得通",
      words: ["回滚", "灰度", "应急", "异常"],
      summary:
        resilienceHits >= 3
          ? "文档提到风险或异常处理，仍需补齐上线后的回滚决策路径。"
          : "上线计划缺少灰度、回滚阈值与应急响应机制。",
      recommendation: "补充灰度策略、监控指标、回滚负责人和决策时限。",
      color: "#cf4674",
    },
    {
      title: "合规与风险",
      category: "合规与风险" as const,
      severity: (resilienceHits >= 2 ? "轻微" : "严重") as FindingSeverity,
      dimension: "扛得住",
      words: ["合规", "隐私", "权限", "风险"],
      summary:
        resilienceHits >= 2
          ? "已有风险意识，建议明确数据、权限和合规责任边界。"
          : "涉及用户数据、权限或业务约束时，当前风险边界不够清晰。",
      recommendation: "列出权限范围、数据使用边界、审计要求和依赖方责任。",
      color: "#17a88b",
    },
    {
      title: "值得保留的亮点",
      category: "值得保留的亮点" as const,
      severity: "优秀" as const,
      dimension: "立得住",
      words: ["用户", "场景", "价值", "体验"],
      summary: "文档已经呈现部分产品边界、用户价值或场景假设，适合继续深化。",
      recommendation: "保留已有价值主张，并围绕指标、证据和验收继续补强。",
      color: "#43ad4f",
    },
  ]

  const findings: PrdFinding[] = checks.map((check, index) => {
    const evidence = findEvidence(normalized, check.words, "未在原文中找到足够明确的证据，需要补充。")
    return {
      id: index + 1,
      title: check.title,
      category: check.category as FindingCategory,
      severity: check.severity,
      dimension: check.dimension,
      evidenceCount: evidence.filter((item) => !item.includes("未在原文")).length,
      summary: check.summary,
      evidence,
      recommendation: check.recommendation,
      color: check.color,
    }
  })

  const sections = prdSectionTitles.map((title) => {
    const summary = sectionSummary(normalized, title)
    return {
      title,
      summary:
        summary ||
        `当前文档中未识别到完整的「${title}」描述，建议按 PRD 标准补充。`,
      bullets: [
        `围绕「${title}」提取现有信息并整理为可评审表述。`,
        "补充责任方、输入输出、约束条件和可验证指标。",
      ],
      evidence: findEvidence(normalized, [title], "原文中缺少直接章节证据。"),
      confidence: summary ? 0.62 : 0.38,
      missing: summary ? [] : [`补充「${title}」的明确章节或条目。`],
    }
  })

  const metrics = {
    overallScore: clampScore(
      scores.reduce((sum, score) => sum + score.value, 0) / scores.length
    ),
    fatalCount: findings.filter((item) => item.severity === "致命").length,
    severeCount: findings.filter((item) => item.severity === "严重").length,
    minorCount: findings.filter((item) => item.severity === "轻微").length,
    highlightCount: findings.filter((item) => item.severity === "优秀").length,
  }

  const analysisWithoutMarkdown = {
    mode: "fallback" as const,
    source: {
      filename,
      fileType,
      characterCount: normalized.length,
      generatedAt,
    },
    scores,
    findings,
    sections,
    metrics,
    gaps: [
      "关键业务指标的当前基线、目标值和统计口径。",
      "上线灰度、失败回滚、监控告警和责任人。",
      "核心流程的异常态、空态、权限边界和验收样例。",
    ],
    warnings: [
      warning ||
        "当前为规则草稿，建议配置 OpenAI API Key 获取更精细的结构化分析。",
    ],
  }

  return {
    ...enrichAnalysis(analysisWithoutMarkdown),
  }
}
