//! Catflix's native side: the window, plus two small network helpers the webview can't do itself.
//!
//! * `native_get` reads a page or JSON document the way a browser would. Some catalogues sit
//!   behind bot checks that refuse proxies, and a webview cannot set `User-Agent` or `Referer`.
//! * The `stream` scheme relays a video file with the referer its host insists on, passing the
//!   player's `Range` requests through so seeking works.

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex, OnceLock};

use serde::Serialize;
use tauri::http::{header, Request, Response, StatusCode};

/// Safari's own user agent: the hosts involved accept it and refuse imitations of Chrome.
const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

/// Hosts the helpers may reach. Anything else is refused, so the webview can't be used to fetch
/// arbitrary URLs.
const ALLOWED: &[&str] = &[
    "aniwaves.tv",
    "kissasia.biz",
    "www.blogger.com",
    "api.flixfile.top",
    "cdnvideo.autos",
    "sooplive.com",
    "imostatic.com",
    "rumble.cloud",
    "1a-1791.com",
];

fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .timeout(std::time::Duration::from_secs(60))
            .build()
            .expect("HTTP client")
    })
}

fn allowed(url: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(url).map_err(|_| "that address is not valid".to_string())?;
    let host = parsed.host_str().unwrap_or_default();
    let ok = parsed.scheme() == "https"
        && ALLOWED
            .iter()
            .any(|domain| host == *domain || host.ends_with(&format!(".{domain}")));
    if ok {
        Ok(parsed)
    } else {
        Err(format!("{host} is not a Catflix source"))
    }
}

#[derive(Serialize)]
struct Page {
    status: u16,
    body: String,
    /// WordPress puts the result count in a header; it is passed on when present.
    total: Option<u64>,
}

#[tauri::command]
async fn native_get(url: String, referer: Option<String>) -> Result<Page, String> {
    let target = allowed(&url)?;
    let mut request = client()
        .get(target)
        .header(header::ACCEPT, "text/html,application/json;q=0.9,*/*;q=0.8")
        .header(header::ACCEPT_LANGUAGE, "en-US,en;q=0.9");
    if let Some(referer) = referer {
        request = request.header(header::REFERER, referer);
    }
    let response = request.send().await.map_err(|error| error.to_string())?;
    let status = response.status().as_u16();
    let total = response
        .headers()
        .get("x-wp-total")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse().ok());
    let body = response.text().await.map_err(|error| error.to_string())?;
    #[cfg(debug_assertions)]
    eprintln!(
        "[native_get] {status} {} ({} bytes)",
        url.chars().take(110).collect::<String>(),
        body.len()
    );
    Ok(Page {
        status,
        body,
        total,
    })
}

