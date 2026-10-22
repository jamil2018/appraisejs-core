//! Sole original underlying writer, including TLS, upgrade, automatic Pong and flush.
use std::io;
use std::pin::Pin;
use std::task::{Context, Poll};

use codex_http_client::m06_outcome::{self, SourceOwner, WriteTicket};
use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};

/// Move-only: there is no method exposing or cloning the underlying stream.
pub(crate) struct M06Io<T> {
    inner: T,
    owner: Option<SourceOwner>,
    pending: Option<WriteTicket>,
}

impl<T> M06Io<T> {
    pub(crate) fn new(inner: T, owner: Option<SourceOwner>) -> io::Result<Self> {
        m06_outcome::require_owner(owner.as_ref())?;
        if let Some(owner) = &owner { owner.claim_direct_io()?; }
        Ok(Self { inner, owner, pending: None })
    }

    fn gate(&self) -> io::Result<()> {
        m06_outcome::require_owner(self.owner.as_ref())?;
        if let Some(owner) = &self.owner {
            owner.final_effect_guard()?;
        }
        Ok(())
    }
}

impl<T: AsyncRead + Unpin> AsyncRead for M06Io<T> {
    fn poll_read(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buffer: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        let this = self.get_mut();
        if let Err(error) = m06_outcome::require_observation_owner(this.owner.as_ref()) {
            return Poll::Ready(Err(error));
        }
        Pin::new(&mut this.inner).poll_read(cx, buffer)
    }
}

impl<T: AsyncWrite + Unpin> AsyncWrite for M06Io<T> {
    fn poll_write(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        bytes: &[u8],
    ) -> Poll<io::Result<usize>> {
        let this = self.get_mut();
        if let Err(error) = m06_outcome::require_owner(this.owner.as_ref()) {
            return Poll::Ready(Err(error));
        }
        if let Some(owner) = &this.owner {
            if this.pending.is_none() {
                match owner.reserve_write(bytes) {
                    Ok(ticket) => this.pending = Some(ticket),
                    Err(error) => return Poll::Ready(Err(error)),
                }
            }
            let ticket = this.pending.as_mut().expect("original pending ticket");
            match ticket.poll_admission(cx, bytes) {
                Poll::Pending => return Poll::Pending,
                Poll::Ready(Err(error)) => return Poll::Ready(Err(error)),
                Poll::Ready(Ok(())) => (),
            }
        }
        // No await, callback or queue between the final guard and the owned write poll.
        match Pin::new(&mut this.inner).poll_write(cx, bytes) {
            Poll::Pending => Poll::Pending,
            Poll::Ready(Ok(count)) => {
                if let Some(ticket) = &mut this.pending {
                    if let Err(error) = ticket.progress(count) {
                        return Poll::Ready(Err(error));
                    }
                    if ticket.complete() {
                        this.pending = None;
                    }
                }
                Poll::Ready(Ok(count))
            }
            Poll::Ready(Err(error)) => {
                if let Some(owner) = &this.owner {
                    owner.fence("WRITE_IO_ERROR");
                }
                Poll::Ready(Err(error))
            }
        }
    }

    fn poll_write_vectored(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buffers: &[io::IoSlice<'_>],
    ) -> Poll<io::Result<usize>> {
        // AsyncWrite permits consuming only the first nonempty prefix.
        let first = buffers.iter().find(|buffer| !buffer.is_empty());
        let bytes: &[u8] = first.map_or(&[], |buffer| buffer.as_ref());
        self.poll_write(cx, bytes)
    }

    fn is_write_vectored(&self) -> bool { false }

    fn poll_flush(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        let this = self.get_mut();
        if this.pending.is_some() {
            if let Some(owner) = &this.owner { owner.fence("FLUSH_WITH_UNRESOLVED_WRITE"); }
            return Poll::Ready(Err(m06_outcome::deny()));
        }
        if let Err(error) = this.gate() { return Poll::Ready(Err(error)); }
        Pin::new(&mut this.inner).poll_flush(cx)
    }

    fn poll_shutdown(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        let this = self.get_mut();
        if this.pending.is_some() {
            if let Some(owner) = &this.owner { owner.fence("CLOSE_WITH_UNRESOLVED_WRITE"); }
            return Poll::Ready(Err(m06_outcome::deny()));
        }
        if let Err(error) = this.gate() { return Poll::Ready(Err(error)); }
        Pin::new(&mut this.inner).poll_shutdown(cx)
    }
}

#[cfg(test)]
#[path = "m06_io_tests.rs"]
mod tests;
