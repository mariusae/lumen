import { useAtomValue, useSetAtom } from "jotai"
import { selectAtom } from "jotai/utils"
import React from "react"
import {
  githubRepoAtom,
  githubUserAtom,
  globalStateMachineAtom,
  isRepoClonedAtom,
} from "../global-state"
import { RemoteSyncPoller } from "../utils/remote-sync-poller"

const isSyncingAtom = selectAtom(
  globalStateMachineAtom,
  (state) =>
    state.matches("signedIn.cloned.sync.pulling") ||
    state.matches("signedIn.cloned.sync.pushing") ||
    state.matches("signedIn.cloned.sync.checkingStatus"),
)

/**
 * Polls the GitHub API to detect remote pushes and triggers a sync
 * when the remote branch has new commits.
 *
 * Pauses automatically when:
 * - The tab is hidden (saves API requests)
 * - A sync operation is in progress (avoids detecting own push)
 */
export function useRemoteSyncPoller() {
  const githubUser = useAtomValue(githubUserAtom)
  const githubRepo = useAtomValue(githubRepoAtom)
  const isRepoCloned = useAtomValue(isRepoClonedAtom)
  const isSyncing = useAtomValue(isSyncingAtom)
  const send = useSetAtom(globalStateMachineAtom)
  const pollerRef = React.useRef<RemoteSyncPoller | null>(null)

  // Create and manage the poller lifecycle
  React.useEffect(() => {
    if (!isRepoCloned || !githubUser || !githubRepo) return

    const poller = new RemoteSyncPoller()
    pollerRef.current = poller

    poller.start({
      owner: githubRepo.owner,
      name: githubRepo.name,
      token: githubUser.token,
      onRemoteChange: () => {
        console.debug("[useRemoteSyncPoller] Remote change detected, triggering sync")
        send("SYNC")
      },
    })

    return () => {
      poller.stop()
      pollerRef.current = null
    }
  }, [isRepoCloned, githubUser, githubRepo, send])

  // Pause/resume based on sync state
  React.useEffect(() => {
    if (!pollerRef.current) return
    if (isSyncing) {
      pollerRef.current.pause()
    } else {
      pollerRef.current.resume()
    }
  }, [isSyncing])

  // Pause when tab is hidden, resume when visible
  React.useEffect(() => {
    const handler = () => {
      if (!pollerRef.current) return
      if (document.visibilityState === "visible") {
        pollerRef.current.resume()
      } else {
        pollerRef.current.pause()
      }
    }
    document.addEventListener("visibilitychange", handler)
    return () => document.removeEventListener("visibilitychange", handler)
  }, [])
}
