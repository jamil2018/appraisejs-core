//! Dormant original-channel M06 source custody. No production effect/clock/finality issuer.
//! A process latch rejects missing explicit owners; it is never task-local authorization.
use std::collections:: {
    BTreeMap,
    BTreeSet,
    VecDeque
};
use std::fs::File;
use std::io:: {
    self,
    Read,
    Write
};
use std::sync:: {
    Arc,
    Mutex,
    OnceLock
};
use std::sync::atomic:: {
    AtomicBool,
    Ordering
};
use std::time::Instant;
use serde_json:: {
    Value,
    json
};
use sha2:: {
    Digest,
    Sha256
};
pub const PROFILE: &str = "M06_SOURCE_FDS_4_5_V12";
pub const MAX_FRAME: usize = 65536;
const MAX_FRAMES: usize = 256;
const MAX_OPERATIONS: usize = 64;
const MAX_OUTBOUND: usize = 2 * 1024 * 1024;
const DOMAIN: &[u8] = b"M06_NATIVE_SOURCE_V12\0";
static REQUESTED: AtomicBool = AtomicBool::new(false);
static ORIGINAL: OnceLock<SourceOwner> = OnceLock::new();
pub fn deny() -> io::Error {
    io::Error::new(io::ErrorKind::PermissionDenied,
    "M06 original source gate refused; outcome UNKNOWN")
}
pub fn active() -> bool {
    REQUESTED.load(Ordering::Acquire)
}
pub fn request_restrictive_profile() {
    REQUESTED.store(true,
    Ordering::Release);
}
pub fn original_owner() -> Option<SourceOwner> {
    ORIGINAL.get().cloned()
}
pub fn require_owner(owner: Option<&SourceOwner>) -> io::Result<()> {
    if !active() {
        return Ok(());
    }
    let Some(owner) = owner else {
        return Err(deny());
    };
    if ORIGINAL.get().is_none_or(|original| !Arc::ptr_eq(&original.0,
    &owner.0)) {
        return Err(deny());
    }
    owner.check_admission()
}
/// Observation-only identity check for the same original reader while SOURCE_CLOSING.
pub fn require_observation_owner(owner: Option<&SourceOwner>) -> io::Result<()> {
    if !active() { return Ok(()); }
    let owner = owner.ok_or_else(deny)?;
    if ORIGINAL.get().is_none_or(|original| !Arc::ptr_eq(&original.0, &owner.0)) { return Err(deny()); }
    owner.check_live()
}
/// Unsupported routes deny at the real entry even if another route has an owner.
pub fn deny_unsupported(route: &'static str) -> io::Result<()> {
    if active() {
        if let Some(owner) = ORIGINAL.get() {
            owner.fence(route);
        }
        Err(deny())
    }  else {
        Ok(())
    }
}
pub fn hex_digest(bytes: &[u8]) -> String {
    format!("sha256:{:x}",
    Sha256::digest(bytes))
}
pub fn canonical(value: &Value) -> io::Result<Vec<u8>> {
    fn check(value: &Value,
    depth: usize) -> io::Result<()> {
        if depth > 16 {
            return Err(deny());
        }
        match value {
            Value::Number(n) if n.as_u64().is_none_or(|n| n > 9_007_199_254_740_991) => return Err(deny()),
            Value::Object(map) => for (k,
            v) in map {
                if !k.bytes().all(|b|(0x20..=0x7e).contains(&b)) {
                    return Err(deny());
                }
                check(v,
                depth+1)?;
            },
            Value::Array(a) => for v in a {
                check(v,
                depth+1)?;
            },
            _ => ()
        }
        Ok(())
    }
    check(value,
    0)?;
    // serde_json's default map order is not assumed: sort recursively explicitly.
    fn sorted(v: &Value) -> Value {
        match v {
            Value::Object(map) => Value::Object(map.iter().map(|(k,
            v)|(k.clone(),
            sorted(v))).collect::<BTreeMap<_,
            _>>().into_iter().collect()),
            Value::Array(a) => Value::Array(a.iter().map(sorted).collect()),
            v => v.clone()
        }
    }
    serde_json::to_vec(&sorted(value)).map_err(|_|deny())
}
fn exact_keys(value: &Value,
keys: &[&str]) -> io::Result<()> {
    let map=value.as_object().ok_or_else(deny)?;
    if map.len()!=keys.len() || keys.iter().any(|k|!map.contains_key(*k)) {
        return Err(deny());
    }
    Ok(())
}
fn id(v:&Value) -> bool {
    v.as_str().is_some_and(|s|!s.is_empty() && s.len()<=200 && s.bytes().all(|b|b.is_ascii_alphanumeric() || b"_.:/-".contains(&b)))
}
fn digest(v:&Value) -> bool {
    v.as_str().is_some_and(|s|s.len()==71 && s.starts_with("sha256:") && s[7..].bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)))
}
fn validate_frame(v:&Value) -> io::Result<()> {
    exact_keys(v,
    &["version",
    "lane",
    "kind",
    "ownerIncarnation",
    "channelIncarnation",
    "sequence",
    "previousDigest",
    "bindingDigest",
    "operationId",
    "parentOperationId",
    "attemptId",
    "transportIncarnation",
    "rpcRequestId",
    "nativeThreadId",
    "nativeTurnId",
    "sourceCallId",
    "mcpRequestId",
    "deadlineId",
    "clockContractId",
    "nativeTick",
    "disposition",
    "payload"])?;
    if v["version"]!="M06_NATIVE_SOURCE_V12" || !matches!(v["lane"].as_str(),
    Some("CONTROL"|"SOURCE"|"MCP")) {
        return Err(deny());
    }
    for k in ["ownerIncarnation",
    "channelIncarnation",
    "deadlineId"] {
        if !id(&v[k]) {
            return Err(deny());
        }
    }
    for k in ["operationId",
    "parentOperationId",
    "attemptId",
    "transportIncarnation",
    "nativeThreadId",
    "nativeTurnId",
    "sourceCallId",
    "clockContractId"] {
        if !v[k].is_null() && !id(&v[k]) {
            return Err(deny());
        }
    }
    if !digest(&v["previousDigest"]) || !digest(&v["bindingDigest"]) {
        return Err(deny());
    }
    for k in ["sequence",
    "nativeTick"] {
        if v[k].as_u64().is_none_or(|n|n>9_007_199_254_740_991) {
            return Err(deny());
        }
    }
    if !v["mcpRequestId"].is_null() {
        let m=&v["mcpRequestId"];
        exact_keys(m,
        &["type",
        "value"])?;
        match m["type"].as_str() {
            Some("string") if id(&m["value"]) => (),
            Some("number") if m["value"].as_u64().is_some_and(|n|n<=9_007_199_254_740_991) => (),
            _=>return Err(deny())
        }
    }
    let keys:&[&str]=match v["kind"].as_str() {
        Some("BOOTSTRAP")=>&["binding"],
        Some("HELLO")=>&["profileDigest",
        "protocolDigest"],
        Some("BOOTSTRAP_ACK")=>&["helperClosed"],
        Some("RESERVATION_ACK")=>&["tokenId",
        "operationId",
        "head"],
        Some("RESERVATION_DURABLE")=>&["route",
        "endpointId",
        "payloadDigest",
        "maxBytes"],
        Some("ATTEMPT_ENTERED")=>&["route"],
        Some("WRITE_ATTEMPT"|"WRITE_PROGRESS")=>&["start",
        "end",
        "rawDigest"],
        Some("RAW_INPUT")=>&["rawSequence", "bytes",
        "rawDigest",
        "eventName",
        "parseDisposition",
        "responseId",
        "itemId",
        "callId"],
        Some("PARSE_DISPOSITION")=>&["rawSequence", "rawDigest", "eventName", "parseDisposition", "responseId", "itemId", "callId"],
        Some("MCP_CALL")=>&["requestHash",
        "profileDigest",
        "responseId",
        "itemId",
        "callId"],
        Some("APPRAISE_ACCEPTANCE")=>&["joinDigest",
        "acceptanceId"],
        Some("LOCAL_CLOSE")=>&["complete"],
        Some("FENCE"|"UNKNOWN"|"ADMISSION_POISON")=>&["reason"],
        Some("RANGE_SEAL")=>&["head",
        "operations",
        "frames",
        "rpcIssuedRequests",
        "rpcWrittenBytes", "rpcObservedRequests", "rpcInputRecords", "rpcSenderSealDigest"],
        Some("RPC_SENDER_SEAL") => &["sealId", "transportId", "transportIncarnation", "issuedRequests", "attemptedBytes", "allocations", "attempts"],
        Some("RPC_INPUT") => &["route", "recordOrdinal", "start", "end", "rawDigest", "framing", "messageKind", "parseDisposition"],
        Some("RPC_EOF") => &["route", "receivedBytes", "records", "observedRequests", "observedIdsDigest"],
        Some("RPC_WORK") => &["route", "recordOrdinal", "state"],
        Some("RPC_OUTPUT") => &["route", "writeOrdinal", "phase", "start", "end", "rawDigest"],
        Some("MCP_REQUEST"|"MCP_REPLY")=>&["messageJson"],
        _=>return Err(deny())
    };
    exact_keys(&v["payload"],
    keys)?;
    if v["kind"]=="MCP_CALL" && ["responseId","itemId","callId"].iter().any(|k|!id(&v["payload"][*k])){return Err(deny());}
    if v["sequence"].as_u64().is_none_or(|n| n==0) || !matches!(v["disposition"].as_str(),
    Some("KNOWN"|"UNKNOWN"|"MALFORMED")) {
        return Err(deny());
    }
    if !v["rpcRequestId"].is_null() && v["rpcRequestId"].as_u64().is_none() {
        return Err(deny());
    }
    let kind=v["kind"].as_str().ok_or_else(deny)?;
    if matches!(kind,
    "MCP_REQUEST"|"MCP_REPLY") != (v["lane"]=="MCP") {
        return Err(deny());
    }
    if matches!(kind,
    "BOOTSTRAP"|"BOOTSTRAP_ACK"|"RESERVATION_ACK"|"RPC_SENDER_SEAL"|"ADMISSION_POISON") && v["lane"]!="CONTROL" {
        return Err(deny());
    }
    let p=&v["payload"];
    for k in ["rawDigest",
    "payloadDigest",
    "profileDigest",
    "protocolDigest",
    "requestHash",
    "joinDigest",
    "head", "rpcSenderSealDigest", "observedIdsDigest"] {
        if let Some(d)=p.get(k) {
            if !digest(d) {
                return Err(deny());
            }
        }
    }
    for k in ["start",
    "end",
    "bytes",
    "maxBytes",
    "operations",
    "frames",
    "rpcIssuedRequests", "rawSequence",
    "rpcWrittenBytes", "rpcObservedRequests", "rpcInputRecords", "recordOrdinal", "writeOrdinal", "receivedBytes", "records", "observedRequests", "issuedRequests", "attemptedBytes"] {
        if let Some(n)=p.get(k) {
            if n.as_u64().is_none_or(|n|n>9_007_199_254_740_991) {
                return Err(deny());
            }
        }
    }
    for k in ["route",
    "endpointId",
    "eventName",
    "tokenId",
    "operationId",
    "acceptanceId",
    "reason"] {
        if let Some(v)=p.get(k) {
            if !id(v) {
                return Err(deny());
            }
        }
    }
    for k in ["responseId",
    "itemId",
    "callId"] {
        if let Some(v)=p.get(k) {
            if !v.is_null() && !id(v) {
                return Err(deny());
            }
        }
    }
    if let Some(d)=p.get("parseDisposition") {
        if !(matches!(d.as_str(), Some("KNOWN"|"UNKNOWN"|"MALFORMED")) || (kind=="RAW_INPUT" && d=="PENDING")) {
            return Err(deny());
        }
    }
    if let Some(d)=p.get("parseDisposition") {
        let outer=if d=="PENDING" { "KNOWN" } else { d.as_str().ok_or_else(deny)? };
        if v["disposition"]!=outer { return Err(deny()); }
    }
    if matches!(kind,"UNKNOWN"|"FENCE"|"ADMISSION_POISON") && v["disposition"]!="UNKNOWN" { return Err(deny()); }
    if let Some(m)=p.get("messageJson") {
        parse_transient(m.as_str().ok_or_else(deny)?)?;
    }
    if let Some(c)=p.get("complete") {
        if !c.is_boolean() {
            return Err(deny());
        }
    }
    if kind=="BOOTSTRAP_ACK" && p["helperClosed"]!=true {
        return Err(deny());
    }
    Ok(())
}
pub fn read_frame(reader: &mut impl Read) -> io::Result<Value> {
    let mut length=[0;
    4];
    reader.read_exact(&mut length)?;
    let size=u32::from_be_bytes(length) as usize;
    if size==0 || size>MAX_FRAME {
        return Err(deny());
    }
    let mut bytes=vec![0;
    size];
    reader.read_exact(&mut bytes)?;
    let value:Value=serde_json::from_slice(&bytes).map_err(|_|deny())?;
    // Canonical equality also rejects duplicate JSON keys, whitespace and alternate escapes.
    if canonical(&value)?!=bytes {
        return Err(deny());
    }
    validate_frame(&value)?;
    Ok(value)
}
fn read_control_frame(reader: &mut impl Read) -> io::Result<Option<Value>> {
    let mut prefix = [0u8;4];
    loop {
        match reader.read(&mut prefix[..1]) {
            Ok(0) => return Ok(None),
            Ok(_) => break,
            Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
            Err(error) => return Err(error),
        }
    }
    reader.read_exact(&mut prefix[1..])?;
    let size = u32::from_be_bytes(prefix) as usize;
    if size == 0 || size > MAX_FRAME { return Err(deny()); }
    let mut framed = prefix.to_vec();
    let mut body = vec![0u8;size];
    reader.read_exact(&mut body)?;
    framed.extend(body);
    read_frame(&mut std::io::Cursor::new(framed)).map(Some)
}
#[derive(Clone)] pub struct SourceOwner(Arc<Inner>);
impl PartialEq for SourceOwner {
    fn eq(&self,
    other:&Self)->bool {
        Arc::ptr_eq(&self.0,
        &other.0)
    }
}
impl Eq for SourceOwner {
}
impl std::fmt::Debug for SourceOwner {
    fn fmt(&self,
    f:&mut std::fmt::Formatter<'_>)->std::fmt::Result {
        f.debug_struct("OriginalM06Owner").finish_non_exhaustive()
    }
}
// Original-owner contract is intentionally absent. No production or generic fixture issuer.
struct OriginalAuthResolutionContract { owner_binding_digest:String }
struct Inner {
    binding:Value,
    binding_digest:String,
    auth_resolution_contract:Option<OriginalAuthResolutionContract>,
    started:Instant,
    fenced:AtomicBool,
    closing:AtomicBool,
    admission_poison:AtomicBool,
    sealed:AtomicBool,
    control_released:AtomicBool,
    collectors_frozen:AtomicBool,
    disposing:AtomicBool,
    #[cfg(test)] fixture_effect:bool,
    state:Mutex<State>,
    output:Mutex<Option<File>>,
    stdio_threads:Mutex<Vec<std::thread::JoinHandle<()>>>,
    collectors:Mutex<Vec<tokio::task::JoinHandle<()>>>,
    replies:Mutex<Option<tokio::sync::mpsc::Receiver<String>>>,
    reservation_notify:tokio::sync::Notify,
}
struct State {
    sequence:u64,
    head:String,
    control_sequence:u64,
    control_head:String,
    frames:usize,
    operations:usize,
    bytes:usize,
    journal_bytes:usize,
    native_thread:Value,
    native_turn:Value,
    response_context:BTreeMap<String,Value>,
    pending_raw:BTreeMap<u64,Option<String>>,
    mcp_links:BTreeMap<String,McpLink>,
    closed_operations:BTreeSet<String>,
    scopes:BTreeMap<String,OperationScope>,
    tickets:BTreeSet<String>,
    calls:BTreeMap<String,
    CallOrigin>,
    advertised:BTreeSet<String>,
    pending_methods:BTreeMap<String,
    String>,
    acknowledged_operations:BTreeSet<String>,
    acknowledgements:BTreeMap<String,
    (String,
    String)>,
    write_wakers:BTreeMap<String,
    std::task::Waker>,
    unresolved:usize,
    inherited_mcp_adopted:bool,
    inherited_mcp_shutdown:bool,
    inherited_mcp_transport_retired:bool,
    inherited_mcp_service_joined:bool,
    direct_io_claimed:bool,
    rpc:RpcState,
    records:VecDeque<Value>
}
impl SourceOwner {
    /// Only called by the dedicated Unix entry with its original owned fd4/fd5.
    /// This installs custody, never host trust or an execution grant. No reopening/re-adoption.
    pub fn bootstrap(mut control:File,
    output:File) -> io::Result<Self> {
        request_restrictive_profile();
        if ORIGINAL.get().is_some() {
            return Err(deny());
        }
        let frame=read_frame(&mut control)?;
        if frame["kind"]!="BOOTSTRAP" || frame["lane"]!="CONTROL" || frame["sequence"]!=1 || frame["previousDigest"]!=hex_digest(DOMAIN) {
            return Err(deny());
        }
        let binding=frame["payload"]["binding"].clone();
        exact_keys(&binding,
        &["runId",
        "intentId",
        "sendBoundaryId",
        "claimEpoch",
        "providerNamespace",
        "configurationDigest",
        "transportId",
        "transportIncarnation",
        "ownerIncarnation",
        "channelIncarnation",
        "protocolDigest",
        "routeProfileDigest",
        "mcpProfileDigest",
        "nonce",
        "deadlineId",
        "parentClockEpoch",
        "clockContractId",
        "nativeClockEpoch"])?;
        if !binding["clockContractId"].is_null() || !binding["nativeClockEpoch"].is_null() {
            return Err(deny());
        }
        for k in ["runId",
        "intentId",
        "sendBoundaryId",
        "providerNamespace",
        "transportId",
        "transportIncarnation",
        "ownerIncarnation",
        "channelIncarnation",
        "nonce",
        "deadlineId",
        "parentClockEpoch"] {
            if !id(&binding[k]) {
                return Err(deny());
            }
        }
        for k in ["configurationDigest",
        "protocolDigest",
        "routeProfileDigest",
        "mcpProfileDigest"] {
            if !digest(&binding[k]) {
                return Err(deny());
            }
        }
        if binding["claimEpoch"].as_u64().is_none_or(|n|n==0) || binding["protocolDigest"]!=hex_digest(b"M06_NATIVE_SOURCE_PROTOCOL_V12:MESSAGE_JSON_V1:RPC_CLOSURE_V1:RAW_PARSE_CUSTODY_V1") {
            return Err(deny());
        }
        let mut bytes=b"M06_NATIVE_BINDING_V12\0".to_vec();
        bytes.extend(canonical(&binding)?);
        let binding_digest=hex_digest(&bytes);
        for k in ["ownerIncarnation",
        "channelIncarnation",
        "deadlineId"] {
            if frame[k]!=binding[k] {
                return Err(deny());
            }
        }
        if frame["bindingDigest"]!=binding_digest {
            return Err(deny());
        }
        let (reply_tx,
        reply_rx)=tokio::sync::mpsc::channel(16);
        let owner=Self(Arc::new(Inner {
            #[cfg(test)] fixture_effect:false,
            binding,
            binding_digest,
            auth_resolution_contract:None,
            started:Instant::now(),
            fenced:AtomicBool::new(false),
            closing:AtomicBool::new(false),
            admission_poison:AtomicBool::new(false),
            sealed:AtomicBool::new(false),
            control_released:AtomicBool::new(false),
            collectors_frozen:AtomicBool::new(false),
            disposing:AtomicBool::new(false),
            stdio_threads:Mutex::new(Vec::new()),
            collectors:Mutex::new(Vec::new()),
            output:Mutex::new(Some(output)),
            replies:Mutex::new(Some(reply_rx)),
            reservation_notify:tokio::sync::Notify::new(),
            state:Mutex::new(State {
                sequence:1,
                head:hex_digest(DOMAIN),
                control_sequence:2,
                control_head:chain(&frame)?,
                frames:0,
                operations:0,
                bytes:0,
                journal_bytes:0,
                native_thread:Value::Null,
                native_turn:Value::Null,
                response_context:BTreeMap::new(),
                pending_raw:BTreeMap::new(),
                mcp_links:BTreeMap::new(),
                closed_operations:BTreeSet::new(),
                scopes:BTreeMap::new(),
                tickets:BTreeSet::new(),
                calls:BTreeMap::new(),
                advertised:BTreeSet::new(),
                pending_methods:BTreeMap::new(),
                acknowledged_operations:BTreeSet::new(),
                acknowledgements:BTreeMap::new(),
                write_wakers:BTreeMap::new(),
                unresolved:0,
                inherited_mcp_adopted:false,
                inherited_mcp_shutdown:false,
                inherited_mcp_transport_retired:false,
                inherited_mcp_service_joined:false,
                direct_io_claimed:false,
                rpc:RpcState::default(),
                records:VecDeque::new()
            })
        }));
        owner.record("HELLO",
        None,
        json!( {
            "profileDigest":owner.0.binding["mcpProfileDigest"],
            "protocolDigest":owner.0.binding["protocolDigest"]
        }))?;
        let ack=read_frame(&mut control)?;
        owner.validate_control(&ack)?;
        if ack["kind"]!="BOOTSTRAP_ACK" || ack["payload"]["helperClosed"]!=true {
            owner.fence("HELPER_CLOSURE");
            return Err(deny());
        }
        ORIGINAL.set(owner.clone()).map_err(|_|deny())?;
        let retained=owner.clone();
        // Exactly one original control reader. It is not a replacement RPC/provider consumer.
        std::thread::Builder::new().name("m06-original-control".into()).spawn(move || {
            loop {
                let frame=match read_control_frame(&mut control) {
                    Ok(Some(frame)) if retained.validate_control(&frame).is_ok()=>frame,
                    Ok(None) if retained.0.sealed.load(Ordering::Acquire) => {
                        retained.0.control_released.store(true, Ordering::Release);
                        retained.0.reservation_notify.notify_waiters();
                        break;
                    },
                    _=> {
                        retained.fence("CONTROL_LOST");
                        break;
                    }
                };
                match frame["kind"].as_str() {
                    Some("MCP_REPLY")=> {
                        if retained.observe_mcp_reply(frame["payload"]["messageJson"].as_str().unwrap_or(""),
                        &frame["mcpRequestId"]).is_err() || reply_tx.try_send(frame["payload"]["messageJson"].as_str().unwrap_or("").to_owned()).is_err() {
                            retained.fence("MCP_REPLY_CONFLICT");
                            break;
                        }
                    }
                    Some("RESERVATION_ACK")=> {
                        if retained.accept_ack(&frame).is_err() {
                            retained.fence("RESERVATION_ACK_CONFLICT");
                            break;
                        }
                    }
                    Some("APPRAISE_ACCEPTANCE")=> {
                        if retained.accept_mcp_evidence(&frame).is_err(){retained.fence("FOREIGN_MCP_ACCEPTANCE");break;}
                        // Echo actual parent SDK/DB evidence; it never proves provider finality.
                        if retained.record_with("APPRAISE_ACCEPTANCE",
                        frame["operationId"].as_str(),
                        frame["sourceCallId"].as_str(),
                        frame["mcpRequestId"].clone(),
                        frame["payload"].clone()).is_err() {
                            retained.fence("ACCEPTANCE_LOST");
                            break;
                        }
                        if let Some(operation)=frame["operationId"].as_str(){if retained.mark_mcp_evidence_echoed(operation).is_err(){retained.fence("MCP_LOCAL_CLOSE_FAILED");break;}}
                    }
                    Some("RPC_SENDER_SEAL")=> {
                        if retained.accept_rpc_sender_seal(&frame["payload"]).is_err() {
                            retained.fence("RPC_SENDER_SEAL_CONFLICT");
                            break;
                        }
                    }
                    Some("ADMISSION_POISON")=> {retained.poison_admission();}
                    Some("FENCE"|"UNKNOWN")=> {
                        retained.fence("PARENT_FENCE");
                        break;
                    }
                    _=> {
                        retained.fence("UNEXPECTED_CONTROL");
                        break;
                    }
                }
            }
        }).inspect_err(|_|owner.fence("CONTROL_READER_SPAWN_FAILED"))?;
        Ok(owner)
    }
    fn validate_control(&self,
    frame:&Value)->io::Result<()> {
        if frame["disposition"]!="KNOWN" && frame["kind"]!="ADMISSION_POISON" {
            self.poison_admission(); return Err(deny());
        }
        self.check_live()?;
        let mut state=self.0.state.lock().map_err(|_|deny())?;
        self.check_live()?;
        if frame["sequence"]!=state.control_sequence || frame["previousDigest"]!=state.control_head || frame["bindingDigest"]!=self.0.binding_digest {
            return Err(deny());
        }
        for k in ["ownerIncarnation",
        "channelIncarnation",
        "deadlineId"] {
            if frame[k]!=self.0.binding[k] {
                return Err(deny());
            }
        }
        state.control_sequence+=1;
        state.control_head=chain(frame)?;
        Ok(())
    }
    pub fn check_live(&self)->io::Result<()> {
        if self.0.fenced.load(Ordering::Acquire) || self.0.sealed.load(Ordering::Acquire) || self.0.disposing.load(Ordering::Acquire) {
            Err(deny())
        }  else {
            Ok(())
        }
    }
    pub fn check_admission(&self) -> io::Result<()> {
        self.check_live()?;
        if self.0.closing.load(Ordering::Acquire) || self.0.admission_poison.load(Ordering::Acquire) {
            return Err(deny());
        }
        Ok(())
    }
    /// Restriction only: original readers and already-owned settlements remain live.
    pub fn poison_admission(&self) {
        self.0.admission_poison.store(true, Ordering::Release);
        self.0.reservation_notify.notify_waiters();
    }
    /// Best-effort source notification after the irreversible restriction, outside state locks.
    pub fn poison_source(&self,reason:&str) {
        let first=!self.0.admission_poison.swap(true,Ordering::AcqRel);
        self.0.reservation_notify.notify_waiters();
        if first {let _=self.record("UNKNOWN",None,json!({"reason":reason}));}
    }
    pub fn is_source_closing(&self) -> bool {
        self.0.closing.load(Ordering::Acquire)
    }
    pub fn fence(&self,
    reason:&'static str) {
        if !self.0.fenced.swap(true,
        Ordering::AcqRel) {
            self.0.reservation_notify.notify_waiters();
            if let Ok(tasks)=self.0.collectors.lock() {
                for task in tasks.iter() {
                    task.abort();
                }
            }
            // No clean seal. Best-effort bounded local UNKNOWN never asserts delivery/finality.
            if let Ok(mut state)=self.0.state.lock() {
                if state.records.len()<MAX_FRAMES {
                    state.records.push_back(json!( {
                        "kind":"UNKNOWN",
                        "reason":reason
                    }));
                }
            }
        }
    }
    pub fn binding(&self)->&Value {
        &self.0.binding
    }
    /// No production registrar supplies a cross-clock or topology contract in12.
    /// Final guard is synchronous, after every slow reservation step and immediately before I/O.
    pub fn final_effect_guard(&self)->io::Result<()> {
        self.check_admission()?;
        #[cfg(test)] if self.0.fixture_effect {
            return Ok(());
        }
        Err(deny())
    }
    pub fn check_auth_resolution_contract(&self) -> io::Result<()> {
        self.check_admission()?;
        self.final_effect_guard()?;
        // Generic effect fixtures cannot supply this separate original auth-route binding.
        let contract = self.0.auth_resolution_contract.as_ref().ok_or_else(deny)?;
        if contract.owner_binding_digest != self.0.binding_digest { return Err(deny()); }
        Ok(())
    }
    pub async fn enter_attempt(&self,
    route:&str,
    endpoint:&str,
    commitment:&[u8])->io::Result<AttemptLease> {
        self.check_admission()?;
        let operation= {
            let mut state=self.0.state.lock().map_err(|_|deny())?;
            if state.operations>=MAX_OPERATIONS||state.unresolved>=16 {
                return Err(deny());
            }
            state.operations+=1;
            state.unresolved+=1;
            let operation=format!("attempt/{route}/{}",
            state.operations);
            state.tickets.insert(operation.clone());
            let scope=self.operation_scope(&state,None,None,false);
            state.scopes.insert(operation.clone(),scope);
            operation
        };
        self.record("RESERVATION_DURABLE",
        Some(&operation),
        json!( {
            "route":"ws.direct",
            "endpointId":endpoint,
            "payloadDigest":hex_digest(commitment),
            "maxBytes":MAX_OUTBOUND
        }))?;
        loop {
            let notified=self.0.reservation_notify.notified();
            if self.0.state.lock().map_err(|_|deny())?.acknowledgements.contains_key(&operation) {
                break;
            }
            self.check_admission()?;
            tokio::select! {
                _=notified=>(),
                _=tokio::time::sleep(std::time::Duration::from_millis(10))=>()
            }
        }
        self.check_admission()?;
        self.record("ATTEMPT_ENTERED",
        Some(&operation),
        json!( {
            "route":"ws.direct"
        }))?;
        self.final_effect_guard()?;
        Ok(AttemptLease{owner:self.clone(),operation,complete:false})
    }
    /// The restricted profile has one original direct transport incarnation.
    /// A second underlying IO, retry or reconnect cannot reuse its identity.
    pub fn claim_direct_io(&self) -> io::Result<()> {
        self.check_admission()?;
        let mut state = self.0.state.lock().map_err(|_|deny())?;
        if state.direct_io_claimed {
            self.0.fenced.store(true,Ordering::Release);
            return Err(deny());
        }
        state.direct_io_claimed = true;
        Ok(())
    }
    pub fn reserve_write(&self,
    bytes:&[u8])->io::Result<WriteTicket> {
        self.check_admission()?;
        let mut state=self.0.state.lock().map_err(|_|deny())?;
        if state.operations>=MAX_OPERATIONS || state.bytes.checked_add(bytes.len()).is_none_or(|n|n>MAX_OUTBOUND) {
            drop(state);
            self.fence("CAPACITY");
            return Err(deny());
        }
        state.operations+=1;
        state.bytes+=bytes.len();
        state.unresolved+=1;
        let operation=format!("write/{}",
        state.operations);
        state.tickets.insert(operation.clone());
        let scope=self.operation_scope(&state,None,None,false);state.scopes.insert(operation.clone(),scope);
        drop(state);
        self.record("RESERVATION_DURABLE",
        Some(&operation),
        json!( {
            "route":"ws.direct",
            "endpointId":"responses-ws",
            "payloadDigest":hex_digest(bytes),
            "maxBytes":bytes.len()
        }))?;
        Ok(WriteTicket {
            owner:self.clone(),
            operation,
            digest:hex_digest(bytes),
            bytes:bytes.to_vec(),
            length:bytes.len(),
            offset:0,
            entered:false,
            settled:false
        })
    }
    pub fn record(&self,
    kind:&str,
    operation:Option<&str>,
    payload:Value)->io::Result<()> {
        self.record_with(kind,
        operation,
        None,
        Value::Null,
        payload)
    }
    fn record_with(&self,
    kind:&str,
    operation:Option<&str>,
    source_call:Option<&str>,
    mcp_id:Value,
    payload:Value)->io::Result<()> {
        self.check_live()?;
        let mut state = self.0.state.lock().map_err(|_| deny())?;
        self.record_locked(&mut state, kind, operation, source_call, mcp_id, Value::Null, false, payload)
    }
    fn record_locked(
        &self,
        state: &mut State,
        kind: &str,
        operation: Option<&str>,
        source_call: Option<&str>,
        mcp_id: Value,
        rpc_id: Value,
        intrinsic: bool,
        payload: Value,
    ) -> io::Result<()> {
        self.record_locked_sequence(state,kind,operation,source_call,mcp_id,rpc_id,intrinsic,payload).map(|_|())
    }
    fn record_locked_sequence(
        &self,
        state: &mut State,
        kind: &str,
        operation: Option<&str>,
        source_call: Option<&str>,
        mcp_id: Value,
        rpc_id: Value,
        intrinsic: bool,
        mut payload: Value,
    ) -> io::Result<u64> {
        self.check_live()?;
        if matches!(payload["parseDisposition"].as_str(),Some("UNKNOWN"|"MALFORMED")) || matches!(kind,"UNKNOWN"|"FENCE") {self.poison_admission();}
        if kind!="PARSE_DISPOSITION" && state.frames+state.pending_raw.len()+1>MAX_FRAMES {self.poison_admission();return Err(deny());}
        if kind=="RAW_INPUT" && payload.get("rawSequence").is_none() { payload["rawSequence"]=json!(state.sequence); }
        if state.frames>=MAX_FRAMES {
            self.0.fenced.store(true, Ordering::Release);
            return Err(deny());
        }
        if let Some(operation)=operation {
            if state.closed_operations.contains(operation){self.0.fenced.store(true,Ordering::Release);return Err(deny());}
            if kind=="LOCAL_CLOSE" {
                if payload["complete"]!=true||!state.scopes.contains_key(operation)||state.pending_raw.values().any(|parent|parent.as_deref()==Some(operation)){self.0.fenced.store(true,Ordering::Release);return Err(deny());}
                state.closed_operations.insert(operation.to_owned());
                state.unresolved=state.unresolved.checked_sub(1).ok_or_else(deny)?;
            }
        }
        let scope=operation.and_then(|id|state.scopes.get(id)).cloned();
        let value=json!( {
            "version":"M06_NATIVE_SOURCE_V12",
            "lane":if kind=="MCP_REQUEST" {
                "MCP"
            } else {
                "SOURCE"
            },
            "kind":kind,
            "ownerIncarnation":self.0.binding["ownerIncarnation"],
            "channelIncarnation":self.0.binding["channelIncarnation"],
            "sequence":state.sequence,
            "previousDigest":state.head,
            "bindingDigest":self.0.binding_digest,
            "operationId":operation,
            "parentOperationId":scope.as_ref().and_then(|s|s.parent.as_deref()),
            "attemptId":operation.map(|s|format!("{s}/attempt/1")),
            "transportIncarnation":if intrinsic { self.0.binding["transportIncarnation"].clone() } else { scope.as_ref().map(|s|Value::String(s.transport.clone())).unwrap_or(Value::Null) },
            "rpcRequestId":rpc_id,
            "nativeThreadId":scope.as_ref().map(|s|s.thread.clone()).unwrap_or(Value::Null),
            "nativeTurnId":scope.as_ref().map(|s|s.turn.clone()).unwrap_or(Value::Null),
            "sourceCallId":source_call.or_else(||scope.as_ref().and_then(|s|s.call.as_deref())),
            "mcpRequestId":mcp_id,
            "deadlineId":self.0.binding["deadlineId"],
            "clockContractId":null,
            "nativeTick":state.sequence,
            "disposition":match payload["parseDisposition"].as_str() {Some("UNKNOWN")=>"UNKNOWN",Some("MALFORMED")=>"MALFORMED",_=>if matches!(kind,"UNKNOWN"|"FENCE"){"UNKNOWN"}else{"KNOWN"}},
            "payload":payload
        });
        let encoded_length=canonical(&value)?.len();
        let completion_reserve=if kind=="PARSE_DISPOSITION" {state.pending_raw.len().saturating_sub(1)} else {state.pending_raw.len()}*MAX_FRAME;
        if state.journal_bytes.checked_add(encoded_length).and_then(|n|n.checked_add(completion_reserve)).is_none_or(|n|n>1024*1024) {
            self.0.fenced.store(true, Ordering::Release);
            return Err(deny());
        }
        state.journal_bytes+=encoded_length;
        let mut output_guard=self.0.output.lock().map_err(|_|deny())?;
        let output = output_guard.as_mut().ok_or_else(deny)?;
        let encoded=canonical(&value)?;
        validate_frame(&value)?;
        if encoded.len()>MAX_FRAME {
            return Err(deny());
        }
        if kind=="MCP_REQUEST" {
            self.final_effect_guard()?;
        }
        // The immutable original frame stays owned through each actual partial write.
        let mut framed=(encoded.len() as u32).to_be_bytes().to_vec();
        framed.extend_from_slice(&encoded);
        let mut offset=0;
        while offset<framed.len(){
            self.check_live()?;
            if kind=="MCP_REQUEST"{self.final_effect_guard()?;}
            // No await, callback, queue or filesystem read between guard and handoff.
            match output.write(&framed[offset..]){
                Ok(0)=>{self.0.fenced.store(true,Ordering::Release);return Err(io::Error::new(io::ErrorKind::WriteZero,"M06 source write incomplete"));}
                Ok(written)=>offset+=written,
                Err(error)=>{self.0.fenced.store(true,Ordering::Release);return Err(error);}
            }
        }
        self.check_live()?;
        output.flush().inspect_err(|_|{self.0.fenced.store(true,Ordering::Release);})?;
        state.head=chain(&value)?;
        let recorded_sequence=state.sequence;
        state.sequence+=1;
        state.frames+=1;
        if kind!="MCP_REQUEST" {
            state.records.push_back(value);
        }
        Ok(recorded_sequence)
    }
    pub fn bind_native_context(&self,
    thread:Option<&str>,
    turn:Option<&str>)->io::Result<()> {
        let mut state=self.0.state.lock().map_err(|_|deny())?;
        for (existing,
        incoming) in [(&mut state.native_thread,
        thread)] {
            if let Some(incoming)=incoming {
                let value=Value::String(incoming.into());
                if !id(&value)||(!existing.is_null()&&*existing!=value) {
                    self.0.fenced.store(true,Ordering::Release);
                    return Err(deny());
                }
                *existing=value;
            }
        }
        if let Some(turn)=turn {
            let value=Value::String(turn.into());
            if !id(&value)||(!state.native_turn.is_null()&&state.native_turn!=value) {
                self.0.fenced.store(true,Ordering::Release);
                return Err(deny());
            }
            state.native_turn=value;
        }
        Ok(())
    }
    fn observe_control_for(&self,operation:Option<&str>,
    bytes:&[u8],
    kind:&str)->io::Result<()> {
        if !matches!(kind,
        "WS_PING"|"WS_PONG"|"WS_CLOSE"|"WS_BINARY"|"WS_FRAME") {
            return Err(deny());
        }
        if matches!(kind,"WS_BINARY"|"WS_FRAME") { self.poison_admission(); }
        self.record("RAW_INPUT",
        operation,
        json!( {
            "bytes":bytes.len(),
            "rawDigest":hex_digest(bytes),
            "eventName":kind,
            "parseDisposition":if matches!(kind,"WS_BINARY"|"WS_FRAME"){"UNKNOWN"}else{"KNOWN"},
            "responseId":null,
            "itemId":null,
            "callId":null
        }))
    }
    /// Begins custody before the existing typed parser; no typename is final authority.
    pub fn observe_raw(&self,bytes:&[u8],route:&str)->io::Result<RawInputToken> {
        self.observe_raw_for(None,bytes,route)
    }
    fn observe_raw_for(&self,operation:Option<&str>,bytes:&[u8],_route:&str)->io::Result<RawInputToken> {
        self.check_live()?;
        let raw_digest=hex_digest(bytes);
        let parsed=serde_json::from_slice::<Value>(bytes);
        let value=parsed.as_ref().ok();
        let structural=|v:Option<&Value>|v.filter(|v|id(v)).cloned().unwrap_or(Value::Null);
        let event_name=value.and_then(|v|v.get("type")).filter(|v|id(v)).and_then(Value::as_str)
            .unwrap_or(if parsed.is_err(){"MALFORMED"}else{"UNKNOWN"}).to_owned();
        let response=structural(value.and_then(|v|v.get("response_id").or_else(||v.get("response").and_then(|r|r.get("id")))));
        let item=structural(value.and_then(|v|v.get("item_id").or_else(||v.get("item").and_then(|r|r.get("id")))));
        let call=structural(value.and_then(|v|v.get("call_id").or_else(||v.get("item").and_then(|r|r.get("call_id")))));
        let conflict=|direct:&str,parent:&str,nested:&str|value.is_some_and(|v|{
            match (v.get(direct),v.get(parent).and_then(|p|p.get(nested))) {
                (Some(a),Some(b)) if !a.is_null() && !b.is_null()=>a!=b,
                _=>false,
            }
        });
        let structural_conflict=conflict("response_id","response","id")||conflict("item_id","item","id")||conflict("call_id","item","call_id");
        let mut state=self.0.state.lock().map_err(|_|deny())?;
        // Reserve one completion per outstanding token and the existing control/fault margin.
        if state.frames+2*(state.pending_raw.len()+1)+2>MAX_FRAMES {
            self.poison_admission(); return Err(deny());
        }
        if state.journal_bytes.checked_add((state.pending_raw.len()+2)*MAX_FRAME).is_none_or(|n|n>1024*1024){self.poison_admission();return Err(deny());}
        let sequence=self.record_locked_sequence(&mut state,"RAW_INPUT",operation,None,Value::Null,Value::Null,false,
            json!({"bytes":bytes.len(),"rawDigest":raw_digest,"eventName":event_name,
                "parseDisposition":"PENDING","responseId":response,"itemId":item,"callId":call}))?;
        state.pending_raw.insert(sequence,operation.map(str::to_owned));
        Ok(RawInputToken{owner:self.clone(),operation:operation.map(str::to_owned),sequence,raw_digest,
            raw_bytes:bytes.len(),response,item,call,structural_conflict,finished:false})
    }
    fn accept_ack(&self,
    frame:&Value)->io::Result<()> {
        let p=&frame["payload"];
        let operation=p["operationId"].as_str().ok_or_else(deny)?;
        let mut state=self.0.state.lock().map_err(|_|deny())?;
        if !state.tickets.contains(operation) || state.acknowledged_operations.contains(operation) {
            return Err(deny());
        }
        state.acknowledged_operations.insert(operation.into());
        state.acknowledgements.insert(operation.into(),
        (p["tokenId"].as_str().ok_or_else(deny)?.into(),
        p["head"].as_str().ok_or_else(deny)?.into()));
        if let Some(waker)=state.write_wakers.remove(operation) {
            waker.wake();
        }
        self.0.reservation_notify.notify_waiters();
        Ok(())
    }
    /// Existing semantic source map lookup; a string or _meta cannot create a source call.
    pub fn claim_source_call(&self,
    call_id:&str,
    tool:&str)->io::Result<OwnedCallContext> {
        self.check_admission()?;
        let mut state=self.0.state.lock().map_err(|_|deny())?;
        if !state.advertised.contains(tool) {
            return Err(deny());
        }
        let origin=state.calls.remove(call_id).ok_or_else(deny)?;
        if state.operations>=MAX_OPERATIONS || state.unresolved>=16 {
            return Err(deny());
        }
        state.operations+=1;
        state.unresolved+=1;
        let operation=format!("mcp/{}",
        state.operations);
        state.tickets.insert(operation.clone());
        let scope=self.operation_scope(&state,origin.parent.clone(),Some(call_id.to_owned()),true);
        state.scopes.insert(operation.clone(),scope);
        Ok(OwnedCallContext(Arc::new(CallContextInner {
            owner:self.clone(),
            origin,
            operation,
            tool:tool.into(),
            consumed:AtomicBool::new(false),local_result:AtomicBool::new(false)
        })))
    }
    fn observe_mcp_reply(&self,
    text:&str,
    envelope_id:&Value)->io::Result<()> {
        let message=parse_transient(text)?;
        if message.get("id").is_none_or(Value::is_null){
            if !envelope_id.is_null(){return Err(deny());}
            // Existing RMCP parser still decides notification/error semantics; this credits no request or acceptance.
            return Ok(());
        }
        let actual_id=tagged_id(&message["id"])?;
        if &actual_id!=envelope_id {
            return Err(deny());
        }
        let id=canonical(&actual_id)?;
        let key=String::from_utf8(id).map_err(|_|deny())?;
        let mut state=self.0.state.lock().map_err(|_|deny())?;
        let method=state.pending_methods.remove(&key).ok_or_else(deny)?;
        if method=="tools/call" {
            let link=state.mcp_links.values_mut().find(|link|link.id==actual_id).ok_or_else(deny)?;
            if link.replied{return Err(deny());}link.replied=true;
        }
        if method=="tools/list" {
            if !state.advertised.is_empty() {
                return Err(deny());
            }
            for tool in message["result"]["tools"].as_array().ok_or_else(deny)? {
                if !id_string(&tool["name"]) || state.advertised.len()>=16 || !state.advertised.insert(tool["name"].as_str().ok_or_else(deny)?.into()) {
                    return Err(deny());
                }
            }
        }
        Ok(())
    }
    pub async fn send_mcp(&self,
    message_json:String,
    context:Option<OwnedCallContext>)->io::Result<()> {
        self.check_admission()?;
        let message=parse_transient(&message_json)?;
        let method=message["method"].as_str().ok_or_else(deny)?;
        let tagged=if message.get("id").is_some() {
            tagged_id(&message["id"])?
        } else {
            Value::Null
        };
        let (operation,
        source_call)=if method=="tools/call" {
            let context=context.ok_or_else(deny)?;
            context.bind_serialized(self,
            &message,
            &message_json,
            tagged.clone()).await?;
            (Some(context.0.operation.clone()),
            Some(context.0.origin.call.as_str().ok_or_else(deny)?.to_owned()))
        } else {
            if context.is_some() || !matches!(method,
            "initialize"|"notifications/initialized"|"tools/list"|"ping") {
                return Err(deny());
            }
            (None,
            None)
        };
        if !tagged.is_null() {
            let key=String::from_utf8(canonical(&tagged)?).map_err(|_|deny())?;
            if self.0.state.lock().map_err(|_|deny())?.pending_methods.insert(key,
            method.into()).is_some() {
                self.fence("MCP_ID_REPLAY");
                return Err(deny());
            }
        }
        // Native execution remains unavailable; actual inherited write guards at handoff.
        self.record_with("MCP_REQUEST",
        operation.as_deref(),
        source_call.as_deref(),
        tagged,
        json!( {
            "messageJson":message_json
        }))
    }
    pub fn bind_stdio_connection(&self, connection: u64) -> io::Result<()> {
        self.check_admission()?;
        let mut state = self.0.state.lock().map_err(|_| deny())?;
        if state.rpc.connection.replace(connection).is_some() {
            self.0.fenced.store(true, Ordering::Release);
            return Err(deny());
        }
        Ok(())
    }

    /// Projection of bytes read by the original stdio reader, before its existing parser.
    /// The original JSONL buffer is neither persisted nor reconstructed from metadata.
    pub fn observe_rpc_input(&self, bytes: &[u8], partial: bool) -> io::Result<()> {
        self.check_live()?;
        let raw_digest = hex_digest(bytes);
        let parsed = std::str::from_utf8(bytes).ok().and_then(|text| {
            // The transient visitor supplies duplicate-key, finite-number and Unicode checks.
            // RPC records have the original 256KiB bound, independently of MCP's 64KiB bound.
            parse_strict_json(text, 256 * 1024 + 2).ok()
        });
        let mut rpc_id = Value::Null;
        let mut message_kind = "INVALID";
        let mut disposition = "MALFORMED";
        if let Some(message) = parsed.as_ref() {
            if message.is_object() && message.get("id").is_some() {
                if let Some(n) = message["id"].as_u64().filter(|n| *n > 0 && *n <= 9_007_199_254_740_991) {
                    rpc_id = json!(n);
                    message_kind = "UNSUPPORTED";
                    disposition = "UNKNOWN";
                    if matches!(message["method"].as_str(), Some("initialize" | "thread/start" | "thread/resume" | "turn/start" | "turn/interrupt")) {
                        message_kind = "REQUEST";
                        disposition = "KNOWN";
                    }
                }
            } else if message.is_object() && message.get("id").is_none() && message["method"] == "initialized" {
                message_kind = "INITIALIZED_NOTIFICATION";
                disposition = "KNOWN";
            } else {
                message_kind = "UNSUPPORTED";
                disposition = "UNKNOWN";
            }
        }
        if partial || bytes.is_empty() || !bytes.ends_with(b"\n") {
            disposition = "MALFORMED";
        }
        let mut state = self.0.state.lock().map_err(|_| deny())?;
        if state.rpc.connection.is_none() || state.rpc.eof || state.rpc.inputs.len() >= 65 {
            self.0.fenced.store(true, Ordering::Release);
            return Err(deny());
        }
        let start = state.rpc.received;
        let end = start.checked_add(bytes.len()).filter(|end|*end <= MAX_OUTBOUND).ok_or_else(deny)?;
        let ordinal = state.rpc.inputs.len();
        if rpc_id.is_null() && state.rpc.inputs.iter().any(|input|input.id.is_null()) {
            disposition = "MALFORMED";
        }
        if !rpc_id.is_null() && !state.rpc.ids.insert(rpc_id.as_u64().ok_or_else(deny)?) {
            disposition = "MALFORMED";
        }
        self.record_locked(&mut state, "RPC_INPUT", None, None, Value::Null, rpc_id.clone(), true,
            json!({"route":"rpc.stdio", "recordOrdinal":ordinal, "start":start, "end":end,
                "rawDigest":raw_digest, "framing":if partial {"EOF_PARTIAL"} else {"LF"},
                "messageKind":message_kind, "parseDisposition":disposition}))?;
        state.rpc.received = end;
        state.rpc.inputs.push(RpcInput { id: rpc_id, start, end, digest:raw_digest, work:RpcWorkState::Unread });
        if disposition != "KNOWN" {
            self.0.fenced.store(true, Ordering::Release);
            return Err(deny());
        }
        Ok(())
    }

    pub fn observe_rpc_eof(&self) -> io::Result<()> {
        // This synchronous gate precedes queue EOF and every async dispatch opportunity.
        self.0.closing.store(true, Ordering::Release);
        self.check_live()?;
        let mut state = self.0.state.lock().map_err(|_| deny())?;
        if state.rpc.eof || state.rpc.connection.is_none() {
            return Err(deny());
        }
        let ids = json!(state.rpc.ids.iter().copied().collect::<Vec<_>>());
        let digest = domain_digest(b"M06_RPC_DELIVERED_IDS_V1\0", &ids)?;
        let payload = json!({"route":"rpc.stdio", "receivedBytes":state.rpc.received,
            "records":state.rpc.inputs.len(), "observedRequests":state.rpc.ids.len(), "observedIdsDigest":digest});
        self.record_locked(&mut state, "RPC_EOF", None, None, Value::Null, Value::Null, true, payload)?;
        state.rpc.eof = true;
        Ok(())
    }

    pub fn claim_rpc_message(&self, connection: u64, message: &Value) -> io::Result<RpcWork> {
        self.check_live()?;
        let request_id = message.get("id").cloned().unwrap_or(Value::Null);
        let mut state = self.0.state.lock().map_err(|_| deny())?;
        if state.rpc.connection != Some(connection) {
            self.0.fenced.store(true, Ordering::Release);
            return Err(deny());
        }
        let index = state.rpc.inputs.iter().position(|input| input.work == RpcWorkState::Unread && input.id == request_id)
            .ok_or_else(deny)?;
        if request_id.is_null() && message["method"] != "initialized" {
            self.0.fenced.store(true, Ordering::Release);
            return Err(deny());
        }
        let ordinal = index;
        self.record_locked(&mut state, "RPC_WORK", None, None, Value::Null, request_id.clone(), true,
            json!({"route":"rpc.stdio", "recordOrdinal":ordinal, "state":"QUEUED"}))?;
        state.rpc.inputs[index].work = RpcWorkState::Queued;
        Ok(RpcWork { owner:self.clone(), ordinal, id:request_id, finished:false })
    }

    fn transition_rpc_work(&self, ordinal: usize, target: RpcWorkState) -> io::Result<()> {
        self.check_live()?;
        if target==RpcWorkState::Dispatched {self.check_admission()?;}
        let mut state = self.0.state.lock().map_err(|_| deny())?;
        let input = state.rpc.inputs.get(ordinal).ok_or_else(deny)?;
        let legal = matches!((input.work,target), (RpcWorkState::Queued,RpcWorkState::Dispatched) |
            (RpcWorkState::Queued,RpcWorkState::NotDispatched) | (RpcWorkState::Dispatched,RpcWorkState::Settled));
        if !legal || (target == RpcWorkState::Dispatched && (self.0.closing.load(Ordering::Acquire)||self.0.admission_poison.load(Ordering::Acquire))) {
            return Err(deny());
        }
        let id = input.id.clone();
        let name = match target {
            RpcWorkState::Dispatched => "DISPATCHED",
            RpcWorkState::Settled => "SETTLED",
            RpcWorkState::NotDispatched => "NOT_DISPATCHED",
            _ => return Err(deny()),
        };
        self.record_locked(&mut state, "RPC_WORK", None, None, Value::Null, id, true,
            json!({"route":"rpc.stdio", "recordOrdinal":ordinal, "state":name}))?;
        state.rpc.inputs[ordinal].work = target;
        Ok(())
    }

    pub fn rpc_output_ticket(&self, bytes: &[u8]) -> io::Result<RpcOutputTicket> {
        self.check_live()?;
        let message = std::str::from_utf8(bytes).ok().and_then(|text| parse_strict_json(text, 256 * 1024 + 2).ok()).ok_or_else(deny)?;
        let id = message.get("id").cloned().filter(|id|id.as_u64().is_some()).unwrap_or(Value::Null);
        let mut state = self.0.state.lock().map_err(|_| deny())?;
        if state.rpc.output_pending || bytes.is_empty() || !bytes.ends_with(b"\n") || bytes.len() > 256 * 1024 + 2 {
            self.0.fenced.store(true, Ordering::Release);
            return Err(deny());
        }
        let ordinal = state.rpc.output_ordinal;
        state.rpc.output_ordinal += 1;
        state.rpc.output_pending = true;
        let start = state.rpc.output_bytes;
        let end = start.checked_add(bytes.len()).filter(|end|*end <= MAX_OUTBOUND).ok_or_else(deny)?;
        let digest = hex_digest(bytes);
        self.record_locked(&mut state, "RPC_OUTPUT", None, None, Value::Null, id.clone(), true,
            json!({"route":"rpc.stdio", "writeOrdinal":ordinal, "phase":"ATTEMPT", "start":start, "end":end, "rawDigest":digest}))?;
        Ok(RpcOutputTicket { owner:self.clone(), ordinal, id, digest, bytes:bytes.to_vec(), start, offset:0, complete:false })
    }

    /// The original stdout thread calls this once per owned immutable JSONL buffer.
    pub fn write_rpc_stdout(&self, writer: &mut impl Write, bytes: &[u8]) -> io::Result<()> {
        let mut ticket = self.rpc_output_ticket(bytes)?;
        while !ticket.remaining().is_empty() {
            ticket.check_handoff()?;
            match writer.write(ticket.remaining()) {
                Ok(0) => return Err(io::Error::new(io::ErrorKind::WriteZero, "M06 stdout remainder")),
                Ok(written) => ticket.progress(written)?,
                Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
                Err(error) => return Err(error),
            }
        }
        if let Err(error) = writer.flush() {
            self.fence("RPC_STDOUT_FLUSH_FAILED");
            return Err(error);
        }
        Ok(())
    }

    fn accept_rpc_sender_seal(&self, payload: &Value) -> io::Result<()> {
        validate_rpc_sender_seal(payload, &self.0.binding)?;
        let mut state = self.0.state.lock().map_err(|_| deny())?;
        if state.rpc.sender.is_some() { return Err(deny()); }
        state.rpc.sender_digest = Some(domain_digest(b"M06_RPC_SENDER_SEAL_V1\0", payload)?);
        state.rpc.sender = Some(payload.clone());
        self.0.reservation_notify.notify_waiters();
        Ok(())
    }

    pub fn retirement(&self, fact: SourceRetirement) -> io::Result<RetirementGuard> {
        self.check_live()?;
        let mut state = self.0.state.lock().map_err(|_| deny())?;
        if !state.rpc.retiring.insert(fact) || state.rpc.retired.contains(&fact) {
            self.0.fenced.store(true, Ordering::Release);
            return Err(deny());
        }
        Ok(RetirementGuard { owner:self.clone(), fact, complete:false })
    }

    pub fn retain_stdio_thread(&self, thread: std::thread::JoinHandle<()>) -> io::Result<()> {
        self.check_live()?;
        let mut threads = self.0.stdio_threads.lock().map_err(|_| deny())?;
        if threads.len() >= 2 {
            self.0.fenced.store(true, Ordering::Release);
            return Err(deny());
        }
        threads.push(thread);
        Ok(())
    }

    pub async fn join_original_producers(&self) -> io::Result<()> {
        self.check_live()?;
        if !self.is_source_closing() { return Err(deny()); }
        let tasks = {
            let mut tasks = self.0.collectors.lock().map_err(|_| deny())?;
            self.0.collectors_frozen.store(true, Ordering::Release);
            std::mem::take(&mut *tasks)
        };
        for task in tasks {
            if task.await.is_err() {
                self.fence("COLLECTOR_JOIN_FAILED");
                return Err(deny());
            }
        }
        let threads = std::mem::take(&mut *self.0.stdio_threads.lock().map_err(|_| deny())?);
        if threads.len() != 2 { self.fence("STDIO_THREAD_CUSTODY_LOST"); return Err(deny()); }
        let joined = tokio::task::spawn_blocking(move || {
            let mut complete = true;
            for thread in threads { complete &= thread.join().is_ok(); }
            complete
        }).await;
        if !matches!(joined, Ok(true)) {
            self.fence("STDIO_THREAD_JOIN_FAILED");
            return Err(deny());
        }
        self.0.state.lock().map_err(|_| deny())?.rpc.producers_joined = true;
        // Wait only on the original control source; no child deadline/TTL is created.
        loop {
            let notified = self.0.reservation_notify.notified();
            if self.0.state.lock().map_err(|_|deny())?.rpc.sender.is_some() { break; }
            self.check_live()?;
            tokio::select! { _ = notified => (), _ = tokio::time::sleep(std::time::Duration::from_millis(10)) => () }
        }
        Ok(())
    }

    pub async fn await_parent_release(&self) -> io::Result<()> {
        if !self.0.sealed.load(Ordering::Acquire) { return Err(deny()); }
        loop {
            let notified = self.0.reservation_notify.notified();
            if self.0.fenced.load(Ordering::Acquire) { return Err(deny()); }
            if self.0.control_released.load(Ordering::Acquire) {
                self.0.disposing.store(true, Ordering::Release);
                return Ok(());
            }
            tokio::select! { _ = notified => (), _ = tokio::time::sleep(std::time::Duration::from_millis(10)) => () }
        }
    }

    /// Original normal shutdown tail only. Source completeness never issues physical finality.
    pub fn seal_candidate(&self) -> io::Result<()> {
        self.check_live()?;
        let mut state = self.0.state.lock().map_err(|_| deny())?;
        let rpc = &state.rpc;
        let sender = rpc.sender.as_ref().ok_or_else(deny)?;
        if !self.is_source_closing() || !rpc.eof || !rpc.producers_joined || rpc.output_pending ||
            !SourceRetirement::ALL.iter().all(|fact|rpc.retired.contains(fact)) || !rpc.retiring.is_empty() ||
            rpc.inputs.iter().any(|input|!matches!(input.work, RpcWorkState::Settled | RpcWorkState::NotDispatched)) ||
            self.0.admission_poison.load(Ordering::Acquire) || !state.pending_raw.is_empty() || state.unresolved != 0 || !state.pending_methods.is_empty() || state.scopes.len() != state.closed_operations.len() ||
            (state.inherited_mcp_adopted && (!state.inherited_mcp_transport_retired || !state.inherited_mcp_service_joined)) {
            return Err(deny());
        }
        let attempts = sender["attempts"].as_array().ok_or_else(deny)?;
        if attempts.len() != rpc.inputs.len() || sender["attemptedBytes"].as_u64() != Some(rpc.received as u64) {
            return Err(deny());
        }
        for (attempt,input) in attempts.iter().zip(&rpc.inputs) {
            if attempt["requestId"] != input.id || attempt["start"].as_u64() != Some(input.start as u64) ||
                attempt["end"].as_u64() != Some(input.end as u64) || attempt["rawDigest"] != input.digest { return Err(deny()); }
        }
        let payload = json!({"head":state.head, "operations":state.operations, "frames":state.records.len(),
            "rpcIssuedRequests":sender["issuedRequests"], "rpcWrittenBytes":rpc.received,
            "rpcObservedRequests":rpc.ids.len(), "rpcInputRecords":rpc.inputs.len(), "rpcSenderSealDigest":rpc.sender_digest});
        // State/output order is the same as all original records. No helper re-locks state.
        self.record_locked(&mut state, "RANGE_SEAL", None, None, Value::Null, Value::Null, false, payload)?;
        self.0.sealed.store(true, Ordering::Release);
        self.0.output.lock().map_err(|_| deny())?.take();
        Ok(())
    }
    pub fn take_mcp_receiver(&self) -> io::Result<tokio::sync::mpsc::Receiver<String>> {
        self.check_admission()?;
        let mut state = self.0.state.lock().map_err(|_|deny())?;
        if state.inherited_mcp_adopted { return Err(deny()); }
        let receiver = self.0.replies.lock().map_err(|_|deny())?.take().ok_or_else(deny)?;
        state.inherited_mcp_adopted = true;
        Ok(receiver)
    }

    pub fn begin_inherited_mcp_shutdown(&self) -> io::Result<()> {
        self.check_live()?;
        let mut state = self.0.state.lock().map_err(|_|deny())?;
        if !self.is_source_closing() || !state.inherited_mcp_adopted || state.inherited_mcp_shutdown ||
            !state.pending_methods.is_empty() || state.mcp_links.keys().any(|operation|!state.closed_operations.contains(operation)) {
            return Err(deny());
        }
        state.inherited_mcp_shutdown = true;
        Ok(())
    }

    /// Only the sole inherited RMCP Transport::close calls this after its actual queue is empty.
    pub fn inherited_mcp_transport_retired(&self) -> io::Result<()> {
        self.check_live()?;
        let mut state = self.0.state.lock().map_err(|_|deny())?;
        if !state.inherited_mcp_shutdown || state.inherited_mcp_transport_retired || !state.pending_methods.is_empty() {
            return Err(deny());
        }
        state.inherited_mcp_transport_retired = true;
        Ok(())
    }

    /// Called only after the original owned RunningService::waiting future returns successfully.
    pub fn inherited_mcp_service_joined(&self) -> io::Result<()> {
        self.check_live()?;
        let mut state = self.0.state.lock().map_err(|_|deny())?;
        if !state.inherited_mcp_shutdown || !state.inherited_mcp_transport_retired || state.inherited_mcp_service_joined {
            return Err(deny());
        }
        state.inherited_mcp_service_joined = true;
        Ok(())
    }
    fn accept_mcp_evidence(&self, frame: &Value) -> io::Result<()> {
        let operation = frame["operationId"].as_str().ok_or_else(deny)?;
        let mut state = self.0.state.lock().map_err(|_| deny())?;
        let link = state.mcp_links.get_mut(operation).ok_or_else(deny)?;
        if link.accepted || link.id != frame["mcpRequestId"] || frame["sourceCallId"] != link.call {
            return Err(deny());
        }
        link.accepted = true;
        Ok(())
    }

    fn mark_mcp_evidence_echoed(&self, operation: &str) -> io::Result<()> {
        {
            let mut state = self.0.state.lock().map_err(|_| deny())?;
            let link = state.mcp_links.get_mut(operation).ok_or_else(deny)?;
            if !link.accepted || link.echoed { return Err(deny()); }
            link.echoed = true;
        }
        self.close_mcp_if_complete(operation)
    }

    fn close_mcp_if_complete(&self, operation: &str) -> io::Result<()> {
        let complete = {
            let mut state = self.0.state.lock().map_err(|_| deny())?;
            let link = state.mcp_links.get_mut(operation).ok_or_else(deny)?;
            let ready = link.replied && link.accepted && link.echoed && link.local_result && !link.closing;
            if ready { link.closing = true; }
            ready
        };
        if complete { self.record("LOCAL_CLOSE", Some(operation), json!({"complete":true}))?; }
        Ok(())
    }

    fn operation_scope(&self, state: &State, parent: Option<String>, call: Option<String>, mcp: bool) -> OperationScope {
        OperationScope {
            parent, call, thread:state.native_thread.clone(), turn:state.native_turn.clone(),
            transport: if mcp {
                self.0.binding["channelIncarnation"].as_str().unwrap_or("").into()
            } else {
                format!("provider/{}",self.0.binding["ownerIncarnation"].as_str().unwrap_or(""))
            },
        }
    }

    pub async fn source_collector(&self, route: &str) -> io::Result<SourceCollector> {
        if !matches!(route,"ws.direct"|"http.sse") { return Err(deny()); }
        require_owner(Some(self))?;
        if route == "ws.direct" && !self.0.state.lock().map_err(|_|deny())?.direct_io_claimed {
            return Err(deny());
        }
        let operation = {
            let mut state = self.0.state.lock().map_err(|_| deny())?;
            if state.operations >= MAX_OPERATIONS || state.unresolved >= 16 { return Err(deny()); }
            state.operations += 1;
            state.unresolved += 1;
            let operation = format!("source/{}",state.operations);
            state.tickets.insert(operation.clone());
            let scope = self.operation_scope(&state,None,None,false);
            state.scopes.insert(operation.clone(),scope);
            operation
        };
        self.record("RESERVATION_DURABLE",Some(&operation),json!({
            "route":route,"endpointId":"original-source","payloadDigest":hex_digest(b"original-reader"),"maxBytes":MAX_OUTBOUND
        }))?;
        loop {
            let notified = self.0.reservation_notify.notified();
            if self.0.state.lock().map_err(|_|deny())?.acknowledgements.contains_key(&operation) { break; }
            self.check_admission()?;
            tokio::select! { _ = notified => (), _ = tokio::time::sleep(std::time::Duration::from_millis(10)) => () }
        }
        self.check_admission()?;
        self.record("ATTEMPT_ENTERED",Some(&operation),json!({"route":route}))?;
        Ok(SourceCollector {
            owner:self.clone(),operation:operation.clone(),
            _lease:CollectorLease { owner:self.clone(),operation:Some(operation),complete:AtomicBool::new(false) },
        })
    }
    pub fn retain_collector(&self,
    task:tokio::task::JoinHandle<()>)->io::Result<()> {
        if self.check_live().is_err(){task.abort();self.poison_admission();return Err(deny());}
        let mut tasks=match self.0.collectors.lock(){Ok(tasks)=>tasks,Err(_)=>{task.abort();self.poison_admission();return Err(deny());}};
        if self.0.collectors_frozen.load(Ordering::Acquire) || tasks.len()>=16 {
            task.abort();
            self.0.fenced.store(true, Ordering::Release);
            return Err(deny());
        }
        tasks.push(task);
        Ok(())
    }
    pub fn collector(&self)->CollectorLease {
        CollectorLease {
            owner:self.clone(),
            operation:None,
            complete:AtomicBool::new(false)
        }
    }
    pub fn elapsed_native(&self)->std::time::Duration {
        self.0.started.elapsed()
    }
}
fn domain_digest(domain: &[u8], value: &Value) -> io::Result<String> {
    let mut bytes = domain.to_vec();
    bytes.extend(canonical(value)?);
    Ok(hex_digest(&bytes))
}

