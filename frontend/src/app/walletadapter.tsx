'use client'
import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import {Network} from "@aptos-labs/ts-sdk";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { clusterApiUrl } from "@solana/web3.js";
import { useMemo } from "react";

import AppWalletProvider from "components/solana/solana";

// Default styles that can be overridden by your app
function Wallet({ children }: { children: React.ReactNode }) {
    // Can be set to 'devnet', 'testnet', or 'mainnet-beta'
    const endpoint = clusterApiUrl("devnet");
    const walletssolana = useMemo(() => [], []);
    return (
      <AppWalletProvider>



      {children}

        </AppWalletProvider>

    );
  }
  
  export default Wallet;