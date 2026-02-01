use anyhow::{anyhow, Result};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

/// Sui address validation and blockchain verification utilities
pub struct SuiVerification {
    network_url: Option<String>,
    http_client: reqwest::Client,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddressVerificationResult {
    pub is_valid: bool,
    pub is_new_user: bool,
    pub address: String,
    pub normalized_address: Option<String>,
    pub on_chain_data: Option<OnChainUserData>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnChainUserData {
    pub has_transactions: bool,
    pub transaction_count: u64,
    pub balance: Option<u64>,
    pub first_transaction_timestamp: Option<i64>,
    pub is_active: bool,
}

impl SuiVerification {
    /// Create new SuiVerification instance
    pub fn new() -> Self {
        Self {
            network_url: None,
            http_client: reqwest::Client::new(),
        }
    }

    /// Initialize with network URL for on-chain verification
    pub async fn with_client(network_url: Option<&str>) -> Result<Self> {
        Ok(Self {
            network_url: network_url.map(|s| s.to_string()),
            http_client: reqwest::Client::new(),
        })
    }

    /// Validate Sui address format
    pub fn validate_address_format(address: &str) -> bool {
        static REGEX: OnceLock<Regex> = OnceLock::new();
        let regex = REGEX.get_or_init(|| {
            // Sui addresses are 32 bytes (64 hex chars) with 0x prefix
            // They can also be shorter and will be padded with zeros
            Regex::new(r"^0x[a-fA-F0-9]{1,64}$").unwrap()
        });

        regex.is_match(address)
    }

    /// Normalize Sui address to canonical format (32 bytes with 0x prefix)
    pub fn normalize_address(address: &str) -> Result<String> {
        if !Self::validate_address_format(address) {
            return Err(anyhow!("Invalid Sui address format"));
        }

        // Remove 0x prefix, pad with zeros to 64 chars, then add 0x back
        let without_prefix = address.strip_prefix("0x").unwrap_or(address);
        let padded = format!("{:0>64}", without_prefix);
        
        if padded.len() != 64 {
            return Err(anyhow!("Address too long"));
        }

        Ok(format!("0x{}", padded))
    }

    /// Check if address exists in our database (new user check)
    pub async fn is_new_user_in_db(
        &self,
        db: &crate::database::Database,
        address: &str,
    ) -> Result<bool> {
        let normalized = Self::normalize_address(address)?;
        
        // Check if any user has this wallet address
        let exists = db.user_exists_by_address(&normalized).await?;

        Ok(!exists)
    }

    /// Get on-chain data for an address using Sui RPC
    pub async fn get_on_chain_data(&self, address: &str) -> Result<OnChainUserData> {
        let normalized = Self::normalize_address(address)?;
        
        match &self.network_url {
            Some(url) => {
                // Try to get balance via RPC call
                let balance = self.get_balance_via_rpc(&normalized, url).await.unwrap_or(0);
                
                // Try to get transaction count via RPC call  
                let transaction_count = self.get_transaction_count_via_rpc(&normalized, url).await.unwrap_or(0);
                
                let has_transactions = transaction_count > 0;
                let is_active = balance > 0 || transaction_count > 0;

                Ok(OnChainUserData {
                    has_transactions,
                    transaction_count,
                    balance: Some(balance),
                    first_transaction_timestamp: None, // Would require additional RPC calls
                    is_active,
                })
            }
            None => {
                // Mock data when no network URL is available
                tracing::warn!("No Sui network URL available, returning mock on-chain data for {}", address);
                Ok(OnChainUserData {
                    has_transactions: false,
                    transaction_count: 0,
                    balance: Some(0),
                    first_transaction_timestamp: None,
                    is_active: false,
                })
            }
        }
    }

    /// Get balance via Sui RPC
    async fn get_balance_via_rpc(&self, address: &str, network_url: &str) -> Result<u64> {
        #[derive(serde::Serialize)]
        struct RpcRequest {
            jsonrpc: String,
            id: i32,
            method: String,
            params: Vec<serde_json::Value>,
        }

        let request = RpcRequest {
            jsonrpc: "2.0".to_string(),
            id: 1,
            method: "suix_getBalance".to_string(),
            params: vec![serde_json::Value::String(address.to_string())],
        };

        match self.http_client
            .post(network_url)
            .json(&request)
            .send()
            .await
        {
            Ok(response) => {
                let json: serde_json::Value = response.json().await?;
                if let Some(result) = json.get("result") {
                    if let Some(total_balance) = result.get("totalBalance") {
                        if let Some(balance_str) = total_balance.as_str() {
                            return Ok(balance_str.parse().unwrap_or(0));
                        }
                    }
                }
                Ok(0)
            }
            Err(e) => {
                tracing::warn!("Failed to get balance for {}: {}", address, e);
                Ok(0)
            }
        }
    }

    /// Get transaction count via Sui RPC
    async fn get_transaction_count_via_rpc(&self, address: &str, network_url: &str) -> Result<u64> {
        #[derive(serde::Serialize)]
        struct RpcRequest {
            jsonrpc: String,
            id: i32,
            method: String,
            params: Vec<serde_json::Value>,
        }

        let request = RpcRequest {
            jsonrpc: "2.0".to_string(),
            id: 1,
            method: "suix_queryTransactionBlocks".to_string(),
            params: vec![
                serde_json::json!({
                    "filter": {
                        "FromAddress": address
                    }
                }),
                serde_json::Value::Null,
                serde_json::Value::Number(serde_json::Number::from(1)),
                serde_json::Value::Bool(false),
            ],
        };

        match self.http_client
            .post(network_url)
            .json(&request)
            .send()
            .await
        {
            Ok(response) => {
                let json: serde_json::Value = response.json().await?;
                if let Some(result) = json.get("result") {
                    if let Some(data) = result.get("data") {
                        if let Some(array) = data.as_array() {
                            return Ok(array.len() as u64);
                        }
                    }
                }
                Ok(0)
            }
            Err(e) => {
                tracing::warn!("Failed to get transaction count for {}: {}", address, e);
                Ok(0)
            }
        }
    }

    /// Comprehensive user verification
    pub async fn verify_user_address(
        &self,
        db: &crate::database::Database,
        address: &str,
    ) -> AddressVerificationResult {
        // Step 1: Validate address format
        if !Self::validate_address_format(address) {
            return AddressVerificationResult {
                is_valid: false,
                is_new_user: false,
                address: address.to_string(),
                normalized_address: None,
                on_chain_data: None,
                error: Some("Invalid Sui address format".to_string()),
            };
        }

        // Step 2: Normalize address
        let normalized_address = match Self::normalize_address(address) {
            Ok(addr) => addr,
            Err(e) => {
                return AddressVerificationResult {
                    is_valid: false,
                    is_new_user: false,
                    address: address.to_string(),
                    normalized_address: None,
                    on_chain_data: None,
                    error: Some(format!("Failed to normalize address: {}", e)),
                };
            }
        };

        // Step 3: Check if user is new in our database
        let is_new_user = match self.is_new_user_in_db(db, address).await {
            Ok(is_new) => is_new,
            Err(e) => {
                return AddressVerificationResult {
                    is_valid: true,
                    is_new_user: false,
                    address: address.to_string(),
                    normalized_address: Some(normalized_address),
                    on_chain_data: None,
                    error: Some(format!("Database check failed: {}", e)),
                };
            }
        };

        // Step 4: Get on-chain data
        let on_chain_data = match self.get_on_chain_data(address).await {
            Ok(data) => Some(data),
            Err(e) => {
                tracing::warn!("Failed to get on-chain data for {}: {}", address, e);
                None
            }
        };

        AddressVerificationResult {
            is_valid: true,
            is_new_user,
            address: address.to_string(),
            normalized_address: Some(normalized_address),
            on_chain_data,
            error: None,
        }
    }

    /// Generate username from Sui address for new users
    pub fn generate_username_from_address(address: &str) -> Result<String> {
        let normalized = Self::normalize_address(address)?;
        // Take last 8 characters (after 0x) and make it more readable
        let suffix = &normalized[normalized.len()-8..];
        Ok(format!("user{}", suffix))
    }

    /// Check if address has minimum activity to be considered legitimate
    pub fn is_legitimate_address(on_chain_data: &OnChainUserData) -> bool {
        // Consider an address legitimate if it:
        // 1. Has at least one transaction, OR
        // 2. Has a balance > 0, OR  
        // 3. Is marked as active
        on_chain_data.has_transactions || 
        on_chain_data.balance.unwrap_or(0) > 0 ||
        on_chain_data.is_active
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_address_format() {
        // Valid addresses
        assert!(SuiVerification::validate_address_format("0x1"));
        assert!(SuiVerification::validate_address_format("0x123abc"));
        assert!(SuiVerification::validate_address_format("0x1234567890abcdef1234567890abcdef12345678"));
        
        // Invalid addresses
        assert!(!SuiVerification::validate_address_format("1234"));
        assert!(!SuiVerification::validate_address_format("0x")); 
        assert!(!SuiVerification::validate_address_format("0xgg"));
        assert!(!SuiVerification::validate_address_format("not_an_address"));
    }

    #[test]
    fn test_normalize_address() {
        assert_eq!(
            SuiVerification::normalize_address("0x1").unwrap(),
            "0x0000000000000000000000000000000000000000000000000000000000000001"
        );
        
        assert_eq!(
            SuiVerification::normalize_address("0x123abc").unwrap(),
            "0x000000000000000000000000000000000000000000000000000000000123abc"
        );
        
        // Already normalized
        let full_addr = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
        assert_eq!(SuiVerification::normalize_address(full_addr).unwrap(), full_addr);
    }

    #[test]
    fn test_generate_username() {
        let result = SuiVerification::generate_username_from_address("0x123abc").unwrap();
        assert!(result.starts_with("user"));
        assert_eq!(result.len(), 12); // "user" + 8 chars
    }
}