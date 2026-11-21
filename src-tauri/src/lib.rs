//! Catflix's native side: the window, plus two small network helpers the webview can't do itself.
//!
//! * `native_get` reads a page or JSON document the way a browser would. Some catalogues sit
//!   behind bot checks that refuse proxies, and a webview cannot set `User-Agent` or `Referer`.
//! * The `stream` scheme relays a video file with the referer its host insists on, passing the
//!   player's `Range` requests through so seeking works.

use std::sync::OnceLock;

use serde::Serialize;
use tauri::http::{header, Request, Response, StatusCode};

/// Safari's own user agent: the hosts involved accept it and refuse imitations of Chrome.
const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

/// Hosts the helpers may reach. Anything else is refused, so the webview can't be used to fetch
/// arbitrary URLs.
const ALLOWED: &[&str] = &[
    "aniwaves.tv",
    "kissasia.biz",
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
    Ok(Page { status, body, total })
}

/// `stream://localhost/?url=<file>&referer=<site>` relays one media request.
async fn relay(request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let failure = |status: StatusCode, text: &str| {
        Response::builder()
            .status(status)
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .body(text.as_bytes().to_vec())
            .unwrap()
    };

    let query = request.uri().query().unwrap_or_default();
    let pairs: Vec<(String, String)> = url::form_urlencoded::parse(query.as_bytes()).into_owned().collect();
    let find = |name: &str| pairs.iter().find(|(key, _)| key == name).map(|(_, value)| value.clone());
    let Some(url) = find("url") else {
        return failure(StatusCode::BAD_REQUEST, "missing url");
    };
    let target = match allowed(&url) {
        Ok(target) => target,
        Err(error) => return failure(StatusCode::FORBIDDEN, &error),
    };

    let mut upstream = client().get(target).header(header::ACCEPT, "*/*");
    if let Some(referer) = find("referer") {
        upstream = upstream.header(header::REFERER, referer);
    }
    // Ask for at most 8 MB at a time: the player asks again for the rest, and a seek stays quick.
    let range = request
        .headers()
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok())
        .map(|value| cap_range(value))
        .unwrap_or_else(|| "bytes=0-8388607".to_string());
    upstream = upstream.header(header::RANGE, range);

    let response = match upstream.send().await {
        Ok(response) => response,
        Err(error) => return failure(StatusCode::BAD_GATEWAY, &error.to_string()),
    };

    let mut builder = Response::builder()
        .status(response.status().as_u16())
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::ACCESS_CONTROL_EXPOSE_HEADERS, "Content-Length, Content-Range, Accept-Ranges");
    for name in [header::CONTENT_TYPE, header::CONTENT_RANGE, header::ACCEPT_RANGES] {
        if let Some(value) = response.headers().get(&name) {
            builder = builder.header(name, value.as_bytes());
        }
    }
    match response.bytes().await {
        Ok(bytes) => builder.body(bytes.to_vec()).unwrap(),
        Err(error) => failure(StatusCode::BAD_GATEWAY, &error.to_string()),
    }
}

/// `bytes=N-` or a very long range becomes at most 8 MB, so each answer stays small.
fn cap_range(value: &str) -> String {
    const CHUNK: u64 = 8 * 1024 * 1024;
    let Some(spec) = value.strip_prefix("bytes=") else {
        return value.to_string();
    };
    let mut parts = spec.splitn(2, '-');
    let start: Option<u64> = parts.next().and_then(|start| start.trim().parse().ok());
    let end: Option<u64> = parts.next().and_then(|end| end.trim().parse().ok());
    match (start, end) {
        (Some(start), Some(end)) if end - start < CHUNK => value.to_string(),
        (Some(start), _) => format!("bytes={}-{}", start, start + CHUNK - 1),
        _ => value.to_string(),
    }
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
        let posts = native_get("https://kissasia.biz/wp-json/wp/v2/posts?per_page=2&_fields=id".into(), Some("https://kissasia.biz/".into())).await.unwrap();
        println!("kissasia {} total={:?} {}", posts.status, posts.total, &posts.body[..60.min(posts.body.len())]);
        assert_eq!(posts.status, 200);

        let filter = native_get("https://aniwaves.tv/filter?genre%5B%5D=4&status%5B%5D=0&sort_by=members&page=1".into(), None).await.unwrap();
        println!("aniwaves {} items={}", filter.status, filter.body.matches("class=\"item\"").count());
        assert!(filter.body.contains("class=\"item\""));

        let request = Request::builder()
            .uri("stream://localhost/?url=https%3A%2F%2Fapi.flixfile.top%2Fmedia%2F09B9t3B5pl.mp4&referer=https%3A%2F%2Fkissasia.biz%2F")
            .header(header::RANGE, "bytes=0-")
            .body(Vec::new())
            .unwrap();
        let response = relay(request).await;
        println!("relay {} {:?} {} bytes {:?}", response.status(), response.headers().get(header::CONTENT_TYPE), response.body().len(), response.headers().get(header::CONTENT_RANGE));
        assert_eq!(response.status(), 206);
        assert_eq!(&response.body()[4..8], b"ftyp");

        let refused = native_get("https://example.com/".into(), None).await;
        assert!(refused.is_err());
    }
}
