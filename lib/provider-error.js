export function providerError(provider, response, result, fallback) {
  const description = result?.error?.message || result?.error_description || result?.message || fallback;
  const error = new Error(`${provider} ${String(description || `request failed (${response.status})`).slice(0, 230)}`);
  error.status = response.status;
  error.retryable = response.status === 429 || response.status >= 500;
  return error;
}
