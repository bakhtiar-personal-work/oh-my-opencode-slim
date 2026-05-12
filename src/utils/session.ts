/**
 * Shared session utilities for background managers.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PluginInput } from '@opencode-ai/plugin';

type OpencodeClient = PluginInput['client'];

type SessionPromptBody = NonNullable<
  Parameters<OpencodeClient['session']['prompt']>[0]['body']
>;

/** Multimodal / text parts accepted by `session.prompt` */
export type PromptBodyPart = SessionPromptBody['parts'][number];

/** Prompt body including optional variant (supported by the host at runtime). */
export type PromptBody = SessionPromptBody & { variant?: string };

/**
 * Extract the short model label from a "provider/model" string.
 * E.g. "openai/gpt-5.4-mini" → "gpt-5.4-mini"
 */
export function shortModelLabel(model: string): string {
  return model.split('/').pop() ?? model;
}

/**
 * Parse a model reference string into provider and model IDs.
 * @param model - Model string in format "provider/model"
 * @returns Object with providerID and modelID, or null if invalid
 */
export function parseModelReference(
  model: string,
): { providerID: string; modelID: string } | null {
  const slashIndex = model.indexOf('/');
  if (slashIndex <= 0 || slashIndex >= model.length - 1) {
    return null;
  }
  return {
    providerID: model.slice(0, slashIndex),
    modelID: model.slice(slashIndex + 1),
  };
}

/**
 * OpenCode stores pasted / attached screenshots as {@link FilePart} (`type: "file"`,
 * `mime` starting with `image/`), not as `type: "image"`. Some stacks still emit
 * legacy `image` parts — accept both.
 *
 * @see https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/session/message-v2.ts
 */
