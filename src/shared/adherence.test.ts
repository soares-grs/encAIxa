import { describe, expect, it } from "vitest";
import { calculateAdherence, makeReviewBaseline } from "./adherence";
import type { Optimization } from "./schemas";

const initial: Optimization = {
  role: "Dev",
  company: "Acme",
  requirements: [
    { id: "r1", text: "TypeScript", kind: "required", matched: true, evidence: ["skills"] },
    { id: "r2", text: "CI/CD", kind: "required", matched: false, evidence: [] },
    { id: "r3", text: "Cloud", kind: "preferred", matched: false, evidence: [] },
  ],
  relevantSkills: ["TypeScript"],
  gaps: ["CI/CD", "Cloud"],
  suggestions: [
    {
      id: "s1",
      type: "summary",
      target: "summary",
      original: "A",
      proposed: "B",
      reason: "R",
      evidenceRefs: ["summary"],
    },
    {
      id: "s2",
      type: "skills",
      target: "skills",
      original: "",
      proposed: "TypeScript",
      reason: "R",
      evidenceRefs: ["skills"],
    },
  ],
};

describe("aderência dinâmica", () => {
  it("pondera lacunas em 90% e sugestões em 10% do ganho possível", () => {
    const baseline = makeReviewBaseline(initial);
    expect(baseline.score).toBe(40);
    const halfway = calculateAdherence(
      { ...initial, gaps: ["Cloud"] },
      [{ suggestionId: "s1", accepted: true }],
      baseline,
    );
    expect(halfway).toMatchObject({ score: 70, gain: 30, resolvedGaps: 1, acceptedSuggestions: 1 });
  });

  it("não pontua novamente sugestões criadas ao preencher lacunas", () => {
    const baseline = makeReviewBaseline(initial);
    const completed = calculateAdherence(
      {
        ...initial,
        gaps: [],
        suggestions: [
          ...initial.suggestions,
          {
            id: "gap-1",
            type: "bullet",
            target: "experience.0.bullets.append",
            original: "",
            proposed: "CI/CD",
            reason: "R",
            evidenceRefs: ["context"],
          },
        ],
      },
      [
        { suggestionId: "s1", accepted: true },
        { suggestionId: "s2", accepted: true },
        { suggestionId: "gap-1", accepted: true },
      ],
      baseline,
    );
    expect(completed.score).toBe(100);
    expect(completed.acceptedSuggestions).toBe(2);
  });

  it("reduz a nota quando uma sugestão original volta a ser rejeitada", () => {
    const baseline = makeReviewBaseline(initial);
    const accepted = calculateAdherence(
      initial,
      [{ suggestionId: "s1", accepted: true }],
      baseline,
    );
    const rejected = calculateAdherence(
      initial,
      [{ suggestionId: "s1", accepted: false }],
      baseline,
    );
    expect(accepted.score).toBeGreaterThan(rejected.score);
    expect(rejected.score).toBe(baseline.score);
  });
});
