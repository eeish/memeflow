use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::Path;
use std::process::Command;
use tempfile::TempDir;

#[derive(Debug, Deserialize)]
pub struct BuildCreatorTokenRequest {
    pub owner_address: String,
    pub token_name: String,
    pub token_symbol: String,
    pub auth_nonce: String,
    pub auth_timestamp_ms: i64,
    pub auth_signature: String,
}

#[derive(Debug, Serialize)]
pub struct BuildCreatorTokenResponse {
    pub package_name: String,
    pub module_name: String,
    pub type_name: String,
    pub token_name: String,
    pub token_symbol: String,
    pub modules: Vec<String>,
    pub dependencies: Vec<String>,
}

pub fn normalize_owner_address(address: &str) -> Option<String> {
    let trimmed = address.trim();
    let normalized = if trimmed.starts_with("0x") {
        trimmed.to_string()
    } else {
        format!("0x{}", trimmed)
    };

    if normalized.len() < 4 || normalized.len() > 66 {
        return None;
    }
    if normalized[2..].chars().all(|ch| ch.is_ascii_hexdigit()) {
        Some(normalized.to_lowercase())
    } else {
        None
    }
}

pub fn normalize_token_symbol(raw: &str) -> Option<String> {
    let upper = raw.trim().to_uppercase();
    if upper.is_empty() || upper.len() > 10 {
        return None;
    }
    if upper.chars().all(|ch| ch.is_ascii_alphanumeric()) {
        Some(upper)
    } else {
        None
    }
}

pub fn normalize_token_name(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.len() > 32 {
        return None;
    }
    if trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == ' ' || ch == '_' || ch == '-' || ch == '.')
    {
        Some(trimmed.to_string())
    } else {
        None
    }
}

pub fn validate_auth_nonce(nonce: &str) -> bool {
    let trimmed = nonce.trim();
    if trimmed.len() < 16 || trimmed.len() > 128 {
        return false;
    }
    trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
}

pub fn build_creator_token_auth_message(
    owner_address: &str,
    token_name: &str,
    token_symbol: &str,
    auth_timestamp_ms: i64,
    auth_nonce: &str,
) -> String {
    format!(
        "Cord Creator Token Build Authorization\n\nOwner: {owner_address}\nToken Name: {token_name}\nToken Symbol: {token_symbol}\nTimestamp: {auth_timestamp_ms}\nNonce: {auth_nonce}\n\nSign this message to authorize creator token package compilation."
    )
}

pub fn verify_creator_token_auth_signature(
    owner_address: &str,
    auth_message: &str,
    auth_signature: &str,
) -> Result<(), String> {
    let signature = auth_signature.trim();
    if signature.is_empty() || signature.len() > 2048 {
        return Err("Invalid authorization signature".to_string());
    }

    let message_b64 = BASE64_STANDARD.encode(auth_message.as_bytes());
    let verify_script = r#"
const { verifyPersonalMessageSignature } = await import('@mysten/sui/verify');

const messageB64 = process.env.CORD_BUILD_AUTH_MESSAGE_B64 || '';
const signature = process.env.CORD_BUILD_AUTH_SIGNATURE || '';
const address = process.env.CORD_BUILD_AUTH_OWNER || '';
const messageBytes = Uint8Array.from(Buffer.from(messageB64, 'base64'));

try {
  await verifyPersonalMessageSignature(messageBytes, signature, { address });
  process.stdout.write('ok');
} catch (err) {
  const msg = err && err.message ? err.message : String(err);
  process.stderr.write(msg);
  process.exit(1);
}
"#;

    let output = Command::new("node")
        .args(["--input-type=module", "-e", verify_script])
        .env("CORD_BUILD_AUTH_MESSAGE_B64", message_b64)
        .env("CORD_BUILD_AUTH_SIGNATURE", signature)
        .env("CORD_BUILD_AUTH_OWNER", owner_address)
        .output()
        .map_err(|e| format!("Failed to verify build authorization signature: {e}"))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let detail = format!("{stderr}\n{stdout}");
    Err(format!(
        "Build authorization signature verification failed: {}",
        detail.trim()
    ))
}

fn normalize_package_name(symbol: &str) -> String {
    let lower = symbol.to_ascii_lowercase();
    let mut out = String::new();
    for ch in lower.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    if out.is_empty() {
        "creator_token".to_string()
    } else if out
        .chars()
        .next()
        .map(|ch| ch.is_ascii_digit())
        .unwrap_or(false)
    {
        format!("token_{}", out)
    } else {
        format!("creator_{}", out)
    }
}

