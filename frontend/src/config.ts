import { http, createConfig } from 'wagmi'
import {   morphHolesky } from 'wagmi/chains'

export const config = createConfig({
  chains: [  morphHolesky],
  multiInjectedProviderDiscovery: false,

  transports: {
    [morphHolesky.id]: http()
  },
})