/// `stream://localhost/?url=<file>&referer=<site>` relays one media request.
///
/// The webview's media loader asks for many tiny ranges (often under 1 KB). Sending each one to
/// the host would mean a round trip per read, so the file is fetched in 2 MB blocks, kept in a
/// small cache, and every read is answered from there. The next block is fetched ahead.
async fn relay(request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let failure = |status: StatusCode, text: &str| {
        Response::builder()
            .status(status)
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .body(text.as_bytes().to_vec())
            .unwrap()
    };

    let query = request.uri().query().unwrap_or_default();
    let pairs: Vec<(String, String)> = url::form_urlencoded::parse(query.as_bytes())
        .into_owned()
        .collect();
    let find = |name: &str| {
        pairs
            .iter()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.clone())
    };
    let Some(url) = find("url") else {
        return failure(StatusCode::BAD_REQUEST, "missing url");
    };
    if let Err(error) = allowed(&url) {
        return failure(StatusCode::FORBIDDEN, &error);
    }
    let referer = find("referer");

    let (start, end) = request
        .headers()
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok())
        .and_then(parse_range)
        .unwrap_or((0, None));
    let index = start / BLOCK;

    let first = match block(&url, referer.as_deref(), index).await {
        Ok(block) => block,
        Err(error) => {
            #[cfg(debug_assertions)]
            eprintln!("[stream] block {index} of {url} failed: {error}");
            return failure(StatusCode::BAD_GATEWAY, &error);
        }
    };
    let total = first.total;
    if start >= total {
        return Response::builder()
            .status(StatusCode::RANGE_NOT_SATISFIABLE)
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .header(header::CONTENT_RANGE, format!("bytes */{total}"))
            .body(Vec::new())
            .unwrap();
    }

    // Answer exactly the bytes asked for, joining blocks where the range crosses an edge: the
    // macOS media loader does not ask again for a short answer, and audio goes missing if it gets
    // one. An open-ended request (`bytes=N-`) gets the rest of this block and the next.
    let last = match end {
        Some(end) => end.min(total - 1).min(start + MAX_ANSWER - 1),
        None => ((index + 2) * BLOCK - 1).min(total - 1),
    };
    let mut body = Vec::with_capacity((last - start + 1) as usize);
    let mut current = first;
    let mut position = start;
    let mut at = index;
    loop {
        let block_start = at * BLOCK;
        let block_last = block_start + current.bytes.len() as u64 - 1;
        let to = last.min(block_last);
        body.extend_from_slice(
            &current.bytes[(position - block_start) as usize..=(to - block_start) as usize],
        );
        if to >= last {
            break;
        }
        position = to + 1;
        at += 1;
        current = match block(&url, referer.as_deref(), at).await {
            Ok(block) => block,
            Err(error) => return failure(StatusCode::BAD_GATEWAY, &error),
        };
    }
    let last = start + body.len() as u64 - 1;

    // Read ahead: the block after this answer is usually wanted a moment later.
    let next = last / BLOCK + 1;
    if next * BLOCK < total {
        let (url, referer) = (url.clone(), referer.clone());
        tauri::async_runtime::spawn(async move {
            let _ = self::block(&url, referer.as_deref(), next).await;
        });
    }

    Response::builder()
        .status(StatusCode::PARTIAL_CONTENT)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(
            header::ACCESS_CONTROL_EXPOSE_HEADERS,
            "Content-Length, Content-Range, Accept-Ranges",
        )
        .header(header::CONTENT_TYPE, current.content_type.as_str())
        .header(header::ACCEPT_RANGES, "bytes")
        .header(
            header::CONTENT_RANGE,
            format!("bytes {start}-{last}/{total}"),
        )
        .body(body)
        .unwrap()
}

/// The longest single answer: a bounded request larger than this is answered in part.
const MAX_ANSWER: u64 = 16 * 1024 * 1024;
const BLOCK: u64 = 2 * 1024 * 1024;
/// About 96 MB: a few minutes of video either side of where the viewer is.
const KEEP: usize = 48;

#[derive(Clone)]
struct Block {
    bytes: Arc<Vec<u8>>,
    total: u64,
    content_type: Arc<String>,
}

type Slot = Arc<tokio::sync::OnceCell<Block>>;

/// Cached blocks by (file, index), oldest first, so the cache stays bounded.
fn cache() -> &'static Mutex<(HashMap<(String, u64), Slot>, VecDeque<(String, u64)>)> {
    static CACHE: OnceLock<Mutex<(HashMap<(String, u64), Slot>, VecDeque<(String, u64)>)>> =
        OnceLock::new();
    CACHE.get_or_init(|| Mutex::new((HashMap::new(), VecDeque::new())))
}

/// One block of a file, fetched once even when several reads want it at the same time.
async fn block(url: &str, referer: Option<&str>, index: u64) -> Result<Block, String> {
    let key = (url.to_string(), index);
    let slot = {
        let mut guard = cache().lock().unwrap();
        let (slots, order) = &mut *guard;
        if let Some(slot) = slots.get(&key) {
            slot.clone()
        } else {
            let slot: Slot = Arc::new(tokio::sync::OnceCell::new());
            slots.insert(key.clone(), slot.clone());
            order.push_back(key.clone());
            while order.len() > KEEP {
                if let Some(old) = order.pop_front() {
                    slots.remove(&old);
                }
            }
            slot
        }
    };
    let result = slot
        .get_or_try_init(|| fetch_block(url, referer, index))
        .await
        .cloned();
    if result.is_err() {
        // Let the next read try again rather than remembering the failure.
        let mut guard = cache().lock().unwrap();
        guard.0.remove(&key);
    }
    result
}

