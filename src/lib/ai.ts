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

function getRemoteBrainGenerateEndpoint(): string {
  return import.meta.env.VITE_REMOTE_BRAIN_URL || FALLBACK_REMOTE_BRAIN_URL;
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
  const fallbackToken = import.meta.env.VITE_REMOTE_BRAIN_TOKEN;

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
  const fallbackToken = import.meta.env.VITE_REMOTE_BRAIN_TOKEN;

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
  const fallbackToken = import.meta.env.VITE_REMOTE_BRAIN_TOKEN;

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
