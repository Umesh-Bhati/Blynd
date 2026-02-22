export type GenerateBlenderCodeInput = {
  prompt: string;
  model: string;
  projectId?: string;
  accessToken?: string;
};

export type GenerateAndApplyRemoteInput = {
  prompt: string;
  model: string;
  projectId?: string;
  accessToken?: string;
  blenderHost?: string;
  blenderPort?: number;
  includeCode?: boolean;
};

export type GenerateAndApplyRemoteResult = {
  applied: boolean;
  provider: string;
  model: string;
  blenderHost: string;
  blenderPort: number;
  message: string;
  blenderResult: unknown;
  pythonCode: string | null;
};

export type RemoteBrainCapabilities = {
  providers: Record<
    'openai' | 'anthropic' | 'groq',
    {
      configured: boolean;
    }
  >;
  defaultProvider: string;
};

type GenerateBlenderCodeResponse = {
  python_code?: string;
  code?: string;
  message?: string;
  error?: string;
};

type GenerateAndApplyRemoteResponse = {
  applied?: boolean;
  provider?: string;
  model?: string;
  blender_host?: string;
  blender_port?: number;
  message?: string;
  blender_result?: unknown;
  python_code?: string | null;
  detail?: string;
  error?: string;
};

type RemoteBrainCapabilitiesResponse = {
  providers?: Partial<
    Record<
      'openai' | 'anthropic' | 'groq',
      {
        configured?: boolean;
      }
    >
  >;
  default_provider?: string;
};

const FALLBACK_REMOTE_BRAIN_URL = 'http://192.168.31.7:8080/generate';
const REMOTE_BRAIN_URL_OVERRIDE_KEY = 'blender-ai-workspace.remote-brain-url';
const REMOTE_BRAIN_TOKEN_OVERRIDE_KEY = 'blender-ai-workspace.remote-brain-token';

function readRemoteBrainUrlOverride(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(REMOTE_BRAIN_URL_OVERRIDE_KEY)?.trim() ?? '';
  return raw || null;
}

function normalizeRemoteBrainGenerateEndpoint(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.endsWith('/generate')) {
    return trimmed;
  }

  if (trimmed.endsWith('/')) {
    return `${trimmed}generate`;
  }

  // Allow entering the backend base URL only (e.g. http://IP:8080)
  if (!/\/(generate|generate-and-apply|health|capabilities)$/.test(trimmed)) {
    return `${trimmed}/generate`;
  }

  if (trimmed.endsWith('/health')) {
    return trimmed.replace(/\/health$/, '/generate');
  }

  if (trimmed.endsWith('/capabilities')) {
    return trimmed.replace(/\/capabilities$/, '/generate');
  }

  if (trimmed.endsWith('/generate-and-apply')) {
    return trimmed.replace(/\/generate-and-apply$/, '/generate');
  }

  return trimmed;
}

export function getActiveRemoteBrainGenerateUrl(): string {
  return getRemoteBrainGenerateEndpoint();
}

function readRemoteBrainTokenOverride(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(REMOTE_BRAIN_TOKEN_OVERRIDE_KEY)?.trim() ?? '';
  return raw || null;
}

function getRemoteBrainToken(): string | null {
  return readRemoteBrainTokenOverride() || import.meta.env.VITE_REMOTE_BRAIN_TOKEN || null;
}

export function getActiveRemoteBrainToken(): string {
  return getRemoteBrainToken() ?? '';
}

export function hasActiveRemoteBrainToken(): boolean {
  return Boolean(getRemoteBrainToken());
}

export function setRemoteBrainTokenOverride(input: string): void {
  const trimmed = input.trim();
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(REMOTE_BRAIN_TOKEN_OVERRIDE_KEY, trimmed);
  }
}

export function clearRemoteBrainTokenOverride(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(REMOTE_BRAIN_TOKEN_OVERRIDE_KEY);
  }
}