export function isForwardableImagePart(part: Record<string, unknown>): boolean {
  const t = part.type;
  if (t === 'image') {
    return true;
  }
  if (t === 'file') {
    const mimeRaw = part.mime;
    const mime =
      typeof mimeRaw === 'string' ? mimeRaw.toLowerCase().trim() : '';
    if (mime.startsWith('image/')) {
      return true;
    }
    const fn = part.filename;
    if (
      typeof fn === 'string' &&
      /\.(png|jpe?g|gif|webp|bmp|heic|avif)$/i.test(fn)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Non-text parts (e.g. images) from the latest user message in a session.
 * Used when forwarding multimodal context to delegated agents such as @frame.
 */
export async function extractLatestUserImageParts(
  client: OpencodeClient,
  sessionId: string,
  directory: string,
): Promise<PromptBodyPart[]> {
  const messagesResult = await client.session.messages({
    path: { id: sessionId },
    query: { directory },
  });
  const messages = (messagesResult.data ?? []) as Array<{
    info?: { role?: string };
    parts?: Array<Record<string, unknown>>;
  }>;
  const userMessages = messages.filter((m) => m.info?.role === 'user');
  const lastUser = userMessages[userMessages.length - 1];
  if (!lastUser?.parts?.length) {
    return [];
  }
  return lastUser.parts.filter(isForwardableImagePart) as PromptBodyPart[];
}

function fileUrlFromSource(
  source: unknown,
  workspaceDirectory: string | undefined,
): string | undefined {
  if (!source || typeof source !== 'object') return undefined;
  const s = source as Record<string, unknown>;
  if (s.type !== 'file') return undefined;
  const filePath = s.path;
  if (typeof filePath !== 'string' || !filePath.trim()) return undefined;
  try {
    const resolved = path.isAbsolute(filePath)
      ? filePath
      : workspaceDirectory
        ? path.resolve(workspaceDirectory, filePath)
        : filePath;
    return pathToFileURL(resolved).href;
  } catch {
    return undefined;
  }
}

/**
 * Stored {@link FilePart} rows include `sessionID` / `messageID` / etc. Child
 * `session.prompt` expects {@link FilePartInput}-shaped drafts (`type`, `mime`,
 * `url`, optional `filename`). Some attachments omit `url` but provide
 * `source.path` — resolve that to a `file:` URL when possible.
 */
export function normalizeImagePartsForChildPrompt(
  parts: PromptBodyPart[],
  workspaceDirectory?: string,
): PromptBodyPart[] {
  const out: PromptBodyPart[] = [];

  for (const part of parts) {
    const p = part as Record<string, unknown>;

    if (p.type === 'file' && isForwardableImagePart(p)) {
      let url = typeof p.url === 'string' && p.url.length > 0 ? p.url : '';
      const mimeRaw =
        typeof p.mime === 'string'
          ? p.mime
          : typeof p.mediaType === 'string'
            ? (p.mediaType as string)
            : 'application/octet-stream';

      const filename = typeof p.filename === 'string' ? p.filename : undefined;

      if (!url) {
        url = fileUrlFromSource(p.source, workspaceDirectory) ?? '';
      }
      if (!url) continue;

      const draft: Record<string, unknown> = {
        type: 'file',
        mime: mimeRaw,
        url,
      };
      if (filename) draft.filename = filename;
      out.push(draft as PromptBodyPart);
      continue;
    }

    if (p.type === 'image') {
      const raw = p.image ?? p.data ?? p.url;
      const imageStr = typeof raw === 'string' ? raw : '';

      if (imageStr.startsWith('data:')) {
        const mimeMatch = imageStr.match(/^data:([^;]+);/);
        const mime = mimeMatch?.[1] ?? 'image/png';
        out.push({ type: 'file', mime, url: imageStr } as PromptBodyPart);
      } else if (/^https?:\/\//i.test(imageStr)) {
        out.push({
          type: 'file',
          mime: 'image/png',
          url: imageStr,
        } as PromptBodyPart);
      }
    }
  }

  return out;
}

/**
 * Send a prompt to a session with optional timeout.
 * If timeout is exceeded, the session is aborted and an error is thrown.
 * @param client - OpenCode client instance
 * @param args - Arguments for session.prompt()
 * @param timeoutMs - Timeout in milliseconds (0 = no timeout)
 * @throws Error if timeout is exceeded
 */
export async function promptWithTimeout(
  client: OpencodeClient,
  args: Parameters<OpencodeClient['session']['prompt']>[0],
  timeoutMs: number,
): Promise<void> {
  if (timeoutMs <= 0) {
    await client.session.prompt(args);
    return;
  }

  const sessionId = args.path.id;
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const promptPromise = client.session.prompt(args);
    promptPromise.catch(() => {});

    await Promise.race([
      promptPromise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          client.session.abort({ path: { id: sessionId } }).catch(() => {});
          reject(new Error(`Prompt timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Result of extracting session content.
 * `empty` is true when the assistant produced zero text content —
 * the provider returned an empty response (e.g. rate-limited silently).
 */
export interface SessionExtractionResult {
  text: string;
  empty: boolean;
}

/**
 * Extract the result text from a session.
 * Collects all assistant messages and concatenates their text parts.
 * @param client - OpenCode client instance
 * @param sessionId - Session ID to extract from
 * @param options - Optional: `includeReasoning` (default true) controls whether
 *                  reasoning/chain-of-thought parts are included.
 * @returns Object with extracted text and an `empty` flag for zero-content detection
 */
export async function extractSessionResult(
  client: OpencodeClient,
  sessionId: string,
  options?: { includeReasoning?: boolean },
): Promise<SessionExtractionResult> {
  const includeReasoning = options?.includeReasoning ?? true;

  const messagesResult = await client.session.messages({
    path: { id: sessionId },
  });
  const messages = (messagesResult.data ?? []) as Array<{
    info?: { role: string };
    parts?: Array<{ type: string; text?: string }>;
  }>;
  const assistantMessages = messages.filter(
    (m) => m.info?.role === 'assistant',
  );

  const extractedContent: string[] = [];
  for (const message of assistantMessages) {
    for (const part of message.parts ?? []) {
      const allowed = includeReasoning
        ? part.type === 'text' || part.type === 'reasoning'
        : part.type === 'text';
      if (allowed && part.text) {
        extractedContent.push(part.text);
      }
    }
  }

  const text = extractedContent.filter((t) => t.length > 0).join('\n\n');
  return { text, empty: text.length === 0 };
}
