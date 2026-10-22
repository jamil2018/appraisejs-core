//! AUTHORED_UNEXECUTED. Unit fixture covers the same underlying writer, no network.
use super::*;
use tokio::io::AsyncWriteExt;
#[tokio::test]
async fn ordinary_unowned_io_preserves_bytes() {
    let (write,
    mut read)=tokio::io::duplex(16);
    let mut io=M06Io::new(write,
    None).unwrap();
    io.write_all(b"pong").await.unwrap();
    let mut bytes=[0;
    4];
    tokio::io::AsyncReadExt::read_exact(&mut read,
    &mut bytes).await.unwrap();
    assert_eq!(&bytes,
    b"pong");
}
struct PartialWriter {
    bytes:Vec<u8>,
    pending:bool,
    fail:bool,
    flushes:usize
}
impl AsyncWrite for PartialWriter {
    fn poll_write(self:Pin<&mut Self>,
    cx:&mut Context<'_>,
    b:&[u8])->Poll<io::Result<usize>> {
        let s=self.get_mut();
        if s.fail {
            return Poll::Ready(Err(io::Error::other("fixture")));
        }
        if !s.pending {
            s.pending=true;
            cx.waker().wake_by_ref();
            return Poll::Pending;
        }
        s.pending=false;
        let n=b.len().min(2);
        s.bytes.extend_from_slice(&b[..n]);
        Poll::Ready(Ok(n))
    }
    fn poll_flush(self:Pin<&mut Self>,
    _:&mut Context<'_>)->Poll<io::Result<()>> {
        self.get_mut().flushes+=1;
        Poll::Ready(Ok(()))
    }
    fn poll_shutdown(self:Pin<&mut Self>,
    _:&mut Context<'_>)->Poll<io::Result<()>> {
        Poll::Ready(Ok(()))
    }
}
#[tokio::test]async fn partial_pending_control_bytes_use_same_underlying_writer() {
    let writer=PartialWriter {
        bytes:vec![],
        pending:false,
        fail:false,
        flushes:0
    };
    let mut io=M06Io::new(writer,
    None).unwrap();
    io.write_all(b"PONG_CLOSE_UPGRADE").await.unwrap();
    io.flush().await.unwrap();
    assert_eq!(io.inner.bytes,
    b"PONG_CLOSE_UPGRADE");
    assert_eq!(io.inner.flushes,
    1);
}
#[tokio::test]async fn vectored_uses_only_guarded_prefix_and_errors_propagate() {
    let writer=PartialWriter {
        bytes:vec![],
        pending:false,
        fail:false,
        flushes:0
    };
    let mut io=M06Io::new(writer,
    None).unwrap();
    assert_eq!(io.write_vectored(&[io::IoSlice::new(b"ab"),
    io::IoSlice::new(b"cd")]).await.unwrap(),
    2);
    assert_eq!(io.inner.bytes,
    b"ab");
    io.inner.fail=true;
    assert!(io.write(b"x").await.is_err());
}
