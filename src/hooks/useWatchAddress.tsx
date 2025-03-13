import { getFulcrum, isActivated } from "@/lib/utils";
import { DefaultProvider, ElectrumNetworkProvider, TestNetWallet, UtxoI, Wallet } from "mainnet-js";
import { useState, useEffect } from "react";

const WalletClass = isActivated ? Wallet : TestNetWallet;
const fulcrum = getFulcrum();
DefaultProvider.servers[isActivated ? "mainnet" : "testnet"] = [`wss://${fulcrum}`];

export function useWatchAddress(address: string | undefined, tokenId?: string) {
  const [utxos, setUtxos] = useState<UtxoI[] | undefined>(undefined);
  const [tokenUtxos, setTokenUtxos] = useState<UtxoI[] | undefined>(undefined);
  const [balance, setBalance] = useState<number | undefined>(undefined);
  const [tokenBalance, setTokenBalance] = useState<number | undefined>(undefined);
  const [retries, setRetries] = useState(0);

  useEffect(() => {
    if (!address) {
      return;
    }

    let cancelWatch: () => void;

    (async () => {
      const wallet = await WalletClass.watchOnly(address);

      const callback = async () => {
        try {
          const utxos = await wallet.getUtxos();
          const balance = utxos.reduce((acc, utxo) => acc + (utxo.token ? 0 : utxo.satoshis), 0);
          if (tokenId) {
            const tokenBalance = utxos.reduce((acc, utxo) => acc + (utxo.token?.tokenId === tokenId ? Number(utxo.token!.amount) : 0), 0);
            setTokenBalance(tokenBalance);
          }

          setTokenUtxos(tokenId ? utxos.filter(utxo => utxo.token?.tokenId === tokenId) : utxos);
          setUtxos(utxos);
          setBalance(balance);
        } catch {
          setRetries((prev) => prev + 1);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      };

      try {
        (wallet.provider as ElectrumNetworkProvider).subscribeToAddress(address, callback);
      } catch {
        setRetries((prev) => prev + 1);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      };
      cancelWatch = async () => {
        try {
          (wallet.provider as ElectrumNetworkProvider).unsubscribeFromAddress(address, callback);
        } catch {
          setRetries((prev) => prev + 1);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      };
    })();

    return () => {
      cancelWatch?.();
    };
  }, [address, retries, tokenId]);

  return { balance, tokenBalance, utxos, tokenUtxos };
}