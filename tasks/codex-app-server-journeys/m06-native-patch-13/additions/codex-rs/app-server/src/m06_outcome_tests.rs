//! AUTHORED_UNEXECUTED; startup must remain before auth and helper dispatch.
#[test]
fn dormant_profile_is_fixed_not_a_caller_descriptor() {
    assert_eq!(codex_http_client::m06_outcome::PROFILE,
    "M06_SOURCE_FDS_4_5_V12");
    assert_eq!(codex_http_client::m06_outcome::MAX_FRAME,
    65536);
}

#[cfg(unix)]
mod connected {
    //! AUTHORED_UNEXECUTED. These are isolated lib-test invocations, not startup qualification.
    //! Harness stdout before/after the connected tail is excluded from owned JSONL assertions.
    use crate::{ConnectedSessionArgs, run_connected_session};
    use codex_http_client::m06_outcome::{SourceOwner, canonical, hex_digest, read_frame};
    use serde_json::{Value, json};
    use std::io::{BufRead, BufReader, Read, Write};
    use std::os::fd::{AsRawFd, FromRawFd};
    use std::os::unix::net::UnixStream;
    use std::os::unix::process::CommandExt;
    use std::process::{Command, Stdio};
    use std::sync::Arc;
    use tokio::sync::{mpsc, oneshot};
    use tokio_util::sync::CancellationToken;

    const CHILD: &str = "m06_outcome::tests::connected::connected_stdio_child";
    const ABSENT_THREAD: &str = "11111111-1111-4111-8111-111111111111";

    fn marker(value: &str) {
        // Observation only; neither this stream nor its contents enters source accounting.
        writeln!(std::io::stderr().lock(), "M06_FIXTURE:{value}").unwrap();
    }

