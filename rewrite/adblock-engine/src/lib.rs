// SPDX-License-Identifier: AGPL-3.0-only
// Thin JSON ABI around Brave's unmodified, MPL-2.0 adblock-rust engine.
use adblock::{Engine, FilterSet, lists::{ParseOptions, RuleTypes}, request::Request, resources::Resource};
use serde_json::{json, Value};
use std::cell::RefCell;

struct Blockers {
    standard: Engine,
    first_party: Engine,
    cosmetics: Engine,
}

thread_local! {
    static BLOCKERS: RefCell<Option<Blockers>> = const { RefCell::new(None) };
}

fn string<'a>(value: &'a Value, key: &str) -> Result<&'a str, String> {
    value.get(key).and_then(Value::as_str).ok_or_else(|| format!("Missing {key}"))
}

fn dispatch(value: Value) -> Result<Value, String> {
    match string(&value, "operation")? {
        "initialize" => {
            let mut standard = FilterSet::new(false);
            let mut first_party = FilterSet::new(false);
            let mut cosmetics = FilterSet::new(false);
            let lists = value["lists"].as_array().ok_or("Missing filter lists")?;
            for list in lists {
                let text = string(list, "text")?.to_owned();
                let options: ParseOptions = serde_json::from_value(json!({
                    "permissions": list["permissions"].as_u64().unwrap_or(0)
                })).map_err(|error| error.to_string())?;
                cosmetics.add_filter_list(text.clone(), ParseOptions { rule_types: RuleTypes::CosmeticOnly, ..options });
                let options = ParseOptions { rule_types: RuleTypes::NetworkOnly, ..options };
                if list["firstParty"].as_bool().unwrap_or(false) {
                    first_party.add_filter_list(text, options);
                } else {
                    standard.add_filter_list(text, options);
                }
            }
            let resources: Vec<Resource> = serde_json::from_value(value["resources"].clone())
                .map_err(|error| error.to_string())?;
            let mut blockers = Blockers {
                standard: Engine::new_with_filter_set(standard),
                first_party: Engine::new_with_filter_set(first_party),
                cosmetics: Engine::new_with_filter_set(cosmetics),
            };
            blockers.standard.use_resources(resources.clone());
            blockers.first_party.use_resources(resources.clone());
            blockers.cosmetics.use_resources(resources);
            BLOCKERS.with_borrow_mut(|current| *current = Some(blockers));
            Ok(json!({ "engine": "brave/adblock-rust", "version": "0.13.6", "lists": lists.len() }))
        }
        "check" => BLOCKERS.with_borrow(|current| {
            let blockers = current.as_ref().ok_or("The blocking engine is not initialized")?;
            let request = Request::new(string(&value, "url")?, string(&value, "source")?,
                string(&value, "requestType")?, value["method"].as_str().unwrap_or("GET"))
                .map_err(|error| format!("Invalid blocking request: {error:?}"))?;
            let first = blockers.first_party.check_network_request_subset(&request, false, true);
            let general = if request.is_third_party || value["mode"] == "aggressive" {
                blockers.standard.check_network_request_subset(&request, first.should_block(), true)
            } else { Default::default() };
            let blocked = first.important || general.important ||
                ((first.filter.is_some() || general.filter.is_some()) && first.exception.is_none() && general.exception.is_none());
            Ok(json!({ "blocked": blocked, "redirect": first.redirect.or(general.redirect),
                "rewritten_url": first.rewritten_url.or(general.rewritten_url), "third_party": request.is_third_party }))
        }),
        "cosmetics" => BLOCKERS.with_borrow(|current| {
            let blockers = current.as_ref().ok_or("The blocking engine is not initialized")?;
            serde_json::to_value(blockers.cosmetics.url_cosmetic_resources(string(&value, "url")?))
                .map_err(|error| error.to_string())
        }),
        "selectors" => BLOCKERS.with_borrow(|current| {
            let blockers = current.as_ref().ok_or("The blocking engine is not initialized")?;
            let resources = blockers.cosmetics.url_cosmetic_resources(string(&value, "url")?);
            if resources.generichide { return Ok(json!([])); }
            let classes: Vec<String> = serde_json::from_value(value["classes"].clone()).map_err(|error| error.to_string())?;
            let ids: Vec<String> = serde_json::from_value(value["ids"].clone()).map_err(|error| error.to_string())?;
            Ok(json!(blockers.cosmetics.hidden_class_id_selectors(classes, ids, &resources.exceptions)))
        }),
        _ => Err("Unknown blocking operation".to_owned()),
    }
}

#[no_mangle]
pub extern "C" fn allocate(length: usize) -> *mut u8 {
    if length > 64 * 1024 * 1024 { return std::ptr::null_mut(); }
    Box::into_raw(vec![0; length].into_boxed_slice()) as *mut u8
}

#[no_mangle]
pub unsafe extern "C" fn release(pointer: *mut u8, length: usize) {
    if !pointer.is_null() { drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(pointer, length))); }
}

#[no_mangle]
pub unsafe extern "C" fn execute(pointer: *const u8, length: usize) -> u64 {
    #[cfg(target_arch = "wasm32")]
    {
        #[link(wasm_import_module = "env")]
        extern "C" { fn projlib_panic(pointer: *const u8, length: usize); }
        static HOOK: std::sync::Once = std::sync::Once::new();
        HOOK.call_once(|| std::panic::set_hook(Box::new(|information| {
            let message = information.to_string();
            unsafe { projlib_panic(message.as_ptr(), message.len()); }
        })));
    }
    let result = serde_json::from_slice(std::slice::from_raw_parts(pointer, length))
        .map_err(|error| error.to_string()).and_then(dispatch);
    let result = match result {
        Ok(value) => json!({ "ok": true, "value": value }),
        Err(error) => json!({ "ok": false, "error": error }),
    };
    let bytes = serde_json::to_vec(&result).unwrap().into_boxed_slice();
    let length = bytes.len() as u64;
    let pointer = Box::into_raw(bytes) as *mut u8 as u64;
    (pointer << 32) | length
}
