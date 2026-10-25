// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
//! The Microsoft Store (MSIX) build. Store updates wipe the package's
//! LocalCache, where Windows redirects %APPDATA% writes, so user data lives in
//! LocalState instead, as it did in the Electron Store build.
use std::path::PathBuf;

/// The package family name when running as an MSIX package.
#[cfg(windows)]
pub fn package_family_name() -> Option<String> {
    use windows_sys::Win32::Foundation::{ERROR_INSUFFICIENT_BUFFER, ERROR_SUCCESS};
    use windows_sys::Win32::Storage::Packaging::Appx::GetCurrentPackageFamilyName;

    let mut len: u32 = 0;
    // SAFETY: a null buffer with length 0 asks for the length needed.
    let rc = unsafe { GetCurrentPackageFamilyName(&mut len, std::ptr::null_mut()) };
    if rc != ERROR_INSUFFICIENT_BUFFER || len == 0 {
        return None; // APPMODEL_ERROR_NO_PACKAGE: not packaged.
    }
    let mut buf = vec![0u16; len as usize];
    // SAFETY: buf holds `len` UTF-16 units, as the first call asked for.
    let rc = unsafe { GetCurrentPackageFamilyName(&mut len, buf.as_mut_ptr()) };
    if rc != ERROR_SUCCESS {
        return None;
    }
    let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    Some(String::from_utf16_lossy(&buf[..end]))
}

#[cfg(not(windows))]
pub fn package_family_name() -> Option<String> {
    None
}

pub fn is_windows_store() -> bool {
    package_family_name().is_some()
}

/// `%LOCALAPPDATA%\Packages\<family name>\LocalState` for the Store build.
pub fn local_state_dir() -> Option<PathBuf> {
    let family = package_family_name()?;
    Some(
        dirs::data_local_dir()?
            .join("Packages")
            .join(family)
            .join("LocalState"),
    )
}