    async fn wait_for_file(path: std::path::PathBuf) {
        loop {
            match std::fs::metadata(&path) {
                Ok(_) => return,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => tokio::task::yield_now().await,
                Err(error) => panic!("fixture release observation failed: {error}"),
            }
        }
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    #[ignore = "AUTHORED_UNEXECUTED; invoked only by the isolated parent rig"]
    async fn connected_stdio_child() -> anyhow::Result<()> {
        let mode = std::env::var("M06_CONNECTED_CASE")?;
        let home = std::path::PathBuf::from(std::env::var_os("CODEX_HOME").unwrap());
        // This child has a fresh disposable HOME, empty environment, no credentials and no
        // managed/cloud loader. Build test inputs before installing the restrictive owner.
        let mut config = codex_core::config::ConfigBuilder::default()
            .codex_home(home.clone())
            .loader_overrides(codex_config::LoaderOverrides::without_managed_config_for_tests())
            .build().await?;
        let auth = Arc::new(codex_login::AuthManager::new(
            home.clone(), false, codex_config::types::AuthCredentialsStoreMode::File,
            None, Some(config.chatgpt_base_url.clone()),
            codex_login::AuthKeyringBackendKind::default(),
            config.auth_config().auth_route_config,
        ).await);
        // Fixed original inherited resources only; no generic I/O adoption API.
        for fd in [4, 5] {
            let flags = unsafe { libc::fcntl(fd, libc::F_GETFD) };
            anyhow::ensure!(flags >= 0);
            anyhow::ensure!(unsafe { libc::fcntl(fd, libc::F_SETFD, flags | libc::FD_CLOEXEC) } >= 0);
        }
        let owner = SourceOwner::bootstrap(
            unsafe { std::fs::File::from_raw_fd(4) },
            unsafe { std::fs::File::from_raw_fd(5) },
        )?;
        // Install this exact owner before MessageProcessor/ThreadManager/model/runtime captures.
        config.m06_owner = Some(owner.clone());
        let config_manager = crate::config_manager::ConfigManager::new_for_tests(
            home.clone(), Vec::new(),
            codex_config::LoaderOverrides::without_managed_config_for_tests(),
            codex_config::CloudConfigBundleLoader::from_getter(|| async { Ok(None) }),
        );
        let (transport_event_tx, mut transport_event_rx) = mpsc::channel(crate::transport::CHANNEL_CAPACITY);
        let (outgoing_tx, outgoing_rx) = mpsc::channel(crate::transport::CHANNEL_CAPACITY);
        let (outbound_control_tx, outbound_control_rx) = mpsc::channel(crate::transport::CHANNEL_CAPACITY);
        let shutdown = CancellationToken::new();
        let remote_shutdown = shutdown.child_token();
        let (client_name_tx, client_name_rx) = oneshot::channel();
        let stdio = crate::transport::start_stdio_connection(
            transport_event_tx.clone(), client_name_tx, mode == "forced-shutdown",
        ).await?;
        let (remote_task, remote) = crate::transport::start_remote_control(
            crate::transport::RemoteControlStartConfig {
                remote_control_url: config.chatgpt_base_url.clone(),
                installation_id: ABSENT_THREAD.to_owned(),
                policy: crate::transport::RemoteControlPolicy::DisabledByRequirements,
            },
            None, auth.clone(), transport_event_tx.clone(), remote_shutdown.clone(),
            Some(client_name_rx), crate::RemoteControlStartupMode::DisabledEphemeral,
        ).await?;
        let analytics = codex_analytics::AnalyticsEventsClient::disabled();
        let outgoing = Arc::new(crate::outgoing_message::OutgoingMessageSender::new(outgoing_tx, analytics.clone()));
        let feedback = codex_feedback::CodexFeedback::new();
        let (_, logger_reload) = crate::otel_reloader::layers::<tracing_subscriber::Registry>(None);
        let otel = crate::otel_reloader::spawn(
            None, logger_reload, config_manager.clone(), auth.clone(), false, shutdown.clone(),
        );
        let (entered_tx, entered_rx) = oneshot::channel();
        let (release_tx, release_rx) = oneshot::channel();
        let (enqueued_tx, enqueued_rx) = oneshot::channel();
        let seam = crate::message_processor::M06QueueTestSeam {
            // This is the first actual connection in this exact isolated invocation.
            connection_id: crate::outgoing_message::ConnectionId(0),
            entered_and_release: std::sync::Mutex::new(Some((entered_tx, release_rx))),
            enqueued: std::sync::Mutex::new(Some(enqueued_tx)),
        };
        let forced_owner = owner.clone();
        let forced_observer = (mode == "forced-shutdown").then(|| tokio::spawn(async move {
            while forced_owner.check_live().is_ok() { tokio::task::yield_now().await; }
            marker("FORCED_SOURCE_FENCED");
        }));
        let release_owner = owner.clone();
        let request_observer = tokio::spawn(async move {
            entered_rx.await.unwrap();
            marker("ID2_DISPATCHED");
            enqueued_rx.await.unwrap();
            marker("ID3_ENQUEUED");
            // Observe real reader EOF, not a timer or fabricated retirement fact.
            while !release_owner.is_source_closing() { tokio::task::yield_now().await; }
            if mode == "held-running" { std::future::pending::<()>().await; }
            release_tx.send(()).unwrap();
        });
        let collector = owner.source_collector("http.sse").await?;
        let release_path = home.join("collector-release");
        let collector_mode = std::env::var("M06_CONNECTED_CASE")?;
        let collector_task = tokio::spawn(async move {
            wait_for_file(release_path).await;
            match collector_mode.as_str() {
                "collector-drop" => drop(collector),
                "collector-abort" => {
                    // Keep the genuine lease live until cancellation drops this future.
                    let _collector = collector;
                    std::future::pending::<()>().await;
                }
                "unresolved-raw" => {
                    let raw = collector.observe_raw(b"{\"type\":\"response.created\",\"response\":{\"id\":\"r\"}}", "http.sse").unwrap();
                    drop(raw);
                    collector.observed_local_close();
                }
                _ => collector.observed_local_close(),
            }
        });
        let collector_abort = collector_task.abort_handle();
        owner.retain_collector(collector_task)?;
        let abort_release = home.join("collector-release");
        let abort_observer = (std::env::var("M06_CONNECTED_CASE")? == "collector-abort").then(|| tokio::spawn(async move {
            wait_for_file(abort_release).await;
            collector_abort.abort();
        }));
        if std::env::var("M06_CONNECTED_CASE")? == "fifo-loss" {
            // Close the actual original transport-event FIFO, no replacement receiver.
            transport_event_rx.close();
            marker("RESOURCE_CLOSED");
            wait_for_file(home.join("resource-start")).await;
        }
        let result = run_connected_session(ConnectedSessionArgs {
            processor_args: crate::message_processor::MessageProcessorArgs {
                outgoing, analytics_events_client: analytics,
                arg0_paths: codex_arg0::Arg0DispatchPaths::default(),
                config: Arc::new(config), config_manager,
                environment_manager: Arc::new(codex_exec_server::EnvironmentManager::default_for_tests()),
                feedback, log_db: None, state_db: None, config_warnings: Vec::new(),
                session_source: codex_protocol::protocol::SessionSource::VSCode,
                user_verification: Arc::new(crate::user_verification::Service::new(auth.clone())),
                auth_manager: auth, installation_id: ABSENT_THREAD.to_owned(),
                code_mode_session_provider: None,
                rpc_transport: codex_analytics::AppServerRpcTransport::Stdio,
                remote_control_handle: Some(remote.clone()), plugin_startup_tasks: None,
            },
            m06_source: Some(owner), transport: crate::AppServerTransport::Stdio,
            transport_event_tx, transport_event_rx, outgoing_rx, outbound_control_tx, outbound_control_rx,
            transport_shutdown_token: shutdown, remote_control_shutdown_token: remote_shutdown,
            remote_control_handle: remote, transport_accept_handles: vec![stdio, remote_task],
            otel_reloader_handle: otel, managed_daemon: false, single_client_mode: true,
            graceful_signal_restart_enabled: false, queue_test_seam: Some(seam),
        }).await;
        request_observer.abort();
        if let Some(observer) = forced_observer { observer.await?; }
        if let Some(observer) = abort_observer { observer.await?; }
        let mode = std::env::var("M06_CONNECTED_CASE")?;
        if mode == "clean" { result?; } else {
            anyhow::ensure!(result.is_err());
            marker("TAIL_REFUSED");
        }
        Ok(())
    }

    struct Control {
        stream: UnixStream,
        binding: Value,
        binding_digest: String,
        previous: String,
        sequence: u64,
    }
    impl Control {
        fn new(stream: UnixStream) -> Self {
            let binding = json!({"runId":"fixture","intentId":"fixture","sendBoundaryId":"fixture","claimEpoch":1,
                "providerNamespace":"fixture","configurationDigest":hex_digest(b"config"),"transportId":"rpc","transportIncarnation":"rpc/1",
                "ownerIncarnation":"owner/1","channelIncarnation":"channel/1",
                "protocolDigest":hex_digest(b"M06_NATIVE_SOURCE_PROTOCOL_V12:MESSAGE_JSON_V1:RPC_CLOSURE_V1:RAW_PARSE_CUSTODY_V1"),
                "routeProfileDigest":hex_digest(b"route"),"mcpProfileDigest":hex_digest(b"mcp"),"nonce":"nonce","deadlineId":"deadline/1",
                "parentClockEpoch":"parent/1","clockContractId":null,"nativeClockEpoch":null});
            let mut bytes = b"M06_NATIVE_BINDING_V12\0".to_vec();
            bytes.extend(canonical(&binding).unwrap());
            Self { stream, binding, binding_digest: hex_digest(&bytes), previous: hex_digest(b"M06_NATIVE_SOURCE_V12\0"), sequence: 0 }
        }
        fn send(&mut self, kind: &str, payload: Value) {
            self.sequence += 1;
            let frame = json!({"version":"M06_NATIVE_SOURCE_V12","lane":"CONTROL","kind":kind,
                "ownerIncarnation":"owner/1","channelIncarnation":"channel/1","sequence":self.sequence,
                "previousDigest":self.previous,"bindingDigest":self.binding_digest,"operationId":null,"parentOperationId":null,
                "attemptId":null,"transportIncarnation":null,"rpcRequestId":null,"nativeThreadId":null,"nativeTurnId":null,
                "sourceCallId":null,"mcpRequestId":null,"deadlineId":"deadline/1","clockContractId":null,
                "nativeTick":self.sequence,"disposition":"KNOWN","payload":payload});
            let body = canonical(&frame).unwrap();
            self.stream.write_all(&(body.len() as u32).to_be_bytes()).unwrap();
            self.stream.write_all(&body).unwrap();
            let mut chain = b"M06_NATIVE_SOURCE_V12\0".to_vec();
            chain.extend(body);
            self.previous = hex_digest(&chain);
        }
    }
    fn await_marker(stderr: &mut impl BufRead, expected: &str) {
        loop {
            let mut line = String::new();
            assert_ne!(stderr.read_line(&mut line).unwrap(), 0, "missing child marker {expected}");
            if line.trim() == format!("M06_FIXTURE:{expected}") { return; }
        }
    }
    fn response(stdout: &mut impl BufRead, id: u64) -> (Value, Vec<u8>) {
        loop {
            let mut line = String::new();
            assert_ne!(stdout.read_line(&mut line).unwrap(), 0, "missing actual stdout response {id}");
            // libtest prelude/epilogue is outside the connected source range. Only complete
            // JSONL emitted by the actual original stdout writer can satisfy this assertion.
            if let Ok(value) = serde_json::from_str::<Value>(&line) {
                assert_ne!(value["id"], 3, "queued id3 entered a response-producing handler");
                if value["id"] == id { return (value, line.into_bytes()); }
            }
        }
    }
    fn drain_without_seal(output: &mut impl Read) {
        loop {
            let mut length = [0; 4];
            if output.read(&mut length[..1]).unwrap() == 0 { return; }
            output.read_exact(&mut length[1..]).unwrap();
            let length = u32::from_be_bytes(length) as usize;
            assert!(length <= codex_http_client::m06_outcome::MAX_FRAME);
            let mut body = vec![0; length];
            output.read_exact(&mut body).unwrap();
            let frame: Value = serde_json::from_slice(&body).unwrap();
            assert_ne!(frame["kind"], "RANGE_SEAL", "failure must preserve UNKNOWN");
        }
    }

    fn manifest(records: &[Vec<u8>]) -> Value {
        let mut cursor = 0;
        let attempts: Vec<_> = records.iter().map(|raw| {
            let message: Value = serde_json::from_slice(raw).unwrap();
            let start = cursor;
            cursor += raw.len();
            json!({"requestId":message.get("id").cloned().unwrap_or(Value::Null),
                "start":start,"end":cursor,"rawDigest":hex_digest(raw)})
        }).collect();
        json!({"sealId":"seal/1","transportId":"rpc","transportIncarnation":"rpc/1",
            "issuedRequests":3,"attemptedBytes":cursor,"attempts":attempts,
            "allocations":[{"id":1,"state":"ATTEMPTED"},{"id":2,"state":"ATTEMPTED"},{"id":3,"state":"ATTEMPTED"}]})
    }

    fn drive(mode: &str) {
        let home = tempfile::tempdir().unwrap();
        let (control_child, control_parent) = UnixStream::pair().unwrap();
        let (output_child, mut output_parent) = UnixStream::pair().unwrap();
        // Duplicate first, so dup2 to fixed4/5 cannot overwrite the other source endpoint.
        let control_fd = unsafe { libc::fcntl(control_child.as_raw_fd(), libc::F_DUPFD_CLOEXEC, 6) };
        let output_fd = unsafe { libc::fcntl(output_child.as_raw_fd(), libc::F_DUPFD_CLOEXEC, 6) };
        assert!(control_fd >= 6 && output_fd >= 6);
        let control_fd = unsafe { std::os::fd::OwnedFd::from_raw_fd(control_fd) };
        let output_fd = unsafe { std::os::fd::OwnedFd::from_raw_fd(output_fd) };
        let mut command = Command::new(std::env::current_exe().unwrap());
        command.args(["--exact", CHILD, "--ignored", "--nocapture", "--quiet"])
            .env_clear().env("HOME", home.path()).env("CODEX_HOME", home.path())
            .env("M06_CONNECTED_CASE", mode).current_dir(home.path())
            .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
        unsafe {
            command.pre_exec(move || {
                if libc::dup2(control_fd.as_raw_fd(), 4) < 0 || libc::dup2(output_fd.as_raw_fd(), 5) < 0 {
                    return Err(std::io::Error::last_os_error());
                }
                Ok(())
            });
        }
        let mut child = command.spawn().unwrap(); // Authored only; never executed in this pass.
        drop(command);
        drop(control_child);
        drop(output_child);
        let mut stdin = child.stdin.take().unwrap();
        let mut stdout = Some(BufReader::new(child.stdout.take().unwrap()));
        let mut stderr = BufReader::new(child.stderr.take().unwrap());
        let mut control = Control::new(control_parent);
        control.send("BOOTSTRAP", json!({"binding":control.binding.clone()}));
        assert_eq!(read_frame(&mut output_parent).unwrap()["kind"], "HELLO");
        control.send("BOOTSTRAP_ACK", json!({"helperClosed":true}));
        let reservation = read_frame(&mut output_parent).unwrap();
        assert_eq!(reservation["kind"], "RESERVATION_DURABLE");
        control.send("RESERVATION_ACK", json!({"operationId":reservation["operationId"],"tokenId":"collector/1","head":reservation["previousDigest"]}));
        let mut records = vec![
            b"{\"id\":1,\"method\":\"initialize\",\"params\":{\"clientInfo\":{\"name\":\"m06-connected-fixture\",\"version\":\"1\"}}}\n".to_vec(),
            b"{\"method\":\"initialized\"}\n".to_vec(),
            format!("{{\"id\":2,\"method\":\"turn/interrupt\",\"params\":{{\"threadId\":\"{ABSENT_THREAD}\",\"turnId\":\"fixture-turn\"}}}}\n").into_bytes(),
            format!("{{\"id\":3,\"method\":\"turn/interrupt\",\"params\":{{\"threadId\":\"{ABSENT_THREAD}\",\"turnId\":\"fixture-turn\"}}}}\n").into_bytes(),
        ];
        if mode == "outbound-filter" {
            records[0] = b"{\"id\":1,\"method\":\"initialize\",\"params\":{\"clientInfo\":{\"name\":\"m06-connected-fixture\",\"version\":\"1\"},\"capabilities\":{\"optOutNotificationMethods\":[\"remoteControl/status/changed\"]}}}\n".to_vec();
        }
        if mode == "fifo-loss" {
            await_marker(&mut stderr, "RESOURCE_CLOSED");
            // The real source threads are alive and retain stdin/stdout; the fixture
            // closes only the named actual queue. Use one real initialize input.
            stdin.write_all(&records[0]).unwrap();
            let one = vec![records[0].clone()];
            let mut sender = manifest(&one);
            sender["allocations"][1]["state"] = json!("NOT_EMITTED");
            sender["allocations"][2]["state"] = json!("NOT_EMITTED");
            control.send("RPC_SENDER_SEAL", sender);
            drop(stdin);
            std::fs::write(home.path().join("collector-release"), b"release").unwrap();
            std::fs::write(home.path().join("resource-start"), b"start").unwrap();
            // Observe the actual parent's source pipe through process EOF. Neither an
            // internal retired flag nor the imposed queue loss can count as a clean seal.
            loop {
                let mut length = [0; 4];
                if output_parent.read(&mut length[..1]).unwrap() == 0 { break; }
                output_parent.read_exact(&mut length[1..]).unwrap();
                let length = u32::from_be_bytes(length) as usize;
                assert!(length <= codex_http_client::m06_outcome::MAX_FRAME);
                let mut body = vec![0; length];
                output_parent.read_exact(&mut body).unwrap();
                let frame: Value = serde_json::from_slice(&body).unwrap();
                assert_ne!(frame["kind"], "RANGE_SEAL");
            }
            await_marker(&mut stderr, "TAIL_REFUSED");
            assert!(child.wait().unwrap().success());
            drop(control);
            return;
        }
        stdin.write_all(&records[0]).unwrap();
        let (_, initialize_bytes) = response(stdout.as_mut().unwrap(), 1);
        if mode == "outbound-filter" {
            // The real initialize post-hook enqueues its actual remote-control status
            // notification. The real negotiated opt-out filter drops its write receipt.
            let mut sender = manifest(&records[..1]);
            sender["allocations"][1]["state"] = json!("NOT_EMITTED");
            sender["allocations"][2]["state"] = json!("NOT_EMITTED");
            control.send("RPC_SENDER_SEAL", sender);
            drop(stdin);
            std::fs::write(home.path().join("collector-release"), b"release").unwrap();
            drain_without_seal(&mut output_parent);
            await_marker(&mut stderr, "TAIL_REFUSED");
            assert!(child.wait().unwrap().success());
            drop(control);
            return;
        }
        stdin.write_all(&records[1]).unwrap();
        stdin.write_all(&records[2]).unwrap();
        await_marker(&mut stderr, "ID2_DISPATCHED");
        stdin.write_all(&records[3]).unwrap();
        await_marker(&mut stderr, "ID3_ENQUEUED");
        if mode == "forced-shutdown" {
            // The real original SIGTERM branch cancels the actual forwarding futures.
            assert_eq!(unsafe { libc::kill(child.id() as libc::pid_t, libc::SIGTERM) }, 0);
            await_marker(&mut stderr, "FORCED_SOURCE_FENCED");
        }
        if mode == "stdout-error" {
            // Close the actual parent response pipe while id2 is still held. Its real
            // stdout handoff will encounter BrokenPipe; no substitute Write is installed.
            drop(stdout.take());
        }
        if mode == "partial-stdin" {
            stdin.write_all(b"{\"id\":").unwrap();
            records.push(b"{\"id\":".to_vec());
        }
        if mode != "missing-sender-manifest" && mode != "partial-stdin" && mode != "held-running" && mode != "stdout-error" && mode != "forced-shutdown" {
            control.send("RPC_SENDER_SEAL", manifest(&records));
        }
        drop(stdin); // Actual parent EOF only after actual original id3 enqueue.
        if mode == "partial-stdin" || mode == "held-running" || mode == "stdout-error" || mode == "forced-shutdown" {
            std::fs::write(home.path().join("collector-release"), b"release").unwrap();
        }
        let mut frames = vec![reservation];
        let mut settled = false;
        let mut queued_cancelled = false;
        let mut stdout_progress = false;
        while !(settled && queued_cancelled && stdout_progress) && mode != "partial-stdin" && mode != "held-running" && mode != "stdout-error" && mode != "forced-shutdown" {
            let frame = read_frame(&mut output_parent).unwrap();
            assert_ne!(frame["kind"], "RANGE_SEAL", "live actual collector must retain custody");
            if frame["kind"] == "RPC_WORK" && frame["rpcRequestId"] == 2 && frame["payload"]["state"] == "SETTLED" { settled = true; }
            if frame["kind"] == "RPC_WORK" && frame["rpcRequestId"] == 3 {
                assert_ne!(frame["payload"]["state"], "DISPATCHED");
                queued_cancelled |= frame["payload"]["state"] == "NOT_DISPATCHED";
            }
            stdout_progress |= frame["kind"] == "RPC_OUTPUT" && frame["rpcRequestId"] == 2 && frame["payload"]["phase"] == "PROGRESS";
            frames.push(frame);
        }
        if mode != "partial-stdin" && mode != "held-running" && mode != "stdout-error" && mode != "forced-shutdown" {
            let (error, error_bytes) = response(stdout.as_mut().unwrap(), 2);
            assert_eq!(error["error"]["message"], format!("thread not found: {ABSENT_THREAD}"));
            for (id, bytes) in [(1, initialize_bytes), (2, error_bytes)] {
                assert!(frames.iter().any(|f| f["kind"] == "RPC_OUTPUT" && f["rpcRequestId"] == id &&
                    f["payload"]["phase"] == "ATTEMPT" && f["payload"]["rawDigest"] == hex_digest(&bytes)));
            }
            std::fs::write(home.path().join("collector-release"), b"release").unwrap();
        }
        if mode == "missing-sender-manifest" {
            // Original control loss settles the waiting join as UNKNOWN; no invented seal.
            drop(control);
        } else if mode == "clean" {
            loop {
                let frame = read_frame(&mut output_parent).unwrap();
                let sealed = frame["kind"] == "RANGE_SEAL";
                frames.push(frame);
                if sealed { break; }
            }
            let mut eof = [0];
            assert_eq!(output_parent.read(&mut eof).unwrap(), 0, "C5 must close before C4 release");
            assert!(child.try_wait().unwrap().is_none(), "original child released C4 custody too early");
            assert_eq!(frames.iter().filter(|f| f["kind"] == "RANGE_SEAL").count(), 1);
            assert!(frames.iter().any(|f| f["kind"] == "RPC_EOF"));
            assert!(frames.iter().any(|f| f["kind"] == "LOCAL_CLOSE"));
            drop(control); // Actual C4 EOF only after observing actual C5 EOF.
        } else {
            // Keep C4 held while the actual failing boundary settles. Early control loss must
            // not manufacture or mask the collector/parser refusal being exercised.
            loop {
                let mut length = [0; 4];
                let first = output_parent.read(&mut length[..1]).unwrap();
                if first == 0 { break; }
                output_parent.read_exact(&mut length[1..]).unwrap();
                let length = u32::from_be_bytes(length) as usize;
                assert!(length <= codex_http_client::m06_outcome::MAX_FRAME);
                let mut body = vec![0; length];
                output_parent.read_exact(&mut body).unwrap();
                let frame: Value = serde_json::from_slice(&body).unwrap();
                assert_ne!(frame["kind"], "RANGE_SEAL", "failure must preserve UNKNOWN");
            }
            drop(control);
        }
        let status = child.wait().unwrap();
        if mode == "stdout-error" {
            // libtest's epilogue also has a closed stdout; only the explicit post-tail
            // refusal marker establishes the connected result, never the exit code.
            await_marker(&mut stderr, "TAIL_REFUSED");
        } else {
            assert!(status.success(), "child assertion failed in {mode}");
        }
        if mode != "clean" {
            while let Ok(frame) = read_frame(&mut output_parent) {
                assert_ne!(frame["kind"], "RANGE_SEAL", "failure must preserve UNKNOWN");
            }
        }
    }

    #[test]
    #[ignore = "AUTHORED_UNEXECUTED; spawns one actual isolated stdio/fd4/fd5 child"]
    fn original_connected_tail_drains_queued_rpc_stdout_and_collector_before_single_seal() { drive("clean"); }
    #[test]
    #[ignore = "AUTHORED_UNEXECUTED; actual partial stdin must refuse the connected seal"]
    fn original_connected_tail_partial_stdin_refuses_seal() { drive("partial-stdin"); }
    #[test]
    #[ignore = "AUTHORED_UNEXECUTED; actual original collector drop poisons closure"]
    fn original_connected_tail_collector_drop_refuses_seal() { drive("collector-drop"); }
    #[test]
    #[ignore = "AUTHORED_UNEXECUTED; actual retained producer failure poisons closure"]
    fn original_connected_tail_collector_abort_refuses_seal() { drive("collector-abort"); }
    #[test]
    #[ignore = "AUTHORED_UNEXECUTED; unresolved actual raw token poisons closure"]
    fn original_connected_tail_unresolved_raw_refuses_seal() { drive("unresolved-raw"); }
    #[test]
    #[ignore = "AUTHORED_UNEXECUTED; missing original sender manifest and C4 loss refuse seal"]
    fn original_connected_tail_missing_sender_manifest_refuses_seal() { drive("missing-sender-manifest"); }
    #[test]
    #[ignore = "AUTHORED_UNEXECUTED; actual held running request exercises unchanged 30s RPC gate timeout"]
    fn original_connected_tail_held_running_rpc_gate_timeout_refuses_seal() { drive("held-running"); }
    #[test]
    #[ignore = "AUTHORED_UNEXECUTED; closes actual parent stdout pipe before held id2 handoff"]
    fn original_connected_tail_original_stdout_error_refuses_seal() { drive("stdout-error"); }
    #[test]
    #[ignore = "AUTHORED_UNEXECUTED; closes actual original transport-event FIFO before forwarding"]
    fn original_connected_tail_actual_fifo_loss_refuses_seal() { drive("fifo-loss"); }
    #[test]
    #[ignore = "AUTHORED_UNEXECUTED; actual original stdio SIGTERM cancellation, unchanged watchdog bounds"]
    fn original_connected_tail_actual_forced_shutdown_refuses_seal() { drive("forced-shutdown"); }
    #[test]
    #[ignore = "AUTHORED_UNEXECUTED; real initialize notification crosses actual negotiated outbound filter"]
    fn original_connected_tail_actual_outbound_filter_refuses_seal() { drive("outbound-filter"); }
}
