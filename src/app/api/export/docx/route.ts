import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx"

import {
  getDesignInputSections,
  getPrdProblemList,
  PrdAnalysisSchema,
} from "@/lib/prd"

export const runtime = "nodejs"

function bullet(text: string) {
  return new Paragraph({
    bullet: { level: 0 },
    children: [new TextRun(text)],
  })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const analysis = PrdAnalysisSchema.parse(body)
    const designInput = getDesignInputSections(analysis)
    const problemList = getPrdProblemList(analysis)

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({
              text: `${analysis.source.filename} PRD 分析报告`,
              heading: HeadingLevel.TITLE,
            }),
            new Paragraph({
              children: [
                new TextRun(`综合评分：${analysis.metrics.overallScore}/10`),
                new TextRun({
                  text: `生成时间：${analysis.source.generatedAt}`,
                  break: 1,
                }),
              ],
            }),
            new Paragraph({
              text: "设计工作队列",
              heading: HeadingLevel.HEADING_1,
            }),
            ...analysis.designPriorities.flatMap((priority) => [
              new Paragraph({
                text: `${priority.id}. ${priority.title}`,
                heading: HeadingLevel.HEADING_2,
              }),
              new Paragraph(
                `优先级：${priority.priority} / 涉及场景：${priority.impactedUser}`
              ),
              new Paragraph(`设计对象：${priority.problem}`),
              new Paragraph(`设计重点：${priority.reason}`),
              new Paragraph(`需求输入：${priority.entryPoint}`),
              new Paragraph(`建议产物：${priority.artifact}`),
              ...priority.evidence.map((item) => bullet(`证据：${item}`)),
            ]),
            new Paragraph({
              text: "设计 Brief",
              heading: HeadingLevel.HEADING_1,
            }),
            new Paragraph(`业务目标：${analysis.designBrief.businessGoal}`),
            new Paragraph(`设计目标：${analysis.designBrief.designGoal}`),
            new Paragraph({
              text: "用户与场景",
              heading: HeadingLevel.HEADING_2,
            }),
            ...analysis.designBrief.usersAndScenarios.map((item) => bullet(item)),
            new Paragraph({
              text: "体验机会",
              heading: HeadingLevel.HEADING_2,
            }),
            ...analysis.designBrief.opportunities.map((item) => bullet(item)),
            new Paragraph({
              text: "需求输入",
              heading: HeadingLevel.HEADING_2,
            }),
            ...designInput.flatMap((section) => [
              new Paragraph({
                text: section.title,
                heading: HeadingLevel.HEADING_2,
              }),
              new Paragraph(section.summary),
              ...section.bullets.map((item) => bullet(item)),
              ...section.missing.map((item) => bullet(`待补充：${item}`)),
            ]),
            new Paragraph({
              text: "PRD 问题清单",
              heading: HeadingLevel.HEADING_1,
            }),
            ...problemList.flatMap((item) => [
              new Paragraph({
                text: item.title,
                heading: HeadingLevel.HEADING_2,
              }),
              new Paragraph(
                `类型：${item.type} / 等级：${item.severity}`
              ),
              new Paragraph(item.summary),
              new Paragraph(`建议：${item.recommendation}`),
              ...item.evidence.map((evidence) => bullet(`证据：${evidence}`)),
            ]),
          ],
        },
      ],
    })

    const buffer = await Packer.toBuffer(doc)

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="prd-analysis.docx"`,
      },
    })
  } catch {
    return Response.json({ error: "DOCX 导出失败。" }, { status: 400 })
  }
}
