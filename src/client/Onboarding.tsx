import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  FileJson,
  FileUp,
  GraduationCap,
  Languages,
  LoaderCircle,
  Plus,
  Sparkles,
  Trash2,
  UserRound,
  Wifi,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import type {
  ImportActivityEvent,
  ImportProgressEvent,
  ImportStage,
  Profile,
} from "../shared/schemas";
import { api } from "@/api";
import { streamProfileImport } from "@/profile-import-stream";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Progress,
  Separator,
  Textarea,
} from "@/components/ui";
import { cn } from "@/lib/utils";

type ProviderId = "codex" | "claude";
type ProviderStatus = {
  installed: boolean;
  authenticated: boolean;
  version: string;
  loginRunning: boolean;
  loginOutput: string;
};
type ProviderStatuses = Record<ProviderId, ProviderStatus>;
type ImportRun = {
  event: ImportProgressEvent;
  activities: ImportActivityEvent[];
  startedAt: number;
};
export type OnboardingState = {
  completed: boolean;
  version: number;
  mode: "manual" | "import" | null;
  step: number;
  provider: ProviderId;
  profile: Profile;
  updatedAt: string | null;
  completedAt: string | null;
};

const stepNames = ["Dados pessoais", "Resumo", "Experiências", "Formação", "Revisão"];

