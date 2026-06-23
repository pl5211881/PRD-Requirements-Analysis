"use client"

import { MeshGradient } from "@paper-design/shaders-react"
import type * as React from "react"

interface BackgroundShaderProps {
  className?: string
  scale?: number
  speed?: number
  offsetX?: number
  offsetY?: number
}

export function BackgroundShader({
  className = "",
  scale = 1.05,
  speed = 0.42,
  offsetX = -0.18,
  offsetY = -0.04,
}: BackgroundShaderProps) {
  const shaderStyle = {
    position: "fixed",
    inset: 0,
    zIndex: 0,
    pointerEvents: "none",
    overflow: "hidden",
    opacity: 0.48,
    mixBlendMode: "screen",
    filter: "saturate(0.92) contrast(1.02) brightness(0.82)",
    maskImage:
      "radial-gradient(circle at 32% 42%, black 0%, black 40%, rgba(0, 0, 0, 0.72) 58%, transparent 84%)",
  } satisfies React.CSSProperties

  return (
    <div
      className={className || "h-full w-full"}
      aria-hidden="true"
      style={shaderStyle}
    >
      <MeshGradient
        style={{ height: "100vh", width: "100vw" }}
        distortion={0.92}
        swirl={0.18}
        offsetX={offsetX}
        offsetY={offsetY}
        scale={scale}
        rotation={-8}
        speed={speed}
        colors={[
          "#050805",
          "#14230b",
          "#2f4f17",
          "#8fd83c",
        ]}
      />
    </div>
  )
}

export default BackgroundShader
