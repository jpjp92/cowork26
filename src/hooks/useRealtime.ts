import { useEffect, useRef, useCallback } from 'react'
import { Op } from '@fortune-sheet/core'
import { supabase } from '../lib/supabase'

export function useRealtime(sheetId: string, onRemoteOp: (ops: Op[]) => void) {
  const callbackRef = useRef(onRemoteOp)
  callbackRef.current = onRemoteOp

  useEffect(() => {
    const channel = supabase.channel(`sheet:${sheetId}`)

    channel
      .on('broadcast', { event: 'op' }, ({ payload }) => {
        callbackRef.current(payload.ops as Op[])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [sheetId])

  const broadcastOps = useCallback(async (ops: Op[]) => {
    await supabase.channel(`sheet:${sheetId}`).send({
      type: 'broadcast',
      event: 'op',
      payload: { ops },
    })
  }, [sheetId])

  return { broadcastOps }
}
