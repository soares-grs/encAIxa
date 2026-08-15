import { useEffect, useRef, useState, type ReactNode } from "react";
import { Toaster, toast } from "sonner";
import {
  AlertCircle,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Database,
  Download,
  FileText,
  History,
  Languages,
  Link2,
  LoaderCircle,
  Menu,
  Moon,
  Pencil,
  Plus,
  RotateCcw,
  SearchCheck,
  Send,
  Sparkles,
  Sun,
  ShieldCheck,
  Trash2,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import type {
  AnalysisActivityEvent,
  AnalysisProgressEvent,
  AnalysisStage,
  Decision,
  GapDraft,
  GapBatchDraft,
  Optimization,
  Profile,
  JobWorkflow,
  JobImportProgressEvent,
} from "../shared/schemas";
import { calculateAdherence, makeReviewBaseline } from "../shared/adherence";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Label,
  Progress,
  Separator,
  Sheet,
  SheetClose,
  SheetContent,
  SheetTrigger,
  Textarea,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import { useTheme } from "@/theme";
import { api } from "@/api";
import Onboarding, { type OnboardingState } from "@/Onboarding";
import { streamAnalysis } from "@/analysis-stream";
import { streamJobImport } from "@/job-import-stream";

type Job = {
  id: string;
  company: string;
  role: string;
  text: string;
  sourceUrl?: string;
  analysis?: Optimization;
  decisions?: Decision[];
  createdAt?: string;
  provider?: ProviderId;
  workflow?: JobWorkflow;
};
type JobDetail = Job & {
  analysis: (Optimization & { score?: number }) | null;
  decisions: Decision[];
  workflow: JobWorkflow;
  files: OutputFile[];
  profileSnapshot: Profile | null;
};
type ProviderId = "codex" | "claude";
type ProviderStatus = {
  installed: boolean;
  authenticated: boolean;
  loginRunning: boolean;
  loginOutput: string;
  version: string;
  error?: string;
};
type ProviderStatuses = Record<ProviderId, ProviderStatus>;
const providerInfo = {
  codex: { label: "Codex", company: "OpenAI", install: "npm install -g @openai/codex" },
  claude: {
    label: "Claude",
    company: "Anthropic",
    install: "npm install -g @anthropic-ai/claude-code",
  },
} as const;
const emptyProviderStatus: ProviderStatus = {
  installed: false,
  authenticated: false,
  loginRunning: false,
  loginOutput: "",
  version: "",
};
type OutputFile = { name: string; url: string; pages: number; lang: string };
type DecisionState = { accepted: boolean; customText?: string };
export type AnalysisRun = {
  event: AnalysisProgressEvent;
  startedAt: number;
  lastHeartbeatAt: number;
  activities: AnalysisActivityEvent[];
  error?: string;
};
const steps = [
  { label: "Perfil", icon: CircleUserRound },
  { label: "Vaga", icon: BriefcaseBusiness },
  { label: "Análise", icon: Sparkles },
  { label: "Revisão", icon: CheckCircle2 },
  { label: "Gerar", icon: Download },
];
const titles = [
  "Seu perfil profissional",
  "Descrição da vaga",
  "Análise de aderência",
  "Revise cada sugestão",
  "Prévia e arquivos finais",
];
const descriptions = [
  "Mantenha sua trajetória atualizada para criar candidaturas mais precisas.",
  "Conte para o encAIxa qual oportunidade você quer conquistar.",
  "Compare seu perfil à vaga sem alterar nenhum dado original.",
  "Você decide quais melhorias entram no currículo desta candidatura.",
  "Confira o resultado e baixe os documentos prontos para enviar.",
];
const emptyProfile: Profile = {
  name: "",
  title: "",
  subtitle: "",
  contact: { email: "", phone: "", linkedin: "", github: "", location: "" },
  summary: "",
  skills: [],
  experience: [],
  education: [],
  languages: [],
};

export default function App() {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [job, setJob] = useState<Job>({ id: "", company: "", role: "", text: "" });
  const [analysis, setAnalysis] = useState<(Optimization & { score?: number }) | null>(null);
  const [workflow, setWorkflow] = useState<JobWorkflow | null>(null);
  const [applicationProfile, setApplicationProfile] = useState<Profile | null>(null);
  const [decisions, setDecisions] = useState<Record<string, DecisionState>>({});
  const [statuses, setStatuses] = useState<ProviderStatuses>({
    codex: emptyProviderStatus,
    claude: emptyProviderStatus,
  });
  const [provider, setProvider] = useState<ProviderId>("codex");
  const [history, setHistory] = useState<Job[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [files, setFiles] = useState<OutputFile[]>([]);
  const [langs, setLangs] = useState<Array<"ptbr" | "en">>(["ptbr"]);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [analysisRun, setAnalysisRun] = useState<AnalysisRun | null>(null);
  const [jobImportProgress, setJobImportProgress] = useState<JobImportProgressEvent | null>(null);
  const historyRequest = useRef(0);
  const decisionSaveQueue = useRef(Promise.resolve());
  const load = () =>
    Promise.all([
      api<OnboardingState>("/api/onboarding"),
      api<ProviderStatuses>("/api/providers/status"),
      api<Job[]>("/api/jobs"),
    ])
      .then(async ([onboardingState, s, h]) => {
        setOnboarding(onboardingState);
        setStatuses(s);
        setHistory(h);
        if (onboardingState.completed) setProfile(await api<Profile>("/api/profile"));
        setBootstrapped(true);
      })
      .catch((e) => {
        setError(e.message);
        setBootstrapped(true);
      });
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (statuses.codex.loginRunning || statuses.claude.loginRunning) {
      const timer = setTimeout(
        () => api<ProviderStatuses>("/api/providers/status").then(setStatuses),
        1500,
      );
      return () => clearTimeout(timer);
    }
  }, [statuses]);
  const work = async (label: string, success: string, fn: () => Promise<void | false>) => {
    setBusy(label);
    setError("");
    try {
      const completed = await fn();
      if (success && completed !== false) toast.success(success);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erro inesperado.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy("");
    }
  };
  const saveProfile = () =>
    work("Salvando perfil...", "Perfil salvo", async () => {
      await api("/api/profile", { method: "PUT", body: JSON.stringify(profile) });
      setStep(1);
    });
  const importJobUrl = () =>
    work("Capturando vaga...", "Dados da vaga capturados", async () => {
      setJobImportProgress({
        type: "progress",
        stage: "validating_url",
        progress: 3,
        title: "Iniciando a captura",
        message: "Preparando o acesso à página pública.",
      });
      try {
        const data = await streamJobImport(job.sourceUrl || "", provider, (event) => {
          if (event.type === "progress") setJobImportProgress(event);
        });
        setJob((current) => ({
          ...current,
          company: data.company || current.company,
          role: data.role || current.role,
          text: data.text || current.text,
          sourceUrl: data.sourceUrl,
        }));
      } finally {
        setJobImportProgress(null);
      }
    });
  const saveJob = () =>
    work("Salvando vaga...", "Vaga salva", async () => {
      const invalidate = Boolean(job.id && workflow && workflow.step > 2);
      if (
        invalidate &&
        !window.confirm(
          "Alterar esta vaga removerá a análise, as decisões e os arquivos gerados. Depois será necessário analisá-la novamente. Deseja continuar?",
        )
      )
        return false;
      const saved = await api<Job>(job.id ? `/api/jobs/${job.id}` : "/api/jobs", {
        method: job.id ? "PUT" : "POST",
        body: JSON.stringify({ ...job, invalidate }),
      });
      setJob(saved);
      setWorkflow(
        saved.workflow ||
          (workflow && !invalidate
            ? workflow
            : {
                version: 1,
                step: 2,
                provider,
                languages: ["ptbr"],
                files: [],
                updatedAt: new Date().toISOString(),
              }),
      );
      if (invalidate) {
        setAnalysis(null);
        setDecisions({});
        setFiles([]);
        setApplicationProfile(null);
        setLangs(["ptbr"]);
      }
      setStep(2);
      await load();
    });
  const analyze = async () => {
    setError("");
    let latest: AnalysisProgressEvent = {
      type: "progress",
      stage: "preparing",
      progress: 3,
      title: "Iniciando a análise",
      message: "Preparando uma sessão segura com o provedor escolhido.",
    };
    const startedAt = Date.now();
    setAnalysisRun({
      event: latest,
      startedAt,
      lastHeartbeatAt: startedAt,
      activities: [
        {
          type: "activity",
          stage: "preparing",
          message: "Solicitação de análise enviada.",
          timestamp: new Date(startedAt).toISOString(),
        },
      ],
    });
    try {
      const result = await streamAnalysis(job.id, provider, (event) => {
        if (event.type === "progress") latest = event;
        setAnalysisRun((current) => {
          const base = current || {
            event: latest,
            startedAt,
            lastHeartbeatAt: startedAt,
            activities: [],
          };
          if (event.type === "heartbeat")
            return { ...base, lastHeartbeatAt: Date.parse(event.timestamp) || Date.now() };
          if (event.type === "activity") {
            const activities = [...base.activities, event]
              .filter(
                (activity, index, list) =>
                  index === 0 || activity.message !== list[index - 1].message,
              )
              .slice(-6);
            return { ...base, lastHeartbeatAt: Date.now(), activities };
          }
          return {
            ...base,
            event,
            lastHeartbeatAt: Date.now(),
            activities: [
              ...base.activities,
              {
                type: "activity" as const,
                stage: event.stage,
                message: event.title,
                timestamp: new Date().toISOString(),
              },
            ].slice(-6),
          };
        });
      });
      setJob((current) => ({ ...current, provider }));
      setApplicationProfile(profile);
      setAnalysis(result);
      setDecisions(
        Object.fromEntries(
          result.suggestions.map((suggestion) => [suggestion.id, { accepted: false }]),
        ),
      );
      setAnalysisRun(null);
      setWorkflow((current) => ({
        version: 1,
        step: 3,
        provider,
        languages: current?.languages || ["ptbr"],
        files: [],
        updatedAt: new Date().toISOString(),
        analyzedAt: new Date().toISOString(),
        reviewBaseline: current?.reviewBaseline || makeReviewBaseline(result),
      }));
      setStep(3);
      void load();
      toast.success("Análise concluída");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "A análise não foi concluída.";
      setAnalysisRun((current) => ({
        event: current?.event || latest,
        startedAt: current?.startedAt || startedAt,
        lastHeartbeatAt: current?.lastHeartbeatAt || Date.now(),
        activities: current?.activities || [],
        error: message,
      }));
      toast.error(message);
    }
  };
  const saveReview = () =>
    work("Salvando revisão...", "Revisão salva", async () => {
      const list = Object.entries(decisions).map(([suggestionId, decision]) => ({
        suggestionId,
        ...decision,
      }));
      await decisionSaveQueue.current;
      await api(`/api/jobs/${job.id}/decisions`, { method: "PUT", body: JSON.stringify(list) });
      const savedWorkflow = await api<JobWorkflow>(`/api/jobs/${job.id}/workflow`, {
        method: "PATCH",
        body: JSON.stringify({ step: 4 }),
      });
      setWorkflow(savedWorkflow);
      setStep(4);
    });
  const generate = () =>
    work("Gerando PDFs...", "Arquivos gerados", async () => {
      const out = await api<{ files: OutputFile[] }>(`/api/jobs/${job.id}/generate`, {
        method: "POST",
        body: JSON.stringify({ languages: langs }),
      });
      setFiles(out.files);
      setWorkflow((current) =>
        current
          ? {
              ...current,
              step: 4,
              files: out.files as JobWorkflow["files"],
              languages: langs,
            }
          : current,
      );
      void load();
    });
  const startNextApplication = (target: "profile" | "job") => {
    setJob({ id: "", company: "", role: "", text: "" });
    setAnalysis(null);
    setWorkflow(null);
    setApplicationProfile(null);
    setDecisions({});
    setFiles([]);
    setLangs(["ptbr"]);
    setAnalysisRun(null);
    setError("");
    setStep(target === "profile" ? 0 : 1);
  };
  const openHistory = (id: string) =>
    work("Abrindo candidatura...", "", async () => {
      const request = ++historyRequest.current;
      const saved = await api<JobDetail>(`/api/jobs/${id}`);
      if (request !== historyRequest.current) return;
      setJob(saved);
      setWorkflow(saved.workflow);
      setApplicationProfile(saved.profileSnapshot);
      setProvider(saved.workflow.provider || saved.provider || "codex");
      setAnalysis(saved.analysis);
      setDecisions(
        Object.fromEntries(
          (saved.decisions || []).map((decision) => [
            decision.suggestionId,
            { accepted: decision.accepted, customText: decision.customText },
          ]),
        ),
      );
      setFiles(saved.files);
      setLangs(saved.workflow.languages);
      setStep(saved.workflow.step);
    });
  const saveDecision = async (
    suggestionId: string,
    accepted: boolean,
    customText?: string | null,
  ) => {
    const previous = decisions[suggestionId] || { accepted: false };
    const next: DecisionState = {
      accepted,
      ...(customText === undefined
        ? previous.customText
          ? { customText: previous.customText }
          : {}
        : customText
          ? { customText }
          : {}),
    };
    setDecisions((current) => ({ ...current, [suggestionId]: next }));
    try {
      const save = () =>
        api(`/api/jobs/${job.id}/decisions/${encodeURIComponent(suggestionId)}`, {
          method: "PUT",
          body: JSON.stringify({
            accepted,
            ...(customText !== undefined ? { customText } : {}),
          }),
        }).then(() => undefined);
      decisionSaveQueue.current = decisionSaveQueue.current.then(save, save);
      await decisionSaveQueue.current;
      return true;
    } catch (caught) {
      setDecisions((current) => ({ ...current, [suggestionId]: previous }));
      toast.error(caught instanceof Error ? caught.message : "Não foi possível salvar a decisão.");
      return false;
    }
  };
  const saveLanguages = async (next: Array<"ptbr" | "en">) => {
    const previous = langs;
    setLangs(next);
    try {
      const saved = await api<JobWorkflow>(`/api/jobs/${job.id}/workflow`, {
        method: "PATCH",
        body: JSON.stringify({ languages: next }),
      });
      setWorkflow(saved);
    } catch (caught) {
      setLangs(previous);
      toast.error(caught instanceof Error ? caught.message : "Não foi possível salvar os idiomas.");
    }
  };
  const login = (selectedProvider: ProviderId) =>
    work("Iniciando login...", "", async () => {
      await api(`/api/providers/${selectedProvider}/login`, { method: "POST" });
      setStatuses(await api<ProviderStatuses>("/api/providers/status"));
    });
  const content =
    step === 0 ? (
      <ProfileStep profile={profile} setProfile={setProfile} onSave={saveProfile} busy={!!busy} />
    ) : step === 1 ? (
      <JobStep
        job={job}
        setJob={setJob}
        onImportUrl={importJobUrl}
        onSave={saveJob}
        busy={!!busy}
        statuses={statuses}
        provider={provider}
        setProvider={setProvider}
        login={login}
        importProgress={jobImportProgress}
      />
    ) : step === 2 ? (
      <AnalysisStep
        statuses={statuses}
        provider={provider}
        setProvider={setProvider}
        job={job}
        login={login}
        analyze={analyze}
        busy={!!busy || Boolean(analysisRun && !analysisRun.error)}
        run={analysisRun}
        changeProvider={() => setAnalysisRun(null)}
      />
    ) : step === 3 && analysis ? (
      <ReviewStep
        job={job}
        profile={applicationProfile || profile}
        analysis={analysis}
        workflow={workflow}
        decisions={decisions}
        setDecision={saveDecision}
        onGapConfirmed={(updatedAnalysis, updatedDecisions) => {
          setAnalysis(updatedAnalysis);
          setDecisions(
            Object.fromEntries(
              updatedDecisions.map((decision) => [
                decision.suggestionId,
                { accepted: decision.accepted, customText: decision.customText },
              ]),
            ),
          );
        }}
        next={saveReview}
        busy={!!busy}
      />
    ) : (
      <GenerateStep
        job={job}
        langs={langs}
        setLangs={saveLanguages}
        generate={generate}
        files={files}
        busy={!!busy}
        startAnotherJob={() => startNextApplication("job")}
        updateProfile={() => startNextApplication("profile")}
      />
    );
  if (!bootstrapped)
    return (
      <div className="grid min-h-screen place-items-center">
        <LoaderCircle className="size-7 animate-spin text-primary" />
      </div>
    );
  if (onboarding && !onboarding.completed)
    return (
      <Onboarding
        initial={onboarding}
        statuses={statuses}
        refreshStatuses={async () =>
          setStatuses(await api<ProviderStatuses>("/api/providers/status"))
        }
        onComplete={(completedProfile) => {
          setProfile(completedProfile);
          setOnboarding({ ...onboarding, completed: true });
          setStep(1);
        }}
      />
    );
  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[280px_1fr]">
      <aside className="hidden h-screen border-r bg-card lg:sticky lg:top-0 lg:flex lg:flex-col">
        <Sidebar
          step={step}
          setStep={setStep}
          history={history}
          openHistory={openHistory}
          statuses={statuses}
          activeJobId={job.id}
          navigationBusy={Boolean(busy || (analysisRun && !analysisRun.error))}
        />
      </aside>
      <div className="min-w-0">
        <MobileHeader
          step={step}
          setStep={setStep}
          history={history}
          openHistory={openHistory}
          statuses={statuses}
          activeJobId={job.id}
          navigationBusy={Boolean(busy || (analysisRun && !analysisRun.error))}
        />
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-10 lg:px-12">
          <PageHeader step={step} />
          {error && (
            <Alert variant="destructive" className="mb-6 flex items-start gap-3">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <div className="flex-1">{error}</div>
              <Button variant="ghost" size="sm" onClick={() => setError("")}>
                Fechar
              </Button>
            </Alert>
          )}
          {busy && (
            <div className="mb-6 flex items-center gap-3 rounded-lg border bg-card p-3 text-sm text-muted-foreground shadow-sm">
              <LoaderCircle className="size-4 animate-spin text-primary" />
              {busy}
            </div>
          )}
          {content}
        </main>
      </div>
      <Toaster richColors position="top-right" theme="system" />
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <img src="/encaixa-logo.png" alt="" className="size-12 object-contain" />
      <div>
        <strong className="block text-xl tracking-tight">encAIxa</strong>
        <span className="block text-xs text-muted-foreground">Seu currículo, na vaga certa</span>
      </div>
    </div>
  );
}
function ThemeButton() {
  const { theme, toggle } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
function Sidebar({
  step,
  setStep,
  history,
  openHistory,
  statuses,
  activeJobId,
  navigationBusy,
}: {
  step: number;
  setStep: (n: number) => void;
  history: Job[];
  openHistory: (id: string) => void;
  statuses: ProviderStatuses;
  activeJobId: string;
  navigationBusy: boolean;
}) {
  return (
    <>
      <div className="flex items-center justify-between p-6">
        <Brand />
        <ThemeButton />
      </div>
      <Separator />
      <nav aria-label="Etapas" className="space-y-1 p-4">
        {steps.map(({ label, icon: Icon }, index) => (
          <Button
            key={label}
            variant="ghost"
            disabled={index > step || navigationBusy}
            onClick={() => setStep(index)}
            className={cn(
              "h-11 w-full justify-start gap-3 px-3 text-muted-foreground",
              step === index && "bg-accent text-accent-foreground",
            )}
          >
            <span
              className={cn(
                "grid size-7 place-items-center rounded-full border text-xs",
                index < step && "border-primary bg-primary text-primary-foreground",
                index === step && "border-primary text-primary",
              )}
            >
              {index < step ? <CheckCircle2 className="size-4" /> : index + 1}
            </span>
            <Icon className="size-4" />
            {label}
          </Button>
        ))}
      </nav>
      <Separator />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <History className="size-3.5" />
          Histórico
        </div>
        <div className="space-y-1">
          {history.length ? (
            history.map((item) => (
              <Button
                key={item.id}
                variant="ghost"
                disabled={navigationBusy}
                onClick={() => openHistory(item.id)}
                className={cn(
                  "h-auto w-full justify-start px-3 py-2 text-left",
                  item.id === activeJobId && "bg-accent text-accent-foreground",
                )}
              >
                <span className="min-w-0">
                  <strong className="block truncate text-sm">{item.role}</strong>
                  <small className="block truncate font-normal text-muted-foreground">
                    {item.company}
                  </small>
                  <Badge variant="outline" className="mt-1 text-[10px]">
                    {item.workflow?.step === 4
                      ? item.workflow.files.length
                        ? "Arquivos gerados"
                        : "Revisada"
                      : item.workflow?.step === 3
                        ? "Em revisão"
                        : "Aguardando análise"}
                  </Badge>
                </span>
              </Button>
            ))
          ) : (
            <p className="px-3 text-xs leading-relaxed text-muted-foreground">
              Nenhuma candidatura criada.
            </p>
          )}
        </div>
      </div>
      <div className="m-4 space-y-2 rounded-xl border bg-muted/50 p-3">
        {(["codex", "claude"] as const).map((id) => (
          <div className="flex items-center gap-2" key={id}>
            {statuses[id].authenticated ? (
              <Wifi className="size-3.5 text-primary" />
            ) : (
              <WifiOff className="size-3.5 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <strong className="block text-xs capitalize">
                {id} {statuses[id].authenticated ? "conectado" : "desconectado"}
              </strong>
              <span className="block truncate text-[10px] text-muted-foreground">
                {statuses[id].version || "CLI não encontrado"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
function MobileHeader(props: Parameters<typeof Sidebar>[0]) {
  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-background/90 px-4 backdrop-blur lg:hidden">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Abrir menu">
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent className="p-0">
          <SheetClose asChild>
            <div className="sr-only">Fechar</div>
          </SheetClose>
          <Sidebar {...props} />
        </SheetContent>
      </Sheet>
      <span className="font-semibold">
        enc<span className="text-primary">AI</span>xa
      </span>
      <ThemeButton />
    </header>
  );
}
function PageHeader({ step }: { step: number }) {
  return (
    <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-primary">
          <Sparkles className="size-3.5" />
          Assistente de candidatura
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{titles[step]}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          {descriptions[step]}
        </p>
      </div>
      <Badge variant="secondary" className="w-fit">
        Etapa {step + 1} de 5
      </Badge>
    </header>
  );
}

function Field({
  label,
  value,
  onChange,
  area = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  area?: boolean;
  placeholder?: string;
}) {
  const id = label.toLowerCase().replace(/\W+/g, "-");
  return (
    <div className={cn("space-y-2", area && "sm:col-span-2")}>
      <Label htmlFor={id}>{label}</Label>
      {area ? (
        <Textarea
          id={id}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input
          id={id}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
function SectionTitle({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof CircleUserRound;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" />
        </div>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription className="mt-1">{description}</CardDescription>
        </div>
      </div>
      {action}
    </div>
  );
}

function ProfileStep({
  profile,
  setProfile,
  onSave,
  busy,
}: {
  profile: Profile;
  setProfile: (p: Profile) => void;
  onSave: () => void;
  busy: boolean;
}) {
  const set = (key: keyof Profile, value: string) => setProfile({ ...profile, [key]: value });
  const contact = (key: keyof Profile["contact"], value: string) =>
    setProfile({ ...profile, contact: { ...profile.contact, [key]: value } });
  const mutate = (fn: (draft: Profile) => void) => {
    const draft = structuredClone(profile);
    fn(draft);
    setProfile(draft);
  };
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <SectionTitle
            icon={CircleUserRound}
            title="Informações principais"
            description="Os dados que identificam você no currículo."
          />
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field label="Nome" value={profile.name} onChange={(v) => set("name", v)} />
          <Field
            label="Título profissional"
            value={profile.title}
            onChange={(v) => set("title", v)}
          />
          <Field
            label="E-mail"
            value={profile.contact.email || ""}
            onChange={(v) => contact("email", v)}
          />
          <Field
            label="Telefone"
            value={profile.contact.phone}
            onChange={(v) => contact("phone", v)}
          />
          <Field
            label="LinkedIn"
            value={profile.contact.linkedin}
            onChange={(v) => contact("linkedin", v)}
          />
          <Field
            label="GitHub"
            value={profile.contact.github}
            onChange={(v) => contact("github", v)}
          />
          <Field
            area
            label="Resumo profissional"
            value={profile.summary}
            onChange={(v) => set("summary", v)}
          />
          <Field
            area
            label="Competências (uma por linha)"
            value={profile.skills.join("\n")}
            onChange={(v) =>
              mutate(
                (x) =>
                  (x.skills = v
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean)),
              )
            }
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <SectionTitle
            icon={BriefcaseBusiness}
            title="Experiências"
            description="Destaque responsabilidades, impacto e resultados."
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  mutate((x) =>
                    x.experience.push({
                      title: "Novo cargo",
                      company: "Empresa",
                      period: "Período",
                      bullets: ["Descreva um resultado"],
                    }),
                  )
                }
              >
                <Plus className="size-4" />
                Adicionar
              </Button>
            }
          />
        </CardHeader>
        <CardContent>
          {profile.experience.length ? (
            <Accordion type="multiple" defaultValue={["experience-0"]}>
              {profile.experience.map((experience, index) => (
                <AccordionItem value={`experience-${index}`} key={index}>
                  <AccordionTrigger>
                    {experience.title}{" "}
                    <span className="ml-1 text-muted-foreground">· {experience.company}</span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="grid gap-5 rounded-lg bg-muted/40 p-4 sm:grid-cols-2">
                      <Field
                        label="Cargo"
                        value={experience.title}
                        onChange={(v) => mutate((x) => (x.experience[index].title = v))}
                      />
                      <Field
                        label="Empresa"
                        value={experience.company}
                        onChange={(v) => mutate((x) => (x.experience[index].company = v))}
                      />
                      <Field
                        label="Período"
                        value={experience.period}
                        onChange={(v) => mutate((x) => (x.experience[index].period = v))}
                      />
                      <Field
                        area
                        label="Resultados (uma linha por item)"
                        value={experience.bullets.join("\n")}
                        onChange={(v) =>
                          mutate(
                            (x) => (x.experience[index].bullets = v.split("\n").filter(Boolean)),
                          )
                        }
                      />
                      <Button
                        variant="destructive"
                        size="sm"
                        className="w-fit"
                        onClick={() => mutate((x) => x.experience.splice(index, 1))}
                      >
                        <Trash2 className="size-4" />
                        Remover experiência
                      </Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ) : (
            <Empty text="Adicione sua primeira experiência profissional." />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <SectionTitle
            icon={FileText}
            title="Formação e idiomas"
            description="Complementos importantes para sua candidatura."
          />
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="mb-3 text-sm font-semibold">Formação</h3>
            {profile.education.map((education, index) => (
              <div className="mb-4 grid gap-4 rounded-lg border p-4 sm:grid-cols-2" key={index}>
                <Field
                  label="Curso"
                  value={education.degree}
                  onChange={(v) => mutate((x) => (x.education[index].degree = v))}
                />
                <Field
                  label="Instituição"
                  value={education.institution}
                  onChange={(v) => mutate((x) => (x.education[index].institution = v))}
                />
                <Field
                  label="Período"
                  value={education.period}
                  onChange={(v) => mutate((x) => (x.education[index].period = v))}
                />
                <Field
                  label="Status"
                  value={education.status || ""}
                  onChange={(v) => mutate((x) => (x.education[index].status = v))}
                />
              </div>
            ))}
          </div>
          <Separator />
          <div>
            <h3 className="mb-3 text-sm font-semibold">Idiomas</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {profile.languages.map((language, index) => (
                <div className="grid gap-4 rounded-lg border p-4" key={index}>
                  <Field
                    label="Idioma"
                    value={language.language}
                    onChange={(v) => mutate((x) => (x.languages[index].language = v))}
                  />
                  <Field
                    label="Nível"
                    value={language.level}
                    onChange={(v) => mutate((x) => (x.languages[index].level = v))}
                  />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button disabled={busy} onClick={onSave}>
            Salvar e continuar
            <ChevronRight className="size-4" />
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function JobStep({
  job,
  setJob,
  onImportUrl,
  onSave,
  busy,
  statuses,
  provider,
  setProvider,
  login,
  importProgress,
}: {
  job: Job;
  setJob: (job: Job) => void;
  onImportUrl: () => void;
  onSave: () => void;
  busy: boolean;
  statuses: ProviderStatuses;
  provider: ProviderId;
  setProvider: (provider: ProviderId) => void;
  login: (provider: ProviderId) => void;
  importProgress: JobImportProgressEvent | null;
}) {
  const selected = statuses[provider];
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <SectionTitle
          icon={BriefcaseBusiness}
          title="Importe a vaga pelo link"
          description="A IA lê a página pública e organiza os dados da oportunidade para você revisar."
        />
      </CardHeader>
      <CardContent className="space-y-8">
        <section className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-primary/5 to-background p-5 sm:p-6">
          <div className="absolute -right-16 -top-16 size-44 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative space-y-5">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <Link2 className="size-5" />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">Link da oportunidade</h2>
                  <Badge>Recomendado</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Use uma página pública da empresa ou de um portal de vagas.
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field
                label="Link da vaga"
                value={job.sourceUrl || ""}
                onChange={(value) => setJob({ ...job, sourceUrl: value || undefined })}
                placeholder="https://empresa.com/vagas/..."
              />
              <Button
                type="button"
                className="sm:min-w-52"
                disabled={busy || !job.sourceUrl || !selected.installed || selected.loginRunning}
                onClick={selected.authenticated ? onImportUrl : () => login(provider)}
              >
                {selected.authenticated ? (
                  <Sparkles className="size-4" />
                ) : (
                  <Wifi className="size-4" />
                )}
                {selected.authenticated
                  ? "Capturar dados"
                  : selected.installed
                    ? `Conectar ${providerInfo[provider].label}`
                    : `${providerInfo[provider].label} não instalado`}
              </Button>
            </div>
            <div className="space-y-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                IA usada na captura
              </span>
              <div className="grid gap-2 sm:grid-cols-2">
                {(["codex", "claude"] as const).map((id) => (
                  <button
                    key={id}
                    type="button"
                    disabled={busy || !statuses[id].installed}
                    onClick={() => setProvider(id)}
                    className={cn(
                      "flex items-center justify-between rounded-xl border bg-background/80 px-4 py-3 text-left text-sm transition-all hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50",
                      provider === id && "border-primary ring-2 ring-primary/15",
                    )}
                  >
                    <span>
                      <strong className="block">{providerInfo[id].label}</strong>
                      <span className="text-xs text-muted-foreground">
                        {providerInfo[id].company}
                      </span>
                    </span>
                    <Badge variant={statuses[id].authenticated ? "default" : "secondary"}>
                      {!statuses[id].installed
                        ? "Indisponível"
                        : statuses[id].authenticated
                          ? "Conectado"
                          : "Desconectado"}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>
            {importProgress && (
              <div className="space-y-2 rounded-xl border bg-background/90 p-4" aria-live="polite">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <LoaderCircle className="size-4 animate-spin text-primary" />
                    {importProgress.title}
                  </span>
                  <span className="text-muted-foreground">{importProgress.progress}%</span>
                </div>
                <Progress value={importProgress.progress} />
                <p className="text-xs text-muted-foreground">{importProgress.message}</p>
              </div>
            )}
          </div>
        </section>
        <Separator />
        <section className="space-y-5">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
              <SearchCheck className="size-4" />
            </span>
            <div>
              <h2 className="font-semibold">Revise os dados da vaga</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Ajuste o conteúdo capturado ou preencha manualmente se necessário.
              </p>
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Empresa"
              value={job.company}
              onChange={(v) => setJob({ ...job, company: v })}
              placeholder="Ex.: Acme"
            />
            <Field
              label="Cargo"
              value={job.role}
              onChange={(v) => setJob({ ...job, role: v })}
              placeholder="Ex.: Engenheiro de Software"
            />
          </div>
          <Field
            area
            label="Descrição completa da vaga"
            value={job.text}
            onChange={(v) => setJob({ ...job, text: v })}
            placeholder="Responsabilidades, requisitos e diferenciais..."
          />
          {job.sourceUrl &&
            Boolean(job.company || job.role || job.text) &&
            (!job.company || !job.role || job.text.length < 20) &&
            !busy && (
              <Alert>
                <AlertCircle className="size-4" />
                <div>
                  <strong>Alguns dados precisam de atenção</strong>
                  <p className="text-sm text-muted-foreground">
                    Complete os campos que não estavam disponíveis na página.
                  </p>
                </div>
              </Alert>
            )}
        </section>
      </CardContent>
      <CardFooter className="mt-2 justify-between gap-4 border-t bg-muted/20">
        <p className="hidden text-xs text-muted-foreground sm:block">
          Nada será salvo antes da sua confirmação.
        </p>
        <Button
          disabled={busy || !job.company || !job.role || job.text.length < 20}
          onClick={onSave}
        >
          Salvar vaga e continuar
          <ChevronRight className="size-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}

function AnalysisStep({
  statuses,
  provider,
  setProvider,
  job,
  login,
  analyze,
  busy,
  run,
  changeProvider,
}: {
  statuses: ProviderStatuses;
  provider: ProviderId;
  setProvider: (provider: ProviderId) => void;
  job: Job;
  login: (provider: ProviderId) => void;
  analyze: () => void;
  busy: boolean;
  run: AnalysisRun | null;
  changeProvider: () => void;
}) {
  const selected = statuses[provider];
  if (run)
    return (
      <AnalysisProgressCard
        run={run}
        provider={providerInfo[provider].label}
        job={job}
        retry={analyze}
        changeProvider={changeProvider}
      />
    );
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {(["codex", "claude"] as const).map((id) => {
          const status = statuses[id];
          const info = providerInfo[id];
          return (
            <button
              type="button"
              key={id}
              disabled={!status.installed}
              onClick={() => setProvider(id)}
              className={cn(
                "rounded-xl border bg-card p-5 text-left shadow-sm transition-all hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-60",
                provider === id && "border-primary ring-2 ring-primary/20",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <strong className="text-lg">{info.label}</strong>
                  <p className="text-sm text-muted-foreground">{info.company}</p>
                </div>
                <Badge variant={status.authenticated ? "default" : "secondary"}>
                  {!status.installed
                    ? "Não instalado"
                    : status.authenticated
                      ? "Conectado"
                      : "Desconectado"}
                </Badge>
              </div>
              <p className="mt-4 truncate text-xs text-muted-foreground">
                {status.version || info.install}
              </p>
            </button>
          );
        })}
      </div>
      <Card className="overflow-hidden">
        <div className="h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
        <CardContent className="flex min-h-[380px] flex-col items-center justify-center px-6 py-12 text-center">
          <div className="mb-5 grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="size-8" />
          </div>
          <Badge variant={selected.authenticated ? "default" : "secondary"} className="mb-4">
            {selected.authenticated
              ? `${providerInfo[provider].label} conectado`
              : "Conexão necessária"}
          </Badge>
          <h2 className="text-2xl font-bold">
            {selected.authenticated
              ? "Tudo pronto para analisar"
              : selected.installed
                ? `Conecte o ${providerInfo[provider].label} uma vez`
                : `${providerInfo[provider].label} CLI não instalado`}
          </h2>
          <p className="mt-3 max-w-xl text-muted-foreground">
            {selected.authenticated
              ? `Vamos comparar seu perfil à vaga de ${job.role} na ${job.company}. O perfil-base nunca será alterado.`
              : selected.installed
                ? `A autenticação é feita localmente pelo ${providerInfo[provider].label} CLI.`
                : `Instale com: ${providerInfo[provider].install}`}
          </p>
          {selected.loginOutput && (
            <pre className="mt-6 max-h-48 w-full max-w-2xl overflow-auto rounded-lg bg-slate-950 p-4 text-left text-xs text-slate-100">
              {selected.loginOutput}
            </pre>
          )}
          <Button
            size="default"
            className="mt-7"
            disabled={busy || !selected.installed || selected.loginRunning}
            onClick={selected.authenticated ? analyze : () => login(provider)}
          >
            {selected.authenticated ? (
              <>
                <Sparkles className="size-4" />
                Analisar aderência
              </>
            ) : (
              <>
                <Wifi className="size-4" />
                {selected.loginRunning
                  ? "Aguardando login..."
                  : `Conectar ${providerInfo[provider].label}`}
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

const analysisStages: Array<{
  id: AnalysisStage;
  label: string;
  icon: typeof Database;
}> = [
  { id: "preparing", label: "Perfil e vaga preparados", icon: Database },
  { id: "checking_provider", label: "Provedor verificado", icon: ShieldCheck },
  { id: "analyzing", label: "Análise pela IA", icon: Sparkles },
  { id: "processing_result", label: "Resultado validado", icon: SearchCheck },
  { id: "saving", label: "Análise salva", icon: CheckCircle2 },
];
const analysisTips = [
  "Estamos cruzando suas experiências com os requisitos da vaga.",
  "Evidências concretas valem mais do que palavras-chave soltas.",
  "Seu perfil-base permanece intacto durante toda a análise.",
  "Estamos procurando lacunas sem inventar qualificações.",
];

export function AnalysisProgressCard({
  run,
  provider,
  job,
  retry,
  changeProvider,
}: {
  run: AnalysisRun;
  provider: string;
  job: Job;
  retry: () => void;
  changeProvider: () => void;
}) {
  const [now, setNow] = useState(Date.now);
  const [tip, setTip] = useState(0);
  useEffect(() => {
    if (run.error) return;
    const elapsedTimer = setInterval(() => setNow(Date.now()), 1000);
    const tipTimer = setInterval(
      () => setTip((current) => (current + 1) % analysisTips.length),
      6000,
    );
    return () => {
      clearInterval(elapsedTimer);
      clearInterval(tipTimer);
    };
  }, [run.error, run.startedAt]);
  const elapsed = Math.floor((now - run.startedAt) / 1000);
  const connectionSlow = !run.error && now - run.lastHeartbeatAt > 12_000;
  const activeIndex = analysisStages.findIndex((stage) => stage.id === run.event.stage);
  const time = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  return (
    <Card className="overflow-hidden" aria-live="polite">
      <div
        className={cn(
          "h-1 bg-gradient-to-r from-transparent via-primary to-transparent",
          !run.error && "animate-pulse",
          run.error && "via-destructive",
        )}
      />
      <CardContent className="p-6 sm:p-9">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex gap-4">
            <div
              className={cn(
                "grid size-14 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary",
                run.error && "bg-destructive/10 text-destructive",
              )}
            >
              {run.error ? (
                <XCircle className="size-7" />
              ) : (
                <Sparkles className="size-7 animate-pulse" />
              )}
            </div>
            <div>
              <Badge variant={run.error ? "destructive" : "secondary"}>
                {run.error ? "Análise interrompida" : `${provider} trabalhando`}
              </Badge>
              <h2 className="mt-3 text-xl font-bold sm:text-2xl">
                {run.error ? "Não foi possível concluir" : run.event.title}
              </h2>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                {run.error || run.event.message}
              </p>
              <p className="mt-2 text-xs font-medium text-muted-foreground">
                {job.role} <span aria-hidden="true">·</span> {job.company}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start rounded-lg border bg-muted/40 px-3 py-2 text-sm tabular-nums text-muted-foreground">
            <Clock3 className="size-4" /> {time}
          </div>
        </div>
        <div className="relative mt-7">
          <Progress
            value={run.event.progress}
            aria-label="Progresso da análise"
            className="h-2.5"
          />
          {!run.error && run.event.stage === "analyzing" && (
            <div className="pointer-events-none absolute inset-y-0 left-[36%] w-1/4 animate-pulse rounded-full bg-primary/35 blur-[1px]" />
          )}
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
          <span className={cn("flex items-center gap-1.5", connectionSlow && "text-amber-600")}>
            {connectionSlow ? <WifiOff className="size-3" /> : <Wifi className="size-3" />}
            {connectionSlow ? "Conexão lenta, aguardando o provedor" : "Atualizado agora"}
          </span>
          <span>Progresso baseado nas etapas concluídas</span>
        </div>
        <div className="mt-7 grid gap-2 sm:grid-cols-5">
          {analysisStages.map(({ id, label, icon: Icon }, index) => {
            const completed = index < activeIndex;
            const active = index === activeIndex;
            return (
              <div
                key={id}
                className={cn(
                  "rounded-lg border p-3 text-xs text-muted-foreground transition-colors",
                  active && !run.error && "border-primary/40 bg-primary/5 text-foreground",
                  active && run.error && "border-destructive/40 bg-destructive/5 text-destructive",
                  completed && "text-foreground",
                )}
              >
                <Icon className={cn("mb-2 size-4", (active || completed) && "text-primary")} />
                {label}
              </div>
            );
          })}
        </div>
        {run.activities.length > 0 && (
          <div className="mt-6 rounded-xl border bg-muted/25 p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <History className="size-3.5" /> Atividade em tempo real
            </div>
            <ol className="space-y-2.5">
              {run.activities.map((activity, index) => (
                <li
                  className="flex items-start gap-3 text-sm"
                  key={`${activity.timestamp}-${index}`}
                >
                  <span
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full bg-muted-foreground/35",
                      index === run.activities.length - 1 &&
                        !run.error &&
                        "animate-pulse bg-primary",
                    )}
                  />
                  <span className="flex-1 text-muted-foreground">{activity.message}</span>
                  <time className="text-xs tabular-nums text-muted-foreground/70">
                    {new Date(activity.timestamp).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </time>
                </li>
              ))}
            </ol>
          </div>
        )}
        {!run.error && run.event.stage === "analyzing" && (
          <div className="mt-6 flex items-start gap-3 rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
            <span key={tip} className="animate-in fade-in duration-500">
              {analysisTips[tip]}
            </span>
          </div>
        )}
        {run.error && (
          <div className="mt-7 flex flex-wrap justify-end gap-3">
            <Button variant="outline" onClick={changeProvider}>
              Trocar provedor
            </Button>
            <Button onClick={retry}>
              <RotateCcw className="size-4" /> Tentar novamente
            </Button>
          </div>
        )}
        {!run.error && (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            A análise costuma levar de alguns segundos a poucos minutos. Você não precisa recarregar
            a página.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function ReviewStep({
  job,
  profile,
  analysis,
  workflow,
  decisions,
  setDecision,
  setDecisions,
  onGapConfirmed,
  next,
  busy,
}: {
  job: Job;
  profile: Profile;
  analysis: Optimization & { score?: number };
  workflow?: JobWorkflow | null;
  decisions: Record<string, DecisionState>;
  setDecision?: (
    suggestionId: string,
    accepted: boolean,
    customText?: string | null,
  ) => boolean | void | Promise<boolean | void>;
  setDecisions?: (decisions: Record<string, DecisionState>) => void;
  onGapConfirmed: (analysis: Optimization & { score?: number }, decisions: Decision[]) => void;
  next: () => void;
  busy: boolean;
}) {
  const [selectedGap, setSelectedGap] = useState<{ gap: string; index: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const decide = async (suggestionId: string, accepted: boolean, customText?: string | null) => {
    if (setDecision) return setDecision(suggestionId, accepted, customText);
    const previous = decisions[suggestionId] || { accepted: false };
    setDecisions?.({
      ...decisions,
      [suggestionId]: {
        accepted,
        ...(customText === undefined
          ? previous.customText
            ? { customText: previous.customText }
            : {}
          : customText
            ? { customText }
            : {}),
      },
    });
    return true;
  };
  const persistDecision = async (
    suggestionId: string,
    accepted: boolean,
    customText?: string | null,
  ) => {
    setSavingId(suggestionId);
    try {
      return await decide(suggestionId, accepted, customText);
    } finally {
      setSavingId((current) => (current === suggestionId ? null : current));
    }
  };
  const matched = analysis.requirements.filter((r) => r.matched).length;
  const decisionList: Decision[] = Object.entries(decisions).map(([suggestionId, decision]) => ({
    suggestionId,
    ...decision,
  }));
  const adherence = calculateAdherence(analysis, decisionList, workflow?.reviewBaseline);
  const score = adherence.score;
  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
          <div className="grid size-20 shrink-0 place-items-center rounded-full border-8 border-primary/15 text-xl font-bold text-primary">
            {score}%
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Aderência estimada</h2>
              <span className="text-sm text-muted-foreground">
                {matched} de {analysis.requirements.length} requisitos
              </span>
            </div>
            <Progress value={score} className="mt-3" />
            <p className="mt-2 text-sm text-muted-foreground">
              Evolui com novas evidências e com as melhorias aplicadas ao currículo.
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>Base: {adherence.baselineScore}%</span>
              <span>
                Lacunas: {adherence.resolvedGaps}/{adherence.initialGapCount}
              </span>
              <span>
                Sugestões: {adherence.acceptedSuggestions}/{adherence.initialSuggestionCount}
              </span>
              {adherence.gain > 0 && (
                <strong className="text-primary">+{adherence.gain} desde a análise</strong>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)]">
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Sugestões do encAIxa</h2>
          {analysis.suggestions.length ? (
            analysis.suggestions.map((suggestion) => {
              const decision = decisions[suggestion.id] || { accepted: false };
              const effectiveText = decision.customText || suggestion.proposed;
              const editing = editingId === suggestion.id;
              return (
                <Card key={suggestion.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge>{suggestion.type}</Badge>
                        {decision.customText && <Badge variant="secondary">Editada</Badge>}
                      </div>
                      <span className="text-xs text-muted-foreground">{suggestion.target}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {suggestion.target.endsWith(".append") ? (
                      <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
                        Novo bullet criado a partir do contexto informado por você.
                      </div>
                    ) : (
                      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-destructive">
                          Antes
                        </span>
                        <p className="mt-1 text-sm text-muted-foreground line-through decoration-destructive/40">
                          {suggestion.original || "Sem texto anterior"}
                        </p>
                      </div>
                    )}
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                        {decision.customText ? "Texto editado" : "Sugestão"}
                      </span>
                      {editing ? (
                        <Textarea
                          className="mt-2 min-h-28 bg-background"
                          aria-label={`Editar sugestão ${suggestion.id}`}
                          value={draftText}
                          onChange={(event) => setDraftText(event.target.value)}
                        />
                      ) : (
                        <p className="mt-1 whitespace-pre-wrap text-sm">{effectiveText}</p>
                      )}
                    </div>
                    <div className="text-xs leading-relaxed text-muted-foreground">
                      <p>{suggestion.reason}</p>
                      <p className="mt-1">
                        <strong>Evidência:</strong> {suggestion.evidenceRefs.join("; ")}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      {editing ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingId(null);
                              setDraftText("");
                            }}
                          >
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            disabled={!draftText.trim() || busy || savingId === suggestion.id}
                            onClick={async () => {
                              const saved = await persistDecision(
                                suggestion.id,
                                true,
                                draftText.trim(),
                              );
                              if (saved !== false) {
                                setEditingId(null);
                                setDraftText("");
                              }
                            }}
                          >
                            <CheckCircle2 className="size-4" />
                            {savingId === suggestion.id ? "Aplicando..." : "Aplicar edição"}
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant={decision.accepted === false ? "destructive" : "outline"}
                            size="sm"
                            disabled={busy || savingId === suggestion.id}
                            onClick={() => void persistDecision(suggestion.id, false)}
                          >
                            <XCircle className="size-4" />
                            Rejeitar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy || savingId === suggestion.id}
                            onClick={() => {
                              setEditingId(suggestion.id);
                              setDraftText(effectiveText);
                            }}
                          >
                            <Pencil className="size-4" />
                            Editar
                          </Button>
                          {decision.customText && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy || savingId === suggestion.id}
                              onClick={() => void persistDecision(suggestion.id, true, null)}
                            >
                              <RotateCcw className="size-4" />
                              Restaurar sugestão da IA
                            </Button>
                          )}
                          <Button
                            variant={decision.accepted === true ? "default" : "outline"}
                            size="sm"
                            disabled={busy || savingId === suggestion.id}
                            onClick={() => void persistDecision(suggestion.id, true)}
                          >
                            <CheckCircle2 className="size-4" />
                            Aceitar
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <Empty text="Nenhuma alteração foi sugerida." />
          )}
        </div>
        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lacunas encontradas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {analysis.gaps.length ? (
                analysis.gaps.map((gap, index) => (
                  <Alert key={`${gap}-${index}`} className="space-y-3">
                    <div className="flex gap-2">
                      <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                      <span>{gap}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={!profile.experience.length}
                      onClick={() => setSelectedGap({ gap, index })}
                    >
                      <Sparkles className="size-3.5" />
                      Adicionar ao currículo
                    </Button>
                  </Alert>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhuma lacuna explícita encontrada.
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Competências relevantes</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {analysis.relevantSkills.map((skill) => (
                <Badge variant="secondary" key={skill}>
                  {skill}
                </Badge>
              ))}
            </CardContent>
          </Card>
        </aside>
      </div>
      <div className="flex justify-end">
        <Button disabled={busy} onClick={next}>
          Salvar revisão e visualizar
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <GapFillDialog
        job={job}
        profile={profile}
        selected={selectedGap}
        onOpenChange={(open) => !open && setSelectedGap(null)}
        onConfirmed={onGapConfirmed}
      />
    </div>
  );
}

function GapFillDialog({
  job,
  profile,
  selected,
  onOpenChange,
  onConfirmed,
}: {
  job: Job;
  profile: Profile;
  selected: { gap: string; index: number } | null;
  onOpenChange: (open: boolean) => void;
  onConfirmed: (analysis: Optimization & { score?: number }, decisions: Decision[]) => void;
}) {
  const [dialogStep, setDialogStep] = useState<"select" | "context" | "review">("select");
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
  const [contexts, setContexts] = useState<Record<number, string>>({});
  const [drafts, setDrafts] = useState<Record<number, GapDraft>>({});
  const [proposed, setProposed] = useState<Record<number, string>>({});
  const [working, setWorking] = useState<"draft" | "confirm" | "">("");
  const [dialogError, setDialogError] = useState("");
  useEffect(() => {
    setDialogStep("select");
    setSelectedIndexes([]);
    setContexts({});
    setDrafts({});
    setProposed({});
    setWorking("");
    setDialogError("");
  }, [selected]);
  if (!selected) return null;
  const entries = selectedIndexes.map((experienceIndex) => ({
    experienceIndex,
    context: contexts[experienceIndex] || "",
  }));
  const payload = {
    gap: selected.gap,
    gapIndex: selected.index,
    entries,
  };
  const toggleExperience = (experienceIndex: number) => {
    setDialogError("");
    setSelectedIndexes((current) =>
      current.includes(experienceIndex)
        ? current.filter((index) => index !== experienceIndex)
        : current.length < 3
          ? [...current, experienceIndex]
          : current,
    );
  };
  const removeExperience = (experienceIndex: number) => {
    const nextIndexes = selectedIndexes.filter((index) => index !== experienceIndex);
    setSelectedIndexes(nextIndexes);
    if (!nextIndexes.length) setDialogStep("select");
    setContexts((current) => {
      const next = { ...current };
      delete next[experienceIndex];
      return next;
    });
    setDrafts((current) => {
      const next = { ...current };
      delete next[experienceIndex];
      return next;
    });
    setProposed((current) => {
      const next = { ...current };
      delete next[experienceIndex];
      return next;
    });
  };
  const generateDraft = async () => {
    setWorking("draft");
    setDialogError("");
    try {
      const result = await api<GapBatchDraft>(`/api/jobs/${job.id}/gaps/drafts`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setDrafts(Object.fromEntries(result.items.map((item) => [item.experienceIndex, item])));
      setProposed(
        Object.fromEntries(result.items.map((item) => [item.experienceIndex, item.proposed])),
      );
      setDialogStep("review");
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : "Não foi possível gerar os textos.");
    } finally {
      setWorking("");
    }
  };
  const confirm = async () => {
    if (!selectedIndexes.length || selectedIndexes.some((index) => !drafts[index]?.canAdd)) return;
    setWorking("confirm");
    setDialogError("");
    try {
      const result = await api<{
        analysis: Optimization & { score?: number };
        decisions: Decision[];
      }>(`/api/jobs/${job.id}/gaps/confirm-many`, {
        method: "POST",
        body: JSON.stringify({
          gap: selected.gap,
          gapIndex: selected.index,
          entries: selectedIndexes.map((experienceIndex) => ({
            experienceIndex,
            context: contexts[experienceIndex],
            proposed: proposed[experienceIndex],
            reason: drafts[experienceIndex].reason,
            evidenceRefs: drafts[experienceIndex].evidenceRefs,
          })),
        }),
      });
      onConfirmed(result.analysis, result.decisions);
      toast.success(
        `${selectedIndexes.length} ${selectedIndexes.length === 1 ? "texto adicionado" : "textos adicionados"} ao currículo`,
      );
      onOpenChange(false);
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : "Não foi possível salvar o texto.");
    } finally {
      setWorking("");
    }
  };
  const canGenerate =
    selectedIndexes.length > 0 &&
    selectedIndexes.every((index) => (contexts[index] || "").trim().length >= 30) &&
    !working;
  const canConfirm =
    selectedIndexes.length > 0 &&
    selectedIndexes.every(
      (index) => drafts[index]?.canAdd && (proposed[index] || "").trim().length >= 10,
    ) &&
    !working;
  const hasUnsavedWork =
    selectedIndexes.length > 0 || Object.values(contexts).some((value) => value.trim());
  const requestClose = (open: boolean) => {
    if (
      !open &&
      hasUnsavedWork &&
      !window.confirm("Fechar agora descartará as informações preenchidas. Deseja continuar?")
    )
      return;
    onOpenChange(open);
  };
  const steps = [
    { id: "select", label: "Escolher" },
    { id: "context", label: "Descrever" },
    { id: "review", label: "Revisar" },
  ] as const;
  const currentStepIndex = steps.findIndex((step) => step.id === dialogStep);
  return (
    <Dialog open onOpenChange={requestClose}>
      <DialogContent className="max-w-4xl p-0">
        <div className="border-b px-6 pb-5 pt-6 sm:px-8">
          <DialogTitle className="pr-8 text-xl font-semibold">
            Preencher lacuna em experiências
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm text-muted-foreground">
            Selecione até três experiências e descreva fatos reais específicos de cada uma.
          </DialogDescription>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs text-muted-foreground",
                  index === currentStepIndex && "border-primary/40 bg-primary/5 text-foreground",
                  index < currentStepIndex && "text-foreground",
                )}
              >
                <span
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-bold",
                    index <= currentStepIndex && "bg-primary text-primary-foreground",
                  )}
                >
                  {index < currentStepIndex ? <CheckCircle2 className="size-3" /> : index + 1}
                </span>
                {step.label}
              </div>
            ))}
          </div>
        </div>
        <div className="max-h-[calc(90vh-13rem)] overflow-y-auto px-6 py-5 sm:px-8">
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-sm">
            <strong className="block text-xs uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Lacuna
            </strong>
            <p className="mt-1">{selected.gap}</p>
          </div>
          {dialogStep === "select" && (
            <div className="mt-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Onde você teve essa experiência?</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Escolha somente experiências em que a lacuna possa ser comprovada.
                  </p>
                </div>
                <Badge variant="secondary">{selectedIndexes.length}/3 selecionadas</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {profile.experience.map((experience, index) => {
                  const checked = selectedIndexes.includes(index);
                  const limitReached = selectedIndexes.length >= 3 && !checked;
                  return (
                    <button
                      type="button"
                      aria-pressed={checked}
                      disabled={limitReached}
                      key={`${experience.company}-${index}`}
                      onClick={() => toggleExperience(index)}
                      className={cn(
                        "flex items-start gap-3 rounded-xl border p-4 text-left transition-all hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-45",
                        checked && "border-primary bg-primary/5 ring-2 ring-primary/15",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid size-5 shrink-0 place-items-center rounded border",
                          checked && "border-primary bg-primary text-primary-foreground",
                        )}
                      >
                        {checked && <CheckCircle2 className="size-3.5" />}
                      </span>
                      <span className="min-w-0">
                        <strong className="block truncate text-sm">{experience.title}</strong>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {experience.company} · {experience.period}
                        </span>
                        <span className="mt-2 block text-xs text-muted-foreground">
                          {experience.bullets.length} itens no currículo
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {dialogError && <Alert variant="destructive">{dialogError}</Alert>}
            </div>
          )}
          {dialogStep === "context" && (
            <div className="mt-5 space-y-5">
              <div>
                <h3 className="font-semibold">Descreva o que aconteceu em cada experiência</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Não copie o mesmo texto: informe ações, tecnologias e resultados específicos.
                </p>
              </div>
              {selectedIndexes.map((experienceIndex) => {
                const experience = profile.experience[experienceIndex];
                const value = contexts[experienceIndex] || "";
                return (
                  <div className="space-y-3 rounded-xl border p-4" key={experienceIndex}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <strong className="text-sm">{experience.title}</strong>
                        <p className="text-xs text-muted-foreground">
                          {experience.company} · {experience.period}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeExperience(experienceIndex)}
                      >
                        Remover
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`gap-context-${experienceIndex}`}>
                        O que você realmente fez?
                      </Label>
                      <Textarea
                        id={`gap-context-${experienceIndex}`}
                        value={value}
                        maxLength={2000}
                        onChange={(event) =>
                          setContexts((current) => ({
                            ...current,
                            [experienceIndex]: event.target.value,
                          }))
                        }
                        placeholder="Descreva ações, ferramentas e resultados reais nesta experiência..."
                      />
                      <p
                        className={cn(
                          "text-xs text-muted-foreground",
                          value.trim().length > 0 && value.trim().length < 30 && "text-amber-600",
                        )}
                      >
                        {value.length}/2000 · mínimo de 30 caracteres
                      </p>
                    </div>
                  </div>
                );
              })}
              {dialogError && <Alert variant="destructive">{dialogError}</Alert>}
            </div>
          )}
          {dialogStep === "review" && (
            <div className="mt-5 space-y-5">
              <div>
                <h3 className="font-semibold">Revise cada texto antes de adicionar</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Todos os textos precisam estar válidos para concluir.
                </p>
              </div>
              {selectedIndexes.map((experienceIndex) => {
                const experience = profile.experience[experienceIndex];
                const draft = drafts[experienceIndex];
                if (!draft) return null;
                return (
                  <div
                    className={cn(
                      "space-y-3 rounded-xl border p-4",
                      !draft.canAdd && "border-destructive/35 bg-destructive/5",
                    )}
                    key={experienceIndex}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <strong className="text-sm">{experience.title}</strong>
                        <p className="text-xs text-muted-foreground">{experience.company}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeExperience(experienceIndex)}
                      >
                        Remover
                      </Button>
                    </div>
                    {draft.canAdd ? (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor={`gap-preview-${experienceIndex}`}>
                            Bullet para esta experiência
                          </Label>
                          <Textarea
                            id={`gap-preview-${experienceIndex}`}
                            value={proposed[experienceIndex] || ""}
                            maxLength={600}
                            onChange={(event) =>
                              setProposed((current) => ({
                                ...current,
                                [experienceIndex]: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                          <strong>Por que funciona:</strong> {draft.reason}
                        </div>
                      </>
                    ) : (
                      <Alert variant="destructive">
                        {draft.missingInfo || "Precisamos de mais contexto para esta experiência."}
                      </Alert>
                    )}
                  </div>
                );
              })}
              {selectedIndexes.some((index) => !drafts[index]?.canAdd) && (
                <Alert>
                  Corrija o contexto ou remova as experiências sem evidência suficiente para
                  continuar.
                </Alert>
              )}
              {dialogError && <Alert variant="destructive">{dialogError}</Alert>}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-6 py-4 sm:px-8">
          <Button
            variant="outline"
            disabled={!!working || dialogStep === "select"}
            onClick={() => setDialogStep(dialogStep === "review" ? "context" : "select")}
          >
            Voltar
          </Button>
          {dialogStep === "select" && (
            <Button disabled={!selectedIndexes.length} onClick={() => setDialogStep("context")}>
              Descrever experiências
              <ChevronRight className="size-4" />
            </Button>
          )}
          {dialogStep === "context" && (
            <Button disabled={!canGenerate} onClick={generateDraft}>
              {working === "draft" ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {working === "draft" ? "Redigindo textos..." : "Gerar prévias com IA"}
            </Button>
          )}
          {dialogStep === "review" && (
            <Button disabled={!canConfirm} onClick={confirm}>
              {working === "confirm" ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              {working === "confirm"
                ? "Adicionando..."
                : `Adicionar ${selectedIndexes.length} ${selectedIndexes.length === 1 ? "texto" : "textos"}`}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function GenerateStep({
  job,
  langs,
  setLangs,
  generate,
  files,
  busy,
  startAnotherJob,
  updateProfile,
}: {
  job: Job;
  langs: Array<"ptbr" | "en">;
  setLangs: (l: Array<"ptbr" | "en">) => void;
  generate: () => void;
  files: OutputFile[];
  busy: boolean;
  startAnotherJob: () => void;
  updateProfile: () => void;
}) {
  const toggle = (lang: "ptbr" | "en") =>
    setLangs(langs.includes(lang) ? langs.filter((item) => item !== lang) : [...langs, lang]);
  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex flex-1 flex-wrap gap-4">
            {(
              [
                { id: "ptbr", label: "Português" },
                { id: "en", label: "Inglês" },
              ] as const
            ).map((language) => (
              <Label
                key={language.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-3"
              >
                <Checkbox
                  checked={langs.includes(language.id)}
                  onCheckedChange={() => toggle(language.id)}
                />
                <Languages className="size-4 text-primary" />
                {language.label}
              </Label>
            ))}
            {langs.includes("en") && (
              <span className="self-center text-xs text-muted-foreground">
                Tradução por {job.provider === "claude" ? "Claude" : "Codex"}
              </span>
            )}
          </div>
          <Button disabled={busy || !langs.length} onClick={generate}>
            <Send className="size-4" />
            Gerar arquivos
          </Button>
        </CardContent>
      </Card>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-3">
          <span className="text-sm font-medium">Prévia do currículo</span>
          <Badge variant="outline">{langs[0] === "en" ? "EN" : "PT-BR"}</Badge>
        </div>
        <iframe
          className="h-[720px] w-full bg-white"
          title="Prévia do currículo"
          src={`/api/jobs/${job.id}/preview/${langs[0] || "ptbr"}`}
        />
      </Card>
      {files.length > 0 && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {files.map((file) => (
              <Card key={file.name} className="transition-shadow hover:shadow-md">
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="grid size-11 place-items-center rounded-lg bg-primary/10 text-primary">
                    <FileText className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-sm">{file.name}</strong>
                    <span
                      className={cn(
                        "text-xs text-muted-foreground",
                        file.pages > 2 && "text-amber-600",
                      )}
                    >
                      {file.pages} página(s) · {file.pages > 2 ? "revisar tamanho" : "pronto"}
                    </span>
                  </div>
                  <Button asChild variant="outline" size="icon">
                    <a href={file.url} aria-label={`Baixar ${file.name}`}>
                      <Download className="size-4" />
                    </a>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="border-primary/25 bg-primary/[0.04]">
            <CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-4">
                <div className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                  <CheckCircle2 className="size-5" />
                </div>
                <div>
                  <h2 className="font-semibold">Candidatura pronta para enviar</h2>
                  <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                    Seus arquivos estão prontos e esta candidatura ficou salva no histórico. Para a
                    próxima vaga, você pode reutilizar seu perfil ou atualizá-lo antes.
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row">
                <Button variant="outline" onClick={updateProfile}>
                  <CircleUserRound className="size-4" />
                  Atualizar meu perfil
                </Button>
                <Button onClick={startAnotherJob}>
                  <BriefcaseBusiness className="size-4" />
                  Analisar outra vaga
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
