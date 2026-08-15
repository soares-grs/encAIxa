import type { Decision, JobWorkflow, Optimization } from "./schemas.js";

export type ReviewBaseline = NonNullable<JobWorkflow["reviewBaseline"]>;

export function requirementScore(requirements: Optimization["requirements"]) {
  const maximum = requirements.reduce(
    (total, requirement) => total + (requirement.kind === "required" ? 2 : 1),
    0,
  );
  const matched = requirements.reduce(
    (total, requirement) =>
      total + (requirement.matched ? (requirement.kind === "required" ? 2 : 1) : 0),
    0,
  );
  return maximum ? Math.round((matched / maximum) * 100) : 0;
}

export function makeReviewBaseline(analysis: Optimization): ReviewBaseline {
  return {
    score: requirementScore(analysis.requirements),
    initialGapCount: analysis.gaps.length,
    suggestionIds: analysis.suggestions
      .filter((suggestion) => !suggestion.id.startsWith("gap-"))
      .map((suggestion) => suggestion.id),
  };
}

export function calculateAdherence(
  analysis: Optimization,
  decisions: Decision[] = [],
  savedBaseline?: ReviewBaseline,
) {
  const baseline = savedBaseline || makeReviewBaseline(analysis);
  const remaining = 100 - baseline.score;
  const resolvedGaps = Math.max(
    0,
    Math.min(baseline.initialGapCount, baseline.initialGapCount - analysis.gaps.length),
  );
  const gapProgress = baseline.initialGapCount ? resolvedGaps / baseline.initialGapCount : 0;
  const accepted = new Set(
    decisions.filter((decision) => decision.accepted).map((decision) => decision.suggestionId),
  );
  const acceptedSuggestions = baseline.suggestionIds.filter((id) => accepted.has(id)).length;
  const suggestionProgress = baseline.suggestionIds.length
    ? acceptedSuggestions / baseline.suggestionIds.length
    : 0;
  const score = Math.min(
    100,
    baseline.score + Math.round(remaining * (gapProgress * 0.9 + suggestionProgress * 0.1)),
  );
  return {
    score,
    baselineScore: baseline.score,
    gain: score - baseline.score,
    resolvedGaps,
    initialGapCount: baseline.initialGapCount,
    acceptedSuggestions,
    initialSuggestionCount: baseline.suggestionIds.length,
  };
}
