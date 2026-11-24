// Registro do comando `career` no PATH do usuário — quem instala o app desktop
// leva a janela nativa E o CLI pronto no terminal (o sidecar embutido serve
// aos dois modos). Idempotente: o shim é reescrito a cada launch, então se
// auto-corrige quando o app muda de lugar ou é reinstalado.
//
//   Windows → career.cmd em %LOCALAPPDATA%\Microsoft\WindowsApps (PATH de
//             usuário por padrão); fallback: shim no install dir + PATH via PS
//   macOS   → /opt/homebrew/bin ou /usr/local/bin (osascript admin se preciso)
//   Linux   → ~/.local/bin/career → `exec <AppImage> --career-cli "$@"`
//             (o binário dentro do squashfs não tem caminho estável — o app
//             vira launcher dele no modo --career-cli)
use std::path::{Path, PathBuf};

/// Nome do sidecar conforme o target-triple do bundler (scripts/build-desktop.mjs).
fn sidecar_name() -> &'static str {
    if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        "career-x86_64-pc-windows-msvc.exe"
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "career-aarch64-apple-darwin"
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        "career-x86_64-apple-darwin"
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        "career-x86_64-unknown-linux-gnu"
    } else {
        "career"
    }
}

/// Localiza um dir de recurso (`career-runtime/`, `skills/`) no pacote: ao
/// lado do exe (Windows/dev), em `../Resources` (bundle macOS) ou
/// `../lib|share/<produto>` (deb/AppImage Linux).
fn find_resource_dir(exe_dir: &Path, name: &str) -> Option<PathBuf> {
    let mut cands = vec![
        exe_dir.join(name),
        exe_dir.join("..").join("Resources").join(name),
    ];
    for sub in ["lib", "share"] {
        if let Ok(entries) = std::fs::read_dir(exe_dir.join("..").join(sub)) {
            for e in entries.flatten() {
                if e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    cands.push(e.path().join(name));
                }
            }
        }
    }
    cands.into_iter().find(|c| c.is_dir())
}

/// `--career-cli <args…>`: executa o sidecar repassando args e stdio e sai com
/// o exit code dele — sem janela nem event loop. É o modo que o shim de Linux
/// (AppImage) usa, pois o binário dentro do pacote não é alcançável por path.
pub fn passthrough(args: &[String]) -> i32 {
    let exe = match std::env::current_exe() {
        Ok(e) => e,
        Err(e) => {
            eprintln!("career: não resolveu o caminho do app: {e}");
            return 1;
        }
    };
    let dir = exe.parent().unwrap_or_else(|| Path::new("."));
    let sidecar = dir.join(sidecar_name());
    let mut cmd = std::process::Command::new(&sidecar);
    cmd.args(args)
        .stdin(std::process::Stdio::inherit())
        .stdout(std::process::Stdio::inherit())
        .stderr(std::process::Stdio::inherit());
    for (env, name) in [("CAREER_RUNTIME", "career-runtime"), ("CAREER_SKILLS", "skills")] {
        if let Some(d) = find_resource_dir(dir, name) {
            cmd.env(env, d);
        }
    }
    match cmd.status() {
        Ok(s) => s.code().unwrap_or(1),
        Err(e) => {
            eprintln!("career: sidecar não encontrado em {}: {e}", sidecar.display());
            1
        }
    }
}

/// Garante o comando `career` no PATH — em background para não segurar o boot
/// da janela; falhas só logam (a UI funciona sem o shim).
pub fn install() {
    std::thread::spawn(|| {
        if let Err(e) = try_install() {
            eprintln!("career cli shim: {e}");
        }
    });
}

#[allow(unreachable_code, unused_variables)]
fn try_install() -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe
        .parent()
        .ok_or_else(|| "sem diretório do executável".to_string())?
        .to_path_buf();

    #[cfg(target_os = "macos")]
    if exe_dir.to_string_lossy().contains("AppTranslocation") {
        return Err("app em translocation — mova para /Applications antes de registrar o CLI".into());
    }

    #[cfg(target_os = "windows")]
    return install_windows(&exe_dir);
    #[cfg(target_os = "macos")]
    return install_macos(&exe_dir);
    #[cfg(target_os = "linux")]
    return install_linux(&exe_dir);

    Err("plataforma sem shim de CLI".into())
}

#[cfg(target_os = "windows")]
fn install_windows(exe_dir: &Path) -> Result<(), String> {
    let sidecar = exe_dir.join(sidecar_name());
    let runtime = exe_dir.join("career-runtime");
    // Caminhos absolutos — o shim pode viver fora do install dir (WindowsApps).
    let content = format!(
        "@echo off\r\nset \"CAREER_RUNTIME={}\"\r\n\"{}\" %*\r\nexit /b %ERRORLEVEL%\r\n",
        runtime.display(),
        sidecar.display()
    );
    // WindowsApps está no PATH de usuário por padrão (Windows 10/11) — shim
    // com nome curto sem tocar no registro.
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        let winapps = PathBuf::from(local).join("Microsoft").join("WindowsApps");
        if winapps.is_dir() {
            let target = winapps.join("career.cmd");
            std::fs::write(&target, &content)
                .map_err(|e| format!("shim {}: {e}", target.display()))?;
            return Ok(());
        }
    }
    // Fallback: shim no install dir + dir no PATH do usuário via PowerShell.
    let target = exe_dir.join("career.cmd");
    std::fs::write(&target, &content).map_err(|e| format!("shim {}: {e}", target.display()))?;
    let ps = format!(
        "$d='{}';$p=[Environment]::GetEnvironmentVariable('Path','User');\
         if(($p -split ';') -notcontains $d){{\
         [Environment]::SetEnvironmentVariable('Path',(($p,$d|?{{$_}}) -join ';'),'User')}}",
        exe_dir.display()
    );
    let st = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", ps.as_str()])
        .status()
        .map_err(|e| e.to_string())?;
    if st.success() {
        Ok(())
    } else {
        Err(format!("powershell PATH falhou ({st}) — shim em {}", target.display()))
    }
}

