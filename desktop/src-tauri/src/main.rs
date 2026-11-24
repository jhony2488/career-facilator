// CareerFacilator UI — shell desktop mínimo.
// Sobe o binário `career` (externalBin) em `serve --port 0 --no-open`,
// captura a URL+token do stdout e aponta a webview para o dashboard local.
// O sidecar carrega `career-runtime/` (CAREER_RUNTIME aponta p/ o recurso
// empacotado) e morre junto com a janela/app.
//
// O mesmo sidecar atende o terminal: no 1º launch o app grava o comando
// `career` no PATH do usuário (cli_shim) e `--career-cli` executa o binário
// em modo passthrough (usado pelo shim de Linux/AppImage).
mod cli_shim;

use std::sync::Mutex;
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

struct Sidecar(Mutex<Option<CommandChild>>);

fn main() {
    let argv: Vec<String> = std::env::args().collect();
    if let Some(pos) = argv.iter().position(|a| a == "--career-cli") {
        std::process::exit(cli_shim::passthrough(&argv[pos + 1..]));
    }

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let rt_dir = app
                .path()
                .resource_dir()
                .ok()
                .map(|d| d.join("career-runtime"));

            let mut cmd = app
                .shell()
                .sidecar("career")
                .map_err(|e| format!("sidecar 'career' não encontrado no pacote: {e}"))?
                .args(["serve", "--port", "0", "--no-open"]);
            if let Some(dir) = rt_dir {
                if dir.exists() {
                    cmd = cmd.env("CAREER_RUNTIME", dir.to_string_lossy().to_string());
                }
            }
            let (mut rx, child) = cmd
                .spawn()
                .map_err(|e| format!("falha ao iniciar sidecar 'career': {e}"))?;
            app.manage(Sidecar(Mutex::new(Some(child))));

            // `career` no terminal do usuário — idempotente, em background.
            cli_shim::install();

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut opened = false;
                while let Some(event) = rx.recv().await {
                    if opened {
                        continue;
                    }
                    if let CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) = event {
                        // cmdUi imprime "Interface gráfica em http://127.0.0.1:<p>/?token=<t>"
                        let line = String::from_utf8_lossy(&bytes);
                        if let Some(raw) =
                            line.split_whitespace().find(|w| w.starts_with("http://"))
                        {
                            if let Ok(url) = raw.parse() {
                                let _ = WebviewWindowBuilder::new(
                                    &handle,
                                    "main",
                                    WebviewUrl::External(url),
                                )
                                .title("CareerFacilator AI")
                                .inner_size(1120.0, 780.0)
                                .resizable(true)
                                .build();
                                opened = true;
                            }
                        }
                    }
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("falha ao iniciar CareerFacilator UI");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            if let Some(child) = handle
                .state::<Sidecar>()
                .0
                .lock()
                .ok()
                .and_then(|mut g| g.take())
            {
                let _ = child.kill();
            }
        }
    });
}