fn write_package_files(
    package_dir: &Path,
    package_name: &str,
    type_name: &str,
    token_symbol: &str,
    token_name: &str,
    owner_address: &str,
) -> Result<(), String> {
    let move_toml = format!(
        r#"[package]
name = "{package_name}"
edition = "2024"

[dependencies]
Sui = {{ git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "d4a0c80be6020093592b305853832e7b80c5e2f2" }}

[addresses]
creator_token = "0x0"
"#
    );
    fs::write(package_dir.join("Move.toml"), move_toml)
        .map_err(|e| format!("Write Move.toml failed: {e}"))?;

    let sources_dir = package_dir.join("sources");
    fs::create_dir_all(&sources_dir).map_err(|e| format!("Create sources dir failed: {e}"))?;

    let description = format!("Cord creator token for {owner_address}");
    let module = format!(
        r#"module creator_token::creator_coin {{
    use sui::coin;

    const DECIMALS: u8 = 9;

    public struct {type_name} has drop {{}}

    fun init(witness: {type_name}, ctx: &mut sui::tx_context::TxContext) {{
        let (treasury_cap, metadata) = coin::create_currency<{type_name}>(
            witness,
            DECIMALS,
            b"{token_symbol}",
            b"{token_name}",
            b"{description}",
            std::option::none(),
            ctx,
        );
        sui::transfer::public_freeze_object(metadata);
        sui::transfer::public_transfer(treasury_cap, sui::tx_context::sender(ctx));
    }}
}}
"#
    );

    fs::write(sources_dir.join("creator_coin.move"), module)
        .map_err(|e| format!("Write creator_coin.move failed: {e}"))?;
    Ok(())
}

fn write_sui_client_config(config_path: &Path) -> Result<(), String> {
    const ZERO_ADDRESS: &str = "0x0000000000000000000000000000000000000000000000000000000000000000";
    let config = format!(
        r#"---
keystore:
  File: /tmp/codex-empty.keystore
external_keys: ~
envs:
  - alias: local
    rpc: "http://127.0.0.1:9000"
    ws: ~
    basic_auth: ~
  - alias: testnet
    rpc: "https://fullnode.testnet.sui.io:443"
    ws: ~
    basic_auth: ~
  - alias: mainnet
    rpc: "https://fullnode.mainnet.sui.io:443"
    ws: ~
    basic_auth: ~
active_env: local
active_address: "{ZERO_ADDRESS}"
"#
    );
    fs::write(config_path, config).map_err(|e| format!("Write Sui client config failed: {e}"))
}

fn run_sui_move_build(
    package_path: &Path,
    client_config_path: &Path,
) -> Result<std::process::Output, String> {
    let preferred_env = std::env::var("CREATOR_TOKEN_BUILD_ENV")
        .ok()
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "testnet".to_string());

    let mut env_candidates = vec![preferred_env];
    if !env_candidates.iter().any(|env| env == "testnet") {
        env_candidates.push("testnet".to_string());
    }
    if !env_candidates.iter().any(|env| env == "mainnet") {
        env_candidates.push("mainnet".to_string());
    }

    let mut last_output: Option<std::process::Output> = None;
    for build_env in env_candidates {
        let output = Command::new("sui")
            .args([
                "move",
                "--client.config",
                client_config_path
                    .to_str()
                    .ok_or_else(|| "Client config path is not valid UTF-8".to_string())?,
                "--client.env",
                "local",
                "build",
                "--path",
                package_path
                    .to_str()
                    .ok_or_else(|| "Temp path is not valid UTF-8".to_string())?,
                "--dump-bytecode-as-base64",
                "--json-errors",
                "--no-tree-shaking",
                "--silence-warnings",
                "--environment",
                &build_env,
            ])
            .output()
            .map_err(|e| format!("Failed to run `sui move build`: {e}"))?;

        if output.status.success() {
            return Ok(output);
        }
        last_output = Some(output);
    }

    match last_output {
        Some(output) => Ok(output),
        None => Err("Move build did not execute".to_string()),
    }
}

fn extract_environment_hint(build_output: &str) -> Option<(String, String)> {
    for line in build_output.lines() {
        let trimmed = line.trim();
        let (left, right) = trimmed.split_once('=')?;
        let alias = left.trim();
        if alias.is_empty()
            || !alias
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
        {
            continue;
        }

        let chain = right.trim().trim_matches('"');
        if chain.is_empty() || !chain.chars().all(|ch| ch.is_ascii_hexdigit()) {
            continue;
        }

        return Some((alias.to_string(), chain.to_string()));
    }
    None
}

