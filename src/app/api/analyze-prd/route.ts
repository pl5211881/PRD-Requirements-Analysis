import OpenAI from "openai"
import { zodTextFormat } from "openai/helpers/zod"
import { PDFParse } from "pdf-parse"

import {
  createFallbackAnalysis,
  enrichAnalysis,
  getFileExtension,
  isAcceptedFile,
  MAX_UPLOAD_BYTES,
  normalizeText,
  PrdAnalysisSchema,
} from "@/lib/prd"

export const runtime = "nodejs"

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

  const AnalysisCoreSchema = PrdAnalysisSchema.omit({
    markdown: true,
    designPriorities: true,
    designBrief: true,
    requirementStructure: true,
  })

  const response = await client.responses.parse({
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
  })

  const parsed = response.output_parsed
  if (!parsed) {
    throw new Error("模型未返回可解析的结构化结果。")
  }

  const normalized = AnalysisCoreSchema.parse({
    ...parsed,
    mode: "ai",
    source: {
      ...parsed.source,
      filename,
      fileType,
      characterCount: text.length,
      generatedAt,
    },
  })

  return PrdAnalysisSchema.parse(enrichAnalysis(normalized))
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
        { error: "单文件最大 20MB，请压缩或拆分后再上传。" },
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
      try {
        const analysis = await analyzeWithOpenAI({
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
      } catch {
        const fallback = createFallbackAnalysis({
          text,
          filename: file.name,
          fileType: extension,
          warning: "API Key 无效或模型请求失败，已自动生成规则草稿。",
        })
        return Response.json(fallback)
      }
    }

    const fallback = createFallbackAnalysis({
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
