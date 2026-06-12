type DispatchInput = {
  runId: number;
  limit: number;
};

type DispatchResult = {
  dispatcher: "cloud_tasks" | "in_process";
};

type FallbackRunner = () => Promise<void>;

function cloudTasksQueueName() {
  const explicit = process.env.CLOUD_TASKS_QUEUE_NAME?.trim();
  if (explicit) return explicit;

  const projectId = process.env.CLOUD_TASKS_PROJECT_ID?.trim() || process.env.GCP_PROJECT_ID?.trim() || process.env.GOOGLE_CLOUD_PROJECT?.trim();
  const location = process.env.CLOUD_TASKS_LOCATION?.trim();
  const queue = process.env.CLOUD_TASKS_QUEUE?.trim();
  if (!projectId || !location || !queue) return null;
  return `projects/${projectId}/locations/${location}/queues/${queue}`;
}

function mlRecommendUrl() {
  const baseUrl = process.env.ML_RECOMMENDER_URL?.trim();
  return baseUrl ? `${baseUrl.replace(/\/+$/, "")}/recommend` : null;
}

async function metadataAccessToken() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", {
      headers: { "Metadata-Flavor": "Google" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { access_token?: string };
    return payload.access_token ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function enqueueCloudTask(input: DispatchInput, queueName: string, url: string) {
  const accessToken = await metadataAccessToken();
  if (!accessToken) {
    throw new Error("Cloud Tasks enqueue requires a Google metadata access token.");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (process.env.ML_RECOMMENDER_TOKEN) {
    headers.Authorization = `Bearer ${process.env.ML_RECOMMENDER_TOKEN}`;
  }

  const response = await fetch(`https://cloudtasks.googleapis.com/v2/${queueName}/tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      task: {
        dispatchDeadline: "600s",
        httpRequest: {
          httpMethod: "POST",
          url,
          headers,
          body: Buffer.from(
            JSON.stringify({
              runId: input.runId,
              limit: input.limit,
              skipModels: process.env.ML_RECOMMENDER_SKIP_MODELS === "true",
            }),
          ).toString("base64"),
        },
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Cloud Tasks enqueue failed (${response.status}): ${text.slice(0, 500)}`);
  }
}

export async function dispatchRecommendationJob(input: DispatchInput, fallbackRunner: FallbackRunner): Promise<DispatchResult> {
  const queueName = cloudTasksQueueName();
  const url = mlRecommendUrl();

  if (queueName && url) {
    await enqueueCloudTask(input, queueName, url);
    return { dispatcher: "cloud_tasks" };
  }

  setImmediate(() => {
    void fallbackRunner().catch((error) => {
      console.error("[recommendation_job_fallback_error]", error);
    });
  });
  return { dispatcher: "in_process" };
}
