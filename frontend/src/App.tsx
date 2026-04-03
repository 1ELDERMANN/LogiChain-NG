/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unused-vars, @typescript-eslint/restrict-plus-operands, @typescript-eslint/no-misused-promises */

import { useCallback, useEffect, useState } from 'react'
import { BrowserProvider, Contract, type TransactionResponse } from 'ethers'
import './App.css'

declare global {
  interface Window {
    ethereum?: any
  }
}

const PICKUP_SCHEDULER_ADDRESS = '0xa0Ac8de1Ddc4b6a8bF79130E8a7B60965515707D'
// const PICKUP_REWARD_TOKEN_ADDRESS = '0xadc95ee2ab07024f3e3268efecbff76b5c1ce9f7'

const PICKUP_SCHEDULER_ABI = [
  'function requestPickup(string pickupLocation, string dropoffLocation, string details, uint256 scheduledAt) external returns (uint256)',
  'function confirmPickup(uint256 pickupId) external',
  'function markInTransit(uint256 pickupId) external',
  'function completePickup(uint256 pickupId) external',
  'function cancelPickup(uint256 pickupId) external',
  'function rateAgent(uint256 pickupId, uint8 rating) external',
  'function getPickupsByUser(address user) external view returns (uint256[])',
  'function getTotalRewardPoints(address user) external view returns (uint256)',
  'function getTopAgentsByPoints(uint256 limit) external view returns (address[], uint256[])',
  'function getTopRatedAgents(uint256 limit) external view returns (address[], uint256[])',
  'function getAgentRatingStats(address agent) external view returns (uint256 totalRating, uint256 ratingCount, uint256 averageRating)',
  'function getCompletedPickupsByAgent(address agent) external view returns (uint256)',
 ]

