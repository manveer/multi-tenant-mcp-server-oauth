export class PublicError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(body, { status, headers: {
    "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", ...headers,
  } });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof PublicError) {
    return json({ error: { code: error.code, message: error.message } }, error.status);
  }
  // Do not send Clerk/Arcade responses, tokens, stack traces, or request bodies.
  return json({ error: { code: "SERVICE_UNAVAILABLE", message: "The request could not be completed. Try again later." } }, 503);
}

export async function readBoundedJson(response: Request | Response, limit = 16_384): Promise<unknown> {
  if (!response.body) throw new PublicError(400, "INVALID_INPUT", "A JSON body is required.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new PublicError(413, "PAYLOAD_TOO_LARGE", "The request is too large.");
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof PublicError) throw error;
    throw new PublicError(400, "INVALID_INPUT", "A valid JSON body is required.");
  } finally { reader.releaseLock(); }
}
