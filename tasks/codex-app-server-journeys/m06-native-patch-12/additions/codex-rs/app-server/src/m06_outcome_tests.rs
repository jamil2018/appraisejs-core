//! AUTHORED_UNEXECUTED; startup must remain before auth and helper dispatch.
#[test]
fn dormant_profile_is_fixed_not_a_caller_descriptor() {
    assert_eq!(codex_http_client::m06_outcome::PROFILE,
    "M06_SOURCE_FDS_4_5_V12");
    assert_eq!(codex_http_client::m06_outcome::MAX_FRAME,
    65536);
}
