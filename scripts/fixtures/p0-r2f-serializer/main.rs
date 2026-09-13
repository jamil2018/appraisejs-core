#![allow(dead_code, unused_imports)]
mod stock;
mod candidate;
use serde_json::{Value,json};
use std::io::{self,Read};
fn main() {
 let mut input=String::new(); io::stdin().read_to_string(&mut input).unwrap();
 let receipt:Value=serde_json::from_str(&input).unwrap();
 let mut rows=Vec::new();
 for arm in receipt["results"].as_array().unwrap() {
  for tool in arm["expectedTools"].as_array().unwrap() {
   let schema=&tool["parameters"];
   let stock=serde_json::to_value(stock::parse_tool_input_schema(schema).unwrap()).unwrap();
   let candidate=serde_json::to_value(candidate::parse_lossless_dynamic_schema(schema).unwrap()).unwrap();
   let wire=arm["capture"]["observedTools"].as_array().unwrap().iter().find(|v|v["name"]==tool["name"]).unwrap();
   rows.push(json!({"arm":arm["arm"],"tool":tool["name"],"stockMatchesWire":stock==wire["parameters"],"candidateMatchesInput":candidate==*schema,"schemaBytes":serde_json::to_vec(schema).unwrap().len()}));
  }
 }
 let oversized=json!({"type":"string","description":"x".repeat(65536)});
 let oversized_rejected=candidate::parse_lossless_dynamic_schema(&oversized).is_err();
 let malformed_type_rejected=candidate::parse_lossless_dynamic_schema(&json!({"type":"not-a-json-type"})).is_err();
 let pairs:std::collections::BTreeSet<String>=rows.iter().map(|r|format!("{}:{}",r["arm"],r["tool"])).collect();
 let arms:std::collections::BTreeSet<String>=rows.iter().map(|r|r["arm"].to_string()).collect();
 let passed=rows.len()==20 && pairs.len()==20 && arms.len()==12 && rows.iter().all(|r|r["stockMatchesWire"]==true && r["candidateMatchesInput"]==true) && oversized_rejected && malformed_type_rejected;
 println!("{}",serde_json::to_string_pretty(&json!({"schema":"appraise.p0-r2f-serializer-canary/v1","sourceLevelCanaryPassed":passed,"providerQualified":false,"fullCodexBuildTested":false,"oversizedRejected":oversized_rejected,"malformedTypeRejected":malformed_type_rejected,"results":rows})).unwrap());
 if !passed { std::process::exit(2); }
}
