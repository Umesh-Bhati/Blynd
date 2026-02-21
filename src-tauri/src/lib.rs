use serde::Serialize;
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

#[cfg(target_os = "windows")]
use std::env;
#[cfg(target_os = "windows")]
use std::fs;
#[cfg(target_os = "windows")]
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BlenderInstallScan {
  found: bool,
  executable_path: Option<String>,
  searched_paths: Vec<String>,
  message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AddonInstallResult {
  installed: bool,
  addon_path: Option<String>,
  blender_version: Option<String>,
  message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BlenderSocketStatus {
  connected: bool,
  host: String,
  port: u16,
  message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BlenderCommandResult {
  ok: bool,
  message: String,
  result: Option<Value>,
}

#[tauri::command]
fn healthcheck() -> &'static str {
  "ok"
}

#[tauri::command]
fn detect_blender_installation() -> BlenderInstallScan {
  detect_blender_installation_impl()
}

#[tauri::command]
fn install_blender_addon() -> Result<AddonInstallResult, String> {
  install_blender_addon_impl()
}

#[tauri::command]
fn check_blender_socket(host: Option<String>, port: Option<u16>) -> BlenderSocketStatus {
  let resolved_host = host.unwrap_or_else(|| "127.0.0.1".to_string());
  let resolved_port = port.unwrap_or(9876);
  let ping_request = json!({
    "type": "get_scene_info",
    "params": {}
  });

  match send_blender_command(&resolved_host, resolved_port, &ping_request) {
    Ok(_) => BlenderSocketStatus {
      connected: true,
      host: resolved_host,
      port: resolved_port,
      message: "Connected to Blender addon socket.".to_string(),
    },
    Err(err) => BlenderSocketStatus {
      connected: false,
      host: resolved_host,
      port: resolved_port,
      message: format!("Blender socket unavailable: {err}"),
    },
  }
}

#[tauri::command]
fn execute_blender_code(
  code: String,
  host: Option<String>,
  port: Option<u16>,
) -> Result<BlenderCommandResult, String> {
  if code.trim().is_empty() {
    return Err("Generated code is empty.".to_string());
  }

  let resolved_host = host.unwrap_or_else(|| "127.0.0.1".to_string());
  let resolved_port = port.unwrap_or(9876);

  let request = json!({
    "type": "execute_code",
    "params": {
      "code": code
    }
  });

  let response = send_blender_command(&resolved_host, resolved_port, &request)?;
  let message = response
    .get("message")
    .and_then(Value::as_str)
    .unwrap_or("Code executed in Blender addon.")
    .to_string();
  let result = response.get("result").cloned();

  Ok(BlenderCommandResult {
    ok: true,
    message,
    result,
  })
}

fn send_blender_command(host: &str, port: u16, payload: &Value) -> Result<Value, String> {
  let mut addresses = (host, port)
    .to_socket_addrs()
    .map_err(|err| format!("Unable to resolve {host}:{port}: {err}"))?;
  let address = addresses
    .next()
    .ok_or_else(|| format!("No socket address resolved for {host}:{port}"))?;

  let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(5))
    .map_err(|err| format!("Could not connect to Blender socket at {host}:{port}: {err}"))?;

  stream
    .set_write_timeout(Some(Duration::from_secs(10)))
    .map_err(|err| format!("Failed to set write timeout: {err}"))?;
  stream
    .set_read_timeout(Some(Duration::from_secs(20)))
    .map_err(|err| format!("Failed to set read timeout: {err}"))?;

  let request_json = payload.to_string();
  stream
    .write_all(request_json.as_bytes())
    .map_err(|err| format!("Failed sending command to Blender socket: {err}"))?;

  let mut all_bytes: Vec<u8> = Vec::new();
  let mut buffer = [0_u8; 8192];

  loop {
    match stream.read(&mut buffer) {
      Ok(0) => break,
      Ok(read_len) => {
        all_bytes.extend_from_slice(&buffer[..read_len]);

        if let Ok(parsed) = serde_json::from_slice::<Value>(&all_bytes) {
          return validate_blender_response(parsed);
        }
      }
      Err(err)
        if err.kind() == std::io::ErrorKind::TimedOut
          || err.kind() == std::io::ErrorKind::WouldBlock =>
      {
        break;
      }
      Err(err) => {
        return Err(format!("Failed reading Blender socket response: {err}"));
      }
    }
  }

  if all_bytes.is_empty() {
    return Err("No response received from Blender addon. Make sure addon server is running.".to_string());
  }

  let parsed = serde_json::from_slice::<Value>(&all_bytes)
    .map_err(|err| format!("Blender response was not valid JSON: {err}"))?;
  validate_blender_response(parsed)
}

fn validate_blender_response(response: Value) -> Result<Value, String> {
  if response
    .get("status")
    .and_then(Value::as_str)
    .is_some_and(|status| status == "error")
  {
    let message = response
      .get("message")
      .and_then(Value::as_str)
      .unwrap_or("Unknown Blender addon error");
    return Err(message.to_string());
  }

  Ok(response)
}

#[cfg(target_os = "windows")]
fn detect_blender_installation_impl() -> BlenderInstallScan {
  let mut roots: Vec<PathBuf> = Vec::new();
  let mut searched_paths: Vec<String> = Vec::new();
  let mut seen_paths = std::collections::HashSet::new();

  if let Ok(program_files) = env::var("PROGRAMFILES") {
    roots.push(PathBuf::from(program_files).join("Blender Foundation"));
  }

  if let Ok(program_files_x86) = env::var("PROGRAMFILES(X86)") {
    roots.push(PathBuf::from(program_files_x86).join("Blender Foundation"));
  }

  if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
    roots.push(
      PathBuf::from(local_app_data)
        .join("Programs")
        .join("Blender Foundation"),
    );
  }

  roots.push(PathBuf::from(r"C:\Program Files\Blender Foundation"));
  roots.push(PathBuf::from(r"C:\Program Files (x86)\Blender Foundation"));

  for root in roots {
    let key = root.display().to_string().to_ascii_lowercase();
    if !seen_paths.insert(key) {
      continue;
    }

    searched_paths.push(root.display().to_string());

    if let Some(exe_path) = find_blender_executable(&root) {
      return BlenderInstallScan {
        found: true,
        executable_path: Some(exe_path.display().to_string()),
        searched_paths,
        message: "Blender installation detected.".to_string(),
      };
    }
  }

  BlenderInstallScan {
    found: false,
    executable_path: None,
    searched_paths,
    message: "Blender was not found in common Windows installation paths.".to_string(),
  }
}

