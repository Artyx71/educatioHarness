use reqwest::{blocking::Client, header::{AUTHORIZATION, ETAG, IF_MATCH, IF_NONE_MATCH}, redirect::Policy, StatusCode, Url};
use serde::Serialize;
use std::{io::Read, time::Duration};

const MAX_ARCHIVE_BYTES: usize = 100_000_052;

#[derive(Serialize)]
pub struct RemoteStatus { pub has_archive: bool, pub etag: Option<String> }

pub fn endpoint(base: &str) -> Result<Url, String> {
    if base.len() > 2048 { return Err("Адрес сервера слишком длинный".into()); }
    let mut url=Url::parse(base).map_err(|_|"Введите полный адрес сервера, например https://study.example.org".to_string())?;
    let local=matches!(url.host_str(),Some("localhost"|"127.0.0.1"|"[::1]"));
    if url.scheme()!="https" && !(url.scheme()=="http"&&local) { return Err("Для удалённого сервера нужен HTTPS; HTTP разрешён только для localhost".into()); }
    if !url.username().is_empty()||url.password().is_some()||url.query().is_some()||url.fragment().is_some()||url.path()!="/" { return Err("Укажите только базовый адрес сервера без пути, параметров и учётных данных".into()); }
    url.set_path("/v1/archive");
    Ok(url)
}

fn client() -> Result<Client,String> {
    Client::builder().no_proxy().no_gzip().no_brotli().no_deflate().no_zstd().redirect(Policy::none()).timeout(Duration::from_secs(120)).build().map_err(|e|e.to_string())
}

fn authorization(token:&str) -> Result<String,String> {
    if token.len()<32||token.len()>256||!token.is_ascii()||token.bytes().any(|b|b<=32||b>=127) { return Err("Некорректный токен сервера".into()); }
    Ok(format!("Bearer {token}"))
}

fn remote_status(client:&Client,url:&Url,auth:&str) -> Result<RemoteStatus,String> {
    let response=client.head(url.clone()).header(AUTHORIZATION,auth).send().map_err(|e|format!("Сервер недоступен: {e}"))?;
    if response.headers().get("x-educatio-sync").and_then(|v|v.to_str().ok())!=Some("1") {return Err("Адрес не ведёт на сервер educatioHarness".into());}
    match response.status() {
        StatusCode::OK => Ok(RemoteStatus {has_archive:true,etag:response.headers().get(ETAG).and_then(|v|v.to_str().ok()).map(str::to_owned)}),
        StatusCode::NOT_FOUND => Ok(RemoteStatus {has_archive:false,etag:None}),
        StatusCode::UNAUTHORIZED => Err("Сервер отклонил токен. Проверьте подключение".into()),
        code => Err(format!("Сервер ответил кодом {code}")),
    }
}

pub fn status(base:&str,token:&str) -> Result<RemoteStatus,String> {
    let url=endpoint(base)?;
    let auth=authorization(token)?;
    remote_status(&client()?,&url,&auth)
}

pub fn upload(base:&str,token:&str,archive:Vec<u8>,expected_etag:Option<&str>) -> Result<String,String> {
    if archive.len()<52||archive.len()>MAX_ARCHIVE_BYTES||!archive.starts_with(b"EDUHBA01") { return Err("Выберите защищённый архив .ehb до 100 МБ".into()); }
    let url=endpoint(base)?;
    let auth=authorization(token)?;
    let client=client()?;
    let current=remote_status(&client,&url,&auth)?;
    if current.has_archive && current.etag.as_deref()!=expected_etag {
        return Err("Архив на сервере отличается от последней известной версии. Сначала скачайте его".into());
    }
    if !current.has_archive && expected_etag.is_some() {return Err("Архив на сервере исчез. Проверьте сервер перед отправкой".into());}
    let mut request=client.put(url).header(AUTHORIZATION,auth).header("content-type","application/octet-stream").body(archive);
    request=if current.has_archive {
        request.header(IF_MATCH,current.etag.ok_or("Сервер не вернул ETag для защиты от конфликтов")?)
    } else {request.header(IF_NONE_MATCH,"*")};
    let response=request.send().map_err(|e|format!("Не удалось отправить архив: {e}"))?;
    if response.headers().get("x-educatio-sync").and_then(|v|v.to_str().ok())!=Some("1") {return Err("Неверный ответ сервера educatioHarness".into());}
    match response.status() {
        StatusCode::OK => response.headers().get(ETAG).and_then(|v|v.to_str().ok()).filter(|tag|valid_etag(tag)).map(str::to_owned).ok_or("Сервер не вернул ETag нового архива".into()),
        StatusCode::PRECONDITION_FAILED|StatusCode::CONFLICT => Err("Архив на сервере изменился. Сначала скачайте его и проверьте данные".into()),
        StatusCode::UNAUTHORIZED => Err("Сервер отклонил токен".into()),
        code => Err(format!("Не удалось отправить архив: HTTP {code}")),
    }
}

fn valid_etag(value:&str) -> bool {
    value.len()==66 && value.starts_with('"') && value.ends_with('"') && value.as_bytes()[1..65].iter().all(u8::is_ascii_hexdigit)
}

