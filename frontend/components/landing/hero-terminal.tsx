"use client"

import { motion } from "motion/react"
import { CheckCircle2 } from "lucide-react"

interface TerminalLine {
  kind: "cmd" | "ok"
  text: string
}

const terminalLines: TerminalLine[] = [
  { kind: "cmd", text: "nextapi add @sup3rus3r/team-workspace" },
  { kind: "ok", text: "Added -no login required" },
  { kind: "cmd", text: "nextapi sync" },
  { kind: "ok", text: "Routes, models, RBAC wired in" },
  { kind: "cmd", text: "nextapi publish ./my-module" },
  { kind: "ok", text: "Published -your module is in the registry" },
]

export function HeroTerminal() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="relative w-full overflow-hidden border border-border bg-card font-mono text-xs shadow-2xl shadow-black/20"
    >
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-red-500/70" />
        <span className="size-2.5 rounded-full bg-amber-500/70" />
        <span className="size-2.5 rounded-full bg-emerald-500/70" />
        <span className="ml-2 text-muted-foreground">nextapi</span>
      </div>
      <div className="flex flex-col gap-2 p-5">
        {terminalLines.map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: 0.4 + i * 0.22, ease: "easeOut" }}
            className="flex items-start gap-2"
          >
            {line.kind === "cmd" ? (
              <>
                <span className="text-brand">$</span>
                <span className="text-foreground">{line.text}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-emerald-500" />
                <span className="text-muted-foreground">{line.text}</span>
              </>
            )}
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}