#[cfg(not(target_os = "windows"))]
fn detect_blender_installation_impl() -> BlenderInstallScan {
  BlenderInstallScan {
    found: false,
    executable_path: None,
    searched_paths: Vec::new(),
    message: "Windows Blender scan is disabled on this OS.".to_string(),
  }
}

#[cfg(target_os = "windows")]
fn install_blender_addon_impl() -> Result<AddonInstallResult, String> {
  const ADDON_SOURCE: &str = include_str!("../resources/blender_mcp_addon.py");

  let (blender_version, addons_dir) = find_latest_blender_addons_dir()?;
  fs::create_dir_all(&addons_dir)
    .map_err(|err| format!("Failed creating Blender addons directory: {err}"))?;

  let addon_path = addons_dir.join("blender_mcp.py");
  fs::write(&addon_path, ADDON_SOURCE)
    .map_err(|err| format!("Failed writing addon file: {err}"))?;

  Ok(AddonInstallResult {
    installed: true,
    addon_path: Some(addon_path.display().to_string()),
    blender_version: Some(blender_version.clone()),
    message: format!(
      "Addon installed to Blender {blender_version}. In Blender Preferences > Add-ons, enable 'Interface: Blender MCP'."
    ),
  })
}

#[cfg(not(target_os = "windows"))]
fn install_blender_addon_impl() -> Result<AddonInstallResult, String> {
  Err("Automatic addon installation is currently implemented for Windows builds only.".to_string())
}

#[cfg(target_os = "windows")]
fn find_latest_blender_addons_dir() -> Result<(String, PathBuf), String> {
  let app_data = env::var("APPDATA").map_err(|_| "APPDATA is not available.".to_string())?;
  let blender_root = PathBuf::from(app_data)
    .join("Blender Foundation")
    .join("Blender");

  if !blender_root.exists() {
    return Err(format!(
      "Blender user config directory not found at {}",
      blender_root.display()
    ));
  }

  let mut versions: Vec<(String, (u32, u32, u32))> = Vec::new();

  let entries = fs::read_dir(&blender_root)
    .map_err(|err| format!("Failed listing {}: {err}", blender_root.display()))?;

  for entry in entries.flatten() {
    let path = entry.path();
    if !path.is_dir() {
      continue;
    }

    let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
      continue;
    };

    if let Some(parsed) = parse_blender_version(name) {
      versions.push((name.to_string(), parsed));
    }
  }

  versions.sort_by(|a, b| b.1.cmp(&a.1));
  let Some((latest_version, _)) = versions.first() else {
    return Err(format!(
      "No Blender version folders found in {}",
      blender_root.display()
    ));
  };

  let addons_dir = blender_root
    .join(latest_version)
    .join("scripts")
    .join("addons");

  Ok((latest_version.clone(), addons_dir))
}

#[cfg(target_os = "windows")]
fn parse_blender_version(input: &str) -> Option<(u32, u32, u32)> {
  let mut parts = input.split('.');
  let major = parts.next()?.parse::<u32>().ok()?;
  let minor = parts.next().unwrap_or("0").parse::<u32>().ok()?;
  let patch = parts.next().unwrap_or("0").parse::<u32>().ok()?;
  Some((major, minor, patch))
}

#[cfg(target_os = "windows")]
fn find_blender_executable(base_path: &Path) -> Option<PathBuf> {
  if !base_path.exists() {
    return None;
  }

  let direct = base_path.join("blender.exe");
  if direct.is_file() {
    return Some(direct);
  }

  let entries = fs::read_dir(base_path).ok()?;
  let mut first_level_dirs: Vec<PathBuf> = Vec::new();

  for entry in entries.flatten() {
    let candidate = entry.path();
    if !candidate.is_dir() {
      continue;
    }

    first_level_dirs.push(candidate.clone());

    let nested = candidate.join("blender.exe");
    if nested.is_file() {
      return Some(nested);
    }
  }

  for dir in first_level_dirs {
    let second_level = fs::read_dir(dir).ok();
    if let Some(sub_entries) = second_level {
      for sub_entry in sub_entries.flatten() {
        let sub_path = sub_entry.path();
        if !sub_path.is_dir() {
          continue;
        }

        let exe = sub_path.join("blender.exe");
        if exe.is_file() {
          return Some(exe);
        }
      }
    }
  }

  None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      healthcheck,
      detect_blender_installation,
      install_blender_addon,
      check_blender_socket,
      execute_blender_code
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
