import OpenAI from "openai"

export const runtime = "nodejs"

async function testResponsesApi(client: OpenAI, model: string) {
  await client.responses.create({
    model,
    store: false,
    max_output_tokens: 16,
    input: "Return exactly: ok",
  })
}

async function testChatCompletionsApi(client: OpenAI, model: string) {
  await client.chat.completions.create({
    model,
    messages: [
      {
        role: "user",
        content: "Return exactly: ok",
      },
    ],
    stream: false,
    max_tokens: 16,
  })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const apiKey = String(body?.openaiApiKey || "").trim()
    const baseUrl = String(body?.openaiBaseUrl || "").trim()
    const model =
      String(body?.openaiModel || "").trim() ||
      process.env.OPENAI_MODEL ||
      "gpt-5.5"

    if (!apiKey && !process.env.OPENAI_API_KEY) {
      return Response.json(
        { ok: false, message: "请先填写 API Key，或配置服务端 OPENAI_API_KEY。" },
        { status: 400 }
      )
    }

    const client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
      baseURL: baseUrl || process.env.OPENAI_BASE_URL || undefined,
    })

    const startedAt = Date.now()
    let apiMode = "Responses API"
    try {
      await testResponsesApi(client, model)
    } catch {
      await testChatCompletionsApi(client, model)
      apiMode = "Chat Completions"
    }

    return Response.json({
      ok: true,
      message: `连接成功，模型 ${model} 可用（${apiMode}）。`,
      latencyMs: Date.now() - startedAt,
    })
  } catch {
    return Response.json(
      { ok: false, message: "API Key、Base URL 或模型名称无效，连接测试失败。" },
      { status: 400 }
    )
  }
}
