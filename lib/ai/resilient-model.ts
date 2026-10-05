import { APICallError, wrapLanguageModel } from "ai";

// Wraps a language model so that Gemini rate limits (HTTP 429 / RESOURCE_EXHAUSTED)
// are absorbed instead of surfacing as errors:
//   1. retry the primary model with exponential backoff (up to 3 retries),
//   2. if it is still rate limited, switch to the fallback model (same retries),
//   3. only then give up and let the original error reach the caller.
// The wrapper is itself a language model, so callers (streamText / generateText)
// use it exactly like the model they had before.

type Model = Parameters<typeof wrapLanguageModel>[0]["model"];

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1500; // 1.5s, 3s, 6s (plus jitter) per model

export function isRateLimitError(error: unknown): boolean {
  if (APICallError.isInstance(error) && error.statusCode === 429) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /resource.?exhausted|too many requests|rate.?limit|quota|\b429\b/i.test(
    message
  );
}

// Gemini names the exhausted quota in the error body (e.g.
// "GenerateRequestsPerDayPerProjectPerModel-FreeTier"). A daily quota will not
// recover within seconds, so retrying the same model is pointless.
function isDailyQuota(error: unknown): boolean {
  const body = APICallError.isInstance(error) ? (error.responseBody ?? "") : "";
  const message = error instanceof Error ? error.message : "";
  return /PerDay/i.test(`${body} ${message}`);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true }
    );
  });
}

async function callWithBackoff<T>(
  modelId: string,
  call: () => PromiseLike<T>,
  signal?: AbortSignal
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (error) {
      if (
        !isRateLimitError(error) ||
        isDailyQuota(error) ||
        attempt >= MAX_RETRIES
      ) {
        throw error;
      }
      const delay = BASE_DELAY_MS * 2 ** attempt + Math.random() * 250;
      console.warn(
        `[gemini] ${modelId} rate limited, retry ${attempt + 1}/${MAX_RETRIES} in ${Math.round(delay)}ms`
      );
      await sleep(delay, signal);
    }
  }
}

export function withRateLimitFallback(primary: Model, fallback: Model): Model {
  const warnFallback = (error: unknown) =>
    console.warn(
      `[gemini] ${primary.modelId} still rate limited, falling back to ${fallback.modelId}`,
      error instanceof Error ? error.message : error
    );

  return wrapLanguageModel({
    model: primary,
    middleware: {
      specificationVersion: "v3",
      wrapGenerate: async ({ doGenerate, params }) => {
        try {
          return await callWithBackoff(
            primary.modelId,
            doGenerate,
            params.abortSignal
          );
        } catch (error) {
          if (!isRateLimitError(error)) {
            throw error;
          }
          warnFallback(error);
          return await callWithBackoff(
            fallback.modelId,
            () => fallback.doGenerate(params),
            params.abortSignal
          );
        }
      },
      // A 429 is returned when the request starts, before any text streams, so
      // catching around doStream is enough. A failure part-way through an
      // already-started stream is not retried (the user has partial text).
      wrapStream: async ({ doStream, params }) => {
        try {
          return await callWithBackoff(
            primary.modelId,
            doStream,
            params.abortSignal
          );
        } catch (error) {
          if (!isRateLimitError(error)) {
            throw error;
          }
          warnFallback(error);
          return await callWithBackoff(
            fallback.modelId,
            () => fallback.doStream(params),
            params.abortSignal
          );
        }
      },
    },
  });
}
