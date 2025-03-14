import { lockingBytecodeToCashAddress, Transaction } from "@bitauth/libauth";
import { clsx, type ClassValue } from "clsx"
import { BCMR, AuthChainElement, hexToBin } from "mainnet-js";
import { twMerge } from "tailwind-merge"
// @ts-ignore
import { default as blockies } from "blockies";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const isActivated = true;

export const getFulcrum = () => {
  return globalThis.localStorage?.getItem("fulcrum") || (isActivated ? "electrum.imaginary.cash:50004" : "chipnet.bch.ninja:50004");
}

const queried: string[] = [];

const cacheTime = 1000 * 60 * 60 * 24; // 1 day

export const addMissingBCMRs = async (categories: string[]) => {
  const now = Date.now();
  categories = categories.filter(category => {
    if (queried.includes(category)) {
      return false;
    }

    const last = Number(localStorage.getItem(`nonBcmrCategory-${category}`) || "0");
    if ((now - last) < cacheTime) {
      return false;
    }

    const { registry: existing, timestamp } = JSON.parse(localStorage.getItem(`bcmr-${category}`) || `{ "registry": {}, "timestamp": 0 }`);
    if (Object.keys(existing).length && ((now - timestamp) < cacheTime)) {
      BCMR.addMetadataRegistry(existing);
      return false;
    }

    return true;
  });

  if (!categories.length) {
    return;
  }
  queried.push(...categories);

  const chunkArrayInGroups = (arr: Array<string>, size: number) => {
    var myArray: string[][] = [];
    for(var i = 0; i < arr.length; i += size) {
      myArray.push(arr.slice(i, i+size));
    }
    return myArray;
  }

  await Promise.all(chunkArrayInGroups(categories, 6).map(group => addMissingBCMRsInternal(group)));
}

export const addMissingBCMRsInternal = async (categories: string[]) => {
  if (!categories.length) {
    return;
  }

  const transformed = `[${categories.map(category => `"\\\\x${category}"`).join(",")}]`;
  const query = /* graphql */ `
{
  transaction(
    where: {
      hash:{_in: ${transformed}},
    }
  ) {
    hash
    authchains {
      authchain_length
      migrations(
        where: {
          transaction: {
            outputs: { locking_bytecode_pattern: { _like: "6a04%" } }
          }
        },
        order_by: { migration_index: desc }
        limit: 3
      ) {
        transaction {
          hash
          inputs(where:{ outpoint_index: { _eq:"0" } }){
            outpoint_index
          }
          outputs(where: { locking_bytecode_pattern: { _like: "6a04%" } }) {
            output_index
            locking_bytecode
          }
        }
      }
    }
  }
}`

  let jsonResponse: any = {};
  try {
    const response = await fetch("https://gql.chaingraph.pat.mn/v1/graphql", {
    // const response = await fetch("https://demo.chaingraph.cash/v1/graphql", {
      body: JSON.stringify({
        operationName: null,
        variables: {},
        query: query
      }),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      method: "POST",
    });

    const textResponse = await response.text();

    jsonResponse = JSON.parse(textResponse.replaceAll("\\\\x", ""));
  } catch {}

  const result: Array<[string, AuthChainElement]> = [];
  for (const tx of jsonResponse.data?.transaction ?? []) {
    const migrations = tx.authchains?.[0]?.migrations;

    const category = tx.hash.replace("\\x", "");

    if (!migrations) {
      continue;
    }

    let found = false;
    for (const migration of migrations) {
      const transaction = migration.transaction[0];
      if (!transaction) {
        continue;
      }
      transaction.inputs.forEach(
        (input: any) => (input.outpointIndex = Number(input.outpoint_index))
      );
      transaction.outputs.forEach((output: any) => {
        output.outputIndex = Number(output.output_index);
        output.lockingBytecode = hexToBin(
          output.locking_bytecode.replace("\\x", "")
        );
      });
      const txHash = transaction.hash.replace("\\x", "");

      const element = BCMR.makeAuthChainElement(transaction as Transaction, txHash);
      if (element.uris.length) {
        result.push([category, element]);
        found = true;
        break;
      }
    }

    if (!found) {
      localStorage.setItem(`nonBcmrCategory-${category}`, String(Date.now()));
    }
  };

  await Promise.all(result.map(async ([category, element]) => {
    try {
      const { registry: existing, timestamp } = JSON.parse(localStorage.getItem(`bcmr-${category}`) || `{ "registry": {}, "timestamp": 0 }`);
      if (Object.keys(existing).length) {
        BCMR.addMetadataRegistry(existing);
      }
      if (Date.now() - timestamp > cacheTime) {
        const fetched = await BCMR.fetchMetadataRegistry(element.httpsUrl.replace("https://ipfs://", "https://dweb.link/ipfs/"));
        localStorage.setItem(`bcmr-${category}`, JSON.stringify( { timestamp: Date.now(), registry: fetched }));
        BCMR.addMetadataRegistry(fetched);
      }
    } catch (e) {
      // failed to fetch, add to ignore list for next 5 minutes
      localStorage.setItem(`nonBcmrCategory-${category}`, String(Date.now()));;
    }
  }));
}


