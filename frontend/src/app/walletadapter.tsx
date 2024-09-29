'use client'
import { PetraWallet } from "petra-plugin-wallet-adapter";
import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import {Network} from "@aptos-labs/ts-sdk";

// Default styles that can be overridden by your app
function Wallet({ children }: { children: React.ReactNode }) {
    // Can be set to 'devnet', 'testnet', or 'mainnet-beta'
    const wallets = [new PetraWallet()];
    return (
     
      <AptosWalletAdapterProvider
      plugins={wallets}
      dappConfig={{
        network: Network.TESTNET,
        aptosConnectDappId: "57fa42a9-29c6-4f1e-939c-4eefa36d9ff5",
        mizuwallet: {
          manifestURL:
            "https://assets.mz.xyz/static/config/mizuwallet-connect-manifest.json",
        },
      }}>
      {children}
        </AptosWalletAdapterProvider>
    );
  }
  
  export default Wallet;