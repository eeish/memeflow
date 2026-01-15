// Intent + Adapter Pattern for Wallet Connections

export interface WalletAdapter {
  connect(): Promise<WalletAccount>;
  disconnect(): Promise<void>;
  getAccount(): WalletAccount | null;
  isConnected(): boolean;
}

export interface WalletAccount {
  address: string;
  chain: 'sui' | 'ethereum';
  displayAddress: string;
}

// Ethereum Wallet Adapter
export class EthereumWalletAdapter implements WalletAdapter {
  private account: WalletAccount | null = null;

  async connect(): Promise<WalletAccount> {
    // In production, this would use window.ethereum (MetaMask, etc.)
    // For now, simulate wallet connection
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const mockAddress = '0x' + Array(40).fill(0).map(() => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
    
    this.account = {
      address: mockAddress,
      chain: 'ethereum',
      displayAddress: this.formatAddress(mockAddress)
    };
    
    return this.account;
  }

  async disconnect(): Promise<void> {
    this.account = null;
  }

  getAccount(): WalletAccount | null {
    return this.account;
  }

  isConnected(): boolean {
    return this.account !== null;
  }

  private formatAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }
}

// Sui Wallet Adapter
export class SuiWalletAdapter implements WalletAdapter {
  private account: WalletAccount | null = null;

  async connect(): Promise<WalletAccount> {
    // In production, this would use @mysten/wallet-adapter
    // For now, simulate wallet connection
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const mockAddress = '0x' + Array(64).fill(0).map(() => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
    
    this.account = {
      address: mockAddress,
      chain: 'sui',
      displayAddress: this.formatAddress(mockAddress)
    };
    
    return this.account;
  }

  async disconnect(): Promise<void> {
    this.account = null;
  }

  getAccount(): WalletAccount | null {
    return this.account;
  }

  isConnected(): boolean {
    return this.account !== null;
  }

  private formatAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }
}

// Wallet Factory
export class WalletFactory {
  static createAdapter(chain: 'sui' | 'ethereum'): WalletAdapter {
    switch (chain) {
      case 'ethereum':
        return new EthereumWalletAdapter();
      case 'sui':
        return new SuiWalletAdapter();
      default:
        throw new Error(`Unsupported chain: ${chain}`);
    }
  }
}
