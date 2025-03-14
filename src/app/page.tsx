"use client";

import { AirdropTable, defaultData, Payment } from "@/components/AirdropTable";
import { TokenDropdown } from "@/components/TokenDropdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConnectorContext } from "@/contexts/ConnectorContext";
import { useWatchAddress } from "@/hooks/useWatchAddress";
import { addMissingBCMRs, fetchFtTokenHolders, fetchNftTokenHolders, getTokenDecimals, getTokenImage, getTokenLabel, getTokenName } from "@/lib/utils";
import { ChangeEvent, ChangeEventHandler, Dispatch, SetStateAction, useCallback, useEffect, useState } from "react";
import { decodeCashAddress } from "@bitauth/libauth";

export default function Home() {
  const { connect, address, disconnect } = useConnectorContext();
  const [connectedAddress, setConnectedAddress] = useState<string>();
  const [categories, setCategories] = useState<string[]>();
  const { balance, utxos } = useWatchAddress(connectedAddress);
  const [balancesByToken, setBalancesByToken] = useState<Record<string, number>>({});
  const [sourceCategory, setSourceCategory] = useState<string>();
  const [targetCategory, setTargetCategory] = useState<string>();
  const [budget, setBudget] = useState<string>("3000");
  const [showWallet, setShowWallet] = useState<boolean>(false);
  const [data, setData] = useState<Payment[]>(defaultData);
  const [inputAddress, setInputAddress] = useState<string>("");
  const [addressValidationError, setAddressValidationError] = useState<string>("");
  const [inputAmount, setInputAmount] = useState<string>("");
  const [amountValidationError, setAmountValidationError] = useState<string>("");
  const [fullValidationError, setFullValidationError] = useState<string>("");
  const [includeContracts, setIncludeContracts] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      if (utxos) {
        const categories = utxos.map((utxo) => utxo.token?.capability ? undefined : utxo.token?.tokenId).filter((tokenId) => tokenId !== undefined).filter((value, index, array) => array.indexOf(value) === index);
        setCategories(categories);
        await addMissingBCMRs(categories);
        setBalancesByToken(categories.reduce((acc, category) => {
          acc[category] = utxos.filter((utxo) => utxo.token?.tokenId === category).reduce((acc, utxo) => acc + Number(utxo.token?.amount), 0);
          return acc;
        }, {} as Record<string, number>));
      }
    })();
  }, [balance, utxos]);

  useEffect(() => {
    (async () => {
      if (address) {
        const addr = await address();
        setConnectedAddress(addr);
      }
    })();
  }, [address]);

  const disconnectWallet = useCallback(async () => {
    setConnectedAddress(undefined);
    setCategories(undefined);
    await disconnect();
  }, []);

  const onBudgetValueChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setBudget(event.target.value);

    if (!sourceCategory) {
      return;
    }

    const decimals = getTokenDecimals(sourceCategory);
    const amount = Number(event.target.value) * 10**decimals;

    if (amount < 0) {
      setBudget("0");
      return;
    }

    if (amount > balancesByToken[sourceCategory]) {
      setBudget(String((balancesByToken[sourceCategory] / 10**decimals).toFixed(decimals)));
      return;
    }
  }, [sourceCategory]);

  const onSourceCategoryChange = useCallback((value: string) => {
    setBudget("");
    setSourceCategory(value);
  }, []);

  const onTargetCategoryChange = useCallback((value: string) => {
    setTargetCategory(value);
  }, []);

  const onMaxClick = useCallback(() => {
    if (!sourceCategory) {
      return;
    }

    const decimals = getTokenDecimals(sourceCategory);
    setBudget(String((balancesByToken[sourceCategory] / 10**decimals).toFixed(decimals)));
  }, [sourceCategory, balancesByToken]);

  const onAddressChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setInputAddress(event.target.value);

    const result = decodeCashAddress(event.target.value);
    if (typeof result === "string") {
      setAddressValidationError("Invalid address");
      return;
    }

    setAddressValidationError("");
  }, []);

  const onAmountChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setInputAmount(event.target.value);

    const value = parseFloat(event.target.value);

    if (isNaN(value)) {
      setAmountValidationError("Invalid amount");
      return;
    }

    if (value < 0) {
      setAmountValidationError("Amount must be positive");
      return;
    }

    const available = parseFloat(budget);
    const currentTotal = data.reduce((acc, payment) => acc + payment.amount, 0);
    if (currentTotal + value > available) {
      setAmountValidationError("Amount exceeds budget");
      return;
    }

    setAmountValidationError("");
  }, []);

  const onAddButtonClick = useCallback(() => {
    setData((prev) => [{ id: data.length.toString(), amount: parseFloat(inputAmount), address: inputAddress }, ...prev]);
    setInputAddress("");
    setInputAmount("");
    setAddressValidationError("");
    setAmountValidationError("");
  }, [inputAddress, inputAmount]);

  const setDataWithValidation: Dispatch<SetStateAction<Payment[]>> = (value) => {
    setFullValidationError("");

    const validateData = (data: Payment[]) => {
      const available = parseFloat(budget);
      const currentTotal = data.reduce((acc, payment) => acc + payment.amount, 0);
      if (currentTotal > available) {
        setFullValidationError("Total amount exceeds budget");
      }
      return data;
    }

    if (typeof value === "function") {
      setData((prev) => {
        return validateData(value(prev));
      });
    } else {
      setData(validateData(value));
    }
  };

  const onLoadFtHoldersFromChaingraphClick = useCallback(async () => {
    if (!targetCategory) {
      return;
    }

    let tokenHolders = await fetchFtTokenHolders(targetCategory);
    if (!includeContracts) {
      tokenHolders = tokenHolders.filter((holder) => holder.address.includes(":p") === false);
    }
    setData((prev) => [...prev, ...tokenHolders.map((holder, index) => ({ id: (data.length + index).toString(), amount: holder.amount, address: holder.address }))]);
  }, [targetCategory, includeContracts]);

  const onLoadNftHoldersFromChaingraphClick = useCallback(async () => {
    if (!targetCategory) {
      return;
    }

    let tokenHolders = await fetchNftTokenHolders(targetCategory);
    if (!includeContracts) {
      tokenHolders = tokenHolders.filter((holder) => holder.address.includes(":p") === false);
    }
    setData((prev) => [...prev, ...tokenHolders.map((holder, index) => ({ id: (data.length + index).toString(), amount: holder.amount, address: holder.address }))]);
  }, [targetCategory, includeContracts]);

  return (
    <div>
      {!connectedAddress && <Button onClick={() => connect("WalletConnectV2")}>Connect</Button>}
      {connectedAddress && <Button onClick={disconnectWallet}>Disconnect</Button>}
      {connectedAddress && <p>Connected Address: {connectedAddress}</p>}
      {balance && <p>Balance: {balance/1e8} BCH</p>}
      {categories && <p className="underline decoration-dashed" onClick={() => setShowWallet(!showWallet)}>Categories: {categories.length}</p>}
      {showWallet && categories?.map((category) => (
          <div key={category} className="mt-3">
            <div className="flex flex-row gap-2">
              <img className="rounded-full" src={getTokenImage(category)} width={72} height={72}  />
              <div className="flex flex-col">
                <div>{getTokenName(category)}</div>
                <div className="flex flex-col gap">
                  <div className="flex flex-row gap-3">
                    <div>{(balancesByToken[category] / (10**getTokenDecimals(category))).toFixed(getTokenDecimals(category))}</div>
                    <div>${getTokenLabel(category)}</div>
                  </div>
                  <div>{category.slice(0, 10)}...</div>
                </div>
              </div>
            </div>
          </div>
        ))
      }
      {utxos && <div>
        <Card className="w-[350px]">
          <CardContent className="">
            <Label htmlFor="sourceToken" className="mb-1">Token to disperse</Label>
            <TokenDropdown categories={categories} balancesByToken={balancesByToken} onSelect={onSourceCategoryChange} />

            {sourceCategory &&
            <>
              <div className="flex flex-row gap-1 mt-1">
                <div>{(balancesByToken[sourceCategory] / (10**getTokenDecimals(sourceCategory))).toFixed(getTokenDecimals(sourceCategory))}</div>
                <div>${getTokenLabel(sourceCategory)}</div>
                <div>available</div>
              </div>
              <Label htmlFor="name" className="mt-4 mb-1">Airdrop budget</Label>
              <div className="flex flex-row gap-2">
                <div className="flex flex-1">
                  <Input type="number" min="0" id="name" placeholder="0" className="" value={budget} onChange={onBudgetValueChange} />
                </div>
                <div className="flex flex-0">
                  <Button onClick={onMaxClick}>Max</Button>
                </div>
              </div>
            </>}

            <Label className="mt-4 mb-1">Target token for aidrdop</Label>
            <TokenDropdown categories={categories} balancesByToken={balancesByToken} onSelect={onTargetCategoryChange} allowCustom />
          </CardContent>
        </Card>
      </div>}
      <div className="mx-10">
        <div className="flex flex-row gap-2">
          <div className="flex flex-col">
            <Input
              className="font-medium text-sm"
              value={inputAddress}
              onChange={onAddressChange}
              placeholder="Address"
            />
            {addressValidationError && <div className="text-red-400">{addressValidationError}</div>}
          </div>
          <div className="flex flex-col">
            <Input
              className="text-right font-medium text-sm"
              value={inputAmount}
              onChange={onAmountChange}
              placeholder="Amount"
            />
            {amountValidationError && <div className="text-red-400">{amountValidationError}</div>}
          </div>
          <Button onClick={() => onAddButtonClick()} disabled={addressValidationError.length > 0 || amountValidationError.length > 0 || inputAddress.length === 0 || inputAmount.length === 0}>
            Add
          </Button>
        </div>
        {fullValidationError && <div className="text-red-400">{fullValidationError}</div>}

        <Button onClick={() => onLoadFtHoldersFromChaingraphClick()}>
          Get FT holders
        </Button>

        <Button onClick={() => onLoadNftHoldersFromChaingraphClick()}>
          Get NFT holders
        </Button>

        <AirdropTable data={data} setData={setDataWithValidation} />
      </div>
    </div>
  );
}