pub fn download(base:&str,token:&str) -> Result<(Vec<u8>,String),String> {
    let url=endpoint(base)?;
    let auth=authorization(token)?;
    let response=client()?.get(url).header(AUTHORIZATION,auth).send().map_err(|e|format!("Сервер недоступен: {e}"))?;
    if response.headers().get("x-educatio-sync").and_then(|v|v.to_str().ok())!=Some("1") {return Err("Неверный ответ сервера educatioHarness".into());}
    match response.status() {
        StatusCode::OK => {},
        StatusCode::NOT_FOUND => return Err("На сервере пока нет архива".into()),
        StatusCode::UNAUTHORIZED => return Err("Сервер отклонил токен".into()),
        code => return Err(format!("Не удалось скачать архив: HTTP {code}")),
    }
    let etag=response.headers().get(ETAG).and_then(|v|v.to_str().ok()).filter(|tag|valid_etag(tag)).ok_or("Сервер не вернул версию архива")?.to_owned();
    if response.content_length().is_some_and(|size|size>MAX_ARCHIVE_BYTES as u64) { return Err("Архив сервера превышает 100 МБ".into()); }
    let mut archive=Vec::new();
    response.take((MAX_ARCHIVE_BYTES+1) as u64).read_to_end(&mut archive).map_err(|e|e.to_string())?;
    if archive.len()<52||archive.len()>MAX_ARCHIVE_BYTES||!archive.starts_with(b"EDUHBA01") { return Err("Сервер вернул некорректный архив".into()); }
    Ok((archive,etag))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn remote_url_requires_https_except_loopback() {
        assert!(endpoint("https://example.org/").is_ok());
        assert!(endpoint("http://127.0.0.1:8787/").is_ok());
        assert!(endpoint("http://example.org/").is_err());
        assert!(endpoint("https://user:secret@example.org/").is_err());
        assert!(endpoint("https://example.org/other").is_err());
        assert!(endpoint("https://example.org/?key=x").is_err());
    }
    #[test]
    fn client_uploads_and_downloads_from_loopback_protocol() {
        use std::{io::{Read,Write},net::TcpListener,thread};
        let listener=TcpListener::bind("127.0.0.1:0").unwrap();
        let port=listener.local_addr().unwrap().port();
        let token="test-token-with-at-least-thirty-two-bytes";
        let archive=[b"EDUHBA01".as_slice(),&[7u8;44]].concat();
        let expected=archive.clone();
        let server=thread::spawn(move || {
            for (method,status) in [("HEAD","404 Not Found"),("PUT","200 OK"),("GET","200 OK")] {
                let (mut stream,_)=listener.accept().unwrap();
                stream.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
                let mut data=Vec::new();
                let mut chunk=[0u8;4096];
                let header_end=loop {
                    let count=stream.read(&mut chunk).unwrap();
                    assert!(count>0);
                    data.extend_from_slice(&chunk[..count]);
                    if let Some(position)=data.windows(4).position(|window|window==b"\r\n\r\n") {break position+4}
                };
                let header=String::from_utf8_lossy(&data[..header_end]).to_ascii_lowercase();
                assert!(header.starts_with(&method.to_ascii_lowercase()));
                assert!(header.contains(&format!("authorization: bearer {token}")));
                if method=="PUT" {
                    assert!(header.contains("if-none-match: *"));
                    while data.len()-header_end<expected.len() {
                        let count=stream.read(&mut chunk).unwrap();
                        assert!(count>0);
                        data.extend_from_slice(&chunk[..count]);
                    }
                    assert_eq!(&data[header_end..],expected);
                }
                let body=if method=="GET" {expected.as_slice()} else {&[]};
                stream.write_all(format!("HTTP/1.1 {status}\r\nContent-Length: {}\r\nETag: \"{}\"\r\nX-Educatio-Sync: 1\r\nConnection: close\r\n\r\n",body.len(),"a".repeat(64)).as_bytes()).unwrap();
                stream.write_all(body).unwrap();
            }
        });
        let url=format!("http://127.0.0.1:{port}/");
        assert_eq!(upload(&url,token,archive.clone(),None).unwrap(),format!("\"{}\"","a".repeat(64)));
        assert_eq!(download(&url,token).unwrap().0,archive);
        server.join().unwrap();
    }
    #[test]
    fn new_device_cannot_overwrite_existing_remote_archive_without_baseline() {
        use std::{io::{Read,Write},net::TcpListener,thread};
        let listener=TcpListener::bind("127.0.0.1:0").unwrap();
        let port=listener.local_addr().unwrap().port();
        let server=thread::spawn(move || {
            let (mut stream,_)=listener.accept().unwrap();
            stream.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
            let mut buffer=[0u8;2048];
            let size=stream.read(&mut buffer).unwrap();
            assert!(String::from_utf8_lossy(&buffer[..size]).starts_with("HEAD "));
            stream.write_all(format!("HTTP/1.1 200 OK\r\nContent-Length: 0\r\nETag: \"{}\"\r\nX-Educatio-Sync: 1\r\nConnection: close\r\n\r\n","a".repeat(64)).as_bytes()).unwrap();
        });
        let archive=[b"EDUHBA01".as_slice(),&[7u8;44]].concat();
        let error=upload(&format!("http://127.0.0.1:{port}/"),"test-token-with-at-least-thirty-two-bytes",archive,None).unwrap_err();
        assert!(error.contains("Сначала скачайте"));
        server.join().unwrap();
    }
}
