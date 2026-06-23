import OpenAI from "openai"
import { zodTextFormat } from "openai/helpers/zod"
import { PDFParse } from "pdf-parse"

import {
  createFallbackAnalysis,
  enrichAnalysis,
  getFileExtension,
  isAcceptedFile,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
  normalizeText,
  PrdAnalysisSchema,
} from "@/lib/prd"

export const runtime = "nodejs"
export const maxDuration = 60

const AI_TIMEOUT_MS = 25000

function isOfficialOpenAIBaseUrl(baseUrl: string) {
  if (!baseUrl) return true
  try {
    return new URL(baseUrl).hostname.endsWith("openai.com")
  } catch {
    return false
  }
}

const AnalysisCoreSchema = PrdAnalysisSchema.omit({
  markdown: true,
  designPriorities: true,
  designBrief: true,
  requirementStructure: true,
})

function createSafeFallbackAnalysis({
  text,
  filename,
  fileType,
  warning,
}: {
  text: string
  filename: string
  fileType: string
  warning: string
}) {
  try {
    return createFallbackAnalysis({
      text,
      filename,
      fileType,
      warning,
    })
  } catch {
    const emptyRequirementStructure = [
      "业务背景",
      "战略目标",
      "项目预期收益",
      "产品定位",
      "目标用户与使用场景",
      "核心功能与流程",
      "关键体验要求",
      "技术实现说明",
      "验收标准",
    ].map((title) => ({
      title,
      summary: "当前文档未能完成结构化解析。",
      bullets: ["建议转换为 Markdown/TXT 或拆分 PDF 后重新上传。"],
      evidence: [],
      confidence: 0,
      missing: ["需要重新上传可解析文本。"],
    }))

    return {
      mode: "fallback" as const,
      source: {
        filename,
        fileType,
        characterCount: text.length,
        generatedAt: new Date().toISOString(),
      },
      scores: [
        {
          key: "viability" as const,
          label: "立得住",
          value: 5,
          summary: "服务端已完成基础接收，但未能生成完整分析。",
        },
        {
          key: "clarity" as const,
          label: "讲得清",
          value: 5,
          summary: "文档内容需要重新解析后再评审。",
        },
        {
          key: "resilience" as const,
          label: "扛得住",
          value: 5,
          summary: "模型或规则分析过程出现异常，已保留安全结果。",
        },
        {
          key: "operability" as const,
          label: "跑得通",
          value: 5,
          summary: "建议压缩、拆分或转换为 Markdown/TXT 后重试。",
        },
      ],
      findings: [],
      sections: emptyRequirementStructure,
      metrics: {
        overallScore: 5,
        fatalCount: 0,
        severeCount: 0,
        minorCount: 0,
        highlightCount: 0,
      },
      gaps: ["当前文档未能完成结构化解析，请转换格式或拆分后重试。"],
      warnings: [warning],
      designPriorities: [],
      designBrief: {
        businessGoal: "当前文档未能完成结构化解析。",
        designGoal: "请先获得可解析文本后再进入设计评审。",
        usersAndScenarios: [],
        painPoints: [],
        opportunities: [],
        constraints: [],
        openQuestions: ["建议将 PDF 导出为 Markdown/TXT 后重新上传。"],
      },
      requirementStructure: emptyRequirementStructure,
      markdown: `# ${filename} PRD 分析报告\n\n${warning}\n`,
    }
  }
}

async function extractPdfText(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer })
  try {
    const result = await parser.getText()
    return normalizeText(result.text || "")
  } finally {
    await parser.destroy()
  }
}

async function extractText(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer())
  const extension = getFileExtension(file.name)

  if (extension === ".pdf") {
    const text = await extractPdfText(buffer)
    if (text.length < 120) {
      throw new Error("扫描件 PDF 暂不支持，请上传文本型 PDF、Markdown 或 TXT 文件。")
    }
    return text
  }

  return normalizeText(buffer.toString("utf-8"))
}