fn validate_rpc_sender_seal(payload: &Value, binding: &Value) -> io::Result<()> {
    exact_keys(payload, &["sealId","transportId","transportIncarnation","issuedRequests","attemptedBytes","allocations","attempts"])?;
    if !id(&payload["sealId"]) || payload["transportId"] != binding["transportId"] || payload["transportIncarnation"] != binding["transportIncarnation"] { return Err(deny()); }
    let issued = payload["issuedRequests"].as_u64().filter(|n|*n <= 64).ok_or_else(deny)?;
    let allocations = payload["allocations"].as_array().ok_or_else(deny)?;
    let attempts = payload["attempts"].as_array().ok_or_else(deny)?;
    if allocations.len() != issued as usize || attempts.len() > 65 { return Err(deny()); }
    let mut expected = BTreeSet::new();
    for (index,allocation) in allocations.iter().enumerate() {
        exact_keys(allocation, &["id","state"])?;
        if allocation["id"].as_u64() != Some(index as u64 + 1) { return Err(deny()); }
        match allocation["state"].as_str() {
            Some("ATTEMPTED") => { expected.insert(index as u64 + 1); }
            Some("NOT_EMITTED") => (),
            _ => return Err(deny()),
        }
    }
    let mut cursor = 0;
    let mut notifications = 0;
    for attempt in attempts {
        exact_keys(attempt, &["requestId","start","end","rawDigest"])?;
        let end = attempt["end"].as_u64().ok_or_else(deny)?;
        if attempt["start"].as_u64() != Some(cursor) || end <= cursor || !digest(&attempt["rawDigest"]) { return Err(deny()); }
        if attempt["requestId"].is_null() {
            notifications += 1;
            if notifications > 1 { return Err(deny()); }
        } else if !expected.remove(&attempt["requestId"].as_u64().ok_or_else(deny)?) { return Err(deny()); }
        cursor = end;
    }
    if !expected.is_empty() || payload["attemptedBytes"].as_u64() != Some(cursor) || cursor > MAX_OUTBOUND as u64 { return Err(deny()); }
    Ok(())
}