export default function Onboarding({
  initial,
  statuses,
  refreshStatuses,
  onComplete,
}: {
  initial: OnboardingState;
  statuses: ProviderStatuses;
  refreshStatuses: () => Promise<void>;
  onComplete: (profile: Profile) => void;
}) {
  const [mode, setMode] = useState<"manual" | "import" | null>(initial.mode);
  const [step, setStep] = useState(initial.step);
  const [provider, setProvider] = useState<ProviderId>(initial.provider || "codex");
  const [profile, setProfile] = useState<Profile>(initial.profile);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [importRun, setImportRun] = useState<ImportRun | null>(null);

  useEffect(() => {
    if (statuses[provider].installed && statuses[provider].authenticated) return;
    const ready = (["codex", "claude"] as const).find(
      (id) => statuses[id].installed && statuses[id].authenticated,
    );
    if (ready) setProvider(ready);
  }, [provider, statuses]);

  const work = async (label: string, task: () => Promise<void>) => {
    setBusy(label);
    setError("");
    try {
      await task();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Não foi possível continuar.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy("");
    }
  };
  const mutate = (change: (draft: Profile) => void) => {
    const draft = structuredClone(profile);
    change(draft);
    setProfile(draft);
  };
  const persist = async (nextStep: number, nextMode = mode || "manual") => {
    await api("/api/onboarding/draft", {
      method: "PUT",
      body: JSON.stringify({ mode: nextMode, step: nextStep, provider, profile }),
    });
    setMode(nextMode);
    setStep(nextStep);
  };
  const next = () =>
    work("Salvando rascunho...", async () => {
      if (step === 0 && (!profile.name.trim() || !profile.title.trim()))
        throw new Error("Informe seu nome e título profissional.");
      if (step === 1 && !profile.summary.trim())
        throw new Error("Escreva um resumo profissional para continuar.");
      await persist(Math.min(4, step + 1));
    });
  const back = () => work("Salvando rascunho...", () => persist(Math.max(0, step - 1)));
  const startManual = () => work("Preparando perfil...", () => persist(0, "manual"));
  const login = (id: ProviderId) =>
    work("Iniciando autenticação...", async () => {
      await api(`/api/providers/${id}/login`, { method: "POST" });
      await refreshStatuses();
    });
  const importFile = (file: File) =>
    work("Importando currículo...", async () => {
      const isJson = file.name.toLowerCase().endsWith(".json");
      const importProvider = ([provider, provider === "codex" ? "claude" : "codex"] as const).find(
        (id) => statuses[id].installed && statuses[id].authenticated,
      );
      if (!isJson && !importProvider)
        throw new Error("Conecte o Codex ou o Claude antes de importar este formato.");
      setImportRun({
        event: {
          type: "progress",
          stage: "reading_file",
          progress: 4,
          title: "Enviando seu currículo",
          message: `Preparando ${file.name}.`,
        },
        activities: [],
        startedAt: Date.now(),
      });
      const result = await streamProfileImport(file, importProvider || provider, (event) => {
        setImportRun((current) => {
          if (!current) return current;
          if (event.type === "progress") return { ...current, event };
          if (event.type === "activity")
            return { ...current, activities: [...current.activities, event].slice(-6) };
          return current;
        });
      });
      setProfile(result.profile);
      setProvider(result.provider);
      setMode("import");
      setStep(4);
      toast.success("Currículo importado. Revise os dados antes de salvar.");
    });
  const complete = () =>
    work("Salvando seu perfil...", async () => {
      const saved = await api<Profile>("/api/onboarding/complete", {
        method: "POST",
        body: JSON.stringify({ profile }),
      });
      toast.success("Perfil configurado com sucesso!");
      onComplete(saved);
    });

  if (!mode)
    return (
      <OnboardingShell>
        <div className="mx-auto max-w-3xl text-center">
          <Badge className="mb-5">Bem-vindo ao encAIxa</Badge>
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
            Vamos preparar seu perfil uma única vez.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-muted-foreground sm:text-lg">
            Ele fica salvo somente nesta máquina e será reutilizado em todas as suas candidaturas.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <Choice
              icon={UserRound}
              title="Preencher meu perfil"
              description="Um passo a passo simples para organizar sua trajetória."
              onClick={startManual}
            />
            <Choice
              icon={FileUp}
              title="Importar meu currículo"
              description="Use PDF, DOCX, TXT, Markdown ou um backup JSON."
              onClick={() => setMode("import")}
            />
          </div>
        </div>
        <Feedback busy={busy} error={error} />
      </OnboardingShell>
    );

  if (mode === "import" && step !== 4)
    return (
      <OnboardingShell>
        <div className="mx-auto max-w-3xl">
          <Button variant="ghost" onClick={() => setMode(null)}>
            <ArrowLeft className="size-4" /> Voltar
          </Button>
          <div className="mt-6 text-center">
            <Badge variant="secondary">Importação inteligente</Badge>
            <h1 className="mt-4 text-3xl font-bold">Traga seu currículo atual</h1>
            <p className="mt-2 text-muted-foreground">
              JSON é importado diretamente. Outros formatos usam a IA escolhida e sempre passam por
              revisão.
            </p>
          </div>
          {importRun && busy && <ImportProgressCard run={importRun} />}
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {(["codex", "claude"] as const).map((id) => (
              <button
                type="button"
                key={id}
                disabled={!statuses[id].installed}
                onClick={() => setProvider(id)}
                className={cn(
                  "rounded-xl border bg-card p-4 text-left disabled:opacity-50",
                  provider === id && "border-primary ring-2 ring-primary/20",
                )}
              >
                <div className="flex justify-between gap-3">
                  <strong>{id === "codex" ? "Codex" : "Claude"}</strong>
                  <Badge variant={statuses[id].authenticated ? "default" : "secondary"}>
                    {!statuses[id].installed
                      ? "Não instalado"
                      : statuses[id].authenticated
                        ? "Conectado"
                        : "Desconectado"}
                  </Badge>
                </div>
                <p className="mt-2 truncate text-xs text-muted-foreground">
                  {statuses[id].version || "CLI necessário para PDF, DOCX, TXT e MD"}
                </p>
              </button>
            ))}
          </div>
          {statuses[provider].installed && !statuses[provider].authenticated && (
            <div className="mt-4 text-center">
              <Button variant="outline" disabled={!!busy} onClick={() => login(provider)}>
                <Wifi className="size-4" /> Conectar {provider === "codex" ? "Codex" : "Claude"}
              </Button>
            </div>
          )}
          <Label className="relative mt-7 flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-muted/30 p-8 text-center hover:border-primary">
            <Input
              type="file"
              accept=".pdf,.docx,.txt,.md,.json"
              className="absolute inset-0 h-full cursor-pointer opacity-0"
              disabled={!!busy}
              onChange={(event) => event.target.files?.[0] && importFile(event.target.files[0])}
            />
            <div className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <FileUp className="size-7" />
            </div>
            <strong className="mt-4 text-lg">Selecione ou arraste seu arquivo</strong>
            <span className="mt-1 text-sm font-normal text-muted-foreground">
              PDF, DOCX, TXT, MD ou JSON · até 10 MB
            </span>
          </Label>
          <div className="mt-5 flex items-center gap-3 text-xs text-muted-foreground">
            <FileJson className="size-4" /> JSON não exige conexão com IA.
          </div>
          <Feedback busy={importRun ? "" : busy} error={error} />
        </div>
      </OnboardingShell>
    );

  return (
    <OnboardingShell>
      <div className="mx-auto max-w-4xl">
        <div className="mb-7 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Configuração do perfil
            </p>
            <h1 className="mt-1 text-2xl font-bold">{stepNames[step]}</h1>
          </div>
          <Badge variant="secondary">{step + 1} de 5</Badge>
        </div>
        <Progress value={(step + 1) * 20} className="mb-7" />
        <Card>
          <CardContent className="p-6 sm:p-8">
            {step === 0 && <Personal profile={profile} setProfile={setProfile} />}
            {step === 1 && <Summary profile={profile} setProfile={setProfile} />}
            {step === 2 && <Experiences profile={profile} mutate={mutate} />}
            {step === 3 && <Education profile={profile} mutate={mutate} />}
            {step === 4 && <Review profile={profile} />}
          </CardContent>
        </Card>
        <Feedback busy={busy} error={error} />
        <div className="mt-6 flex justify-between">
          <Button variant="outline" disabled={!!busy} onClick={step ? back : () => setMode(null)}>
            <ArrowLeft className="size-4" /> Voltar
          </Button>
          {step < 4 ? (
            <Button disabled={!!busy} onClick={next}>
              Salvar e continuar <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button disabled={!!busy} onClick={complete}>
              <Check className="size-4" /> Salvar meu perfil
            </Button>
          )}
        </div>
      </div>
    </OnboardingShell>
  );
}

