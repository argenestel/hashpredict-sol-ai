'use client'
import { PetraWallet } from "petra-plugin-wallet-adapter";
import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import {Network} from "@aptos-labs/ts-sdk";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { clusterApiUrl } from "@solana/web3.js";
import { useMemo } from "react";
import {
  WalletModalProvider,
  WalletMultiButton,
} from "@solana/wallet-adapter-react-ui";
import AppWalletProvider from "components/solana/solana";

// Default styles that can be overridden by your app
function Wallet({ children }: { children: React.ReactNode }) {
    // Can be set to 'devnet', 'testnet', or 'mainnet-beta'
    const endpoint = clusterApiUrl("devnet");
    const walletssolana = useMemo(() => [], []);
    const wallets = [new PetraWallet()];
    return (
      <AppWalletProvider>


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

        </AppWalletProvider>

    );
  }
  
  export default Wallet;