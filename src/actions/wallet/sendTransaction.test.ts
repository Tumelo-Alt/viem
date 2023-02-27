import { describe, expect, test } from 'vitest'

import { accounts, publicClient, testClient, walletClient } from '../../_test'
import { celo, defineChain, localhost, optimism } from '../../chains'
import { hexToNumber, numberToHex, parseEther, parseGwei } from '../../utils'
import { getBalance, getBlock } from '..'
import { mine, setBalance, setNextBlockBaseFeePerGas } from '../test'

import { sendTransaction } from './sendTransaction'
import { anvilChain } from '../../_test/utils'

const sourceAccount = accounts[0]
const targetAccount = accounts[1]

async function setup() {
  await setBalance(testClient, {
    address: sourceAccount.address,
    value: sourceAccount.balance,
  })
  await setBalance(testClient, {
    address: targetAccount.address,
    value: targetAccount.balance,
  })
  await setNextBlockBaseFeePerGas(testClient, {
    baseFeePerGas: parseGwei('10'),
  })
  await mine(testClient, { blocks: 1 })
}

test('sends transaction', async () => {
  await setup()

  expect(
    await sendTransaction(walletClient, {
      from: sourceAccount.address,
      to: targetAccount.address,
      value: parseEther('1'),
    }),
  ).toBeDefined()

  expect(
    await getBalance(publicClient, { address: targetAccount.address }),
  ).toMatchInlineSnapshot('10000000000000000000000n')
  expect(
    await getBalance(publicClient, { address: sourceAccount.address }),
  ).toMatchInlineSnapshot('10000000000000000000000n')

  await mine(testClient, { blocks: 1 })

  expect(
    await getBalance(publicClient, { address: targetAccount.address }),
  ).toMatchInlineSnapshot('10001000000000000000000n')
  expect(
    await getBalance(publicClient, { address: sourceAccount.address }),
  ).toBeLessThan(sourceAccount.balance)
})

test('sends transaction (w/ formatter)', async () => {
  await setup()

  const chain = defineChain({
    ...localhost,
    id: 1,
    formatters: {
      transactionRequest: celo.formatters.transactionRequest,
    },
  })

  expect(
    await sendTransaction(walletClient, {
      chain,
      from: sourceAccount.address,
      to: targetAccount.address,
      value: parseEther('1'),
    }),
  ).toBeDefined()

  expect(
    await getBalance(publicClient, { address: targetAccount.address }),
  ).toMatchInlineSnapshot('10000000000000000000000n')
  expect(
    await getBalance(publicClient, { address: sourceAccount.address }),
  ).toMatchInlineSnapshot('10000000000000000000000n')

  await mine(testClient, { blocks: 1 })

  expect(
    await getBalance(publicClient, { address: targetAccount.address }),
  ).toMatchInlineSnapshot('10001000000000000000000n')
  expect(
    await getBalance(publicClient, { address: sourceAccount.address }),
  ).toBeLessThan(sourceAccount.balance)
})

// TODO: This test is flaky. Need to figure out how to mitigate.
test.skip('sends transaction w/ no value', async () => {
  await setup()

  expect(
    await sendTransaction(walletClient, {
      from: sourceAccount.address,
      to: targetAccount.address,
    }),
  ).toBeDefined()

  expect(
    await getBalance(publicClient, { address: targetAccount.address }),
  ).toMatchInlineSnapshot('10000000000000000000000n')
  expect(
    await getBalance(publicClient, { address: sourceAccount.address }),
  ).toMatchInlineSnapshot('10000000000000000000000n')

  await mine(testClient, { blocks: 1 })

  expect(
    await getBalance(publicClient, { address: targetAccount.address }),
  ).toMatchInlineSnapshot('10000000000000000000000n')
  expect(
    await getBalance(publicClient, { address: sourceAccount.address }),
  ).toBeLessThan(sourceAccount.balance)
})

describe('args: gas', () => {
  test('sends transaction', async () => {
    await setup()

    expect(
      await sendTransaction(walletClient, {
        from: sourceAccount.address,
        to: targetAccount.address,
        value: parseEther('1'),
        gas: 1_000_000n,
      }),
    ).toBeDefined()

    expect(
      await getBalance(publicClient, { address: targetAccount.address }),
    ).toMatchInlineSnapshot('10000000000000000000000n')
    expect(
      await getBalance(publicClient, { address: sourceAccount.address }),
    ).toMatchInlineSnapshot('10000000000000000000000n')

    await mine(testClient, { blocks: 1 })

    expect(
      await getBalance(publicClient, { address: targetAccount.address }),
    ).toMatchInlineSnapshot('10001000000000000000000n')
    expect(
      await getBalance(publicClient, { address: sourceAccount.address }),
    ).toBeLessThan(sourceAccount.balance)
  })
})