function buildPrompt({
  text,
  filename,
  industry,
  targetReader,
  prdDepth,
  language,
}: {
  text: string
  filename: string
  industry: string
  targetReader: string
  prdDepth: string
  language: string
}) {
  return `你是一名资深产品负责人和需求评审专家。请分析用户上传的需求文档，输出结构化 PRD 评审报告。

文件名：${filename}
行业/业务域：${industry || "未填写"}
目标读者：${targetReader || "产品、研发、测试、业务方"}
分析深度：${prdDepth || "标准"}
输出语言：${language || "中文"}

要求：
1. 严格围绕原文证据分析，不要编造不存在的事实。
2. 使用「立得住 / 讲得清 / 扛得住 / 跑得通」四维评分，每项 0-10 分。
3. 关键结论必须覆盖：目标与价值归因、关键阈值量化、交互一致性、回滚与应急机制、合规与风险、值得保留的亮点、数据闭环与上线验证。
4. PRD 章节必须覆盖：业务背景、战略目标、项目预期收益、产品定位、目标用户与使用场景、核心功能与流程、关键体验要求、技术实现说明、验收标准、范围边界、风险与依赖、待确认问题。
5. 每个 findings 和 sections 的 evidence 都要引用或概括原文证据。
6. 如果信息缺失，请写进 missing、gaps 或 recommendation。

原文如下：
${text.slice(0, 60000)}`
}

function buildJsonPrompt(input: Parameters<typeof buildPrompt>[0]) {
  return `${buildPrompt(input)}

请只返回一个合法 JSON 对象，不要返回 Markdown 代码块、解释文字或额外前后缀。
JSON 对象必须包含以下字段：
- mode: "ai"
- source: { filename, fileType, characterCount, generatedAt }
- scores: 4 项，分别对应 viability、clarity、resilience、operability
- findings: 问题与亮点数组
- sections: PRD 章节数组
- metrics: overallScore、fatalCount、severeCount、minorCount、highlightCount
- gaps: 待补充信息数组
- warnings: 风险提示数组

sections 至少覆盖这些 title：业务背景、战略目标、项目预期收益、产品定位、目标用户与使用场景、核心功能与流程、关键体验要求、技术实现说明、验收标准、范围边界、风险与依赖、待确认问题。`
}

function parseJsonObject(content: string) {
  const trimmed = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()

  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf("{")
    const end = trimmed.lastIndexOf("}")
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1))
    }
    throw new Error("模型未返回合法 JSON。")
  }
}

function normalizeAiAnalysis({
  parsed,
  filename,
  fileType,
  text,
  generatedAt,
}: {
  parsed: unknown
  filename: string
  fileType: string
  text: string
  generatedAt: string
}) {
  const raw = parsed && typeof parsed === "object" ? parsed : {}
  const source =
    "source" in raw && raw.source && typeof raw.source === "object"
      ? raw.source
      : {}

  const normalized = AnalysisCoreSchema.parse({
    ...raw,
    mode: "ai",
    source: {
      ...source,
      filename,
      fileType,
      characterCount: text.length,
      generatedAt,
    },
  })

  return PrdAnalysisSchema.parse(enrichAnalysis(normalized))
}

async function analyzeWithResponsesApi({
  client,
  signal,
  model,
  text,
  filename,
  fileType,
  industry,
  targetReader,
  prdDepth,
  language,
  generatedAt,
}: {
  client: OpenAI
  signal?: AbortSignal
  model: string
  text: string
  filename: string
  fileType: string
  industry: string
  targetReader: string
  prdDepth: string
  language: string
  generatedAt: string
}) {
  const response = await client.responses.parse(
    {
      model,
      store: false,
      input: buildPrompt({
        text,
        filename,
        industry,
        targetReader,
        prdDepth,
        language,
      }),
      text: {
        format: zodTextFormat(AnalysisCoreSchema, "prd_analysis"),
      },
    },
    { signal }
  )

  if (!response.output_parsed) {
    throw new Error("模型未返回可解析的结构化结果。")
  }

  return normalizeAiAnalysis({
    parsed: response.output_parsed,
    filename,
    fileType,
    text,
    generatedAt,
  })
}

async function analyzeWithChatCompletionsApi({
  client,
  signal,
  model,
  text,
  filename,
  fileType,
  industry,
  targetReader,
  prdDepth,
  language,
  generatedAt,
}: {
  client: OpenAI
  signal?: AbortSignal
  model: string
  text: string
  filename: string
  fileType: string
  industry: string
  targetReader: string
  prdDepth: string
  language: string
  generatedAt: string
}) {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        "你是一名严谨的 PRD 分析专家。你必须只输出合法 JSON，并严格匹配用户要求的字段结构。",
    },
    {
      role: "user",
      content: buildJsonPrompt({
        text,
        filename,
        industry,
        targetReader,
        prdDepth,
        language,
      }),
    },
  ]

  const createCompletion = (useJsonMode: boolean) =>
    client.chat.completions.create(
      {
        model,
        messages,
        ...(useJsonMode
          ? { response_format: { type: "json_object" as const } }
          : {}),
        stream: false,
        max_tokens: 4096,
      },
      { signal }
    )

  let completion: OpenAI.Chat.Completions.ChatCompletion
  try {
    completion = await createCompletion(true)
  } catch {
    completion = await createCompletion(false)
  }

  const content = completion.choices[0]?.message?.content
  if (!content) {
    throw new Error("模型未返回分析结果。")
  }

  return normalizeAiAnalysis({
    parsed: parseJsonObject(content),
    filename,
    fileType,
    text,
    generatedAt,
  })
}

