import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import type { Recommendation } from "../../types/domain.js";
import { getCandidateRow, mapRecommendation } from "../../repositories/recommendationRepository.js";
import type { RecommendationAdapter, RecommendationInput } from "./recommendationAdapter.js";

const execFileAsync = promisify(execFile);

type MlScore = {
  candidate_id?: number;
  candidateId?: number;
  lightfm_score?: number;
  xgboost_probability?: number;
  intent_bonus?: number;
  mmr_penalty?: number;
  repeat_food_penalty?: number;
  final_score?: number;
  final_rank?: number;
};

type MlOutput = {
  scores?: MlScore[];
  error?: string;
};

function pythonPathEnv() {
  const mlPath = resolve(process.cwd(), "ML");
  return process.env.PYTHONPATH ? `${mlPath}:${process.env.PYTHONPATH}` : mlPath;
}

function mlPythonExecutable() {
  return process.env.ML_PYTHON_PATH ?? "python3";
}

function mlTimeoutMs() {
  return Number(process.env.ML_RECOMMENDER_TIMEOUT_MS ?? 60_000);
}

function remoteMlUrl() {
  const url = process.env.ML_RECOMMENDER_URL?.trim();
  return url ? url.replace(/\/+$/, "") : null;
}

function parseMlOutput(stdout: string): MlOutput {
  const trimmed = stdout.trim();
  if (!trimmed) throw new Error("ML recommender returned empty output.");
  const lastLine = trimmed.split(/\r?\n/).at(-1);
  if (!lastLine) throw new Error("ML recommender returned invalid output.");
  return JSON.parse(lastLine) as MlOutput;
}

function candidateIdFromScore(score: MlScore) {
  return Number(score.candidate_id ?? score.candidateId);
}

function withMlReason(recommendation: Recommendation, score: MlScore): Recommendation {
  const finalScore = Number(score.final_score ?? recommendation.score);
  const lightfmScore = Number(score.lightfm_score ?? 0.5);
  const xgboostProbability = Number(score.xgboost_probability ?? 0.5);
  const intentBonus = Number(score.intent_bonus ?? 0);
  const mmrPenalty = Number(score.mmr_penalty ?? 0);
  const repeatFoodPenalty = Number(score.repeat_food_penalty ?? 0);
  return {
    ...recommendation,
    score: Math.round(finalScore * 1000) / 1000,
    reason: "MILP로 조건에 맞는 후보를 만들고 LightFM, XGBoost, MMR 점수를 합산했습니다.",
    goalFit: `${recommendation.totalCaloriesKcal}kcal · ${recommendation.totalPriceKrw.toLocaleString("ko-KR")}원 후보입니다.`,
    scoreBreakdown: [
      `LightFM ${lightfmScore.toFixed(4)}`,
      `XGBoost ${xgboostProbability.toFixed(4)}`,
      `Intent ${intentBonus.toFixed(4)}`,
      `MMR penalty ${mmrPenalty.toFixed(4)}`,
      `Repeat food penalty ${repeatFoodPenalty.toFixed(4)}`,
    ],
  };
}

async function hydrateMlOutput(output: MlOutput, stderr = "") {
  if (output.error) throw new Error(output.error);
  const scores = [...(output.scores ?? [])].sort((a, b) => Number(a.final_rank ?? 9999) - Number(b.final_rank ?? 9999));
  if (scores.length === 0) {
    throw new Error(stderr.trim() || "ML recommender returned no candidates.");
  }

  const recommendations = (
    await Promise.all(
      scores.map(async (score) => {
        const candidateId = candidateIdFromScore(score);
        if (!candidateId) return null;
        const row = await getCandidateRow(candidateId);
        if (!row) return null;
        return withMlReason(await mapRecommendation(row), score);
      }),
    )
  ).filter((recommendation): recommendation is Recommendation => Boolean(recommendation));

  if (recommendations.length === 0) {
    throw new Error("ML recommender persisted scores but no readable meal candidates were found.");
  }

  return recommendations;
}

async function runRemoteMlRecommendationRun(input: { runId: number; limit: number; url: string }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), mlTimeoutMs());

  try {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (process.env.ML_RECOMMENDER_TOKEN) headers.set("Authorization", `Bearer ${process.env.ML_RECOMMENDER_TOKEN}`);

    const response = await fetch(`${input.url}/recommend`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        runId: input.runId,
        limit: input.limit,
        skipModels: process.env.ML_RECOMMENDER_SKIP_MODELS === "true",
      }),
      signal: controller.signal,
    });

    const text = await response.text();
    let output: MlOutput;
    try {
      output = JSON.parse(text) as MlOutput;
    } catch {
      throw new Error(`ML service returned non-JSON response (${response.status}): ${text.slice(0, 300)}`);
    }

    if (!response.ok) {
      const detail = (output as MlOutput & { detail?: string }).detail;
      throw new Error(detail || output.error || `ML service request failed with status ${response.status}.`);
    }

    return hydrateMlOutput(output);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`ML service request timed out after ${mlTimeoutMs()}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function runLocalMlRecommendationRun(input: { runId: number; limit: number }) {
  const args = [
    "-m",
    "ecobi_recommender",
    "--run-id",
    String(input.runId),
    "--limit",
    String(input.limit),
    "--persist",
  ];
  if (process.env.ML_RECOMMENDER_SKIP_MODELS === "true") {
    args.push("--skip-models");
  }

  const { stdout, stderr } = await execFileAsync(mlPythonExecutable(), args, {
    cwd: process.cwd(),
    timeout: mlTimeoutMs(),
    env: {
      ...process.env,
      PYTHONPATH: pythonPathEnv(),
    },
    maxBuffer: 1024 * 1024 * 8,
  });

  const output = parseMlOutput(stdout);
  return hydrateMlOutput(output, stderr);
}

export async function runMlRecommendationRun(input: { runId: number; limit: number }) {
  const url = remoteMlUrl();
  if (url) return runRemoteMlRecommendationRun({ ...input, url });
  return runLocalMlRecommendationRun(input);
}

export const mlRecommendationAdapter: RecommendationAdapter = {
  async recommend(input: RecommendationInput) {
    return { recommendations: await runMlRecommendationRun({ runId: input.runId, limit: input.limit }), persistedCandidates: true };
  },
};
