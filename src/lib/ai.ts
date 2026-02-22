export type GenerateBlenderCodeInput = {
  prompt: string;
  model: string;
  projectId?: string;
  accessToken?: string;
};

type GenerateBlenderCodeResponse = {
  python_code?: string;
  code?: string;
  message?: string;
  error?: string;
};

const FALLBACK_REMOTE_BRAIN_URL = 'http://192.168.31.7:8080/generate';

export async function generateBlenderCode(
  input: GenerateBlenderCodeInput
): Promise<string> {
  const endpoint = import.meta.env.VITE_REMOTE_BRAIN_URL || FALLBACK_REMOTE_BRAIN_URL;
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