export const getTokenLabel = (tokenId: string) => {
  const bcmr = BCMR.getTokenInfo(tokenId);
  let label = bcmr?.token?.symbol;
  if (!label) {
    label = "CT-" + tokenId.slice(0, 8);
  }

  return label;
}

export const getTokenDecimals = (tokenId: string) => {
  const bcmr = BCMR.getTokenInfo(tokenId);
  return bcmr?.token?.decimals || 0;
}

export const getTokenName = (tokenId: string, commitment?: string) => {
  const bcmr = BCMR.getTokenInfo(tokenId);
  let label = bcmr?.token?.nfts?.parse?.types?.[commitment ?? ""]?.name || bcmr?.name
  if (!label) {
    label = "CT-" + tokenId.slice(0, 8);
  }

  return label;
}

export const getTokenAmount = (tokenId: string, rawAmount: number) => {
  const bcmr = BCMR.getTokenInfo(tokenId);
  const decimals = bcmr?.token?.decimals || 0;

  return rawAmount / (10 ** decimals);
}


export const getTokenImage = (tokenId: string): string => {
  const bcmr = BCMR.getTokenInfo(tokenId);
  const asset = bcmr?.uris?.asset;
  const icon = bcmr?.uris?.icon;

  if (asset) {
    return convertIpfsLink(asset)!;
  }

  if (icon) {
    return convertIpfsLink(icon)!;
  }

  return blockies({ seed: tokenId, size: 12, scale: 4, spotcolor: '#000'}).toDataURL()
}

export const convertIpfsLink = (uri: string | undefined, preferredGateway?: string): string | undefined => {
  if (uri?.indexOf("ipfs://") === 0) {
    const gateway = preferredGateway ?? getGateway();
    return `https://${gateway}/ipfs/${uri.replace("ipfs://", "")}`
  }

  return uri;
}

export const getGateway = () => {
  return globalThis.localStorage?.getItem("ipfs_gateway") || "w3s.link";
}

export const ftHoldersQuery = (tokenId: string) => `{
  output(
    where: {
      token_category: { _eq: "\\\\x${tokenId}" }
      fungible_token_amount: {_gt: 0}
      _not: { spent_by: {} }
    }
    order_by: { fungible_token_amount: desc }
  ) {
    locking_bytecode
    fungible_token_amount
  }
}`;

export const fetchFtTokenHolders = async (tokenId: string) => {
  let jsonResponse: { data?: { output?: [{locking_bytecode: string, fungible_token_amount: string}] } } = {};
  try {
    const response = await fetch("https://gql.chaingraph.pat.mn/v1/graphql", {
      body: JSON.stringify({
        operationName: null,
        variables: {},
        query: ftHoldersQuery(tokenId),
      }),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      method: "POST",
    });

    const textResponse = await response.text();

    jsonResponse = JSON.parse(textResponse.replaceAll("\\\\x", ""));
  } catch {}

  const result = (jsonResponse?.data?.output || []).map((holder: {locking_bytecode: string, fungible_token_amount: string}) => ({
    address: (lockingBytecodeToCashAddress(hexToBin(holder.locking_bytecode), isActivated ? "bitcoincash" : "bchtest") as string),
    amount: BigInt(holder.fungible_token_amount)
  })).reduce((acc: {address: string, amount: bigint}[], holder) => {
    const existingHolder = acc.find(h => h.address === holder.address);
    if (existingHolder) {
      existingHolder.amount += holder.amount;
    } else {
      acc.push(holder);
    }
    return acc;
  }, []).sort((a, b) => Number(b.amount) - Number(a.amount)).map((holder) => ({
    address: holder.address,
    amount: Number(holder.amount)
  }));
  return result;
}

export const nftHoldersQuery = (tokenId: string) => `{
  output(
    where: {
      token_category: { _eq: "\\\\x${tokenId}" }
      fungible_token_amount: {_eq: 0}
      nonfungible_token_capability: {_is_null: false}
      _not: { spent_by: {} }
    }
    order_by: { fungible_token_amount: desc }
  ) {
    locking_bytecode
  }
}`;

export const fetchNftTokenHolders = async (tokenId: string) => {
  let jsonResponse: { data?: { output?: [{locking_bytecode: string, fungible_token_amount: string}] } } = {};
  try {
    const response = await fetch("https://gql.chaingraph.pat.mn/v1/graphql", {
      body: JSON.stringify({
        operationName: null,
        variables: {},
        query: nftHoldersQuery(tokenId),
      }),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      method: "POST",
    });

    const textResponse = await response.text();

    jsonResponse = JSON.parse(textResponse.replaceAll("\\\\x", ""));
  } catch {}

  const result = (jsonResponse?.data?.output || []).map((holder: {locking_bytecode: string, fungible_token_amount: string}) => ({
    address: (lockingBytecodeToCashAddress(hexToBin(holder.locking_bytecode), isActivated ? "bitcoincash" : "bchtest") as string),
    amount: 1
  })).reduce((acc: {address: string, amount: number}[], holder) => {
    const existingHolder = acc.find(h => h.address === holder.address);
    if (existingHolder) {
      existingHolder.amount += 1;
    } else {
      acc.push(holder);
    }
    return acc;
  }, []).sort((a, b) => Number(b.amount) - Number(a.amount)).map((holder) => ({
    address: holder.address,
    amount: Number(holder.amount)
  }));
  return result;
}
