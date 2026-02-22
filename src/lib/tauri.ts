import { invoke } from '@tauri-apps/api/core';

export type BlenderInstallScan = {
  found: boolean;
  executablePath: string | null;
  searchedPaths: string[];
  message: string;
};

export type AddonInstallResult = {
  installed: boolean;
  addonPath: string | null;
  blenderVersion: string | null;
  message: string;
};

export type BlenderSocketStatus = {
  connected: boolean;
  host: string;
  port: number;
  message: string;
};

export type BlenderCommandResult = {
  ok: boolean;
  message: string;
  result: unknown;
};

export type BlenderAutoSetupResult = {
  ok: boolean;
  executablePath: string | null;
  addonPath: string | null;
  blenderVersion: string | null;
  socketStatus: BlenderSocketStatus;
  message: string;
  details: string[];
};

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);
}

export async function detectBlenderInstallation(): Promise<BlenderInstallScan> {
  if (!isTauriRuntime()) {
    return {
      found: false,
      executablePath: null,
      searchedPaths: [],
      message: 'Tauri runtime not detected. Launch with `pnpm tauri dev` to run local Blender handshake.'
    };
  }

  return invoke<BlenderInstallScan>('detect_blender_installation');
}

export async function installBlenderAddon(): Promise<AddonInstallResult> {
  if (!isTauriRuntime()) {
    return {
      installed: false,
      addonPath: null,
      blenderVersion: null,
      message: 'Tauri runtime not detected. Addon installation works only in desktop app.'
    };
  }

  return invoke<AddonInstallResult>('install_blender_addon');
}

export async function setupBlenderOneClick(): Promise<BlenderAutoSetupResult> {
  if (!isTauriRuntime()) {
    return {
      ok: false,
      executablePath: null,
      addonPath: null,
      blenderVersion: null,
      socketStatus: {
        connected: false,
        host: '127.0.0.1',
        port: 9876,
        message: 'Tauri runtime not detected. One-click setup works only in desktop app.'
      },
      message: 'Tauri runtime not detected. One-click setup works only in desktop app.',
      details: []
    };
  }

  return invoke<BlenderAutoSetupResult>('setup_blender_one_click');
}

export async function checkBlenderSocket(
  host = '127.0.0.1',
  port = 9876
): Promise<BlenderSocketStatus> {
  if (!isTauriRuntime()) {
    return {
      connected: false,
      host,
      port,
      message: 'Tauri runtime not detected. Blender socket checks work only in desktop app.'
    };
  }

  return invoke<BlenderSocketStatus>('check_blender_socket', { host, port });
}

export async function executeBlenderCode(
  code: string,
  host = '127.0.0.1',
  port = 9876
): Promise<BlenderCommandResult> {
  if (!isTauriRuntime()) {
    return {
      ok: false,
      message: 'Tauri runtime not detected. Blender execution works only in desktop app.',
      result: null
    };
  }

  return invoke<BlenderCommandResult>('execute_blender_code', { code, host, port });
}
