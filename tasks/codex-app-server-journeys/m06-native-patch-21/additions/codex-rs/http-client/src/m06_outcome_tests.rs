//! AUTHORED_UNEXECUTED. No Rust compiler, test runner or native executable was invoked.
use super::*;
fn binding() -> Value {
    json!( {
        "runId":"run",
        "intentId":"intent",
        "sendBoundaryId":"boundary",
        "claimEpoch":1,
        "providerNamespace":"provider",
        "configurationDigest":hex_digest(b"config"),
        "transportId":"rpc",
        "transportIncarnation":"rpc/1",
        "ownerIncarnation":"owner/1",
        "channelIncarnation":"channel/1",
        "protocolDigest":hex_digest(b"M06_NATIVE_SOURCE_PROTOCOL_V12:MESSAGE_JSON_V1:RPC_CLOSURE_V1:RAW_PARSE_CUSTODY_V1"),
        "routeProfileDigest":hex_digest(b"route"),
        "mcpProfileDigest":hex_digest(b"profile"),
        "nonce":"nonce",
        "deadlineId":"deadline/1",
        "parentClockEpoch":"parent/1",
        "clockContractId":null,
        "nativeClockEpoch":null
    })
}
fn fixture(effect: bool) -> SourceOwner {
    let binding = binding();
    let mut bytes = b"M06_NATIVE_BINDING_V12\0".to_vec();
    bytes.extend(canonical(&binding).unwrap());
    let (_tx, rx) = tokio::sync::mpsc::channel(16);
    SourceOwner(Arc::new(Inner {
        binding,
        binding_digest: hex_digest(&bytes),
        auth_resolution_contract: None,
        started: Instant::now(),
        fenced: AtomicBool::new(false),
        closing: AtomicBool::new(false),
        admission_poison: AtomicBool::new(false),
        sealed: AtomicBool::new(false),
        control_released: AtomicBool::new(false),
        collectors_frozen: AtomicBool::new(false),
        disposing: AtomicBool::new(false),
        stdio_threads: Mutex::new(Vec::new()),
        fixture_effect: effect,
        collectors: Mutex::new(Vec::new()),
        output: Mutex::new(Some(tempfile::tempfile().unwrap())),
        replies: Mutex::new(Some(rx)),
        reservation_notify: tokio::sync::Notify::new(),
        state: Mutex::new(State {
            sequence: 1,
            head: hex_digest(DOMAIN),
            control_sequence: 1,
            control_head: hex_digest(DOMAIN),
            frames: 0,
            operations: 0,
            bytes: 0,
            journal_bytes: 0,
            native_thread: Value::Null,
            native_turn: Value::Null,
            response_context: BTreeMap::new(),
            pending_raw: BTreeMap::new(),
            mcp_links: BTreeMap::new(),
            closed_operations: BTreeSet::new(),
            scopes: BTreeMap::new(),
            tickets: BTreeSet::new(),
            calls: BTreeMap::new(),
            advertised: BTreeSet::new(),
            pending_methods: BTreeMap::new(),
            acknowledged_operations: BTreeSet::new(),
            acknowledgements: BTreeMap::new(),
            write_wakers: BTreeMap::new(),
            unresolved: 0,
            inherited_mcp_adopted: false,
            inherited_mcp_shutdown: false,
            inherited_mcp_transport_retired: false,
            inherited_mcp_service_joined: false,
            direct_io_claimed: false,
            rpc: RpcState::default(),
            records: VecDeque::new(),
        }),
    }))
}
fn frame() -> Value {
    let b = binding();
    let owner = fixture(false);
    json!( {
        "version":"M06_NATIVE_SOURCE_V12",
        "lane":"SOURCE",
        "kind":"HELLO",
        "ownerIncarnation":b["ownerIncarnation"],
        "channelIncarnation":b["channelIncarnation"],
        "sequence":1,
        "previousDigest":hex_digest(DOMAIN),
        "bindingDigest":owner.0.binding_digest,
        "operationId":null,
        "parentOperationId":null,
        "attemptId":null,
        "transportIncarnation":null,
        "rpcRequestId":null,
        "nativeThreadId":null,
        "nativeTurnId":null,
        "sourceCallId":null,
        "mcpRequestId":null,
        "deadlineId":b["deadlineId"],
        "clockContractId":null,
        "nativeTick":0,
        "disposition":"KNOWN",
        "payload": {
            "profileDigest":b["mcpProfileDigest"],
            "protocolDigest":b["protocolDigest"]
        }
    })
}
fn wire(value: &Value) -> Vec<u8> {
    let bytes = canonical(value).unwrap();
    let mut out = (bytes.len() as u32).to_be_bytes().to_vec();
    out.extend(bytes);
    out
}
#[test]
fn canonical_rejects_float_negative_unsafe_and_sorts_ascii() {
    for v in [json!(1.5), json!(-1), json!(9007199254740992u64)] {
        assert!(canonical(&v).is_err());
    }
    assert_eq!(
        canonical(&json!( {
            "z":0,
            "a":"value"
        }))
        .unwrap(),
        br#"{"a":"value","z":0}"#
    );
}
#[test]
fn frame_partial_zero_oversize_invalid_utf8_duplicate_and_unknown_refuse() {
    for bytes in [
        vec![0, 0, 0, 0],
        vec![0, 1, 0, 1],
        vec![0, 0, 0, 1, 255],
        vec![0, 0, 0, 5, b'{', b'}'],
    ] {
        assert!(read_frame(&mut &bytes[..]).is_err());
    }
    let mut v = frame();
    v["unexpected"] = json!(true);
    assert!(read_frame(&mut &wire(&v)[..]).is_err());
    let bytes = br#"{"version":12,"version":12}"#;
    let mut f = (bytes.len() as u32).to_be_bytes().to_vec();
    f.extend(bytes);
    assert!(read_frame(&mut &f[..]).is_err());
}
#[test]
fn canonical_valid_frame_roundtrips_and_all_split_truncations_refuse() {
    let v = frame();
    let bytes = wire(&v);
    assert_eq!(read_frame(&mut &bytes[..]).unwrap(), v);
    for n in 0..bytes.len() {
        assert!(read_frame(&mut &bytes[..n]).is_err());
    }
}
#[test]
fn unsafe_ids_lane_and_payload_schema_refuse() {
    let mut v = frame();
    v["ownerIncarnation"] = json!("bad id");
    assert!(validate_frame(&v).is_err());
    let mut v = frame();
    v["lane"] = json!("MCP");
    assert!(validate_frame(&v).is_err());
    let mut v = frame();
    v["payload"]["prompt"] = json!("private");
    assert!(validate_frame(&v).is_err());
}
#[test]
fn null_clock_never_creates_effect_or_native_seal() {
    let owner = fixture(false);
    assert!(owner.final_effect_guard().is_err());
    assert!(owner.seal_candidate().is_err());
    assert!(owner.binding()["clockContractId"].is_null());
}
#[test]
fn one_original_receiver_no_readoption() {
    let owner = fixture(false);
    assert!(owner.take_mcp_receiver().is_ok());
    assert!(owner.take_mcp_receiver().is_err());
}
#[test]
fn control_sequence_gap_foreign_binding_replay_refuse() {
    let owner = fixture(false);
    let mut v = frame();
    v["kind"] = json!("BOOTSTRAP_ACK");
    v["lane"] = json!("CONTROL");
    v["payload"] = json!( {
        "helperClosed":true
    });
    assert!(owner.validate_control(&v).is_ok());
    assert!(owner.validate_control(&v).is_err());
    v["sequence"] = json!(9);
    assert!(owner.validate_control(&v).is_err());
}
#[test]
fn pending_and_partial_keep_same_ticket_ack_and_original_buffer() {
    let owner = fixture(true);
    let mut ticket = owner.reserve_write(b"abcdef").unwrap();
    assert_eq!(
        ticket.before_poll(b"abcdef").unwrap_err().kind(),
        io::ErrorKind::WouldBlock
    );
    let operation = ticket.operation.clone();
    owner
        .0
        .state
        .lock()
        .unwrap()
        .acknowledgements
        .insert(operation.clone(), ("token".into(), hex_digest(b"head")));
    ticket.before_poll(b"abcdef").unwrap();
    ticket.before_poll(b"abcdef").unwrap();
    assert_eq!(ticket.offset, 0);
    ticket.progress(2).unwrap();
    assert_eq!(ticket.offset, 2);
    ticket.before_poll(b"cdef").unwrap();
    ticket.progress(4).unwrap();
    assert!(ticket.complete());
    assert_eq!(owner.0.state.lock().unwrap().operations, 1);
    assert!(
        !owner
            .0
            .state
            .lock()
            .unwrap()
            .acknowledgements
            .contains_key(&operation)
    );
}
#[test]
fn changed_pending_buffer_or_aborted_remainder_is_unknown() {
    let owner = fixture(true);
    let mut ticket = owner.reserve_write(b"original").unwrap();
    assert!(ticket.before_poll(b"changed!").is_err());
    assert!(owner.check_live().is_err());
    let owner = fixture(true);
    drop(owner.reserve_write(b"partial").unwrap());
    assert!(owner.check_live().is_err());
}
#[test]
fn overprogress_refuses_and_no_later_writer_after_fence() {
    let owner = fixture(true);
    let mut ticket = owner.reserve_write(b"abc").unwrap();
    assert!(ticket.progress(4).is_err());
    assert!(owner.reserve_write(b"again").is_err());
}
#[test]
fn raw_pending_and_fault_are_exact_and_no_typename_can_authorize() {
    let owner = fixture(false);
    let token = owner
        .observe_raw(
            br#"{"type":"response.output_text.delta","delta":5,"text":"secret"}"#,
            "WS_RAW",
        )
        .unwrap();
    {
        let state = owner.0.state.lock().unwrap();
        assert_eq!(state.records[0]["payload"]["parseDisposition"], "PENDING");
        assert!(state.calls.is_empty());
    }
    token.finish("MALFORMED", "MALFORMED", false).unwrap();
    assert!(owner.check_admission().is_err());
    assert!(owner.check_live().is_ok());
    let state = owner.0.state.lock().unwrap();
    assert_eq!(
        state.records[1]["payload"]["rawSequence"],
        state.records[0]["sequence"]
    );
    assert_eq!(
        state.records[1]["payload"]["rawDigest"],
        state.records[0]["payload"]["rawDigest"]
    );
    assert_eq!(state.records[1]["disposition"], "MALFORMED");
    assert!(
        !canonical(&json!(state.records))
            .unwrap()
            .windows(6)
            .any(|w| w == b"secret")
    );
}
#[test]
fn queued_raw_lineage_resolves_only_from_same_finalized_parser_operation() {
    let owner = fixture(false);
    let created = owner
        .observe_raw_for(
            Some("source/1"),
            br#"{"type":"response.created","response":{"id":"r1"}}"#,
            "WS_RAW",
        )
        .unwrap();
    let callable=owner.observe_raw_for(Some("source/1"),br#"{"type":"response.output_item.done","item":{"id":"i1","type":"function_call","call_id":"c1"}}"#,"WS_RAW").unwrap();
    assert!(owner.0.state.lock().unwrap().calls.is_empty());
    created.finish("response.created", "KNOWN", false).unwrap();
    callable
        .finish("response.output_item.done", "KNOWN", true)
        .unwrap();
    let state = owner.0.state.lock().unwrap();
    assert_eq!(state.calls["c1"].response, "r1");
    assert_eq!(state.calls["c1"].raw_sequence, 2);
}
#[test]
fn foreign_operation_and_conflicting_response_never_publish_origin() {
    let owner = fixture(false);
    owner
        .observe_raw_for(
            Some("source/1"),
            br#"{"type":"response.created","response":{"id":"old"}}"#,
            "WS_RAW",
        )
        .unwrap()
        .finish("response.created", "KNOWN", false)
        .unwrap();
    owner
        .observe_raw_for(
            Some("source/2"),
            br#"{"type":"response.output_item.done","item":{"id":"i","call_id":"c"}}"#,
            "WS_RAW",
        )
        .unwrap()
        .finish("response.output_item.done", "KNOWN", true)
        .unwrap();
    assert!(owner.0.state.lock().unwrap().calls.is_empty());
    assert!(owner.check_admission().is_err());
    owner.observe_raw_for(Some("source/1"),br#"{"type":"response.output_item.done","response_id":"wrong","item":{"id":"i2","call_id":"c2"}}"#,"WS_RAW").unwrap().finish("response.output_item.done","KNOWN",true).unwrap();
    assert!(owner.0.state.lock().unwrap().calls.is_empty());
}
#[test]
fn dropped_raw_token_poison_is_monotonic_and_keeps_observation_alive() {
    let owner = fixture(false);
    drop(owner.observe_raw(b"{", "WS_RAW").unwrap());
    assert!(owner.check_admission().is_err());
    assert!(owner.check_live().is_ok());
    assert!(owner.seal_candidate().is_err());
    owner
        .observe_raw(
            br#"{"type":"response.created","response":{"id":"r"}}"#,
            "WS_RAW",
        )
        .unwrap()
        .finish("response.created", "KNOWN", false)
        .unwrap();
    assert!(owner.check_admission().is_err());
}
#[test]
fn forged_call_metadata_cannot_create_context_and_foreign_original_refuses() {
    let owner = fixture(false);
    assert!(owner.claim_source_call("caller-string", "tool").is_err());
    owner
        .0
        .state
        .lock()
        .unwrap()
        .advertised
        .insert("tool".into());
    owner.0.state.lock().unwrap().calls.insert(
        "call".into(),
        CallOrigin {
            parent: None,
            raw_sequence: 1,
            raw_digest: hex_digest(b"raw"),
            raw_bytes: 3,
            response: json!("r"),
            item: json!("i"),
            call: json!("call"),
        },
    );
    let ctx = owner.claim_source_call("call", "tool").unwrap();
    assert!(ctx.check_owner(&fixture(false)).is_err());
    assert!(owner.claim_source_call("call", "tool").is_err());
    owner.fence("DEADLINE_OR_CHANNEL_LOSS");
    assert!(ctx.prepare().is_err());
}
#[test]
fn immutable_thread_turn_and_collector_drop_poison() {
    let owner = fixture(false);
    owner
        .bind_native_context(Some("thread"), Some("turn"))
        .unwrap();
    assert!(
        owner
            .bind_native_context(Some("foreign"), Some("turn"))
            .is_err()
    );
    drop(owner.collector());
    assert!(owner.check_live().is_err());
}
#[test]
fn bounded_operation_capacity_never_renews() {
    let owner = fixture(false);
    {
        let mut state = owner.0.state.lock().unwrap();
        state.operations = MAX_OPERATIONS;
    }
    assert!(owner.reserve_write(b"one").is_err());
    assert!(owner.check_live().is_err());
}
#[test]
fn transient_exact_bytes_numbers_unicode_controls_and_tag_domains() {
    for text in [
        r#"{"jsonrpc":"2.0","id":1,"error":{"code":-32602,"message":"invalid"}}"#,
        r#"{"jsonrpc":"2.0","id":"1","method":"tools/call","params":{"x":0.25,"y":-1.5,"z":1e-3,"s":"雪\n\""}}"#,
    ] {
        assert!(parse_transient(text).is_ok());
        let before = hex_digest(text.as_bytes());
        let outer = json!( {
            "messageJson":text
        });
        let encoded = canonical(&outer).unwrap();
        let decoded: Value = serde_json::from_slice(&encoded).unwrap();
        assert_eq!(decoded["messageJson"], text);
        assert_eq!(
            hex_digest(decoded["messageJson"].as_str().unwrap().as_bytes()),
            before
        );
    }
    assert_ne!(
        tagged_id(&json!(1)).unwrap(),
        tagged_id(&json!("1")).unwrap()
    );
}
#[test]
fn transient_duplicate_overflow_surrogate_bom_bad_id_and_depth_refuse() {
    for text in [
        r#"{"id":1,"id":2}"#,
        r#"{"x":1e400}"#,
        r#"{"x":"\ud800"}"#,
        r#"{"id":-1}"#,
        r#"{"id":-0.0}"#,
        r#"{"id":0.25}"#,
        r#"{"id":9007199254740992}"#,
        "\u{feff}{}",
    ] {
        assert!(parse_transient(text).is_err(), "{text}");
    }
    let deep = format!("{{\"x\":{}0{}}}", "[".repeat(17), "]".repeat(17));
    assert!(parse_transient(&deep).is_err());
    assert!(parse_transient(&format!("{{\"x\":\"{}\"}}", "x".repeat(MAX_FRAME))).is_err());
}
#[test]
fn old_mcp_shape_and_outer_escaping_overflow_refuse() {
    let mut v = frame();
    v["kind"] = json!("MCP_REQUEST");
    v["lane"] = json!("MCP");
    v["payload"] = json!( {
        "message": {
            "jsonrpc":"2.0",
            "id":1,
            "method":"tools/list"
        }
    });
    assert!(validate_frame(&v).is_err());
    let text = format!("{{\"x\":\"{}\"}}", "\\\"".repeat(20000));
    assert!(text.len() < MAX_FRAME);
    v["payload"] = json!( {
        "messageJson":text
    });
    let bytes = wire(&v);
    assert!(bytes.len() > MAX_FRAME);
    assert!(read_frame(&mut &bytes[..]).is_err());
}

#[test]
fn node_rust_exact_amended_transient_vectors() {
    assert_eq!(
        hex_digest(
            b"M06_NATIVE_SOURCE_PROTOCOL_V12:MESSAGE_JSON_V1:RPC_CLOSURE_V1:RAW_PARSE_CUSTODY_V1"
        ),
        "sha256:902e9a0a494d5724c007e8eac9ec197a267b6fb5b3b6055046bc9b404e4c5992"
    );
    let error = r#"{"jsonrpc":"2.0","id":1,"error":{"code":-32602,"message":"Invalid params"}}"#;
    assert!(parse_transient(error).is_ok());
    assert_eq!(
        hex_digest(error.as_bytes()),
        "sha256:feeede7ef02360557224e1044ff159cb0a4bdb73cd6981bb1559e26e9fa1bcdc"
    );
    let call = r#"{ "jsonrpc":"2.0", "id":"string.id", "method":"tools/call", "params":{"name":"fixture","arguments":{"x":0.25,"y":-1.5,"z":1e-7,"text":"雪\n\u0000"}} }"#;
    assert!(parse_transient(call).is_ok());
    assert_eq!(
        hex_digest(call.as_bytes()),
        "sha256:3b1896ad0b4ee80e45a7cd2bdefae435486f271cbf868460bbe6d30b15a856f4"
    );
    assert!(parse_transient(r#"{"x":1,"\u0078":2}"#).is_err());
}

#[test]
fn original_mcp_result_waits_for_actual_parent_acceptance_echo() {
    let owner = fixture(true);
    {
        let mut state = owner.0.state.lock().unwrap();
        state.advertised.insert("tool".into());
        state.calls.insert(
            "call".into(),
            CallOrigin {
                parent: None,
                raw_sequence: 1,
                raw_digest: hex_digest(b"original raw"),
                raw_bytes: 12,
                response: json!("response"),
                item: json!("item"),
                call: json!("call"),
            },
        );
    }
    let context = owner.claim_source_call("call", "tool").unwrap();
    let operation = context.0.operation.clone();
    context.0.consumed.store(true, Ordering::Release);
    owner.0.state.lock().unwrap().mcp_links.insert(
        operation.clone(),
        McpLink {
            id: json!({"type":"number","value":1}),
            call: "call".into(),
            replied: true,
            accepted: true,
            echoed: false,
            closing: false,
            local_result: false,
        },
    );
    context.observed_local_result().unwrap();
    drop(context);
    assert!(owner.check_live().is_ok());
    assert!(
        !owner
            .0
            .state
            .lock()
            .unwrap()
            .closed_operations
            .contains(&operation)
    );
    owner.mark_mcp_evidence_echoed(&operation).unwrap();
    assert!(
        owner
            .0
            .state
            .lock()
            .unwrap()
            .closed_operations
            .contains(&operation)
    );
    assert!(owner.mark_mcp_evidence_echoed(&operation).is_err());
    assert!(owner.seal_candidate().is_err()); // No original RPC sender seal.
}

#[test]
fn partial_write_cancellation_and_missing_parent_ack_never_close_source() {
    let owner = fixture(true);
    let mut ticket = owner.reserve_write(b"sixsix").unwrap();
    let operation = ticket.operation.clone();
    owner
        .0
        .state
        .lock()
        .unwrap()
        .acknowledgements
        .insert(operation.clone(), ("token".into(), hex_digest(b"head")));
    ticket.before_poll(b"sixsix").unwrap();
    ticket.progress(2).unwrap();
    drop(ticket);
    assert!(owner.check_live().is_err());
    assert!(
        !owner
            .0
            .state
            .lock()
            .unwrap()
            .closed_operations
            .contains(&operation)
    );
}

fn rpc_request(id: u64) -> Vec<u8> {
    format!("{{\"id\":{id},\"method\":\"initialize\",\"params\":{{}}}}\n").into_bytes()
}
fn sender_manifest(records: &[Vec<u8>], issued: u64) -> Value {
    let mut cursor = 0;
    let mut delivered = BTreeSet::new();
    let attempts = records
        .iter()
        .map(|bytes| {
            let message =
                parse_strict_json(std::str::from_utf8(bytes).unwrap(), 256 * 1024 + 2).unwrap();
            let id = message.get("id").cloned().unwrap_or(Value::Null);
            if let Some(id) = id.as_u64() {
                delivered.insert(id);
            }
            let start = cursor;
            cursor += bytes.len();
            json!({"requestId":id,"start":start,"end":cursor,"rawDigest":hex_digest(bytes)})
        })
        .collect::<Vec<_>>();
    json!({"sealId":"seal/1","transportId":"rpc","transportIncarnation":"rpc/1",
        "issuedRequests":issued,"attemptedBytes":cursor,"attempts":attempts,
        "allocations":(1..=issued).map(|id|json!({"id":id,"state":if delivered.contains(&id){"ATTEMPTED"}else{"NOT_EMITTED"}})).collect::<Vec<_>>()})
}

#[test]
fn rpc_input_records_actual_id_holes_and_notification_bytes() {
    let owner = fixture(false);
    owner.bind_stdio_connection(9).unwrap();
    let request = rpc_request(2);
    let notification = b"{\"method\":\"initialized\"}\r\n".to_vec();
    owner.observe_rpc_input(&request, false).unwrap();
    owner.observe_rpc_input(&notification, false).unwrap();
    let mut work = owner
        .claim_rpc_message(9, &json!({"id":2,"method":"initialize"}))
        .unwrap();
    work.dispatch().unwrap();
    let mut notification_work = owner
        .claim_rpc_message(9, &json!({"method":"initialized"}))
        .unwrap();
    notification_work.dispatch().unwrap();
    owner.observe_rpc_eof().unwrap();
    work.settle().unwrap();
    notification_work.settle().unwrap();
    owner
        .accept_rpc_sender_seal(&sender_manifest(
            &[request.clone(), notification.clone()],
            2,
        ))
        .unwrap();
    let state = owner.0.state.lock().unwrap();
    assert_eq!(state.rpc.ids.iter().copied().collect::<Vec<_>>(), vec![2]);
    assert_eq!(state.rpc.received, request.len() + notification.len());
    assert_eq!(state.rpc.sender.as_ref().unwrap()["issuedRequests"], 2);
    assert_eq!(state.rpc.inputs[0].id, 2);
    assert_eq!(state.rpc.inputs[1].id, Value::Null);
    let input = state
        .records
        .iter()
        .find(|frame| frame["kind"] == "RPC_INPUT")
        .unwrap();
    assert_eq!(input["payload"]["recordOrdinal"], 0);
    assert_eq!(input["rpcRequestId"], 2);
    assert_eq!(input["transportIncarnation"], "rpc/1");
}

#[test]
fn rpc_eof_refuses_queued_dispatch_but_allows_explicit_rejection() {
    let owner = fixture(false);
    owner.bind_stdio_connection(9).unwrap();
    owner.observe_rpc_input(&rpc_request(1), false).unwrap();
    let mut queued = owner
        .claim_rpc_message(9, &json!({"id":1,"method":"initialize"}))
        .unwrap();
    owner.observe_rpc_eof().unwrap();
    assert!(queued.dispatch().is_err());
    queued.not_dispatched().unwrap();
    assert!(owner.check_admission().is_err());
    assert!(owner.check_live().is_ok());
    assert!(owner.final_effect_guard().is_err());
}

#[test]
fn rpc_lost_queued_and_running_lease_are_unknown() {
    for dispatch in [false, true] {
        let owner = fixture(false);
        owner.bind_stdio_connection(9).unwrap();
        owner.observe_rpc_input(&rpc_request(1), false).unwrap();
        let mut work = owner
            .claim_rpc_message(9, &json!({"id":1,"method":"initialize"}))
            .unwrap();
        if dispatch {
            work.dispatch().unwrap();
        }
        drop(work);
        assert!(owner.check_live().is_err());
        assert!(owner.seal_candidate().is_err());
    }
}

#[test]
fn rpc_partial_duplicate_invalid_and_uncoerced_ids_poison_source() {
    for bytes in [
        b"{\"id\":1,\"method\":\"initialize\"}".as_slice(),
        b"{\"id\":1,\"id\":2,\"method\":\"initialize\"}\n",
        b"{\"id\":\"1\",\"method\":\"initialize\"}\n",
        b"{\"id\":1.5,\"method\":\"initialize\"}\n",
        b"{\"id\":9007199254740992,\"method\":\"initialize\"}\n",
        b"{\"id\":1,\"method\":\"unsupported\"}\n",
    ] {
        let owner = fixture(false);
        owner.bind_stdio_connection(9).unwrap();
        assert!(
            owner
                .observe_rpc_input(bytes, !bytes.ends_with(b"\n"))
                .is_err()
        );
        assert!(owner.check_live().is_err());
    }
}

struct StdoutPrefixes {
    bytes: Vec<u8>,
    interrupt: bool,
    fail_after: Option<usize>,
}
impl Write for StdoutPrefixes {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if self.interrupt {
            self.interrupt = false;
            return Err(io::Error::from(io::ErrorKind::Interrupted));
        }
        if self
            .fail_after
            .is_some_and(|limit| self.bytes.len() >= limit)
        {
            return Err(io::Error::other("fixture loss"));
        }
        let count = bytes.len().min(3);
        self.bytes.extend_from_slice(&bytes[..count]);
        Ok(count)
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
#[test]
fn original_stdout_loop_uses_immutable_suffix_and_actual_prefix_progress() {
    let owner = fixture(false);
    let bytes = b"{\"id\":2,\"result\":{}}\n";
    let mut output = StdoutPrefixes {
        bytes: Vec::new(),
        interrupt: true,
        fail_after: None,
    };
    owner.write_rpc_stdout(&mut output, bytes).unwrap();
    assert_eq!(output.bytes, bytes);
    let state = owner.0.state.lock().unwrap();
    assert_eq!(state.rpc.output_bytes, bytes.len());
    assert!(!state.rpc.output_pending);
    let frames = state
        .records
        .iter()
        .filter(|frame| frame["kind"] == "RPC_OUTPUT")
        .collect::<Vec<_>>();
    assert_eq!(frames[0]["payload"]["phase"], "ATTEMPT");
    assert_eq!(frames[0]["payload"]["writeOrdinal"], 0);
    assert_eq!(frames[0]["payload"]["end"], bytes.len());
    assert!(
        frames
            .iter()
            .all(|frame| frame["payload"]["rawDigest"] == hex_digest(bytes))
    );
    assert_eq!(frames.last().unwrap()["payload"]["end"], bytes.len());
}
#[test]
fn original_stdout_failed_remainder_blocks_seal() {
    let owner = fixture(false);
    let mut output = StdoutPrefixes {
        bytes: Vec::new(),
        interrupt: false,
        fail_after: Some(3),
    };
    assert!(
        owner
            .write_rpc_stdout(&mut output, b"{\"id\":1,\"result\":{}}\n")
            .is_err()
    );
    assert_eq!(output.bytes.len(), 3);
    assert!(owner.check_live().is_err());
    assert!(owner.seal_candidate().is_err());
}
#[test]
fn sender_manifest_rejects_unknown_allocations_gaps_and_fake_holes() {
    let original = sender_manifest(&[rpc_request(2)], 2);
    for mutate in 0..4 {
        let mut manifest = original.clone();
        match mutate {
            0 => manifest["allocations"][0]["state"] = json!("ALLOCATED"),
            1 => manifest["attempts"][0]["start"] = json!(1),
            2 => manifest["allocations"][1]["state"] = json!("NOT_EMITTED"),
            _ => manifest["attempts"][0]["requestId"] = json!("2"),
        }
        assert!(validate_rpc_sender_seal(&manifest, &binding()).is_err());
    }
}
#[test]
fn retirement_timeout_abort_or_panic_cannot_be_clean() {
    let owner = fixture(false);
    owner.observe_rpc_eof().unwrap_err(); // No original stdin connection.
    let guard = owner.retirement(SourceRetirement::Background).unwrap();
    drop(guard); // Same guard drops on original wait timeout, panic or abort.
    assert!(owner.check_live().is_err());
    assert!(owner.seal_candidate().is_err());
}
#[tokio::test]
async fn actual_owned_thread_and_collector_joins_precede_one_source_seal() {
    let owner = fixture(false);
    owner.bind_stdio_connection(9).unwrap();
    let bytes = rpc_request(2);
    owner.observe_rpc_input(&bytes, false).unwrap();
    let mut work = owner
        .claim_rpc_message(9, &json!({"id":2,"method":"initialize"}))
        .unwrap();
    work.dispatch().unwrap();
    owner.observe_rpc_eof().unwrap();
    work.settle().unwrap();
    owner
        .accept_rpc_sender_seal(&sender_manifest(&[bytes], 2))
        .unwrap();
    assert!(owner.seal_candidate().is_err()); // Actual joins and lifecycle facts are missing.
    for fact in SourceRetirement::ALL {
        let guard = owner.retirement(fact).unwrap();
        if matches!(
            fact,
            SourceRetirement::StdinThread | SourceRetirement::StdoutThread
        ) {
            owner
                .retain_stdio_thread(std::thread::spawn(move || {
                    guard.observed_completion().unwrap()
                }))
                .unwrap();
        } else {
            guard.observed_completion().unwrap();
        }
    }
    let (release, wait) = tokio::sync::oneshot::channel();
    owner
        .retain_collector(tokio::spawn(async move {
            wait.await.unwrap();
        }))
        .unwrap();
    release.send(()).unwrap();
    owner.join_original_producers().await.unwrap();
    owner.seal_candidate().unwrap();
    assert!(owner.seal_candidate().is_err());
    assert!(owner.0.output.lock().unwrap().is_none());
    let state = owner.0.state.lock().unwrap();
    let seals = state
        .records
        .iter()
        .filter(|frame| frame["kind"] == "RANGE_SEAL")
        .collect::<Vec<_>>();
    assert_eq!(seals.len(), 1);
    assert_eq!(seals[0]["payload"]["rpcIssuedRequests"], 2);
    assert_eq!(seals[0]["payload"]["rpcObservedRequests"], 1);
    assert_eq!(seals[0]["payload"]["rpcInputRecords"], 1);
    // This source-only fixture has no production effect, host, clock or physical issuer.
    assert_eq!(owner.binding()["clockContractId"], Value::Null);
}
#[tokio::test]
async fn failed_actual_collector_join_is_unknown() {
    let owner = fixture(false);
    owner.bind_stdio_connection(9).unwrap();
    owner.observe_rpc_eof().unwrap();
    let task = tokio::spawn(async { std::future::pending::<()>().await });
    task.abort();
    owner.retain_collector(task).unwrap();
    assert!(owner.join_original_producers().await.is_err());
    assert!(owner.seal_candidate().is_err());
}
#[test]
fn control_clean_eof_is_distinct_from_truncated_frame() {
    assert!(
        read_control_frame(&mut io::Cursor::new(Vec::<u8>::new()))
            .unwrap()
            .is_none()
    );
    assert!(read_control_frame(&mut io::Cursor::new(vec![0, 0])).is_err());
}

#[test]
fn rpc_closure_exact_cross_language_byte_vectors() {
    assert_eq!(
        hex_digest(
            b"M06_NATIVE_SOURCE_PROTOCOL_V12:MESSAGE_JSON_V1:RPC_CLOSURE_V1:RAW_PARSE_CUSTODY_V1"
        ),
        "sha256:902e9a0a494d5724c007e8eac9ec197a267b6fb5b3b6055046bc9b404e4c5992"
    );
    assert_eq!(
        hex_digest(b"{\"id\":2,\"method\":\"initialize\",\"params\":{}}\n"),
        "sha256:1b732ae88b7d9eb325cb3c5cecb54f3f8a22b6647617e9c2d7869a2b0988f567"
    );
    assert_eq!(
        hex_digest(b"{\"method\":\"initialized\"}\r\n"),
        "sha256:59f928c904679e06449ee39b9a6a6c86772129b663655b2a76a41ddbb35cae42"
    );
    assert_eq!(
        hex_digest(b"{\"id\":2,\"method\":\"initialize\",\"params\":{}}"),
        "sha256:13b6a7b9f2608d189ac9155ab16589249540819c2d1fedd31cb651a1297b44d8"
    );
}

#[test]
fn another_underlying_writer_cannot_alias_original_direct_transport() {
    let owner = fixture(false);
    owner.claim_direct_io().unwrap();
    assert!(owner.claim_direct_io().is_err());
    assert!(owner.check_live().is_err());
}

#[test]
fn generic_effect_fixture_does_not_supply_original_auth_contract() {
    let owner = fixture(true);
    assert!(owner.final_effect_guard().is_ok());
    assert!(owner.check_auth_resolution_contract().is_err());
}

#[test]
fn generic_effect_fixture_cannot_resolve_original_proxy_topology() {
    let owner = fixture(true);
    assert!(owner.final_effect_guard().is_ok());
    for policy in [
        crate::OutboundProxyPolicy::ReqwestDefault,
        crate::OutboundProxyPolicy::RespectSystemProxy,
    ] {
        let factory = crate::HttpClientFactory::new(policy).with_m06_owner(Some(owner.clone()));
        assert!(
            factory
                .original_m06_direct_route("wss://example.com/responses")
                .is_err()
        );
        assert!(
            factory
                .original_m06_direct_permit(
                    &reqwest::Url::parse("wss://example.com/responses").unwrap()
                )
                .is_err()
        );
    }
}
#[test]
fn inherited_mcp_requires_transport_retirement_and_real_service_join_separately() {
    let owner = fixture(false);
    let receiver = owner.take_mcp_receiver().unwrap();
    assert!(owner.begin_inherited_mcp_shutdown().is_err());
    owner.bind_stdio_connection(9).unwrap();
    owner.observe_rpc_eof().unwrap();
    owner.begin_inherited_mcp_shutdown().unwrap();
    assert!(owner.inherited_mcp_service_joined().is_err());
    drop(receiver); // Merely dropping the original receiver cannot create either closure proof.
    assert!(
        !owner
            .0
            .state
            .lock()
            .unwrap()
            .inherited_mcp_transport_retired
    );
    assert!(!owner.0.state.lock().unwrap().inherited_mcp_service_joined);
    assert!(owner.seal_candidate().is_err());
    let lease = owner.retirement(SourceRetirement::McpService).unwrap();
    drop(lease); // A lost original shutdown/waiting future is UNKNOWN.
    assert!(owner.check_live().is_err());
}

// Exact production module and identical SourceOwner type. No public fixture factory or feature.
#[path = "../../websocket-client/src/m06_io.rs"]
mod owned_io_source;

// AUTHORED_UNEXECUTED: each `owned_io_*` test requires an isolated test invocation.
// REQUESTED/ORIGINAL remain irreversible; running multiple owner-installing rows together
// deliberately refuses rather than resetting process authority.
#[derive(Default)]
struct WriterEvidence {
    bytes: Vec<u8>,
    polls: usize,
    flushes: usize,
    shutdowns: usize,
}
enum WriterStep {
    Pending,
    Count(usize),
    Error,
    Zero,
}
struct OwnedFixtureWriter {
    evidence: Arc<Mutex<WriterEvidence>>,
    steps: VecDeque<WriterStep>,
}
impl tokio::io::AsyncWrite for OwnedFixtureWriter {
    fn poll_write(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
        bytes: &[u8],
    ) -> std::task::Poll<io::Result<usize>> {
        let this = self.get_mut();
        this.evidence.lock().unwrap().polls += 1;
        match this
            .steps
            .pop_front()
            .unwrap_or(WriterStep::Count(usize::MAX))
        {
            WriterStep::Pending => {
                cx.waker().wake_by_ref();
                std::task::Poll::Pending
            }
            WriterStep::Error => {
                std::task::Poll::Ready(Err(io::Error::other("owned fixture write error")))
            }
            WriterStep::Zero => std::task::Poll::Ready(Ok(0)),
            WriterStep::Count(count) => {
                let count = count.min(bytes.len());
                this.evidence
                    .lock()
                    .unwrap()
                    .bytes
                    .extend_from_slice(&bytes[..count]);
                std::task::Poll::Ready(Ok(count))
            }
        }
    }
    fn poll_flush(
        self: std::pin::Pin<&mut Self>,
        _: &mut std::task::Context<'_>,
    ) -> std::task::Poll<io::Result<()>> {
        self.evidence.lock().unwrap().flushes += 1;
        std::task::Poll::Ready(Ok(()))
    }
    fn poll_shutdown(
        self: std::pin::Pin<&mut Self>,
        _: &mut std::task::Context<'_>,
    ) -> std::task::Poll<io::Result<()>> {
        self.evidence.lock().unwrap().shutdowns += 1;
        std::task::Poll::Ready(Ok(()))
    }
}
struct FixtureWake;
impl std::task::Wake for FixtureWake {
    fn wake(self: Arc<Self>) {}
}
fn owned_io_fixture(
    steps: Vec<WriterStep>,
) -> (
    SourceOwner,
    owned_io_source::M06Io<OwnedFixtureWriter>,
    Arc<Mutex<WriterEvidence>>,
) {
    assert!(!active(), "owned fixture requires an isolated invocation");
    let owner = fixture(true);
    assert!(
        ORIGINAL.set(owner.clone()).is_ok(),
        "never reset original owner"
    );
    request_restrictive_profile();
    let evidence = Arc::new(Mutex::new(WriterEvidence::default()));
    let writer = OwnedFixtureWriter {
        evidence: evidence.clone(),
        steps: steps.into(),
    };
    let writer = owned_io_source::M06Io::new(writer, Some(owner.clone())).unwrap();
    (owner, writer, evidence)
}
fn actual_reservation_ack(owner: &SourceOwner) -> Value {
    let state = owner.0.state.lock().unwrap();
    let reservation = state
        .records
        .iter()
        .rev()
        .find(|frame| frame["kind"] == "RESERVATION_DURABLE")
        .unwrap();
    let mut ack = frame();
    ack["kind"] = json!("RESERVATION_ACK");
    ack["lane"] = json!("CONTROL");
    ack["sequence"] = json!(state.control_sequence);
    ack["previousDigest"] = json!(state.control_head);
    ack["payload"] = json!({"operationId":reservation["operationId"],"tokenId":"actual-parent-token","head":chain(reservation).unwrap()});
    ack
}
fn accept_actual_ack(owner: &SourceOwner, ack: &Value) {
    validate_frame(ack).unwrap();
    owner.validate_control(ack).unwrap();
    owner.accept_ack(ack).unwrap();
}
#[test]
#[ignore = "requires isolated original-owner invocation; never reset process authority"]
fn owned_io_actual_ack_pending_partial_and_suffix_have_one_ticket() {
    use tokio::io::AsyncWrite;
    let (owner, mut writer, evidence) = owned_io_fixture(vec![
        WriterStep::Pending,
        WriterStep::Count(2),
        WriterStep::Count(4),
    ]);
    let waker = std::task::Waker::from(Arc::new(FixtureWake));
    let mut cx = std::task::Context::from_waker(&waker);
    assert!(
        std::pin::Pin::new(&mut writer)
            .poll_write(&mut cx, b"abcdef")
            .is_pending()
    );
    assert_eq!(evidence.lock().unwrap().polls, 0);
    let ack = actual_reservation_ack(&owner);
    accept_actual_ack(&owner, &ack);
    assert!(
        std::pin::Pin::new(&mut writer)
            .poll_write(&mut cx, b"abcdef")
            .is_pending()
    );
    assert!(matches!(
        std::pin::Pin::new(&mut writer).poll_write(&mut cx, b"abcdef"),
        std::task::Poll::Ready(Ok(2))
    ));
    assert!(matches!(
        std::pin::Pin::new(&mut writer).poll_write(&mut cx, b"cdef"),
        std::task::Poll::Ready(Ok(4))
    ));
    assert_eq!(evidence.lock().unwrap().bytes, b"abcdef");
    assert_eq!(owner.0.state.lock().unwrap().operations, 1);
    assert!(matches!(
        std::pin::Pin::new(&mut writer).poll_flush(&mut cx),
        std::task::Poll::Ready(Ok(()))
    ));
    assert!(matches!(
        std::pin::Pin::new(&mut writer).poll_shutdown(&mut cx),
        std::task::Poll::Ready(Ok(()))
    ));
    assert_eq!(evidence.lock().unwrap().flushes, 1);
    assert_eq!(evidence.lock().unwrap().shutdowns, 1);
    owner.poison_admission();
    let polls = evidence.lock().unwrap().polls;
    assert!(matches!(
        std::pin::Pin::new(&mut writer).poll_write(&mut cx, b"later"),
        std::task::Poll::Ready(Err(_))
    ));
    assert_eq!(evidence.lock().unwrap().polls, polls);
}
#[test]
#[ignore = "requires isolated original-owner invocation; never reset process authority"]
fn owned_io_vectored_first_nonempty_uses_actual_ack_and_exact_prefix() {
    use tokio::io::AsyncWrite;
    let (owner, mut writer, evidence) = owned_io_fixture(vec![WriterStep::Count(2)]);
    let waker = std::task::Waker::from(Arc::new(FixtureWake));
    let mut cx = std::task::Context::from_waker(&waker);
    let buffers = [
        io::IoSlice::new(b""),
        io::IoSlice::new(b"ab"),
        io::IoSlice::new(b"cd"),
    ];
    assert!(
        std::pin::Pin::new(&mut writer)
            .poll_write_vectored(&mut cx, &buffers)
            .is_pending()
    );
    assert_eq!(evidence.lock().unwrap().polls, 0);
    accept_actual_ack(&owner, &actual_reservation_ack(&owner));
    assert!(matches!(
        std::pin::Pin::new(&mut writer).poll_write_vectored(&mut cx, &buffers),
        std::task::Poll::Ready(Ok(2))
    ));
    assert_eq!(evidence.lock().unwrap().bytes, b"ab");
}
#[test]
#[ignore = "requires isolated original-owner invocation; never reset process authority"]
fn owned_io_changed_pending_buffer_fences_before_any_inner_poll() {
    use tokio::io::AsyncWrite;
    let (owner, mut writer, evidence) = owned_io_fixture(vec![]);
    let waker = std::task::Waker::from(Arc::new(FixtureWake));
    let mut cx = std::task::Context::from_waker(&waker);
    assert!(
        std::pin::Pin::new(&mut writer)
            .poll_write(&mut cx, b"abc")
            .is_pending()
    );
    assert!(matches!(
        std::pin::Pin::new(&mut writer).poll_write(&mut cx, b"xyz"),
        std::task::Poll::Ready(Err(_))
    ));
    assert_eq!(evidence.lock().unwrap().polls, 0);
    assert!(owner.check_live().is_err());
}
#[test]
#[ignore = "requires isolated original-owner invocation; never reset process authority"]
fn owned_io_partial_error_and_drop_remainder_never_poll_after_fence() {
    use tokio::io::AsyncWrite;
    let (owner, mut writer, evidence) =
        owned_io_fixture(vec![WriterStep::Count(1), WriterStep::Error]);
    let waker = std::task::Waker::from(Arc::new(FixtureWake));
    let mut cx = std::task::Context::from_waker(&waker);
    assert!(
        std::pin::Pin::new(&mut writer)
            .poll_write(&mut cx, b"ab")
            .is_pending()
    );
    accept_actual_ack(&owner, &actual_reservation_ack(&owner));
    assert!(matches!(
        std::pin::Pin::new(&mut writer).poll_write(&mut cx, b"ab"),
        std::task::Poll::Ready(Ok(1))
    ));
    assert!(matches!(
        std::pin::Pin::new(&mut writer).poll_write(&mut cx, b"b"),
        std::task::Poll::Ready(Err(_))
    ));
    let polls = evidence.lock().unwrap().polls;
    assert!(matches!(
        std::pin::Pin::new(&mut writer).poll_write(&mut cx, b"b"),
        std::task::Poll::Ready(Err(_))
    ));
    assert_eq!(evidence.lock().unwrap().polls, polls);
    drop(writer);
    assert!(owner.seal_candidate().is_err());
}
#[test]
#[ignore = "requires isolated original-owner invocation; never reset process authority"]
fn owned_io_zero_write_and_unresolved_shutdown_refuse_clean_close() {
    use tokio::io::AsyncWrite;
    let (owner, mut writer, evidence) = owned_io_fixture(vec![WriterStep::Zero]);
    let waker = std::task::Waker::from(Arc::new(FixtureWake));
    let mut cx = std::task::Context::from_waker(&waker);
    assert!(
        std::pin::Pin::new(&mut writer)
            .poll_write(&mut cx, b"x")
            .is_pending()
    );
    accept_actual_ack(&owner, &actual_reservation_ack(&owner));
    assert!(matches!(
        std::pin::Pin::new(&mut writer).poll_write(&mut cx, b"x"),
        std::task::Poll::Ready(Err(_))
    ));
    assert!(matches!(
        std::pin::Pin::new(&mut writer).poll_shutdown(&mut cx),
        std::task::Poll::Ready(Err(_))
    ));
    assert_eq!(evidence.lock().unwrap().shutdowns, 0);
    assert!(owner.seal_candidate().is_err());
}
#[test]
#[ignore = "requires isolated original-owner invocation; never reset process authority"]
fn owned_io_drop_before_ack_and_pending_flush_poison_original_ticket() {
    use tokio::io::AsyncWrite;
    let (owner, mut writer, evidence) = owned_io_fixture(vec![]);
    let waker = std::task::Waker::from(Arc::new(FixtureWake));
    let mut cx = std::task::Context::from_waker(&waker);
    assert!(
        std::pin::Pin::new(&mut writer)
            .poll_write(&mut cx, b"x")
            .is_pending()
    );
    assert!(matches!(
        std::pin::Pin::new(&mut writer).poll_flush(&mut cx),
        std::task::Poll::Ready(Err(_))
    ));
    assert_eq!(evidence.lock().unwrap().polls, 0);
    assert_eq!(evidence.lock().unwrap().flushes, 0);
    drop(writer);
    assert!(owner.check_live().is_err());
}
#[test]
#[ignore = "requires isolated original-owner invocation; never reset process authority"]
fn owned_io_duplicate_or_foreign_ack_never_admits_a_new_ticket() {
    use tokio::io::AsyncWrite;
    let (owner, mut writer, evidence) = owned_io_fixture(vec![]);
    let waker = std::task::Waker::from(Arc::new(FixtureWake));
    let mut cx = std::task::Context::from_waker(&waker);
    assert!(
        std::pin::Pin::new(&mut writer)
            .poll_write(&mut cx, b"x")
            .is_pending()
    );
    let ack = actual_reservation_ack(&owner);
    let mut foreign = ack.clone();
    foreign["ownerIncarnation"] = json!("foreign");
    assert!(owner.validate_control(&foreign).is_err());
    assert_eq!(evidence.lock().unwrap().polls, 0);
    accept_actual_ack(&owner, &ack);
    assert!(owner.validate_control(&ack).is_err());
    assert!(owner.accept_ack(&ack).is_err());
    owner.poison_admission();
    assert!(matches!(
        std::pin::Pin::new(&mut writer).poll_write(&mut cx, b"x"),
        std::task::Poll::Ready(Err(_))
    ));
    assert_eq!(evidence.lock().unwrap().polls, 0);
}

#[test]
fn private_context_owner_tool_consumption_and_poison_checks_are_nonconsuming() {
    let owner = fixture(false);
    {
        let mut state = owner.0.state.lock().unwrap();
        state.advertised.insert("tool".into());
        state.calls.insert(
            "call".into(),
            CallOrigin {
                parent: Some("original-provider".into()),
                raw_sequence: 1,
                raw_digest: hex_digest(b"raw"),
                raw_bytes: 3,
                response: json!("r"),
                item: json!("i"),
                call: json!("call"),
            },
        );
    }
    let context = owner.claim_source_call("call", "tool").unwrap();
    assert!(context.check_tool(&owner, "other-tool").is_err());
    assert!(context.check_tool(&fixture(false), "tool").is_err());
    context.check_tool(&owner, "tool").unwrap();
    context.check_tool(&owner, "tool").unwrap();
    assert!(!context.0.consumed.load(Ordering::Acquire));
    context.0.consumed.store(true, Ordering::Release);
    assert!(context.check_tool(&owner, "tool").is_err());
    owner.poison_admission();
    assert!(context.prepare().is_err());
    assert!(owner.check_live().is_ok());
    // No downstream preparation, serializer success or external effect is asserted by this unit row.
}
#[test]
fn parse_completion_out_of_original_order_and_unresolved_close_refuse() {
    let owner = fixture(false);
    let first = owner
        .observe_raw_for(
            Some("source/1"),
            br#"{"type":"response.created","response":{"id":"r"}}"#,
            "WS_RAW",
        )
        .unwrap();
    let later = owner
        .observe_raw_for(
            Some("source/1"),
            br#"{"type":"response.output_text.delta","delta":"later"}"#,
            "WS_RAW",
        )
        .unwrap();
    later
        .finish("response.output_text.delta", "KNOWN", false)
        .unwrap();
    assert!(owner.check_admission().is_err());
    assert_eq!(
        owner.0.state.lock().unwrap().records.back().unwrap()["payload"]["parseDisposition"],
        "UNKNOWN"
    );
    first.finish("response.created", "KNOWN", false).unwrap();
    assert!(owner.check_admission().is_err());
    assert!(owner.seal_candidate().is_err());
}

#[test]
fn actual_normalized_identity_conflict_never_advances_source_context() {
    let owner = fixture(false);
    let token=owner.observe_raw_for(Some("source/1"),br#"{"type":"response.created","response_id":"provisional","response":{"id":"actual"}}"#,"WS_RAW").unwrap();
    token
        .finish_parsed(
            "response.created",
            "KNOWN",
            false,
            Some("actual"),
            None,
            None,
        )
        .unwrap();
    let state = owner.0.state.lock().unwrap();
    assert!(state.response_context.is_empty());
    let final_frame = state.records.back().unwrap();
    assert_eq!(final_frame["payload"]["parseDisposition"], "UNKNOWN");
    assert_eq!(final_frame["payload"]["responseId"], "provisional");
    assert!(owner.check_admission().is_err());
}

#[test]
fn queued_created_replaces_previous_response_only_when_same_parser_finalizes() {
    let owner = fixture(false);
    owner
        .observe_raw_for(
            Some("source/1"),
            br#"{"type":"response.created","response":{"id":"old"}}"#,
            "WS_RAW",
        )
        .unwrap()
        .finish("response.created", "KNOWN", false)
        .unwrap();
    let next = owner
        .observe_raw_for(
            Some("source/1"),
            br#"{"type":"response.created","response":{"id":"new"}}"#,
            "WS_RAW",
        )
        .unwrap();
    let callable = owner
        .observe_raw_for(
            Some("source/1"),
            br#"{"type":"response.output_item.done","item":{"id":"item","call_id":"call"}}"#,
            "WS_RAW",
        )
        .unwrap();
    owner
        .observe_raw_for(
            Some("source/2"),
            br#"{"type":"response.created","response":{"id":"foreign"}}"#,
            "WS_RAW",
        )
        .unwrap()
        .finish("response.created", "KNOWN", false)
        .unwrap();
    assert_eq!(
        owner.0.state.lock().unwrap().response_context["source/1"],
        "old"
    );
    next.finish("response.created", "KNOWN", false).unwrap();
    callable
        .finish("response.output_item.done", "KNOWN", true)
        .unwrap();
    assert_eq!(owner.0.state.lock().unwrap().calls["call"].response, "new");
}

#[test]
#[ignore = "requires isolated original-owner invocation; never reset process authority"]
fn owned_io_poison_between_pending_inner_polls_retains_bytes_and_stops_polling() {
    use tokio::io::AsyncWrite;
    let (owner, mut writer, evidence) =
        owned_io_fixture(vec![WriterStep::Pending, WriterStep::Count(3)]);
    let waker = std::task::Waker::from(Arc::new(FixtureWake));
    let mut cx = std::task::Context::from_waker(&waker);
    assert!(
        std::pin::Pin::new(&mut writer)
            .poll_write(&mut cx, b"abc")
            .is_pending()
    );
    accept_actual_ack(&owner, &actual_reservation_ack(&owner));
    assert!(
        std::pin::Pin::new(&mut writer)
            .poll_write(&mut cx, b"abc")
            .is_pending()
    );
    assert_eq!(evidence.lock().unwrap().polls, 1);
    owner.poison_admission();
    assert!(matches!(
        std::pin::Pin::new(&mut writer).poll_write(&mut cx, b"abc"),
        std::task::Poll::Ready(Err(_))
    ));
    assert_eq!(evidence.lock().unwrap().polls, 1);
    assert!(evidence.lock().unwrap().bytes.is_empty());
    assert!(owner.check_live().is_ok());
    drop(writer);
    assert!(owner.check_live().is_err());
}
#[test]
#[ignore = "requires isolated original-owner invocation; never reset process authority"]
fn owned_io_partial_drop_records_unknown_without_a_second_inner_poll() {
    use tokio::io::AsyncWrite;
    let (owner, mut writer, evidence) = owned_io_fixture(vec![WriterStep::Count(1)]);
    let waker = std::task::Waker::from(Arc::new(FixtureWake));
    let mut cx = std::task::Context::from_waker(&waker);
    assert!(
        std::pin::Pin::new(&mut writer)
            .poll_write(&mut cx, b"ab")
            .is_pending()
    );
    accept_actual_ack(&owner, &actual_reservation_ack(&owner));
    assert!(matches!(
        std::pin::Pin::new(&mut writer).poll_write(&mut cx, b"ab"),
        std::task::Poll::Ready(Ok(1))
    ));
    drop(writer);
    assert_eq!(evidence.lock().unwrap().bytes, b"a");
    assert_eq!(evidence.lock().unwrap().polls, 1);
    assert!(owner.check_live().is_err());
    assert!(owner.seal_candidate().is_err());
}
#[test]
#[ignore = "requires isolated original-owner invocation; never reset process authority"]
fn owned_io_pending_shutdown_never_reaches_underlying_shutdown() {
    use tokio::io::AsyncWrite;
    let (owner, mut writer, evidence) = owned_io_fixture(vec![]);
    let waker = std::task::Waker::from(Arc::new(FixtureWake));
    let mut cx = std::task::Context::from_waker(&waker);
    assert!(
        std::pin::Pin::new(&mut writer)
            .poll_write(&mut cx, b"abc")
            .is_pending()
    );
    assert!(matches!(
        std::pin::Pin::new(&mut writer).poll_shutdown(&mut cx),
        std::task::Poll::Ready(Err(_))
    ));
    assert_eq!(evidence.lock().unwrap().shutdowns, 0);
    assert_eq!(evidence.lock().unwrap().polls, 0);
    assert!(owner.check_live().is_err());
}

// AUTHORED_UNEXECUTED: writer-algorithm unit coverage, not OS stdout qualification.
struct StdoutBoundaryFault {
    bytes: Vec<u8>,
    zero: bool,
    writes: usize,
    flushes: usize,
}
impl Write for StdoutBoundaryFault {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.writes += 1;
        if self.zero {
            return Ok(0);
        }
        let count = bytes.len().min(3);
        self.bytes.extend_from_slice(&bytes[..count]);
        Ok(count)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.flushes += 1;
        Err(io::Error::other("fixture flush-only loss"))
    }
}
#[test]
fn original_stdout_algorithm_zero_write_records_attempt_without_progress() {
    let owner = fixture(false);
    let bytes = b"{\"id\":1,\"result\":{}}\n";
    let mut output = StdoutBoundaryFault {
        bytes: Vec::new(),
        zero: true,
        writes: 0,
        flushes: 0,
    };
    assert_eq!(
        owner
            .write_rpc_stdout(&mut output, bytes)
            .unwrap_err()
            .kind(),
        io::ErrorKind::WriteZero
    );
    assert_eq!(output.writes, 1);
    assert_eq!(output.flushes, 0);
    assert!(output.bytes.is_empty());
    {
        let state = owner.0.state.lock().unwrap();
        assert_eq!(state.rpc.output_bytes, 0);
        assert!(state.rpc.output_pending);
        let frames = state
            .records
            .iter()
            .filter(|f| f["kind"] == "RPC_OUTPUT")
            .collect::<Vec<_>>();
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0]["payload"]["phase"], "ATTEMPT");
        assert_eq!(frames[0]["payload"]["rawDigest"], hex_digest(bytes));
        assert_eq!(frames[0]["payload"]["start"], 0);
        assert_eq!(frames[0]["payload"]["end"], bytes.len());
    }
    assert!(owner.check_live().is_err());
    assert!(owner.seal_candidate().is_err());
}
#[test]
fn original_stdout_algorithm_flush_only_failure_keeps_actual_prefix_facts_but_refuses_seal() {
    let owner = fixture(false);
    let bytes = b"{\"id\":1,\"result\":{}}\n";
    let mut output = StdoutBoundaryFault {
        bytes: Vec::new(),
        zero: false,
        writes: 0,
        flushes: 0,
    };
    assert!(owner.write_rpc_stdout(&mut output, bytes).is_err());
    assert_eq!(output.bytes, bytes);
    assert_eq!(output.flushes, 1);
    assert!(output.writes > 1);
    {
        let state = owner.0.state.lock().unwrap();
        assert_eq!(state.rpc.output_bytes, bytes.len());
        assert!(!state.rpc.output_pending);
        let frames = state
            .records
            .iter()
            .filter(|f| f["kind"] == "RPC_OUTPUT")
            .collect::<Vec<_>>();
        assert_eq!(frames[0]["payload"]["phase"], "ATTEMPT");
        let progress = frames
            .iter()
            .filter(|f| f["payload"]["phase"] == "PROGRESS")
            .collect::<Vec<_>>();
        assert_eq!(progress.len(), output.writes);
        let mut observed = 0;
        for frame in &progress {
            assert_eq!(frame["payload"]["start"], observed);
            let end = frame["payload"]["end"].as_u64().unwrap() as usize;
            assert!(end > observed && end - observed <= 3);
            observed = end;
        }
        assert_eq!(observed, bytes.len());
        assert_eq!(progress.last().unwrap()["payload"]["end"], bytes.len());
        assert!(
            frames
                .iter()
                .all(|f| f["payload"]["rawDigest"] == hex_digest(bytes))
        );
    }
    assert!(owner.check_live().is_err());
    assert!(owner.seal_candidate().is_err());
}