export function setRemoteBrainUrlOverride(input: string): string {
  const normalized = normalizeRemoteBrainGenerateEndpoint(input);
  if (!normalized) {
    throw new Error('Remote brain URL cannot be empty.');
  }

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(REMOTE_BRAIN_URL_OVERRIDE_KEY, normalized);
  }

  return normalized;
}

export function clearRemoteBrainUrlOverride(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(REMOTE_BRAIN_URL_OVERRIDE_KEY);
  }
}

function getRemoteBrainGenerateEndpoint(): string {
  return readRemoteBrainUrlOverride() || import.meta.env.VITE_REMOTE_BRAIN_URL || FALLBACK_REMOTE_BRAIN_URL;
}

function getRemoteBrainBaseUrl(): string {
  const endpoint = getRemoteBrainGenerateEndpoint();

  try {
    const url = new URL(endpoint);
    url.pathname = '/';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return endpoint.replace(/\/generate\/?$/, '');
  }
}

export async function getRemoteBrainCapabilities(): Promise<RemoteBrainCapabilities | null> {
  const baseUrl = getRemoteBrainBaseUrl();
  const fallbackToken = getRemoteBrainToken();

  const headers: Record<string, string> = {};
  if (fallbackToken) {
    headers.Authorization = `Bearer ${fallbackToken}`;
  }

  try {
    const response = await fetch(`${baseUrl}/capabilities`, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json().catch(() => null)) as RemoteBrainCapabilitiesResponse | null;
    if (!data) {
      return null;
    }

    return {
      providers: {
        openai: { configured: Boolean(data.providers?.openai?.configured) },
        anthropic: { configured: Boolean(data.providers?.anthropic?.configured) },
        groq: { configured: Boolean(data.providers?.groq?.configured) }
      },
      defaultProvider: data.default_provider ?? ''
    };
  } catch {
    return null;
  }
}

export async function generateBlenderCode(
  input: GenerateBlenderCodeInput
): Promise<string> {
  const endpoint = getRemoteBrainGenerateEndpoint();
  const fallbackToken = getRemoteBrainToken();

  if (!endpoint) {
    throw new Error('Remote brain endpoint missing. Set VITE_REMOTE_BRAIN_URL in your environment.');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  const authToken = input.accessToken ?? fallbackToken;
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt: input.prompt,
      model: input.model,
      projectId: input.projectId
    })
  });

  const data = (await response.json().catch(() => null)) as GenerateBlenderCodeResponse | null;

  if (!response.ok) {
    const reason = data?.error ?? data?.message ?? `HTTP ${response.status}`;
    throw new Error(`Remote generation failed: ${reason}`);
  }

  const pythonCode = data?.python_code ?? data?.code;
  if (!pythonCode || !pythonCode.trim()) {
    throw new Error('Remote response did not include Blender Python code.');
  }

  return pythonCode;
}

export async function generateAndApplyRemote(
  input: GenerateAndApplyRemoteInput
): Promise<GenerateAndApplyRemoteResult> {
  const baseUrl = getRemoteBrainBaseUrl();
  const endpoint = `${baseUrl}/generate-and-apply`;
  const fallbackToken = getRemoteBrainToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  const authToken = input.accessToken ?? fallbackToken;
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt: input.prompt,
      model: input.model,
      projectId: input.projectId,
      blender_host: input.blenderHost,
      blender_port: input.blenderPort ?? 9876,
      include_code: input.includeCode ?? false
    })
  });

  const data = (await response.json().catch(() => null)) as GenerateAndApplyRemoteResponse | null;

  if (!response.ok) {
    const reason = data?.detail ?? data?.error ?? data?.message ?? `HTTP ${response.status}`;
    throw new Error(`Remote apply failed: ${reason}`);
  }

  return {
    applied: Boolean(data?.applied),
    provider: data?.provider ?? '',
    model: data?.model ?? '',
    blenderHost: data?.blender_host ?? '',
    blenderPort: data?.blender_port ?? 9876,
    message: data?.message ?? 'Applied in Blender.',
    blenderResult: data?.blender_result ?? null,
    pythonCode: data?.python_code ?? null
  };
}
