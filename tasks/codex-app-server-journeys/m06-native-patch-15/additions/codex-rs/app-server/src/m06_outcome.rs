//! Dedicated Unix fd4/fd5 bootstrap, before arg0/config/auth/helper entry.
//! The environment value requests restrictions; it is not an execution/trust grant.
use std::io;
use codex_http_client::m06_outcome:: {
    self,
    SourceOwner
};
pub fn before_arg0() -> io::Result<()> {
    if std::env::var_os("M06_NATIVE_SOURCE_PROFILE").is_none() {
        return Ok(());
    }
    m06_outcome::request_restrictive_profile();
    if std::env::var("M06_NATIVE_SOURCE_PROFILE").ok().as_deref()!=Some(m06_outcome::PROFILE) {
        return Err(m06_outcome::deny());
    }
    #[cfg(unix)] {
        use std::os::fd::FromRawFd;
        // Fixed original inherited endpoints; never reopen /dev/fd or caller-selected indices.
        // Check fixed inherited resources before FromRawFd's validity precondition.
        for fd in [4,
        5] {
            let flags=unsafe {
                libc::fcntl(fd,
                libc::F_GETFD)
            };
            if flags<0 {
                return Err(io::Error::last_os_error());
            }
            if unsafe {
                libc::fcntl(fd,
                libc::F_SETFD,
                flags|libc::FD_CLOEXEC)
            }
            <0 {
                return Err(io::Error::last_os_error());
            }
        }
        let control=unsafe {
            std::fs::File::from_raw_fd(4)
        };
        let observations=unsafe {
            std::fs::File::from_raw_fd(5)
        };
        let _owner=SourceOwner::bootstrap(control,
        observations)?;
        // Alternate arg0 helpers cannot inherit original descriptors.
        let executable=std::env::args_os().next().ok_or_else(m06_outcome::deny)?;
        if std::path::Path::new(&executable).file_name().and_then(|v|v.to_str())!=Some("codex-app-server") {
            return Err(m06_outcome::deny());
        }
        Ok(())
    }
    #[cfg(not(unix))] {
        Err(m06_outcome::deny())
    }
}
pub fn before_bootstrap() -> io::Result<()> {
    if std::env::var_os("M06_NATIVE_SOURCE_PROFILE").is_some(){m06_outcome::request_restrictive_profile();}
    if m06_outcome::active() {
        let owner=m06_outcome::original_owner().ok_or_else(m06_outcome::deny)?;
        m06_outcome::require_owner(Some(&owner))?;
        // Auth/cloud config/plugin/OTEL setup is not covered. Refuse before even reading it.
        m06_outcome::deny_unsupported("BOOTSTRAP_AUTH_CLOUD_HELPERS")?;
    }
    Ok(())
}
pub fn before_in_process() -> io::Result<()> {
    if std::env::var_os("M06_NATIVE_SOURCE_PROFILE").is_some(){m06_outcome::request_restrictive_profile();}
    // No pre-entry host epoch is registered. An existing process cannot be adopted.
    m06_outcome::deny_unsupported("IN_PROCESS_PREENTRY_UNKNOWN")
}
#[cfg(test)] #[path="m06_outcome_tests.rs"] mod tests;
