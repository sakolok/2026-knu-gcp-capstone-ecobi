import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type TokenCache = {
  accessToken: string;
  expiresAt: number;
};

type GeminiPart = {
  text?: string;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
};

let tokenCache: TokenCache | null = null;

function vertexProjectId() {
  return process.env.VERTEX_AI_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCP_PROJECT ?? process.env.GCLOUD_PROJECT ?? "";
}

function vertexLocation() {
  return process.env.VERTEX_AI_LOCATION ?? process.env.GOOGLE_CLOUD_LOCATION ?? "asia-northeast3";
}

function vertexModel() {
  return process.env.VERTEX_AI_GEMINI_MODEL ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
}

function thinkingBudget() {
  return Number(process.env.VERTEX_AI_THINKING_BUDGET ?? 0);
}

export function isGeminiConfigured() {
  return process.env.VERTEX_AI_DISABLED !== "true" && Boolean(vertexProjectId());
}

async function fetchWithTimeout(input: string, init: RequestInit = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getMetadataAccessToken() {
  const response = await fetchWithTimeout(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    { headers: { "Metadata-Flavor": "Google" } },
    3000,
  );
  if (!response.ok) throw new Error(`metadata token request failed: ${response.status}`);
  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!payload.access_token) throw new Error("metadata token response did not include access_token");
  return {
    accessToken: payload.access_token,
    expiresAt: Date.now() + Math.max(60, (payload.expires_in ?? 300) - 60) * 1000,
  };
}

async function getGcloudAccessToken() {
  const { stdout } = await execFileAsync("gcloud", ["auth", "application-default", "print-access-token"], { timeout: 5000 });
  const accessToken = stdout.trim();
  if (!accessToken) throw new Error("gcloud did not return an access token");
  return {
    accessToken,
    expiresAt: Date.now() + 50 * 60 * 1000,
  };
}

async function getAccessToken() {
  if (process.env.VERTEX_AI_ACCESS_TOKEN) return process.env.VERTEX_AI_ACCESS_TOKEN;
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.accessToken;

  try {
    tokenCache = await getMetadataAccessToken();
  } catch {
    tokenCache = await getGcloudAccessToken();
  }
  return tokenCache.accessToken;
}

function parseJsonText<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (fenced) return JSON.parse(fenced) as T;
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first >= 0 && last > first) return JSON.parse(text.slice(first, last + 1)) as T;
    throw new Error("Gemini response was not valid JSON.");
  }
}

export async function generateGeminiJson<T>(input: {
  systemInstruction: string;
  prompt: string;
  responseSchema?: Record<string, unknown>;
  maxOutputTokens?: number;
  temperature?: number;
}) {
  if (!isGeminiConfigured()) throw new Error("Vertex AI Gemini is not configured.");

  const projectId = vertexProjectId();
  const location = vertexLocation();
  const model = vertexModel();
  const timeoutMs = Number(process.env.VERTEX_AI_TIMEOUT_MS ?? 18000);
  const accessToken = await getAccessToken();
  const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;
  const response = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: input.systemInstruction }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: input.prompt }],
          },
        ],
        generationConfig: {
          temperature: input.temperature ?? 0.25,
          maxOutputTokens: input.maxOutputTokens ?? 900,
          thinkingConfig: {
            thinkingBudget: thinkingBudget(),
          },
          responseMimeType: "application/json",
          ...(input.responseSchema ? { responseSchema: input.responseSchema } : {}),
        },
      }),
    },
    timeoutMs,
  );

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`Gemini request failed: ${response.status} ${message.slice(0, 240)}`);
  }

  const payload = (await response.json()) as GeminiResponse;
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
  if (!text) throw new Error("Gemini response was empty.");
  return parseJsonText<T>(text);
}
