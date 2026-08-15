import { useEffect, useState, type ReactNode } from "react";
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
  LoaderCircle,
  Menu,
  Moon,
  Plus,
  RotateCcw,
  SearchCheck,
  Send,
  Sparkles,
  Sun,
  ShieldCheck,
  Trash2,
  Upload,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import type {
  AnalysisProgressEvent,
  AnalysisStage,
  Decision,
  Optimization,
  Profile,
} from "../shared/schemas";
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

type Job = {
  id: string;
  company: string;
  role: string;
  text: string;
  analysis?: Optimization;
  decisions?: Decision[];
  createdAt?: string;
  provider?: ProviderId;
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
const emptyProviderStatus: ProviderStatus = {
  installed: false,
  authenticated: false,
  loginRunning: false,
  loginOutput: "",
  version: "",
};
type OutputFile = { name: string; url: string; pages: number; lang: string };
export type AnalysisRun = { event: AnalysisProgressEvent; startedAt: number; error?: string };
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
  const [decisions, setDecisions] = useState<Record<string, boolean>>({});
  const [statuses, setStatuses] = useState<ProviderStatuses>({
    codex: emptyProviderStatus,
    claude: emptyProviderStatus,
  });
  const [provider, setProvider] = useState<ProviderId>("codex");
  const [history, setHistory] = useState<Job[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [files, setFiles] = useState<OutputFile[]>([]);
  const [langs, setLangs] = useState<string[]>(["ptbr"]);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [analysisRun, setAnalysisRun] = useState<AnalysisRun | null>(null);
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
  const work = async (label: string, success: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError("");
    try {
      await fn();
      if (success) toast.success(success);
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
  const importFile = (file: File) =>
    work("Extraindo arquivo...", "Descrição importada", async () => {
      const form = new FormData();
      form.append("file", file);
      const data = await api<{ text: string }>("/api/import", { method: "POST", body: form });
      setJob((j) => ({ ...j, text: data.text }));
    });
  const saveJob = () =>
    work("Salvando vaga...", "Vaga salva", async () => {
      const saved = await api<Job>("/api/jobs", { method: "POST", body: JSON.stringify(job) });
      setJob(saved);
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
    setAnalysisRun({ event: latest, startedAt: Date.now() });
    try {
      const result = await streamAnalysis(job.id, provider, (event) => {
        latest = event;
        setAnalysisRun((current) => ({
          event,
          startedAt: current?.startedAt || Date.now(),
        }));
      });
      setJob((current) => ({ ...current, provider }));
      setAnalysis(result);
      setDecisions(Object.fromEntries(result.suggestions.map((s) => [s.id, false])));
      setAnalysisRun(null);
      setStep(3);
      toast.success("Análise concluída");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "A análise não foi concluída.";
      setAnalysisRun((current) => ({
        event: current?.event || latest,
        startedAt: current?.startedAt || Date.now(),
        error: message,
      }));
      toast.error(message);
    }
  };
  const saveReview = () =>
    work("Salvando revisão...", "Revisão salva", async () => {
      const list = Object.entries(decisions).map(([suggestionId, accepted]) => ({
        suggestionId,
        accepted,
      }));
      await api(`/api/jobs/${job.id}/decisions`, { method: "PUT", body: JSON.stringify(list) });
      setStep(4);
    });
  const generate = () =>
    work("Gerando PDFs...", "Arquivos gerados", async () => {
      const out = await api<{ files: OutputFile[] }>(`/api/jobs/${job.id}/generate`, {
        method: "POST",
        body: JSON.stringify({ languages: langs }),
      });
      setFiles(out.files);
    });
  const startNextApplication = (target: "profile" | "job") => {
    setJob({ id: "", company: "", role: "", text: "" });
    setAnalysis(null);
    setDecisions({});
    setFiles([]);
    setLangs(["ptbr"]);
    setAnalysisRun(null);
    setError("");
    setStep(target === "profile" ? 0 : 1);
  };
  const openHistory = (id: string) =>
    work("Abrindo candidatura...", "", async () => {
      const saved = await api<Job>(`/api/jobs/${id}`);
      setJob(saved);
      setProvider(saved.provider || "codex");
      setAnalysis(saved.analysis ? { ...saved.analysis } : null);
      setDecisions(
        Object.fromEntries((saved.decisions || []).map((d) => [d.suggestionId, d.accepted])),
      );
      setFiles([]);
      setStep(saved.analysis ? 3 : 2);
    });
  const login = (selectedProvider: ProviderId) =>
    work("Iniciando login...", "", async () => {
      await api(`/api/providers/${selectedProvider}/login`, { method: "POST" });
      setStatuses(await api<ProviderStatuses>("/api/providers/status"));
    });
  const content =
    step === 0 ? (
      <ProfileStep profile={profile} setProfile={setProfile} onSave={saveProfile} busy={!!busy} />
    ) : step === 1 ? (
      <JobStep job={job} setJob={setJob} onFile={importFile} onSave={saveJob} busy={!!busy} />
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
        analysis={analysis}
        decisions={decisions}
        setDecisions={setDecisions}
        next={saveReview}
        busy={!!busy}
      />
    ) : (
      <GenerateStep
        job={job}
        langs={langs}
        setLangs={setLangs}
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
        />
      </aside>
      <div className="min-w-0">
        <MobileHeader
          step={step}
          setStep={setStep}
          history={history}
          openHistory={openHistory}
          statuses={statuses}
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
}: {
  step: number;
  setStep: (n: number) => void;
  history: Job[];
  openHistory: (id: string) => void;
  statuses: ProviderStatuses;
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
            disabled={index > step}
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
                onClick={() => openHistory(item.id)}
                className="h-auto w-full justify-start px-3 py-2 text-left"
              >
                <span className="min-w-0">
                  <strong className="block truncate text-sm">{item.role}</strong>
                  <small className="block truncate font-normal text-muted-foreground">
                    {item.company}
                  </small>
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
  onFile,
  onSave,
  busy,
}: {
  job: Job;
  setJob: (job: Job) => void;
  onFile: (file: File) => void;
  onSave: () => void;
  busy: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <SectionTitle
          icon={BriefcaseBusiness}
          title="Dados da oportunidade"
          description="Importe ou cole a descrição completa para uma análise melhor."
        />
      </CardHeader>
      <CardContent className="space-y-6">
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
        <Label className="relative flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-muted/30 p-6 text-center transition-colors hover:border-primary hover:bg-primary/5">
          <Input
            className="absolute inset-0 h-full cursor-pointer opacity-0"
            type="file"
            accept=".docx,.pdf,.txt,.md"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          <span className="mb-3 grid size-11 place-items-center rounded-full bg-primary/10 text-primary">
            <Upload className="size-5" />
          </span>
          <strong>Importar descrição da vaga</strong>
          <span className="mt-1 text-xs font-normal text-muted-foreground">
            DOCX, PDF, TXT ou Markdown · até 10 MB
          </span>
        </Label>
        <Field
          area
          label="Ou cole a descrição completa"
          value={job.text}
          onChange={(v) => setJob({ ...job, text: v })}
          placeholder="Responsabilidades, requisitos e diferenciais..."
        />
      </CardContent>
      <CardFooter className="justify-end">
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
  const providerInfo = {
    codex: { label: "Codex", company: "OpenAI", install: "npm install -g @openai/codex" },
    claude: {
      label: "Claude",
      company: "Anthropic",
      install: "npm install -g @anthropic-ai/claude-code",
    },
  } as const;
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
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - run.startedAt) / 1000));
  const [tip, setTip] = useState(0);
  useEffect(() => {
    if (run.error) return;
    const elapsedTimer = setInterval(
      () => setElapsed(Math.floor((Date.now() - run.startedAt) / 1000)),
      1000,
    );
    const tipTimer = setInterval(
      () => setTip((current) => (current + 1) % analysisTips.length),
      6000,
    );
    return () => {
      clearInterval(elapsedTimer);
      clearInterval(tipTimer);
    };
  }, [run.error, run.startedAt]);
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
        <Progress
          value={run.event.progress}
          aria-label="Progresso da análise"
          className="mt-7 h-2.5"
        />
        <p className="mt-2 text-right text-[11px] text-muted-foreground">
          Progresso baseado nas etapas concluídas
        </p>
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

function ReviewStep({
  analysis,
  decisions,
  setDecisions,
  next,
  busy,
}: {
  analysis: Optimization & { score?: number };
  decisions: Record<string, boolean>;
  setDecisions: (d: Record<string, boolean>) => void;
  next: () => void;
  busy: boolean;
}) {
  const matched = analysis.requirements.filter((r) => r.matched).length;
  const score = analysis.score ?? 0;
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
              Baseada somente nas evidências encontradas no seu perfil.
            </p>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)]">
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Sugestões do encAIxa</h2>
          {analysis.suggestions.length ? (
            analysis.suggestions.map((suggestion) => (
              <Card key={suggestion.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <Badge>{suggestion.type}</Badge>
                    <span className="text-xs text-muted-foreground">{suggestion.target}</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-destructive">
                      Antes
                    </span>
                    <p className="mt-1 text-sm text-muted-foreground line-through decoration-destructive/40">
                      {suggestion.original || "Sem texto anterior"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                      Sugestão
                    </span>
                    <p className="mt-1 text-sm">{suggestion.proposed}</p>
                  </div>
                  <div className="text-xs leading-relaxed text-muted-foreground">
                    <p>{suggestion.reason}</p>
                    <p className="mt-1">
                      <strong>Evidência:</strong> {suggestion.evidenceRefs.join("; ")}
                    </p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant={decisions[suggestion.id] === false ? "destructive" : "outline"}
                      size="sm"
                      onClick={() => setDecisions({ ...decisions, [suggestion.id]: false })}
                    >
                      <XCircle className="size-4" />
                      Rejeitar
                    </Button>
                    <Button
                      variant={decisions[suggestion.id] === true ? "default" : "outline"}
                      size="sm"
                      onClick={() => setDecisions({ ...decisions, [suggestion.id]: true })}
                    >
                      <CheckCircle2 className="size-4" />
                      Aceitar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
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
                analysis.gaps.map((gap) => (
                  <Alert key={gap} className="flex gap-2">
                    <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                    <span>{gap}</span>
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
    </div>
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
  langs: string[];
  setLangs: (l: string[]) => void;
  generate: () => void;
  files: OutputFile[];
  busy: boolean;
  startAnotherJob: () => void;
  updateProfile: () => void;
}) {
  const toggle = (lang: string) =>
    setLangs(langs.includes(lang) ? langs.filter((item) => item !== lang) : [...langs, lang]);
  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex flex-1 flex-wrap gap-4">
            {[
              { id: "ptbr", label: "Português" },
              { id: "en", label: "Inglês" },
            ].map((language) => (
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
