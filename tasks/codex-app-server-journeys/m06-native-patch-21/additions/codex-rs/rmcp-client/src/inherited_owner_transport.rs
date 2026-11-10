//! Single-use original parent channel; the existing RMCP engine parses protocol and IDs.
use std::future::Future;
use std::io;

use codex_http_client::m06_outcome::{self, OwnedCallContext, SourceOwner};
use rmcp::model::{GetExtensions, JsonRpcMessage};
use rmcp::service::{RoleClient, RxJsonRpcMessage, TxJsonRpcMessage};
use rmcp::transport::Transport;
use tokio::sync::mpsc;

pub(crate) struct InheritedOwnerTransport {
    owner: SourceOwner,
    replies: mpsc::Receiver<String>,
    retired: bool,
}

impl InheritedOwnerTransport {
    pub(crate) fn take(owner: SourceOwner) -> io::Result<Self> {
        m06_outcome::require_owner(Some(&owner))?;
        let replies = owner.take_mcp_receiver()?;
        Ok(Self {
            owner,
            replies,
            retired: false,
        })
    }
}

impl Transport<RoleClient> for InheritedOwnerTransport {
    type Error = io::Error;

    fn send(
        &mut self,
        mut message: TxJsonRpcMessage<RoleClient>,
    ) -> impl Future<Output = io::Result<()>> + Send + 'static {
        let owner = self.owner.clone();
        let context = match &mut message {
            JsonRpcMessage::Request(envelope) => envelope
                .request
                .extensions_mut()
                .remove::<OwnedCallContext>(),
            _ => None,
        };
        // Serialize this actual RMCP envelope/ID once, after removing private Rust extensions.
        // A model field or _meta cannot create that original context.
        let preflight = owner
            .check_admission()
            .and_then(|()| match context.as_ref() {
                Some(context) => context.check_owner(&owner),
                None => Ok(()),
            });
        let text = preflight
            .and_then(|()| serde_json::to_string(&message).map_err(|_| m06_outcome::deny()));
        async move { owner.send_mcp(text?, context).await }
    }

    async fn receive(&mut self) -> Option<RxJsonRpcMessage<RoleClient>> {
        let text = self.replies.recv().await?;
        let parsed = m06_outcome::parse_transient(&text)
            .and_then(|value| serde_json::from_value(value).map_err(|_| m06_outcome::deny()));
        match parsed {
            Ok(message) => Some(message),
            Err(_) => {
                self.owner.fence("RMCP_PARSE_FAILURE");
                None
            }
        }
    }

    async fn close(&mut self) -> io::Result<()> {
        if !self.replies.is_empty() {
            self.owner.fence("RMCP_UNREAD_REPLY_AT_CLOSE");
            return Err(m06_outcome::deny());
        }
        if let Err(error) = self.owner.inherited_mcp_transport_retired() {
            self.owner.fence("RMCP_UNSETTLED_CLOSE");
            return Err(error);
        }
        self.replies.close();
        self.retired = true;
        Ok(())
    }
}

impl Drop for InheritedOwnerTransport {
    fn drop(&mut self) {
        if !self.retired {
            // Actual sole transport destruction is only one fact. It cannot stand in for
            // the independently awaited original RunningService join in RmcpClient::shutdown.
            if self.replies.is_empty() && self.owner.inherited_mcp_transport_retired().is_ok() {
                self.retired = true;
            } else {
                self.owner.fence("RMCP_TRANSPORT_DROPPED_UNKNOWN");
            }
        }
    }
}

#[cfg(test)]
#[path = "inherited_owner_transport_tests.rs"]
mod tests;