const importStages: Array<{ id: ImportStage; label: string }> = [
  { id: "reading_file", label: "Arquivo lido" },
  { id: "checking_provider", label: "IA verificada" },
  { id: "extracting", label: "Perfil estruturado" },
  { id: "validating", label: "Dados validados" },
  { id: "saving", label: "Revisão preparada" },
];

function ImportProgressCard({ run }: { run: ImportRun }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - run.startedAt) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [run.startedAt]);
  const activeIndex = importStages.findIndex((stage) => stage.id === run.event.stage);
  return (
    <Card className="mt-7 overflow-hidden" aria-live="polite">
      <div className="h-1 animate-pulse bg-gradient-to-r from-transparent via-primary to-transparent" />
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="size-6 animate-pulse" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <Badge variant="secondary">Importação inteligente</Badge>
              <span className="text-xs tabular-nums text-muted-foreground">
                {String(Math.floor(elapsed / 60)).padStart(2, "0")}:
                {String(elapsed % 60).padStart(2, "0")}
              </span>
            </div>
            <h2 className="mt-3 text-lg font-bold">{run.event.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{run.event.message}</p>
          </div>
        </div>
        <Progress
          value={run.event.progress}
          aria-label="Progresso da importação"
          className="mt-5 h-2.5"
        />
        <div className="mt-5 grid gap-2 sm:grid-cols-5">
          {importStages.map((stage, index) => (
            <div
              key={stage.id}
              className={cn(
                "rounded-lg border p-2 text-xs text-muted-foreground",
                index === activeIndex && "border-primary/40 bg-primary/5 text-foreground",
                index < activeIndex && "text-foreground",
              )}
            >
              {index < activeIndex ? (
                <Check className="mb-1 size-3.5 text-primary" />
              ) : (
                <LoaderCircle
                  className={cn(
                    "mb-1 size-3.5",
                    index === activeIndex && "animate-spin text-primary",
                  )}
                />
              )}
              {stage.label}
            </div>
          ))}
        </div>
        {run.activities.length > 0 && (
          <ol className="mt-5 space-y-2 rounded-xl border bg-muted/25 p-4 text-sm">
            {run.activities.map((item, index) => (
              <li key={`${item.timestamp}-${index}`} className="flex gap-2 text-muted-foreground">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                {item.message}
              </li>
            ))}
          </ol>
        )}
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Você pode acompanhar cada etapa sem recarregar a página.
        </p>
      </CardContent>
    </Card>
  );
}

function OnboardingShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-6xl items-center px-5">
          <img src="/encaixa-logo.png" alt="" className="size-11 object-contain" />
          <strong className="ml-3 text-xl">encAIxa</strong>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-10 sm:py-16">{children}</main>
      <Toaster richColors position="top-right" />
    </div>
  );
}
function Choice({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: typeof UserRound;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-2xl border bg-card p-7 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
    >
      <div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-6" />
      </div>
      <h2 className="mt-5 text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
      <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary">
        Começar <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
      </span>
    </button>
  );
}
function Feedback({ busy, error }: { busy: string; error: string }) {
  return (
    <>
      {busy && (
        <Alert className="mt-5 flex items-center gap-2">
          <LoaderCircle className="size-4 animate-spin text-primary" />
          {busy}
        </Alert>
      )}
      {error && (
        <Alert variant="destructive" className="mt-5">
          {error}
        </Alert>
      )}
    </>
  );
}
function FormField({
  label,
  value,
  onChange,
  area = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  area?: boolean;
}) {
  return (
    <div className={cn("space-y-2", area && "sm:col-span-2")}>
      <Label>{label}</Label>
      {area ? (
        <Textarea value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <Input value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </div>
  );
}
function Personal({
  profile,
  setProfile,
}: {
  profile: Profile;
  setProfile: (profile: Profile) => void;
}) {
  const set = (key: keyof Profile, value: string) => setProfile({ ...profile, [key]: value });
  const contact = (key: keyof Profile["contact"], value: string) =>
    setProfile({ ...profile, contact: { ...profile.contact, [key]: value } });
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <FormField label="Nome completo" value={profile.name} onChange={(v) => set("name", v)} />
      <FormField
        label="Título profissional"
        value={profile.title}
        onChange={(v) => set("title", v)}
      />
      <FormField
        label="E-mail"
        value={profile.contact.email || ""}
        onChange={(v) => contact("email", v)}
      />
      <FormField
        label="Telefone"
        value={profile.contact.phone}
        onChange={(v) => contact("phone", v)}
      />
      <FormField
        label="LinkedIn"
        value={profile.contact.linkedin}
        onChange={(v) => contact("linkedin", v)}
      />
      <FormField
        label="GitHub"
        value={profile.contact.github}
        onChange={(v) => contact("github", v)}
      />
      <FormField
        label="Localização"
        value={profile.contact.location}
        onChange={(v) => contact("location", v)}
      />
    </div>
  );
}
function Summary({
  profile,
  setProfile,
}: {
  profile: Profile;
  setProfile: (profile: Profile) => void;
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <FormField
        area
        label="Resumo profissional"
        value={profile.summary}
        onChange={(summary) => setProfile({ ...profile, summary })}
      />
      <FormField
        area
        label="Competências (uma por linha)"
        value={profile.skills.join("\n")}
        onChange={(value) =>
          setProfile({
            ...profile,
            skills: value
              .split("\n")
              .map((item) => item.trim())
              .filter(Boolean),
          })
        }
      />
    </div>
  );
}
function Experiences({
  profile,
  mutate,
}: {
  profile: Profile;
  mutate: (change: (draft: Profile) => void) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex justify-between">
        <div>
          <CardTitle>Experiências profissionais</CardTitle>
          <CardDescription>
            Adicione somente experiências que realmente fazem parte da sua trajetória.
          </CardDescription>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            mutate((p) => p.experience.push({ title: "", company: "", period: "", bullets: [] }))
          }
        >
          <Plus className="size-4" />
          Adicionar
        </Button>
      </div>
      {profile.experience.length ? (
        profile.experience.map((item, index) => (
          <div key={index} className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
            <FormField
              label="Cargo"
              value={item.title}
              onChange={(v) => mutate((p) => (p.experience[index].title = v))}
            />
            <FormField
              label="Empresa"
              value={item.company}
              onChange={(v) => mutate((p) => (p.experience[index].company = v))}
            />
            <FormField
              label="Período"
              value={item.period}
              onChange={(v) => mutate((p) => (p.experience[index].period = v))}
            />
            <FormField
              area
              label="Resultados (uma por linha)"
              value={item.bullets.join("\n")}
              onChange={(v) =>
                mutate(
                  (p) =>
                    (p.experience[index].bullets = v
                      .split("\n")
                      .map((x) => x.trim())
                      .filter(Boolean)),
                )
              }
            />
            <Button
              size="sm"
              variant="destructive"
              className="w-fit"
              onClick={() => mutate((p) => p.experience.splice(index, 1))}
            >
              <Trash2 className="size-4" />
              Remover
            </Button>
          </div>
        ))
      ) : (
        <Empty icon={BriefcaseBusiness} text="Você pode continuar sem adicionar experiências." />
      )}
    </div>
  );
}
function Education({
  profile,
  mutate,
}: {
  profile: Profile;
  mutate: (change: (draft: Profile) => void) => void;
}) {
  return (
    <div className="space-y-7">
      <SectionList
        title="Formação"
        icon={GraduationCap}
        add={() =>
          mutate((p) => p.education.push({ degree: "", institution: "", period: "", status: "" }))
        }
      >
        {profile.education.map((item, index) => (
          <div className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2" key={index}>
            <FormField
              label="Curso"
              value={item.degree}
              onChange={(v) => mutate((p) => (p.education[index].degree = v))}
            />
            <FormField
              label="Instituição"
              value={item.institution}
              onChange={(v) => mutate((p) => (p.education[index].institution = v))}
            />
            <FormField
              label="Período"
              value={item.period}
              onChange={(v) => mutate((p) => (p.education[index].period = v))}
            />
            <FormField
              label="Status"
              value={item.status || ""}
              onChange={(v) => mutate((p) => (p.education[index].status = v))}
            />
            <Button
              variant="ghost"
              size="sm"
              className="w-fit text-destructive sm:col-span-2"
              onClick={() => mutate((p) => p.education.splice(index, 1))}
            >
              <Trash2 className="size-4" /> Remover formação
            </Button>
          </div>
        ))}
      </SectionList>
      <Separator />
      <SectionList
        title="Idiomas"
        icon={Languages}
        add={() => mutate((p) => p.languages.push({ language: "", level: "" }))}
      >
        {profile.languages.map((item, index) => (
          <div className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2" key={index}>
            <FormField
              label="Idioma"
              value={item.language}
              onChange={(v) => mutate((p) => (p.languages[index].language = v))}
            />
            <FormField
              label="Nível"
              value={item.level}
              onChange={(v) => mutate((p) => (p.languages[index].level = v))}
            />
            <Button
              variant="ghost"
              size="sm"
              className="w-fit text-destructive sm:col-span-2"
              onClick={() => mutate((p) => p.languages.splice(index, 1))}
            >
              <Trash2 className="size-4" /> Remover idioma
            </Button>
          </div>
        ))}
      </SectionList>
    </div>
  );
}
function SectionList({
  title,
  icon: Icon,
  add,
  children,
}: {
  title: string;
  icon: typeof GraduationCap;
  add: () => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold">
          <Icon className="size-4 text-primary" />
          {title}
        </h2>
        <Button variant="outline" size="sm" onClick={add}>
          <Plus className="size-4" />
          Adicionar
        </Button>
      </div>
      {children}
    </div>
  );
}
function Review({ profile }: { profile: Profile }) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="size-6" />
        </div>
        <h2 className="mt-3 text-xl font-bold">Tudo pronto para revisar</h2>
        <p className="text-sm text-muted-foreground">
          Confira os principais dados antes de criar seu perfil reutilizável.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <ReviewItem label="Nome" value={profile.name} />
        <ReviewItem label="Título" value={profile.title} />
        <ReviewItem
          label="Contato"
          value={profile.contact.email || profile.contact.phone || "Não informado"}
        />
        <ReviewItem label="Competências" value={`${profile.skills.length} adicionada(s)`} />
        <ReviewItem label="Experiências" value={`${profile.experience.length} adicionada(s)`} />
        <ReviewItem
          label="Formação e idiomas"
          value={`${profile.education.length} formação(ões) · ${profile.languages.length} idioma(s)`}
        />
      </div>
      <Alert>
        Ao salvar, estes dados ficarão somente no armazenamento local do encAIxa e serão
        reutilizados nas próximas candidaturas.
      </Alert>
    </div>
  );
}
function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <strong className="mt-1 block text-sm">{value || "Não informado"}</strong>
    </div>
  );
}
function Empty({ icon: Icon, text }: { icon: typeof BriefcaseBusiness; text: string }) {
  return (
    <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
      <Icon className="mx-auto mb-2 size-5" />
      {text}
    </div>
  );
}
