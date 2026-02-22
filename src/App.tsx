import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { generateBlenderCode } from './lib/ai';
import { hasSupabaseEnv, supabase } from './lib/supabase';
import {
  checkBlenderSocket,
  detectBlenderInstallation,
  executeBlenderCode,
  installBlenderAddon,
  setupBlenderOneClick,
  type AddonInstallResult,
  type BlenderInstallScan,
  type BlenderSocketStatus
} from './lib/tauri';

type Project = {
  id: string;
  name: string;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

const MODELS = [
  { label: 'Groq Llama 3.3 70B', value: 'groq/llama-3.3-70b-versatile' },
  { label: 'Claude 3.5 Sonnet', value: 'anthropic/claude-3-5-sonnet-latest' },
  { label: 'GPT-4o', value: 'openai/gpt-4o' },
  { label: 'GPT-4.1 mini', value: 'openai/gpt-4.1-mini' }
];
const STORAGE_KEY = 'blender-ai-workspace.projects';
const HAS_REMOTE_BRAIN_ENV = Boolean(import.meta.env.VITE_REMOTE_BRAIN_URL);

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadProjects(): Project[] {
  const fallback = [{ id: createId(), name: 'Project Alpha' }];

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw) as Project[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return fallback;
    }

    return parsed;
  } catch {
    return fallback;
  }
}

function App() {
  const authEnabled = import.meta.env.VITE_ENABLE_AUTH === 'true';

  if (!authEnabled || !hasSupabaseEnv || !supabase) {
    return <Workspace session={null} />;
  }

  return <AppWithAuth />;
}

function AppWithAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase!.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session ?? null);
        setLoading(false);
      }
    });

    const {
      data: { subscription }
    } = supabase!.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return <div className="center-screen">Checking account session...</div>;
  }

  if (!session) {
    return <AuthScreen />;
  }

  return <Workspace session={session} />;
}

function AuthScreen() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('');
    setSubmitting(true);

    const { error } = await supabase!.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin
      }
    });

    if (error) {
      setStatus(error.message);
    } else {
      setStatus('Check your email for the secure login link.');
      setEmail('');
    }

    setSubmitting(false);
  };

  return (
    <div className="center-screen">
      <form className="panel auth-panel" onSubmit={onSubmit}>
        <h1>Blender-AI Workspace</h1>
        <p>Sign in to access your 3D projects and AI control workspace.</p>

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="founder@studio.com"
          required
        />

        <button type="submit" disabled={submitting}>
          {submitting ? 'Sending link...' : 'Send magic link'}
        </button>

        {status ? <p className="status-text">{status}</p> : null}
      </form>
    </div>
  );
}

