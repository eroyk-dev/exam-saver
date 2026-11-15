// Запуск моста без Android: cargo run --release --example serve -- <каталог данных>
fn main() {
    let dir = std::env::args().nth(1).expect("укажите каталог данных");
    std::fs::create_dir_all(&dir).unwrap();
    let run = hub_core::start(std::path::Path::new(&dir)).unwrap();
    println!("http://{}", run.addr);
    loop {
        std::thread::sleep(std::time::Duration::from_secs(3600));
    }
}