#[derive(Default)]
struct RpcState {
    connection: Option<u64>,
    inputs: Vec<RpcInput>,
    ids: BTreeSet<u64>,
    received: usize,
    eof: bool,
    sender: Option<Value>,
    sender_digest: Option<String>,
    output_bytes: usize,
    output_ordinal: usize,
    output_pending: bool,
    retiring: BTreeSet<SourceRetirement>,
    retired: BTreeSet<SourceRetirement>,
    producers_joined: bool,
}
struct RpcInput { id:Value, start:usize, end:usize, digest:String, work:RpcWorkState }
#[derive(Clone, Copy, PartialEq, Eq)]
enum RpcWorkState { Unread, Queued, Dispatched, Settled, NotDispatched }

/// Owned by the original queued future. No Clone or public reconstruction exists.
pub struct RpcWork { owner:SourceOwner, ordinal:usize, id:Value, finished:bool }
impl RpcWork {
    pub fn dispatch(&mut self) -> io::Result<()> {
        self.owner.transition_rpc_work(self.ordinal, RpcWorkState::Dispatched)
    }
    pub fn settle(mut self) -> io::Result<()> {
        self.owner.transition_rpc_work(self.ordinal, RpcWorkState::Settled)?;
        self.finished = true;
        Ok(())
    }
    pub fn not_dispatched(mut self) -> io::Result<()> {
        self.owner.transition_rpc_work(self.ordinal, RpcWorkState::NotDispatched)?;
        self.finished = true;
        Ok(())
    }
}
impl Drop for RpcWork {
    fn drop(&mut self) {
        if !self.finished { self.owner.fence("RPC_WORK_DROPPED_UNKNOWN"); }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum SourceRetirement {
    StdinThread, InputForwarder, OutputForwarder, StdoutThread,
    RpcGate, Cleanup, Background, Threads, Processor, Outbound, Transports, McpService,
}
impl SourceRetirement {
    const ALL: [Self;11] = [Self::StdinThread,Self::InputForwarder,Self::OutputForwarder,Self::StdoutThread,
        Self::RpcGate,Self::Cleanup,Self::Background,Self::Threads,Self::Processor,Self::Outbound,Self::Transports];
}
pub struct RetirementGuard { owner:SourceOwner, fact:SourceRetirement, complete:bool }
impl RetirementGuard {
    pub fn observed_completion(mut self) -> io::Result<()> {
        self.owner.check_live()?;
        if !self.owner.is_source_closing() { return Err(deny()); }
        let mut state = self.owner.0.state.lock().map_err(|_| deny())?;
        if !state.rpc.retiring.remove(&self.fact) || !state.rpc.retired.insert(self.fact) { return Err(deny()); }
        self.complete = true;
        Ok(())
    }
}
impl Drop for RetirementGuard {
    fn drop(&mut self) {
        if !self.complete { self.owner.fence("SOURCE_RETIREMENT_DROPPED_UNKNOWN"); }
    }
}

pub struct RpcOutputTicket {
    owner:SourceOwner, ordinal:usize, id:Value, digest:String, bytes:Vec<u8>, start:usize, offset:usize, complete:bool,
}
impl RpcOutputTicket {
    /// Only this ticket's immutable remaining suffix is ever exposed to the original writer.
    pub fn remaining(&self) -> &[u8] { &self.bytes[self.offset..] }
    pub fn check_handoff(&self) -> io::Result<()> { self.owner.check_live() }
    pub fn progress(&mut self, written:usize) -> io::Result<()> {
        self.owner.check_live()?;
        if written == 0 || written > self.bytes.len() - self.offset { return Err(deny()); }
        let mut state = self.owner.0.state.lock().map_err(|_| deny())?;
        let start = self.start + self.offset;
        let end = start + written;
        self.owner.record_locked(&mut state,"RPC_OUTPUT",None,None,Value::Null,self.id.clone(),true,
            json!({"route":"rpc.stdio","writeOrdinal":self.ordinal,"phase":"PROGRESS","start":start,"end":end,"rawDigest":self.digest}))?;
        self.offset += written;
        state.rpc.output_bytes = end;
        if self.offset == self.bytes.len() {
            state.rpc.output_pending = false;
            self.complete = true;
        }
        Ok(())
    }
}
impl Drop for RpcOutputTicket {
    fn drop(&mut self) {
        if !self.complete { self.owner.fence("RPC_STDOUT_REMAINDER_UNKNOWN"); }
    }
}

struct McpLink{id:Value,call:String,replied:bool,accepted:bool,echoed:bool,closing:bool,local_result:bool}
pub struct AttemptLease{owner:SourceOwner,operation:String,complete:bool}
impl AttemptLease{
    pub fn observed_local_close(mut self)->io::Result<()>{self.owner.record("LOCAL_CLOSE",Some(&self.operation),json!({"complete":true}))?;self.complete=true;Ok(())}
}
impl Drop for AttemptLease{fn drop(&mut self){if !self.complete{self.owner.fence("ATTEMPT_DROPPED_UNKNOWN");}}}
#[derive(Clone)]
struct OperationScope{parent:Option<String>,transport:String,thread:Value,turn:Value,call:Option<String>}
/// The original producer retains this opaque scope; no second socket/body reader is created.
pub struct SourceCollector{owner:SourceOwner,operation:String,_lease:CollectorLease}
impl SourceCollector{
    pub fn observe_bytes(&self,bytes:&[u8])->io::Result<()>{
        self.owner.record("RAW_INPUT",Some(&self.operation),json!({"bytes":bytes.len(),"rawDigest":hex_digest(bytes),"eventName":"SSE_BYTES","parseDisposition":"KNOWN","responseId":null,"itemId":null,"callId":null}))
    }

    pub fn observed_local_close(&self){self._lease.observed_local_close();}
    pub fn observe_raw(&self,bytes:&[u8],route:&str)->io::Result<RawInputToken>{self.owner.observe_raw_for(Some(&self.operation),bytes,route)}
    pub fn observe_control(&self,bytes:&[u8],kind:&str)->io::Result<()>{self.owner.observe_control_for(Some(&self.operation),bytes,kind)}
}
/// A single original raw record carried by the actual typed parser. Intentionally not Clone.
pub struct RawInputToken {
    owner:SourceOwner,operation:Option<String>,sequence:u64,raw_digest:String,raw_bytes:usize,
    response:Value,item:Value,call:Value,structural_conflict:bool,finished:bool,
}
impl RawInputToken {
    /// Called once by the same parser/normalizer before any output delivery awaits.
    pub fn finish(self,event_name:&str,disposition:&str,callable:bool)->io::Result<()> {
        self.finish_impl(event_name,disposition,callable,None)
    }
    /// Identity from the actual normalized result; callable IDs must exist in that same item.
    pub fn finish_parsed(self,event_name:&str,disposition:&str,callable:bool,response:Option<&str>,item:Option<&str>,call:Option<&str>)->io::Result<()> {
        self.finish_impl(event_name,disposition,callable,Some((json!(response),json!(item),json!(call))))
    }
    fn finish_impl(mut self,event_name:&str,disposition:&str,callable:bool,parsed:Option<(Value,Value,Value)>)->io::Result<()> {
        if !matches!(disposition,"KNOWN"|"UNKNOWN"|"MALFORMED") || !id(&json!(event_name)) {
            self.owner.poison_admission(); return Err(deny());
        }
        // Poison before acquiring the record/output lock, including any finalization failure.
        if disposition!="KNOWN" { self.owner.poison_admission(); }
        let mut state=self.owner.0.state.lock().map_err(|_|deny())?;
        if state.pending_raw.get(&self.sequence)!=Some(&self.operation) {
            self.owner.poison_admission(); return Err(deny());
        }
        let ordered=!state.pending_raw.range(..self.sequence).any(|(_,operation)|operation==&self.operation);
        let identity_valid=parsed.as_ref().is_none_or(|(response,item,call)| {
            [(response,&self.response),(item,&self.item),(call,&self.call)].iter().all(|(actual,raw)|actual.is_null() || (id(actual)&&*actual==*raw)) &&
            (!callable || (!item.is_null()&&!call.is_null())) && (event_name!="response.created" || !response.is_null())
        });
        let mut final_disposition=if disposition=="KNOWN" && (!ordered || self.structural_conflict || !identity_valid){"UNKNOWN"}else{disposition};
        let mut response=self.response.clone();
        let key=self.operation.as_deref().unwrap_or("");
        if final_disposition=="KNOWN" {
            let prior=state.response_context.get(key).cloned().unwrap_or(Value::Null);
            if event_name=="response.created" {
                if response.is_null() { final_disposition="UNKNOWN"; }
            } else if !prior.is_null() {
                if response.is_null() {response=prior.clone();} else if response!=prior {final_disposition="UNKNOWN";}
            }
            if callable && (self.operation.is_none() || prior.is_null() || response.is_null() || self.item.is_null() || self.call.is_null() ||
                state.calls.len()>=MAX_OPERATIONS || state.calls.contains_key(self.call.as_str().unwrap_or(""))) {
                final_disposition="UNKNOWN";
            }
        }
        if final_disposition!="KNOWN" {
            self.owner.poison_admission(); response=self.response.clone();
        }
        self.owner.record_locked(&mut state,"PARSE_DISPOSITION",self.operation.as_deref(),None,Value::Null,Value::Null,false,
            json!({"rawSequence":self.sequence,"rawDigest":self.raw_digest,"eventName":event_name,
                "parseDisposition":final_disposition,"responseId":response,"itemId":self.item,"callId":self.call}))?;
        state.pending_raw.remove(&self.sequence);
        self.finished=true;
        if final_disposition=="KNOWN" {
            if event_name=="response.created" {state.response_context.insert(key.to_owned(),response.clone());}
            // Publish only after the final completion record has committed.
            if callable { state.calls.insert(self.call.as_str().ok_or_else(deny)?.to_owned(),CallOrigin {
                parent:self.operation.clone(),raw_sequence:self.sequence,raw_digest:self.raw_digest.clone(),raw_bytes:self.raw_bytes,
                response,item:self.item.clone(),call:self.call.clone(),
            }); }
        }
        Ok(())
    }
}
impl Drop for RawInputToken {
    fn drop(&mut self) {
        if !self.finished {
            self.owner.poison_admission();
            let _=self.owner.record("UNKNOWN",self.operation.as_deref(),json!({"reason":"UNRESOLVED_RAW_INPUT"}));
        }
    }
}
#[derive(Clone)] struct CallOrigin {
    parent:Option<String>, raw_sequence:u64, raw_digest:String, raw_bytes:usize,
    response:Value,
    item:Value,
    call:Value
}
struct CallContextInner {
    owner:SourceOwner,
    origin:CallOrigin,
    operation:String,
    tool:String,
    consumed:AtomicBool,
    local_result:AtomicBool
}
/// Clones retain the same one-shot state; no public metadata constructor exists.
#[derive(Clone)]
pub struct OwnedCallContext(Arc<CallContextInner>);
impl std::fmt::Debug for OwnedCallContext {
    fn fmt(&self,
    f:&mut std::fmt::Formatter<'_>)->std::fmt::Result {
        f.debug_struct("OriginalMcpCall").finish_non_exhaustive()
    }
}
impl OwnedCallContext {
    pub fn check_owner(&self,
    owner:&SourceOwner)->io::Result<()> {
        if !Arc::ptr_eq(&self.0.owner.0,
        &owner.0) || self.0.consumed.load(Ordering::Acquire) {
            return Err(deny());
        }
        require_owner(Some(owner))?;
        owner.check_admission()
    }
    pub fn check_tool(&self,owner:&SourceOwner,tool:&str)->io::Result<()> {
        self.check_owner(owner)?;
        if self.0.tool!=tool { return Err(deny()); }
        let state=owner.0.state.lock().map_err(|_|deny())?;
        if !state.advertised.contains(tool) || owner.0.binding["mcpProfileDigest"]!=self.0.owner.0.binding["mcpProfileDigest"] {return Err(deny());}
        Ok(())
    }
    pub fn observed_local_result(&self)->io::Result<()>{
        self.0.owner.check_live()?;
        {let mut state=self.0.owner.0.state.lock().map_err(|_|deny())?;let link=state.mcp_links.get_mut(&self.0.operation).ok_or_else(deny)?;if link.local_result || !link.replied {return Err(deny());}link.local_result=true;}
        self.0.local_result.store(true,Ordering::Release);
        self.0.owner.close_mcp_if_complete(&self.0.operation)
    }
    pub fn prepare(&self)->io::Result<()> {
        self.check_owner(&self.0.owner)
    }
    async fn bind_serialized(&self,
    owner:&SourceOwner,
    message:&Value,
    message_json:&str,
    actual_id:Value)->io::Result<()> {
        self.check_tool(owner,&self.0.tool)?;
        if message["params"]["name"]!=self.0.tool || actual_id.is_null() {
            return Err(deny());
        }
        let request_hash=hex_digest(message_json.as_bytes());
        owner.record("RESERVATION_DURABLE",
        Some(&self.0.operation),
        json!( {
            "route":"appraise.mcp",
            "endpointId":"original-appraise",
            "payloadDigest":request_hash,
            "maxBytes":message_json.len()
        }))?;
        loop {
            let notified=owner.0.reservation_notify.notified();
            if owner.0.state.lock().map_err(|_|deny())?.acknowledgements.contains_key(&self.0.operation) {
                break;
            }
            self.prepare()?;
            tokio::select! {
                _=notified=>(),
                _=tokio::time::sleep(std::time::Duration::from_millis(10))=>()
            }
        }
        self.prepare()?;
        owner.record("ATTEMPT_ENTERED",Some(&self.0.operation),json!({"route":"appraise.mcp"}))?;
        // Exact bounded projection of the original raw source node, not another input read.
        owner.record("RAW_INPUT",Some(&self.0.operation),json!({"rawSequence":self.0.origin.raw_sequence,"bytes":self.0.origin.raw_bytes,"rawDigest":self.0.origin.raw_digest,"eventName":"response.output_item.done","parseDisposition":"KNOWN","responseId":self.0.origin.response,"itemId":self.0.origin.item,"callId":self.0.origin.call}))?;
        // Consume once after original durable ACK. Actual inherited writer still gates below.
        owner.0.state.lock().map_err(|_|deny())?.acknowledgements.remove(&self.0.operation).ok_or_else(deny)?;
        if self.0.consumed.swap(true,
        Ordering::AcqRel) {
            return Err(deny());
        }
        owner.0.state.lock().map_err(|_|deny())?.mcp_links.insert(self.0.operation.clone(),McpLink{id:actual_id.clone(),call:self.0.origin.call.as_str().ok_or_else(deny)?.into(),replied:false,accepted:false,echoed:false,closing:false,local_result:false});
        owner.record_with("MCP_CALL",
        Some(&self.0.operation),
        self.0.origin.call.as_str(),
        actual_id,
        json!( {
            "requestHash":request_hash,
            "profileDigest":owner.0.binding["mcpProfileDigest"],
            "responseId":self.0.origin.response,
            "itemId":self.0.origin.item,
            "callId":self.0.origin.call
        }))
    }
}
impl Drop for CallContextInner {
    fn drop(&mut self) {
        if !self.local_result.load(Ordering::Acquire){self.owner.fence("MCP_INVOCATION_ENDED_UNKNOWN");}
    }
}
fn id_string(value:&Value)->bool {
    id(value)
}
fn tagged_id(value:&Value)->io::Result<Value> {
    if id(value) {
        Ok(json!( {
            "type":"string",
            "value":value
        }))
    }  else if value.as_u64().is_some_and(|v|v<=9_007_199_254_740_991) {
        Ok(json!( {
            "type":"number",
            "value":value
        }))
    } else {
        Err(deny())
    }
}
/// Finite ordinary JSON numbers are allowed only inside this separately bounded transient text.
/// serde_json rejects invalid UTF-8, BOM, invalid escapes and unpaired UTF-16 surrogate escapes.
pub fn parse_transient(text: &str) -> io::Result<Value> {
    let value = parse_strict_json(text, MAX_FRAME)?;
    if let Some(id) = value.get("id") {
        if !id.is_null() { tagged_id(id)?; }
    }
    Ok(value)
}
fn parse_strict_json(text: &str, limit: usize) -> io::Result<Value> {
    use serde::Deserialize;
    if text.is_empty()||text.len()>limit||text.starts_with('\u{feff}') {
        return Err(deny());
    }
    struct Strict(Value);
    impl<'de> Deserialize<'de> for Strict {
        fn deserialize<D:serde::Deserializer<'de>>(d:D)->Result<Self,
        D::Error> {
            struct V;
            impl<'de> serde::de::Visitor<'de> for V {
                type Value=Strict;
                fn expecting(&self,
                f:&mut std::fmt::Formatter<'_>)->std::fmt::Result {
                    f.write_str("finite unique-key JSON")
                }
                fn visit_unit<E:serde::de::Error>(self)->Result<Strict,
                E> {
                    Ok(Strict(Value::Null))
                }
                fn visit_bool<E:serde::de::Error>(self,
                v:bool)->Result<Strict,
                E> {
                    Ok(Strict(Value::Bool(v)))
                }
                fn visit_i64<E:serde::de::Error>(self,
                v:i64)->Result<Strict,
                E> {
                    Ok(Strict(v.into()))
                }
                fn visit_u64<E:serde::de::Error>(self,
                v:u64)->Result<Strict,
                E> {
                    Ok(Strict(v.into()))
                }
                fn visit_f64<E:serde::de::Error>(self,
                v:f64)->Result<Strict,
                E> {
                    serde_json::Number::from_f64(v).map(|n|Strict(Value::Number(n))).ok_or_else(||E::custom("nonfinite transient number"))
                }
                fn visit_str<E:serde::de::Error>(self,
                v:&str)->Result<Strict,
                E> {
                    Ok(Strict(Value::String(v.into())))
                }
                fn visit_string<E:serde::de::Error>(self,
                v:String)->Result<Strict,
                E> {
                    Ok(Strict(Value::String(v)))
                }
                fn visit_seq<A:serde::de::SeqAccess<'de>>(self,
                mut a:A)->Result<Strict,
                A::Error> {
                    let mut out=Vec::new();
                    while let Some(v)=a.next_element::<Strict>()? {
                        out.push(v.0);
                    }
                    Ok(Strict(Value::Array(out)))
                }
                fn visit_map<A:serde::de::MapAccess<'de>>(self,
                mut a:A)->Result<Strict,
                A::Error> {
                    let mut out=serde_json::Map::new();
                    while let Some(k)=a.next_key::<String>()? {
                        if out.contains_key(&k) {
                            return Err(serde::de::Error::custom("duplicate transient key"));
                        }
                        out.insert(k,
                        a.next_value::<Strict>()?.0);
                    }
                    Ok(Strict(Value::Object(out)))
                }
            }
            d.deserialize_any(V)
        }
    }
    let mut decoder=serde_json::Deserializer::from_str(text);
    let value=Strict::deserialize(&mut decoder).map_err(|_|deny())?.0;
    decoder.end().map_err(|_|deny())?;
    fn depth(v:&Value,
    n:usize)->io::Result<()> {
        if n>16 {
            return Err(deny());
        }
        match v {
            Value::Array(a)=>for v in a {
                depth(v,
                n+1)?
            },
            Value::Object(m)=>for v in m.values() {
                depth(v,
                n+1)?
            },
            _=>()
        }
        Ok(())
    }
    depth(&value,
    0)?;
    if !value.is_object() {
        return Err(deny());
    }
    Ok(value)
}
fn chain(frame:&Value)->io::Result<String> {
    let mut bytes=DOMAIN.to_vec();
    bytes.extend(canonical(frame)?);
    Ok(hex_digest(&bytes))
}
/// Retains the same producer independent of the ordinary sampling cleanup grace.
/// Drop is synchronous UNKNOWN, never async cleanup or a clean source seal.
pub struct CollectorLease {
    owner:SourceOwner,
    operation:Option<String>,
    complete:AtomicBool
}
impl CollectorLease {
    pub fn observed_local_close(&self) {
        if self.complete.swap(true,Ordering::AcqRel){self.owner.fence("DUPLICATE_LOCAL_CLOSE");return;}
        if self.operation.is_none(){return;}
        let _=self.owner.record("LOCAL_CLOSE",
        self.operation.as_deref(),
        json!( {
            "complete":true
        }));
    }
}
impl Drop for CollectorLease {
    fn drop(&mut self) {
        if !self.complete.load(Ordering::Acquire) {
            self.owner.fence("COLLECTOR_ABORTED");
        }
    }
}
pub struct WriteTicket {
    owner:SourceOwner,
    operation:String,
    digest:String,
    bytes:Vec<u8>,
    length:usize,
    offset:usize,
    entered:bool,
    settled:bool
}
impl WriteTicket {
    pub fn poll_admission(&mut self,
    cx:&mut std::task::Context<'_>,
    bytes:&[u8])->std::task::Poll<io::Result<()>> {
        if let Ok(mut state)=self.owner.0.state.lock() {
            state.write_wakers.insert(self.operation.clone(),
            cx.waker().clone());
        }
        match self.before_poll(bytes) {
            Err(e) if e.kind()==io::ErrorKind::WouldBlock=>std::task::Poll::Pending,
            result=>std::task::Poll::Ready(result)
        }
    }
    pub fn before_poll(&mut self,
    bytes:&[u8])->io::Result<()> {
        self.owner.check_admission()?;
        if bytes!=&self.bytes[self.offset..] {
            self.owner.fence("WRITE_BUFFER_CHANGED");
            return Err(deny());
        }
        let acknowledged=self.owner.0.state.lock().map_err(|_|deny())?.acknowledgements.contains_key(&self.operation);
        if !self.entered && !acknowledged {
            return Err(io::Error::new(io::ErrorKind::WouldBlock,
            "M06 parent durable ACK pending"));
        }
        if !self.entered {
            self.owner.0.state.lock().map_err(|_|deny())?.acknowledgements.remove(&self.operation).ok_or_else(deny)?;
            self.entered=true;
            self.owner.record("ATTEMPT_ENTERED",Some(&self.operation),json!({"route":"ws.direct"}))?;
            self.owner.record("WRITE_ATTEMPT",
            Some(&self.operation),
            json!( {
                "start":0,
                "end":self.length,
                "rawDigest":self.digest
            }))?;
        }
        self.owner.final_effect_guard()?;
        Ok(())
    }
    pub fn complete(&self)->bool {
        self.settled
    }
    pub fn progress(&mut self,
    n:usize)->io::Result<()> {
        if n>self.length-self.offset {
            self.owner.fence("WRITE_OVERFLOW");
            return Err(deny());
        }
        let start=self.offset;
        self.offset+=n;
        self.owner.record("WRITE_PROGRESS",
        Some(&self.operation),
        json!( {
            "start":start,
            "end":self.offset,
            "rawDigest":self.digest
        }))?;
        if self.offset==self.length {
            self.owner.record("LOCAL_CLOSE",Some(&self.operation),json!({"complete":true}))?;
            self.settled=true;

        }
        Ok(())
    }
}
impl Drop for WriteTicket {
    fn drop(&mut self) {
        if !self.settled {
            self.owner.fence("UNRESOLVED_WRITE");
        }
    }
}
#[cfg(test)] #[path="m06_outcome_tests.rs"] mod tests;
