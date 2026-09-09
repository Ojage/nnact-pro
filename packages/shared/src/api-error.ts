interface ApiErrorBody {
  message?: string;
  error?: string;
  statusCode?: number;
}

export function apiErrorMessage(status: number, body: string): string {
  const text = body.replace(/^\d+:\s*/, "").trim();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  if (parsed && typeof parsed === "object") {
    const message = (parsed as ApiErrorBody).message;
    if (typeof message === "string" && message.trim()) return message.trim();
    const error = (parsed as ApiErrorBody).error;
    if (typeof error === "string" && error.trim()) return error.trim();
    return statusFallback(status);
  }
  if (text) return text;
  return statusFallback(status);
}

function statusFallback(status: number): string {
  if (status === 400) return "The request was not valid. Please check your input and try again.";
  if (status === 401) return "Your sign-in is no longer valid. Please sign in again.";
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "That item could not be found. It may have been removed.";
  if (status === 409) return "This conflicts with existing data. Please refresh and try again.";
  if (status === 422) return "Some of the details you entered are invalid. Please review them and try again.";
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  if (status >= 500) return "The server hit an unexpected error. Please try again in a moment.";
  return "The request failed. Please try again.";
}