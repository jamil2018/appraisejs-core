//! AUTHORED_UNEXECUTED. Existing rmcp types parse the actual JSON-RPC IDs.
use rmcp::service:: {
    RoleClient,
    TxJsonRpcMessage
};
#[test]
fn real_parser_retains_string_and_number_id_domains() {
    for id in [serde_json::json!(7),
    serde_json::json!("7")] {
        let message=serde_json::json!( {
            "jsonrpc":"2.0",
            "id":id,
            "method":"tools/list"
        });
        let parsed:TxJsonRpcMessage<RoleClient>=serde_json::from_value(message).unwrap();
        assert_eq!(serde_json::to_value(parsed).unwrap()["id"],
        id);
    }
}
#[test] fn malformed_actual_message_is_not_a_replacement_protocol() {
    assert!(serde_json::from_value::<TxJsonRpcMessage<RoleClient>>(serde_json::json!( {
        "id":1,
        "method":false
    })).is_err());
}
#[test] fn private_original_context_is_not_a_json_field() {
    let value=serde_json::json!( {
        "jsonrpc":"2.0",
        "id":1,
        "method":"tools/call",
        "params": {
            "name":"tool",
            "arguments": {
                "_meta": {
                    "owner":"forged"
                }
            }
        }
    });
    let parsed:TxJsonRpcMessage<RoleClient>=serde_json::from_value(value).unwrap();
    use rmcp::model:: {
        JsonRpcMessage,
        GetExtensions
    };
    if let JsonRpcMessage::Request(mut request)=parsed {
        assert!(request.request.extensions_mut().remove::<codex_http_client::m06_outcome::OwnedCallContext>().is_none());
    } else {
        panic!("request expected");
    }
}
