import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <span className="font-mono text-sm font-semibold tracking-tight">forge</span>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Forge</h1>
        <p className="max-w-md text-muted-foreground">
          Fábrica de software nativa em IA. Fundação do monorepo em construção — Fase 0
          concluída.
        </p>
      </main>
    </div>
  );
}