async function analyzeWithOpenAI({
  apiKey,
  baseUrl,
  model,
  text,
  filename,
  fileType,
  industry,
  targetReader,
  prdDepth,
  language,
}: {
  apiKey: string
  baseUrl: string
  model: string
  text: string
  filename: string
  fileType: string
  industry: string
  targetReader: string
  prdDepth: string
  language: string
}) {
  const client = new OpenAI({
    apiKey,
    baseURL: baseUrl || undefined,
  })
  const generatedAt = new Date().toISOString()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)

  try {
    if (!isOfficialOpenAIBaseUrl(baseUrl)) {
      return await analyzeWithChatCompletionsApi({
        client,
        signal: controller.signal,
        model,
        text,
        filename,
        fileType,
        industry,
        targetReader,
        prdDepth,
        language,
        generatedAt,
      })
    }

    try {
      return await analyzeWithResponsesApi({
        client,
        signal: controller.signal,
        model,
        text,
        filename,
        fileType,
        industry,
        targetReader,
        prdDepth,
        language,
        generatedAt,
      })
    } catch {
      return await analyzeWithChatCompletionsApi({
        client,
        signal: controller.signal,
        model,
        text,
        filename,
        fileType,
        industry,
        targetReader,
        prdDepth,
        language,
        generatedAt,
      })
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function analyzeWithOpenAIOrFallback({
  apiKey,
  baseUrl,
  model,
  text,
  filename,
  fileType,
  industry,
  targetReader,
  prdDepth,
  language,
}: {
  apiKey: string
  baseUrl: string
  model: string
  text: string
  filename: string
  fileType: string
  industry: string
  targetReader: string
  prdDepth: string
  language: string
}) {
  try {
    return await analyzeWithOpenAI({
      apiKey,
      baseUrl,
      model,
      text,
      filename,
      fileType,
      industry,
      targetReader,
      prdDepth,
      language,
    })
  } catch {
    return createSafeFallbackAnalysis({
      text,
      filename,
      fileType,
      warning: "API Key 无效、模型请求失败或模型输出无法解析，已自动生成规则草稿。",
    })
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get("file")

    if (!(file instanceof File)) {
      return Response.json({ error: "请先上传需求文档。" }, { status: 400 })
    }

    if (!isAcceptedFile(file.name)) {
      return Response.json(
        { error: "仅支持 PDF、Markdown、TXT 格式文件。" },
        { status: 400 }
      )
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return Response.json(
        {
          error: `单文件最大 ${MAX_UPLOAD_MB}MB，请压缩、拆分或转为 Markdown/TXT 后再上传。`,
        },
        { status: 400 }
      )
    }

    const text = await extractText(file)
    if (text.length < 30) {
      return Response.json(
        { error: "未提取到足够文本内容，请检查文件是否为空或为扫描件。" },
        { status: 400 }
      )
    }

    const extension = getFileExtension(file.name)
    const pageApiKey = String(formData.get("openaiApiKey") || "").trim()
    const apiKey = pageApiKey || process.env.OPENAI_API_KEY || ""
    const pageBaseUrl = String(formData.get("openaiBaseUrl") || "").trim()
    const baseUrl = pageBaseUrl || process.env.OPENAI_BASE_URL || ""
    const pageModel = String(formData.get("openaiModel") || "").trim()
    const model = pageModel || process.env.OPENAI_MODEL || "gpt-5.5"
    const industry = String(formData.get("industry") || "")
    const targetReader = String(formData.get("targetReader") || "")
    const prdDepth = String(formData.get("prdDepth") || "标准")
    const language = String(formData.get("language") || "中文")

    if (apiKey) {
      const analysis = await analyzeWithOpenAIOrFallback({
        apiKey,
        baseUrl,
        model,
        text,
        filename: file.name,
        fileType: extension,
        industry,
        targetReader,
        prdDepth,
        language,
      })

      return Response.json(analysis)
    }

    const fallback = createSafeFallbackAnalysis({
      text,
      filename: file.name,
      fileType: extension,
      warning: "未配置 API Key，已生成规则草稿。",
    })
    return Response.json(fallback)
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "分析失败，请检查文件后重试。"

    return Response.json({ error: message }, { status: 400 })
  }
}
