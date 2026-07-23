fn main() {
    if let Err(error) = lachesi_lib::tui::run_from_env() {
        eprintln!("lachesi-tui: {error}");
        std::process::exit(1);
    }
}
