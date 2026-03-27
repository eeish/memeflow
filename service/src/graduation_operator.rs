use crate::creator_token_builder::BuildCreatorTokenResponse;
use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tempfile::NamedTempFile;
use tokio::process::Command;

#[derive(Clone)]
pub struct GraduationOperator {
    pub network: String,
    pub rpc_url: String,
    pub operator_address: String,
    pub operator_private_key: String,
    pub contract_package_id: String,
    pub graduation_registry_id: String,
    repo_root: PathBuf,
    helper_script: PathBuf,
}

#[derive(Debug, Clone, Serialize)]
pub struct OperatorLaunchInput {
    pub owner_address: String,
    pub market_id: String,
    pub token_name: String,
    pub token_symbol: String,
    pub package_build: Option<BuildCreatorTokenResponse>,
    pub existing_package_id: Option<String>,
    pub existing_token_type: Option<String>,
    pub existing_vault_id: Option<String>,
    pub existing_pool_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OperatorLaunchResult {
    pub package_id: Option<String>,
    pub token_type: Option<String>,
    pub vault_id: Option<String>,
    pub pool_id: Option<String>,
    #[serde(default)]
    pub tx_digests: Vec<String>,
}

fn default_rpc_url(network: &str) -> Option<&'static str> {
    match network {
        "devnet" => Some("https://fullnode.devnet.sui.io:443"),
        "testnet" => Some("https://fullnode.testnet.sui.io:443"),
        "mainnet" => Some("https://fullnode.mainnet.sui.io:443"),
        _ => None,
    }
}

fn read_deployment_value(path: &Path, field: &str) -> Option<String> {
    let raw = std::fs::read_to_string(path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&raw).ok()?;
    value
        .get(field)
        .and_then(|entry| entry.as_str())
        .map(|entry| entry.to_string())
}

impl GraduationOperator {
    pub fn from_env() -> Result<Self> {
        let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .ok_or_else(|| anyhow!("service crate path is missing repo root"))?
            .to_path_buf();

        let network = std::env::var("GRADUATION_OPERATOR_NETWORK")
            .unwrap_or_else(|_| "testnet".to_string())
            .trim()
            .to_ascii_lowercase();
        let rpc_url = std::env::var("GRADUATION_OPERATOR_RPC_URL")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .or_else(|| default_rpc_url(&network).map(str::to_string))
            .ok_or_else(|| anyhow!("Missing GRADUATION_OPERATOR_RPC_URL"))?;
        let operator_address = std::env::var("GRADUATION_OPERATOR_ADDRESS")
            .context("Missing GRADUATION_OPERATOR_ADDRESS")?;
        let operator_private_key = std::env::var("GRADUATION_OPERATOR_PRIVATE_KEY")
            .context("Missing GRADUATION_OPERATOR_PRIVATE_KEY")?;

        let deployment_path = repo_root.join(format!("public/deployment-{}.json", network));
        let contract_package_id = std::env::var("CORD_CONTRACT_PACKAGE_ID")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .or_else(|| read_deployment_value(&deployment_path, "packageId"))
            .ok_or_else(|| anyhow!("Missing CORD_CONTRACT_PACKAGE_ID and deployment packageId"))?;
        let graduation_registry_id = std::env::var("CORD_GRADUATION_REGISTRY_ID")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .or_else(|| read_deployment_value(&deployment_path, "graduationRegistryId"))
            .ok_or_else(|| anyhow!("Missing CORD_GRADUATION_REGISTRY_ID and deployment graduationRegistryId"))?;

        let helper_script = repo_root.join("service/scripts/graduation_operator.mjs");
        if !helper_script.exists() {
            return Err(anyhow!(
                "Graduation operator helper script not found at {}",
                helper_script.display()
            ));
        }

        Ok(Self {
            network,
            rpc_url,
            operator_address,
            operator_private_key,
            contract_package_id,
            graduation_registry_id,
            repo_root,
            helper_script,
        })
    }

    pub async fn launch(&self, input: OperatorLaunchInput) -> Result<OperatorLaunchResult> {
        let request_file = NamedTempFile::new().context("create graduation input temp file")?;
        serde_json::to_writer_pretty(
            request_file.as_file(),
            &serde_json::json!({
                "network": self.network,
                "rpcUrl": self.rpc_url,
                "operatorAddress": self.operator_address,
                "contractPackageId": self.contract_package_id,
                "graduationRegistryId": self.graduation_registry_id,
                "ownerAddress": input.owner_address,
                "marketId": input.market_id,
                "tokenName": input.token_name,
                "tokenSymbol": input.token_symbol,
                "existingPackageId": input.existing_package_id,
                "existingTokenType": input.existing_token_type,
                "existingVaultId": input.existing_vault_id,
                "existingPoolId": input.existing_pool_id,
                "packageBuild": input.package_build,
            }),
        )
        .context("write graduation input file")?;

        let output = Command::new("node")
            .arg(&self.helper_script)
            .arg(request_file.path())
            .current_dir(&self.repo_root)
            .env("GRADUATION_OPERATOR_PRIVATE_KEY", &self.operator_private_key)
            .output()
            .await
            .context("run graduation operator helper")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            let message = format!("{}\n{}", stderr.trim(), stdout.trim())
                .trim()
                .to_string();
            return Err(anyhow!(
                "Graduation operator failed: {}",
                if message.is_empty() {
                    "unknown error".to_string()
                } else {
                    message
                }
            ));
        }

        let stdout = String::from_utf8(output.stdout).context("decode graduation helper stdout")?;
        serde_json::from_str(stdout.trim())
            .with_context(|| format!("parse graduation helper json output: {}", stdout.trim()))
    }
}
