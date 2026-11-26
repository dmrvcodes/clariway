export type AIServiceErrorCode =
  | "PROJECT_ACCESS_DENIED"
  | "RATE_LIMITED"
  | "REQUEST_FAILED";

export class AIServiceError extends Error {
  override readonly name = "AIServiceError";
  readonly code: AIServiceErrorCode;

  constructor(
    code: AIServiceErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.code = code;
  }
}

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Cloud AI request failed.";

/** Converts Firebase/Gemini transport failures into stable, actionable UI errors. */
export const normalizeAIServiceError = (error: unknown): AIServiceError => {
  if (error instanceof AIServiceError) return error;

  const message = toErrorMessage(error);
  if (/free tier is not available for this project|project-unavailable/iu.test(message)) {
    return new AIServiceError(
      "PROJECT_ACCESS_DENIED",
      "This Firebase project does not currently have Gemini API access. Use an authorized project with free-tier or hackathon quota access, then retry.",
      { cause: error },
    );
  }

  if (/\[429\]|resource[_ -]?exhausted|quota|rate limit/iu.test(message)) {
    return new AIServiceError(
      "RATE_LIMITED",
      "Cloud AI is temporarily rate-limited. Wait a moment, then retry.",
      { cause: error },
    );
  }

  return new AIServiceError("REQUEST_FAILED", message, { cause: error });
};
