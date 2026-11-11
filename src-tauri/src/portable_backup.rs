use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    ChaCha20Poly1305, Key, Nonce,
};
use zeroize::Zeroize;

const MAGIC: &[u8; 8] = b"EDUHBA01";
const HEADER_SIZE: usize = 8 + 16 + 12;
pub const MAX_PLAINTEXT_SIZE: usize = 100_000_000;

fn derive_key(password: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    if password.chars().count() < 12 || password.len() > 1024 {
        return Err("Пароль архива должен содержать от 12 до 1024 символов".into());
    }
    let params = Params::new(64 * 1024, 3, 1, Some(32)).map_err(|e| e.to_string())?;
    let mut key = [0u8; 32];
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| e.to_string())?;
    Ok(key)
}

pub fn encrypt(plaintext: &[u8], password: &str) -> Result<Vec<u8>, String> {
    if plaintext.len() > MAX_PLAINTEXT_SIZE {
        return Err("База превышает лимит защищённого архива 100 МБ".into());
    }
    let mut header = [0u8; HEADER_SIZE];
    header[..8].copy_from_slice(MAGIC);
    getrandom::fill(&mut header[8..]).map_err(|e| e.to_string())?;
    let mut key = derive_key(password, &header[8..24])?;
    let cipher = ChaCha20Poly1305::new(&Key::try_from(key.as_slice()).expect("32-byte key"));
    let result = cipher
        .encrypt(
            &Nonce::try_from(&header[24..36]).expect("12-byte nonce"),
            plaintext,
        )
        .map_err(|_| "Не удалось зашифровать архив".to_string());
    key.zeroize();
    let ciphertext = result?;
    let mut archive = Vec::with_capacity(HEADER_SIZE + ciphertext.len());
    archive.extend_from_slice(&header);
    archive.extend_from_slice(&ciphertext);
    Ok(archive)
}

pub fn decrypt(archive: &[u8], password: &str) -> Result<Vec<u8>, String> {
    if archive.len() < HEADER_SIZE + 16
        || archive.len() > HEADER_SIZE + MAX_PLAINTEXT_SIZE + 16
        || &archive[..8] != MAGIC
    {
        return Err("Некорректный или слишком большой архив educatioHarness".into());
    }
    let mut key = derive_key(password, &archive[8..24])?;
    let cipher = ChaCha20Poly1305::new(&Key::try_from(key.as_slice()).expect("32-byte key"));
    let result = cipher
        .decrypt(
            &Nonce::try_from(&archive[24..36]).expect("12-byte nonce"),
            &archive[HEADER_SIZE..],
        )
        .map_err(|_| "Неверный пароль или архив повреждён".to_string());
    key.zeroize();
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_and_wrong_password() {
        let data = b"SQLite format 3\0personal learning history";
        let backup = encrypt(data, "secret phrase 123").unwrap();
        assert!(!backup.windows(data.len()).any(|window| window == data));
        assert_eq!(decrypt(&backup, "secret phrase 123").unwrap(), data);
        assert!(decrypt(&backup, "wrong password 123").is_err());
        let mut damaged = backup;
        *damaged.last_mut().unwrap() ^= 1;
        assert!(decrypt(&damaged, "secret phrase 123").is_err());
    }
}