function Workspace({ session }: { session: Session | null }) {
  const [projects, setProjects] = useState<Project[]>(() => loadProjects());
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [renameDraft, setRenameDraft] = useState('');
  const [model, setModel] = useState(MODELS[0].value);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCheckingBlender, setIsCheckingBlender] = useState(false);
  const [isInstallingAddon, setIsInstallingAddon] = useState(false);
  const [isRunningOneClickSetup, setIsRunningOneClickSetup] = useState(false);
  const [autoApplyToBlender, setAutoApplyToBlender] = useState(true);
  const [blenderScan, setBlenderScan] = useState<BlenderInstallScan | null>(null);
  const [addonInstall, setAddonInstall] = useState<AddonInstallResult | null>(null);
  const [socketStatus, setSocketStatus] = useState<BlenderSocketStatus | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: createId(),
      role: 'assistant',
      content: 'Workspace ready. Ask for a 3D operation and I will generate Blender Python code.'
    }
  ]);

  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
      setRenameDraft(projects[0].name);
    }
  }, [projects, selectedProjectId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  }, [projects]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const addProject = () => {
    const project = {
      id: createId(),
      name: `Project ${projects.length + 1}`
    };

    setProjects((current) => [...current, project]);
    setSelectedProjectId(project.id);
    setRenameDraft(project.name);
  };

  const renameProject = () => {
    if (!selectedProjectId) {
      return;
    }

    const cleaned = renameDraft.trim();
    if (!cleaned) {
      return;
    }

    setProjects((current) =>
      current.map((project) =>
        project.id === selectedProjectId ? { ...project, name: cleaned } : project
      )
    );
  };

  const runBlenderHandshake = async () => {
    setIsCheckingBlender(true);
    try {
      const result = await detectBlenderInstallation();
      setBlenderScan(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown handshake error.';
      setBlenderScan({
        found: false,
        executablePath: null,
        searchedPaths: [],
        message: `Handshake failed: ${message}`
      });
    } finally {
      setIsCheckingBlender(false);
    }
  };

  const runAddonInstall = async () => {
    setIsInstallingAddon(true);
    try {
      const result = await installBlenderAddon();
      setAddonInstall(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown addon install error.';
      setAddonInstall({
        installed: false,
        addonPath: null,
        blenderVersion: null,
        message
      });
    } finally {
      setIsInstallingAddon(false);
    }
  };

  const runSocketCheck = async () => {
    try {
      const status = await checkBlenderSocket();
      setSocketStatus(status);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown socket check error.';
      setSocketStatus({
        connected: false,
        host: '127.0.0.1',
        port: 9876,
        message
      });
    }
  };

  const runOneClickBlenderSetup = async () => {
    setIsRunningOneClickSetup(true);

    try {
      const result = await setupBlenderOneClick();

      setBlenderScan({
        found: Boolean(result.executablePath),
        executablePath: result.executablePath,
        searchedPaths: [],
        message: result.executablePath
          ? 'Blender installation detected.'
          : 'Blender installation was not detected.'
      });

      setAddonInstall({
        installed: Boolean(result.addonPath),
        addonPath: result.addonPath,
        blenderVersion: result.blenderVersion,
        message: result.message
      });

      setSocketStatus(result.socketStatus);

      if (result.details.length > 0) {
        setMessages((current) => [
          ...current,
          {
            id: createId(),
            role: 'assistant',
            content: `One-click setup: ${result.details.join(' | ')}`
          }
        ]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown one-click setup error.';
      setAddonInstall({
        installed: false,
        addonPath: null,
        blenderVersion: null,
        message
      });
      setSocketStatus({
        connected: false,
        host: '127.0.0.1',
        port: 9876,
        message
      });
    } finally {
      setIsRunningOneClickSetup(false);
    }
  };

  const onSendPrompt = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isGenerating) {
      return;
    }

    const cleanedPrompt = prompt.trim();
    if (!cleanedPrompt) {
      return;
    }

    setPrompt('');
    setMessages((current) => [
      ...current,
      { id: createId(), role: 'user', content: cleanedPrompt }
    ]);
    setIsGenerating(true);

    try {
      const generatedCode = await generateBlenderCode({
        prompt: cleanedPrompt,
        model,
        projectId: selectedProject?.id
      });

      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: 'assistant',
          content: generatedCode
        }
      ]);

      if (autoApplyToBlender) {
        try {
          const execResult = await executeBlenderCode(generatedCode);
          setMessages((current) => [
            ...current,
            {
              id: createId(),
              role: 'assistant',
              content: `Applied to Blender: ${execResult.message}`
            }
          ]);
          await runSocketCheck();
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Failed to execute generated code in Blender.';
          setMessages((current) => [
            ...current,
            {
              id: createId(),
              role: 'assistant',
              content: `Blender apply failed: ${message}`
            }
          ]);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected AI generation error.';
      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: 'assistant',
          content: `Error: ${message}`
        }
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  const signOut = async () => {
    if (!supabase || !session) {
      return;
    }

    await supabase.auth.signOut();
  };

  return (
    <div className="workspace-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Projects</p>
          <button className="ghost-button" onClick={addProject} type="button">
            New Project
          </button>
        </div>

        <section className="handshake-card">
          <p className="eyebrow">Blender Handshake</p>
          <div className="handshake-actions">
            <button
              className="ghost-button"
              type="button"
              onClick={runOneClickBlenderSetup}
              disabled={isRunningOneClickSetup}
            >
              {isRunningOneClickSetup ? 'Running One-Click Setup...' : 'One-Click Setup'}
            </button>

            <button
              className="ghost-button"
              type="button"
              onClick={runBlenderHandshake}
              disabled={isCheckingBlender || isRunningOneClickSetup}
            >
              {isCheckingBlender ? 'Scanning Windows Paths...' : 'Detect Blender Install'}
            </button>

            <button
              className="ghost-button"
              type="button"
              onClick={runAddonInstall}
              disabled={isInstallingAddon || isRunningOneClickSetup}
            >
              {isInstallingAddon ? 'Installing Addon...' : 'Install Addon'}
            </button>

            <button
              className="ghost-button"
              type="button"
              onClick={runSocketCheck}
              disabled={isRunningOneClickSetup}
            >
              Check Blender Socket
            </button>
          </div>

          {blenderScan ? (
            <>
              <p className={`scan-status ${blenderScan.found ? 'ok' : 'warn'}`}>
                {blenderScan.message}
              </p>
              {blenderScan.executablePath ? (
                <p className="path-text">{blenderScan.executablePath}</p>
              ) : null}
            </>
          ) : (
            <p className="muted">Run once to verify local Blender availability.</p>
          )}

          {addonInstall ? (
            <>
              <p className={`scan-status ${addonInstall.installed ? 'ok' : 'warn'}`}>
                {addonInstall.message}
              </p>
              {addonInstall.addonPath ? <p className="path-text">{addonInstall.addonPath}</p> : null}
            </>
          ) : null}

          {socketStatus ? (
            <p className={`scan-status ${socketStatus.connected ? 'ok' : 'warn'}`}>
              {socketStatus.message}
            </p>
          ) : null}
        </section>

        <nav className="project-list">
          {projects.map((project) => (
            <button
              key={project.id}
              className={`project-item ${project.id === selectedProjectId ? 'active' : ''}`}
              onClick={() => {
                setSelectedProjectId(project.id);
                setRenameDraft(project.name);
              }}
              type="button"
            >
              {project.name}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <p className="muted">{session?.user.email ?? 'Local Mode (Auth Disabled)'}</p>
          {session ? (
            <button className="ghost-button" onClick={signOut} type="button">
              Sign out
            </button>
          ) : null}
        </div>
      </aside>

      <main className="chat-pane">
        <header className="chat-header panel">
          <div className="project-rename-row">
            <input
              type="text"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              disabled={!selectedProject}
            />
            <button onClick={renameProject} type="button">
              Rename
            </button>
          </div>

          <label className="model-picker">
            Model
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {MODELS.map((modelOption) => (
                <option key={modelOption.value} value={modelOption.value}>
                  {modelOption.label}
                </option>
              ))}
            </select>
          </label>
        </header>

        <section className="messages panel">
          {messages.map((message) => (
            <article key={message.id} className={`message ${message.role}`}>
              <p className="role">{message.role === 'assistant' ? 'AI' : 'You'}</p>
              <p>{message.content}</p>
            </article>
          ))}
        </section>

        <form className="composer panel" onSubmit={onSendPrompt}>
          <p className="muted">
            Remote brain endpoint: {HAS_REMOTE_BRAIN_ENV ? 'configured' : 'not configured'}.
          </p>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={autoApplyToBlender}
              onChange={(event) => setAutoApplyToBlender(event.target.checked)}
            />
            Auto-apply generated code to Blender on port 9876
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the Blender task, e.g. create a low-poly sci-fi chair with subdivision-friendly topology."
            rows={3}
          />
          <button type="submit" disabled={isGenerating}>
            {isGenerating ? 'Generating...' : 'Generate Blender Code'}
          </button>
        </form>
      </main>
    </div>
  );
}

export default App;