#[cfg(unix)]
fn write_exec_shim(target: &Path, content: &str) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::write(target, content).map_err(|e| format!("shim {}: {e}", target.display()))?;
    std::fs::set_permissions(target, std::fs::Permissions::from_mode(0o755))
        .map_err(|e| format!("chmod {}: {e}", target.display()))
}

#[cfg(target_os = "macos")]
fn install_macos(exe_dir: &Path) -> Result<(), String> {
    let sidecar = exe_dir.join(sidecar_name());
    let runtime =
        find_resource_dir(exe_dir, "career-runtime").unwrap_or_else(|| exe_dir.join("career-runtime"));
    let skills = find_resource_dir(exe_dir, "skills").unwrap_or_else(|| exe_dir.join("skills"));
    let content = format!(
        "#!/bin/sh\n# CareerFacilator CLI — shim gerado pelo app desktop\nexport CAREER_RUNTIME=\"{}\"\nexport CAREER_SKILLS=\"{}\"\nexec \"{}\" \"$@\"\n",
        runtime.display(),
        skills.display(),
        sidecar.display()
    );
    // /opt/homebrew/bin cobre Apple Silicon c/ homebrew; /usr/local/bin está
    // no PATH default do macOS — primeiro candidato gravável ganha.
    for dir in ["/opt/homebrew/bin", "/usr/local/bin"] {
        let probe = Path::new(dir).join(".career-write-test");
        if std::fs::write(&probe, b"").is_ok() {
            let _ = std::fs::remove_file(&probe);
            return write_exec_shim(&Path::new(dir).join("career"), &content);
        }
    }
    // Sem dir gravável → um prompt admin via osascript instala o shim. Se o
    // usuário recusar, um marker evita repetir a pergunta em todo launch
    // (apague ~/.careerfacilator/cli-shim-declined p/ tentar de novo).
    let marker = std::env::var_os("HOME").map(PathBuf::from).map(|h| {
        h.join(".careerfacilator").join("cli-shim-declined")
    });
    if marker.as_ref().is_some_and(|m| m.exists()) {
        return Err("instalação do CLI pulada — marker cli-shim-declined presente".into());
    }
    let tmp = std::env::temp_dir().join("career-cli-shim");
    std::fs::write(&tmp, content).map_err(|e| e.to_string())?;
    let script = format!(
        "do shell script \"mkdir -p /usr/local/bin && cp '{}' /usr/local/bin/career && chmod 755 /usr/local/bin/career\" with administrator privileges",
        tmp.display()
    );
    let st = std::process::Command::new("osascript")
        .args(["-e", script.as_str()])
        .status()
        .map_err(|e| e.to_string())?;
    if st.success() {
        Ok(())
    } else {
        if let Some(m) = marker {
            let _ = m.parent().map(std::fs::create_dir_all);
            let _ = std::fs::write(&m, b"cli shim recusado\n");
        }
        Err("instalação do CLI recusada — rode o app de /Applications ou instale o shim manualmente".into())
    }
}

#[cfg(target_os = "linux")]
fn install_linux(exe_dir: &Path) -> Result<(), String> {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "HOME ausente".to_string())?;
    let bin = home.join(".local").join("bin");
    std::fs::create_dir_all(&bin).map_err(|e| format!("mkdir {}: {e}", bin.display()))?;
    // AppImage: o binário interno morre com o mount — o shim aponta p/ o
    // AppImage no modo --career-cli. Pacote instalado (deb/rpm): sidecar com
    // caminho estável, chamado direto com CAREER_RUNTIME.
    let content = match std::env::var("APPIMAGE").ok().filter(|p| !p.is_empty()) {
        Some(img) => format!("#!/bin/sh\nexec \"{}\" --career-cli \"$@\"\n", img),
        None => {
            let sidecar = exe_dir.join(sidecar_name());
            let runtime = find_resource_dir(exe_dir, "career-runtime")
                .unwrap_or_else(|| exe_dir.join("career-runtime"));
            let skills =
                find_resource_dir(exe_dir, "skills").unwrap_or_else(|| exe_dir.join("skills"));
            format!(
                "#!/bin/sh\nexport CAREER_RUNTIME=\"{}\"\nexport CAREER_SKILLS=\"{}\"\nexec \"{}\" \"$@\"\n",
                runtime.display(),
                skills.display(),
                sidecar.display()
            )
        }
    };
    write_exec_shim(&bin.join("career"), &content)
}