function App() {
  const [walletAddress, setWalletAddress] = useState<string>('')
  const [schedulerContract, setSchedulerContract] = useState<Contract | null>(null)
  const [status, setStatus] = useState<string>('')

  const [pickupId, setPickupId] = useState<string>('')
  const [pickupLocation, setPickupLocation] = useState<string>('')
  const [dropoffLocation, setDropoffLocation] = useState<string>('')
  const [details, setDetails] = useState<string>('')
  const [scheduledAt, setScheduledAt] = useState<string>('')
  const [rating, setRating] = useState<string>('5')

  const [leaderboard, setLeaderboard] = useState<Array<{agent:string, points:string}>>([])
  const [agentLeaderboard, setAgentLeaderboard] = useState<Array<{agent:string, rating:string}>>([])

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      setStatus('Please install MetaMask.')
      return
    }
    const web3Provider = new BrowserProvider(window.ethereum)
    await web3Provider.send('eth_requestAccounts', [])
    const signer = await web3Provider.getSigner()
    const address = await signer.getAddress()

    const contract = new Contract(PICKUP_SCHEDULER_ADDRESS, PICKUP_SCHEDULER_ABI, signer)

    setWalletAddress(address)
    setSchedulerContract(contract)
    setStatus('Connected: ' + address)
  }, [])

  useEffect(() => {
    if (!walletAddress && window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        if (accounts.length > 0) {
          setWalletAddress(accounts[0])
          setStatus('Account changed to ' + accounts[0])
        } else {
          setWalletAddress('')
          setStatus('Disconnected')
        }
      })
    }
  }, [walletAddress])

  const executeTx = async (fn: () => Promise<TransactionResponse>) => {
    try {
      if (!schedulerContract) {
        setStatus('Wallet not connected')
        return
      }
      setStatus('Sending transaction...')
      const tx = await fn()
      await tx.wait()
      setStatus('Transaction confirmed: ' + tx.hash)
    } catch (error) {
      setStatus('Error: ' + (error as any).message)
    }
  }

  const handleRequestPickup = async () => {
    if (!pickupLocation || !dropoffLocation || !details || !scheduledAt) {
      setStatus('Fill in all fields for pickup request')
      return
    }

    const when = Math.floor(new Date(scheduledAt).getTime() / 1000)
    await executeTx(() => schedulerContract!.requestPickup(pickupLocation, dropoffLocation, details, when))
  }

  const handleConfirmPickup = async () => {
    if (!pickupId) {
      setStatus('Enter pickup ID to confirm')
      return
    }
    await executeTx(() => schedulerContract!.confirmPickup(pickupId))
  }

  const handleMarkInTransit = async () => {
    if (!pickupId) {
      setStatus('Enter pickup ID to mark in transit')
      return
    }
    await executeTx(() => schedulerContract!.markInTransit(pickupId))
  }

  const handleCompletePickup = async () => {
    if (!pickupId) {
      setStatus('Enter pickup ID to complete')
      return
    }
    await executeTx(() => schedulerContract!.completePickup(pickupId))
  }

  const handleRateAgent = async () => {
    if (!pickupId) {
      setStatus('Enter pickup ID to rate')
      return
    }
    const value = Number(rating)
    if (value < 1 || value > 5) {
      setStatus('Rating between 1 and 5')
      return
    }
    await executeTx(() => schedulerContract!.rateAgent(pickupId, value))
  }

  const loadLeaderboard = async () => {
    try {
      if (!schedulerContract) {
        setStatus('Connect wallet first')
        return
      }
      const [agents, points] = await schedulerContract.getTopAgentsByPoints(10)
      const arr1 = agents.map((agent:string, idx:number) => ({ agent, points: points[idx].toString() }))
      setLeaderboard(arr1)

      const [ratedAgents, ratings] = await schedulerContract.getTopRatedAgents(10)
      const arr2 = ratedAgents.map((agent:string, idx:number) => ({ agent, rating: (ratings[idx].toNumber() / 100).toFixed(2) }))
      setAgentLeaderboard(arr2)
      setStatus('Leaderboard loaded')
    } catch (error) {
      setStatus('Error loading leaderboard: ' + (error as any).message)
    }
  }

  return (
    <div className="App">
      <h1>LogiChain-NG Pickup Scheduler</h1>
      <p>{status}</p>
      <button onClick={connectWallet}>{walletAddress ? 'Connected: ' + walletAddress : 'Connect Wallet'}</button>

      <section>
        <h2>Schedule a Pickup</h2>
        <input placeholder="Pickup location" value={pickupLocation} onChange={(e) => setPickupLocation(e.target.value)} />
        <input placeholder="Dropoff location" value={dropoffLocation} onChange={(e) => setDropoffLocation(e.target.value)} />
        <input placeholder="Package details" value={details} onChange={(e) => setDetails(e.target.value)} />
        <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
        <button onClick={handleRequestPickup}>Request Pickup</button>
      </section>

      <section>
        <h2>Agent Actions</h2>
        <input placeholder="Pickup ID" value={pickupId} onChange={(e) => setPickupId(e.target.value)} />
        <button onClick={handleConfirmPickup}>Confirm Pickup</button>
        <button onClick={handleMarkInTransit}>Mark In Transit</button>
        <button onClick={handleCompletePickup}>Complete Pickup</button>
      </section>

      <section>
        <h2>Rate Agent</h2>
        <input placeholder="Rating (1-5)" type="number" value={rating} onChange={(e) => setRating(e.target.value)} />
        <button onClick={handleRateAgent}>Submit Rating</button>
      </section>

      <section>
        <h2>Leaderboard</h2>
        <button onClick={loadLeaderboard}>Load Leaderboard</button>
        <h3>Top Agents by Points</h3>
        <ul>
          {leaderboard.map((item) => (
            <li key={item.agent}>{item.agent}: {item.points} points</li>
          ))}
        </ul>
        <h3>Top Rated Agents</h3>
        <ul>
          {agentLeaderboard.map((item) => (
            <li key={item.agent}>{item.agent}: {item.rating} stars</li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export default App
