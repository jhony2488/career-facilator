// CareerFacilator UI — shell desktop mínimo.
// Sobe o binário `career` (externalBin) em `serve --port 0 --no-open`,
// captura a URL+token do stdout e aponta a webview para o dashboard local.
// O sidecar carrega `career-runtime/` (CAREER_RUNTIME aponta p/ o recurso
// empacotado) e morre junto com a janela/app.
use std::sync::Mutex;
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

struct Sidecar(Mutex<Option<CommandChild>>);

fn main() {
    tauri::Builder::default()
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

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut opened = false;
                while let Some(event) = rx.recv().await {
                    if opened {
                        continue;
                    }
                    if let CommandEvent::Stdout(line) | CommandEvent::Stderr(line) = event {
                        // cmdUi imprime "Interface gráfica em http://127.0.0.1:<p>/?token=<t>"
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
        .on_event(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(state) = app.try_state::<Sidecar>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("falha ao iniciar CareerFacilator UI");
}