async fn fetch_block(url: &str, referer: Option<&str>, index: u64) -> Result<Block, String> {
    let target = allowed(url)?;
    let mut upstream = client().get(target).header(header::ACCEPT, "*/*").header(
        header::RANGE,
        format!("bytes={}-{}", index * BLOCK, (index + 1) * BLOCK - 1),
    );
    if let Some(referer) = referer {
        upstream = upstream.header(header::REFERER, referer);
    }
    let response = upstream.send().await.map_err(|error| error.to_string())?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("the host answered {status}"));
    }
    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("video/mp4")
        .to_string();
    // `bytes a-b/total` on a 206; a 200 means the host sent the whole file.
    let total_from_range = response
        .headers()
        .get(header::CONTENT_RANGE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.rsplit('/').next())
        .and_then(|value| value.parse::<u64>().ok());
    let bytes = response.bytes().await.map_err(|error| error.to_string())?;
    let (bytes, total) = if status == StatusCode::PARTIAL_CONTENT {
        (
            bytes.to_vec(),
            total_from_range.unwrap_or(index * BLOCK + bytes.len() as u64),
        )
    } else {
        // No range support: keep only the wanted block of the whole file.
        let total = bytes.len() as u64;
        let from = (index * BLOCK).min(total) as usize;
        let to = ((index + 1) * BLOCK).min(total) as usize;
        (bytes[from..to].to_vec(), total)
    };
    if bytes.is_empty() {
        return Err("the host sent nothing".to_string());
    }
    #[cfg(debug_assertions)]
    eprintln!(
        "[stream] block {index} ({} bytes of {total}) {url}",
        bytes.len()
    );
    Ok(Block {
        bytes: Arc::new(bytes),
        total,
        content_type: Arc::new(content_type),
    })
}

/// `bytes=a-b` or `bytes=a-` as (a, Some(b) / None).
fn parse_range(value: &str) -> Option<(u64, Option<u64>)> {
    let spec = value.strip_prefix("bytes=")?;
    let (start, end) = spec.split_once('-')?;
    let start = start.trim().parse().ok()?;
    let end = end.trim().parse().ok();
    Some((start, end))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![native_get])
        .register_asynchronous_uri_scheme_protocol("stream", |_context, request, responder| {
            tauri::async_runtime::spawn(async move {
                responder.respond(relay(request).await);
            });
        })
        .run(tauri::generate_context!())
        .expect("error while running Catflix");
}

#[cfg(test)]
mod live {
    use super::*;

    /// Hits the real sources: `cargo test -- --ignored` to run it.
    #[tokio::test]
    #[ignore]
    async fn sources_answer() {
        let posts = native_get(
            "https://kissasia.biz/wp-json/wp/v2/posts?per_page=2&_fields=id".into(),
            Some("https://kissasia.biz/".into()),
        )
        .await
        .unwrap();
        println!(
            "kissasia {} total={:?} {}",
            posts.status,
            posts.total,
            &posts.body[..60.min(posts.body.len())]
        );
        assert_eq!(posts.status, 200);

        let filter = native_get(
            "https://aniwaves.tv/filter?genre%5B%5D=4&status%5B%5D=0&sort_by=members&page=1".into(),
            None,
        )
        .await
        .unwrap();
        println!(
            "aniwaves {} items={}",
            filter.status,
            filter.body.matches("class=\"item\"").count()
        );
        assert!(filter.body.contains("class=\"item\""));

        let request = Request::builder()
            .uri("stream://localhost/?url=https%3A%2F%2Fapi.flixfile.top%2Fmedia%2F09B9t3B5pl.mp4&referer=https%3A%2F%2Fkissasia.biz%2F")
            .header(header::RANGE, "bytes=0-")
            .body(Vec::new())
            .unwrap();
        let response = relay(request).await;
        println!(
            "relay {} {:?} {} bytes {:?}",
            response.status(),
            response.headers().get(header::CONTENT_TYPE),
            response.body().len(),
            response.headers().get(header::CONTENT_RANGE)
        );
        assert_eq!(response.status(), 206);
        assert_eq!(&response.body()[4..8], b"ftyp");

        // Tiny reads, as the webview makes them, come from the cached block.
        for offset in [1000u64, 5000, 900_000, 2 * 1024 * 1024 - 300] {
            let request = Request::builder()
                .uri("stream://localhost/?url=https%3A%2F%2Fapi.flixfile.top%2Fmedia%2F09B9t3B5pl.mp4&referer=https%3A%2F%2Fkissasia.biz%2F")
                .header(header::RANGE, format!("bytes={offset}-{}", offset + 799))
                .body(Vec::new())
                .unwrap();
            let started = std::time::Instant::now();
            let response = relay(request).await;
            println!(
                "read {offset}: {} {} bytes in {:?}",
                response.status(),
                response.body().len(),
                started.elapsed()
            );
            assert_eq!(response.body().len(), 800);
        }

        let refused = native_get("https://example.com/".into(), None).await;
        assert!(refused.is_err());
    }
}