describe('args: gasPrice', () => {
  test('sends transaction', async () => {
    await setup()

    const block = await getBlock(publicClient)

    expect(
      await sendTransaction(walletClient, {
        from: sourceAccount.address,
        to: targetAccount.address,
        value: parseEther('1'),
        gasPrice: BigInt(block.baseFeePerGas ?? 0),
      }),
    ).toBeDefined()

    expect(
      await getBalance(publicClient, { address: targetAccount.address }),
    ).toMatchInlineSnapshot('10000000000000000000000n')
    expect(
      await getBalance(publicClient, { address: sourceAccount.address }),
    ).toMatchInlineSnapshot('10000000000000000000000n')

    await mine(testClient, { blocks: 1 })

    expect(
      await getBalance(publicClient, { address: targetAccount.address }),
    ).toMatchInlineSnapshot('10001000000000000000000n')
    expect(
      await getBalance(publicClient, { address: sourceAccount.address }),
    ).toBeLessThan(sourceAccount.balance)
  })

  test('errors when account has insufficient funds', async () => {
    await setup()

    const block = await getBlock(publicClient)

    await expect(() =>
      sendTransaction(walletClient, {
        from: sourceAccount.address,
        to: targetAccount.address,
        value: parseEther('1'),
        gasPrice: BigInt(block.baseFeePerGas ?? 0) + parseEther('10000'),
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `
      "The total cost (gas * gas fee + value) of executing this transaction exceeds the balance of the account.

      This error could arise when the account does not have enough funds to:
       - pay for the total gas fee,
       - pay for the value to send.
       
      The cost of the transaction is calculated as \`gas * gas fee + value\`, where:
       - \`gas\` is the amount of gas needed for transaction to execute,
       - \`gas fee\` is the gas fee,
       - \`value\` is the amount of ether to send to the recipient.
       
      Request Arguments:
        from:      0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
        to:        0x70997970c51812dc3a010c7d01b50e0d17dc79c8
        value:     1 ETH
        gasPrice:  10000000000010 gwei

      Details: Insufficient funds for gas * price + value
      Version: viem@1.0.2"
    `,
    )
  })
})

describe('args: maxFeePerGas', () => {
  test('sends transaction', async () => {
    await setup()

    const block = await getBlock(publicClient)

    expect(
      await sendTransaction(walletClient, {
        from: sourceAccount.address,
        to: targetAccount.address,
        value: parseEther('1'),
        maxFeePerGas: BigInt(block.baseFeePerGas ?? 0),
      }),
    ).toBeDefined()

    expect(
      await getBalance(publicClient, { address: targetAccount.address }),
    ).toMatchInlineSnapshot('10000000000000000000000n')
    expect(
      await getBalance(publicClient, { address: sourceAccount.address }),
    ).toMatchInlineSnapshot('10000000000000000000000n')

    await mine(testClient, { blocks: 1 })

    expect(
      await getBalance(publicClient, { address: targetAccount.address }),
    ).toMatchInlineSnapshot('10001000000000000000000n')
    expect(
      await getBalance(publicClient, { address: sourceAccount.address }),
    ).toBeLessThan(sourceAccount.balance)
  })

  test('errors when account has insufficient funds', async () => {
    await setup()

    const block = await getBlock(publicClient)

    await expect(() =>
      sendTransaction(walletClient, {
        from: sourceAccount.address,
        to: targetAccount.address,
        value: parseEther('1'),
        maxFeePerGas: BigInt(block.baseFeePerGas ?? 0) + parseEther('10000'),
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `
      "The total cost (gas * gas fee + value) of executing this transaction exceeds the balance of the account.

      This error could arise when the account does not have enough funds to:
       - pay for the total gas fee,
       - pay for the value to send.
       
      The cost of the transaction is calculated as \`gas * gas fee + value\`, where:
       - \`gas\` is the amount of gas needed for transaction to execute,
       - \`gas fee\` is the gas fee,
       - \`value\` is the amount of ether to send to the recipient.
       
      Request Arguments:
        from:          0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
        to:            0x70997970c51812dc3a010c7d01b50e0d17dc79c8
        value:         1 ETH
        maxFeePerGas:  10000000000010 gwei

      Details: Insufficient funds for gas * price + value
      Version: viem@1.0.2"
    `,
    )
  })
})

describe('args: maxPriorityFeePerGas', () => {
  test('sends transaction', async () => {
    await setup()

    expect(
      await sendTransaction(walletClient, {
        from: sourceAccount.address,
        to: targetAccount.address,
        value: parseEther('1'),
        maxPriorityFeePerGas: parseGwei('1'),
      }),
    ).toBeDefined()

    expect(
      await getBalance(publicClient, { address: targetAccount.address }),
    ).toMatchInlineSnapshot('10000000000000000000000n')
    expect(
      await getBalance(publicClient, { address: sourceAccount.address }),
    ).toMatchInlineSnapshot('10000000000000000000000n')

    await mine(testClient, { blocks: 1 })

    expect(
      await getBalance(publicClient, { address: targetAccount.address }),
    ).toMatchInlineSnapshot('10001000000000000000000n')
    expect(
      await getBalance(publicClient, { address: sourceAccount.address }),
    ).toBeLessThan(sourceAccount.balance)
  })

  test('maxPriorityFeePerGas + maxFeePerGas: sends transaction', async () => {
    await setup()

    const block = await getBlock(publicClient)

    expect(
      await sendTransaction(walletClient, {
        from: sourceAccount.address,
        to: targetAccount.address,
        value: parseEther('1'),
        maxPriorityFeePerGas: parseGwei('10'),
        maxFeePerGas: BigInt(block.baseFeePerGas ?? 0) + parseGwei('10'),
      }),
    ).toBeDefined()

    expect(
      await getBalance(publicClient, { address: targetAccount.address }),
    ).toMatchInlineSnapshot('10000000000000000000000n')
    expect(
      await getBalance(publicClient, { address: sourceAccount.address }),
    ).toMatchInlineSnapshot('10000000000000000000000n')

    await mine(testClient, { blocks: 1 })

    expect(
      await getBalance(publicClient, { address: targetAccount.address }),
    ).toMatchInlineSnapshot('10001000000000000000000n')
    expect(
      await getBalance(publicClient, { address: sourceAccount.address }),
    ).toBeLessThan(sourceAccount.balance)
  })
})

describe('args: nonce', () => {
  test('sends transaction', async () => {
    await setup()

    const transactionCount = (await publicClient.request({
      method: 'eth_getTransactionCount',
      params: [sourceAccount.address, 'latest'],
    }))!

    expect(
      await sendTransaction(walletClient, {
        from: sourceAccount.address,
        to: targetAccount.address,
        value: parseEther('1'),
        nonce: hexToNumber(transactionCount),
      }),
    ).toBeDefined()

    expect(
      await getBalance(publicClient, { address: targetAccount.address }),
    ).toMatchInlineSnapshot('10000000000000000000000n')
    expect(
      await getBalance(publicClient, { address: sourceAccount.address }),
    ).toMatchInlineSnapshot('10000000000000000000000n')

    await mine(testClient, { blocks: 1 })

    expect(
      await getBalance(publicClient, { address: targetAccount.address }),
    ).toMatchInlineSnapshot('10001000000000000000000n')
    expect(
      await getBalance(publicClient, { address: sourceAccount.address }),
    ).toBeLessThan(sourceAccount.balance)
  })
})

describe('args: chain', async () => {
  test('default', async () => {
    expect(
      await sendTransaction(walletClient, {
        chain: anvilChain,
        from: sourceAccount.address,
        to: targetAccount.address,
        value: parseEther('1'),
      }),
    ).toBeDefined
  })

  test('args: assertChain', async () => {
    expect(
      await sendTransaction(walletClient, {
        assertChain: false,
        chain: optimism,
        from: sourceAccount.address,
        to: targetAccount.address,
        value: parseEther('1'),
      }),
    ).toBeDefined
  })

  test('chain mismatch', async () => {
    await expect(() =>
      sendTransaction(walletClient, {
        chain: optimism,
        from: sourceAccount.address,
        to: targetAccount.address,
        value: parseEther('1'),
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(`
      "The current chain (id: 1) does not match the chain passed to the request (id: 10 – Optimism).

      Current Chain ID:  1
      Expected Chain ID: 10 – Optimism
       
      Request Arguments:
        chain:  Optimism (id: 10)
        from:   0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
        to:     0x70997970c51812dc3a010c7d01b50e0d17dc79c8
        value:  1 ETH

      Version: viem@1.0.2"
    `)
  })
})

describe('errors', () => {
  test('fee cap too high', async () => {
    await setup()

    await expect(() =>
      sendTransaction(walletClient, {
        from: sourceAccount.address,
        to: targetAccount.address,
        value: parseEther('1'),
        maxFeePerGas: 2n ** 256n - 1n + 1n,
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(`
      "The fee cap (\`maxFeePerGas\` = 115792089237316195423570985008687907853269984665640564039457584007913.129639936 gwei) cannot be higher than the maximum allowed value (2^256-1).

      Request Arguments:
        from:          0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
        to:            0x70997970c51812dc3a010c7d01b50e0d17dc79c8
        value:         1 ETH
        maxFeePerGas:  115792089237316195423570985008687907853269984665640564039457584007913.129639936 gwei

      Version: viem@1.0.2"
    `)
  })

  test('gas too low', async () => {
    await setup()

    await expect(() =>
      sendTransaction(walletClient, {
        from: sourceAccount.address,
        to: targetAccount.address,
        value: parseEther('1'),
        gas: 100n,
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(`
      "The amount of gas (100) provided for the transaction is too low.

      Request Arguments:
        from:   0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
        to:     0x70997970c51812dc3a010c7d01b50e0d17dc79c8
        value:  1 ETH
        gas:    100

      Details: intrinsic gas too low
      Version: viem@1.0.2"
    `)
  })

  test('gas too high', async () => {
    await setup()

    await expect(() =>
      sendTransaction(walletClient, {
        from: sourceAccount.address,
        to: targetAccount.address,
        value: parseEther('1'),
        gas: 100_000_000n,
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(`
      "The amount of gas (100000000) provided for the transaction exceeds the limit allowed for the block.

      Request Arguments:
        from:   0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
        to:     0x70997970c51812dc3a010c7d01b50e0d17dc79c8
        value:  1 ETH
        gas:    100000000

      Details: intrinsic gas too high
      Version: viem@1.0.2"
    `)
  })

  test('gas fee is less than block base fee', async () => {
    await setup()

    await expect(() =>
      sendTransaction(walletClient, {
        from: sourceAccount.address,
        to: targetAccount.address,
        value: parseEther('1'),
        maxFeePerGas: 1n,
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `
      "The fee cap (\`maxFeePerGas\` = 0.000000001 gwei) cannot be lower than the block base fee.

      Request Arguments:
        from:          0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
        to:            0x70997970c51812dc3a010c7d01b50e0d17dc79c8
        value:         1 ETH
        maxFeePerGas:  0.000000001 gwei

      Details: max fee per gas less than block base fee
      Version: viem@1.0.2"
    `,
    )
  })

  test('nonce too low', async () => {
    await expect(() =>
      sendTransaction(walletClient, {
        from: sourceAccount.address,
        to: targetAccount.address,
        value: parseEther('1'),
        nonce: 1,
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(`
      "Nonce provided for the transaction (1) is lower than the current nonce of the account.
      Try increasing the nonce or find the latest nonce with \`getTransactionCount\`.

      Request Arguments:
        from:   0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
        to:     0x70997970c51812dc3a010c7d01b50e0d17dc79c8
        value:  1 ETH
        nonce:  1

      Details: nonce too low
      Version: viem@1.0.2"
    `)
  })

  test('insufficient funds', async () => {
    await setup()

    await expect(() =>
      sendTransaction(walletClient, {
        from: sourceAccount.address,
        to: targetAccount.address,
        value: parseEther('100000'),
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(`
      "The total cost (gas * gas fee + value) of executing this transaction exceeds the balance of the account.

      This error could arise when the account does not have enough funds to:
       - pay for the total gas fee,
       - pay for the value to send.
       
      The cost of the transaction is calculated as \`gas * gas fee + value\`, where:
       - \`gas\` is the amount of gas needed for transaction to execute,
       - \`gas fee\` is the gas fee,
       - \`value\` is the amount of ether to send to the recipient.
       
      Request Arguments:
        from:   0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
        to:     0x70997970c51812dc3a010c7d01b50e0d17dc79c8
        value:  100000 ETH

      Details: Insufficient funds for gas * price + value
      Version: viem@1.0.2"
    `)
  })

  test('tip higher than fee cap', async () => {
    await expect(() =>
      sendTransaction(walletClient, {
        from: sourceAccount.address,
        to: targetAccount.address,
        value: parseEther('1'),
        maxPriorityFeePerGas: parseGwei('11'),
        maxFeePerGas: parseGwei('10'),
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `
      "The provided tip (\`maxPriorityFeePerGas\` = 11 gwei) cannot be higher than the fee cap (\`maxFeePerGas\` = 10 gwei).

      Request Arguments:
        from:                  0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
        to:                    0x70997970c51812dc3a010c7d01b50e0d17dc79c8
        value:                 1 ETH
        maxFeePerGas:          10 gwei
        maxPriorityFeePerGas:  11 gwei

      Version: viem@1.0.2"
    `,
    )
  })
})