fn upsert_environment_entry(
    move_toml_path: &Path,
    env_alias: &str,
    chain_id: &str,
) -> Result<(), String> {
    let content =
        fs::read_to_string(move_toml_path).map_err(|e| format!("Read Move.toml failed: {e}"))?;
    let mut lines = content
        .lines()
        .map(|line| line.to_string())
        .collect::<Vec<_>>();

    let section_idx = lines
        .iter()
        .position(|line| line.trim() == "[environments]");

    match section_idx {
        Some(idx) => {
            let mut end_idx = lines.len();
            let mut alias_idx = None;
            for i in (idx + 1)..lines.len() {
                let trimmed = lines[i].trim();
                if trimmed.starts_with('[') && trimmed.ends_with(']') {
                    end_idx = i;
                    break;
                }
                if let Some((left, _)) = trimmed.split_once('=') {
                    if left.trim() == env_alias {
                        alias_idx = Some(i);
                        break;
                    }
                }
            }

            let new_line = format!("{env_alias} = \"{chain_id}\"");
            if let Some(i) = alias_idx {
                lines[i] = new_line;
            } else {
                lines.insert(end_idx, new_line);
            }
        }
        None => {
            lines.push(String::new());
            lines.push("[environments]".to_string());
            lines.push(format!("{env_alias} = \"{chain_id}\""));
        }
    }

    let mut updated = lines.join("\n");
    if !updated.ends_with('\n') {
        updated.push('\n');
    }
    fs::write(move_toml_path, updated).map_err(|e| format!("Write Move.toml failed: {e}"))?;
    Ok(())
}

fn run_legacy_sui_move_build(package_path: &Path) -> Result<std::process::Output, String> {
    Command::new("sui")
        .args([
            "move",
            "build",
            "--path",
            package_path
                .to_str()
                .ok_or_else(|| "Temp path is not valid UTF-8".to_string())?,
            "--dump-bytecode-as-base64",
            "--json-errors",
            "--no-tree-shaking",
            "--silence-warnings",
        ])
        .output()
        .map_err(|e| format!("Failed to run `sui move build`: {e}"))
}

fn extract_json(output: &str) -> Result<Value, String> {
    let trimmed = output.trim();
    if trimmed.is_empty() {
        return Err("Compiler returned empty output".to_string());
    }

    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
        return Ok(value);
    }

    let start = trimmed
        .find('{')
        .ok_or_else(|| "Compiler output missing JSON object".to_string())?;
    let end = trimmed
        .rfind('}')
        .ok_or_else(|| "Compiler output missing JSON close brace".to_string())?;
    let slice = &trimmed[start..=end];
    serde_json::from_str(slice).map_err(|e| format!("Parse compiler JSON failed: {e}"))
}

fn normalize_dependencies(raw: &[Value]) -> Vec<String> {
    raw.iter()
        .filter_map(|entry| entry.as_str())
        .map(|dep| {
            if dep.starts_with("0x") {
                dep.to_string()
            } else {
                format!("0x{dep}")
            }
        })
        .collect()
}

pub fn build_creator_token_package(
    request: BuildCreatorTokenRequest,
) -> Result<BuildCreatorTokenResponse, String> {
    let owner_address = normalize_owner_address(&request.owner_address)
        .ok_or_else(|| "Invalid owner_address".to_string())?;
    let token_symbol = normalize_token_symbol(&request.token_symbol).ok_or_else(|| {
        "Invalid token_symbol: use 1-10 uppercase alphanumeric characters".to_string()
    })?;
    let token_name = normalize_token_name(&request.token_name).ok_or_else(|| {
        "Invalid token_name: use 1-32 ASCII characters [A-Za-z0-9 _-.]".to_string()
    })?;

    let type_name = "CREATOR_COIN".to_string();
    let package_name = normalize_package_name(&token_symbol);
    let module_name = "creator_coin".to_string();

    let temp_dir = TempDir::new().map_err(|e| format!("Create temp dir failed: {e}"))?;
    write_package_files(
        temp_dir.path(),
        &package_name,
        &type_name,
        &token_symbol,
        &token_name,
        &owner_address,
    )?;
    let client_config_path = temp_dir.path().join("sui-client.yaml");
    write_sui_client_config(&client_config_path)?;

    let mut output = run_sui_move_build(temp_dir.path(), &client_config_path)?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let combined = format!("{stderr}\n{stdout}");

        if let Some((env_alias, chain_id)) = extract_environment_hint(&combined) {
            let move_toml_path = temp_dir.path().join("Move.toml");
            upsert_environment_entry(&move_toml_path, &env_alias, &chain_id)?;
            output = run_legacy_sui_move_build(temp_dir.path())?;
        }

        if !output.status.success() {
            let retry_stderr = String::from_utf8_lossy(&output.stderr);
            let retry_stdout = String::from_utf8_lossy(&output.stdout);
            let retry_combined = format!("{retry_stderr}\n{retry_stdout}");
            return Err(format!("Move build failed: {}", retry_combined.trim()));
        }
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let json = extract_json(&stdout)?;

    let modules = json
        .get("modules")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "Compiler JSON missing `modules`".to_string())?
        .iter()
        .filter_map(|v| v.as_str())
        .map(|s| s.to_string())
        .collect::<Vec<_>>();

    if modules.is_empty() {
        return Err("Compiler returned empty modules".to_string());
    }

    let dependencies = json
        .get("dependencies")
        .and_then(|v| v.as_array())
        .map(|arr| normalize_dependencies(arr))
        .unwrap_or_default();

    Ok(BuildCreatorTokenResponse {
        package_name,
        module_name,
        type_name,
        token_name,
        token_symbol,
        modules,
        dependencies,
    })
}
