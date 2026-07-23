use std::{
    io::{self, Stdout},
    panic,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Once, OnceLock,
    },
};

use crossterm::{
    cursor::{Hide, Show},
    event::{DisableMouseCapture, EnableMouseCapture},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{backend::CrosstermBackend, layout::Rect, Terminal};

pub struct TerminalGuard {
    terminal: Terminal<CrosstermBackend<Stdout>>,
    interrupted: Arc<AtomicBool>,
}

impl TerminalGuard {
    pub fn enter() -> io::Result<Self> {
        install_panic_restore_hook();
        let interrupted = install_sigint_restore_handler()?;

        enable_raw_mode()?;
        let mut stdout = io::stdout();
        execute!(stdout, EnterAlternateScreen, EnableMouseCapture, Hide)?;
        let backend = CrosstermBackend::new(stdout);
        let terminal = Terminal::new(backend)?;

        Ok(Self {
            terminal,
            interrupted,
        })
    }

    pub fn draw<F>(&mut self, draw: F) -> io::Result<()>
    where
        F: FnOnce(&mut ratatui::Frame<'_>),
    {
        self.terminal.draw(draw)?;
        Ok(())
    }

    pub fn interrupted(&self) -> bool {
        self.interrupted.load(Ordering::SeqCst)
    }

    pub fn area(&self) -> io::Result<Rect> {
        self.terminal
            .size()
            .map(|size| Rect::new(0, 0, size.width, size.height))
    }

    pub fn suspend<T>(&mut self, action: impl FnOnce() -> T) -> io::Result<T> {
        restore_terminal()?;
        let output = action();
        enable_raw_mode()?;
        execute!(io::stdout(), EnterAlternateScreen, EnableMouseCapture, Hide)?;
        self.terminal.clear()?;
        Ok(output)
    }
}

impl Drop for TerminalGuard {
    fn drop(&mut self) {
        let _ = restore_terminal();
    }
}

fn install_panic_restore_hook() {
    static PANIC_HOOK: Once = Once::new();
    PANIC_HOOK.call_once(|| {
        let original_hook = panic::take_hook();
        panic::set_hook(Box::new(move |panic_info| {
            let _ = restore_terminal();
            original_hook(panic_info);
        }));
    });
}

fn install_sigint_restore_handler() -> io::Result<Arc<AtomicBool>> {
    static INTERRUPTED: OnceLock<Arc<AtomicBool>> = OnceLock::new();
    let interrupted = INTERRUPTED
        .get_or_init(|| Arc::new(AtomicBool::new(false)))
        .clone();

    static SIGINT_HANDLER: Once = Once::new();
    let handler_flag = interrupted.clone();
    let mut install_result = Ok(());
    SIGINT_HANDLER.call_once(|| {
        install_result = ctrlc::set_handler(move || {
            handler_flag.store(true, Ordering::SeqCst);
            let _ = restore_terminal();
        })
        .map_err(io::Error::other);
    });
    install_result?;
    interrupted.store(false, Ordering::SeqCst);
    Ok(interrupted)
}

fn restore_terminal() -> io::Result<()> {
    disable_raw_mode()?;
    execute!(
        io::stdout(),
        Show,
        LeaveAlternateScreen,
        DisableMouseCapture
    )
}
