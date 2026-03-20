import { useEffect, useState } from "react"

import { parseApiError } from "@/lib/api"

export function AttendancePhoto({
  token,
  photoUrl,
  alt,
  className,
}: {
  token: string
  photoUrl: string
  alt: string
  className: string
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    const shouldFetchAsBlob = /\/api\/attendance\/\d+\/photo\/(check-in|check-out)\//.test(photoUrl)
    if (!shouldFetchAsBlob) {
      setBlobUrl(null)
      setError("")
      return
    }

    const controller = new AbortController()
    let objectUrl: string | null = null

    const load = async () => {
      setError("")
      try {
        const response = await fetch(photoUrl, {
          headers: {
            Authorization: `Token ${token}`,
          },
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`Image request failed with status ${response.status}`)
        }

        const blob = await response.blob()
        objectUrl = URL.createObjectURL(blob)
        setBlobUrl(objectUrl)
      } catch (fetchError) {
        if (controller.signal.aborted) {
          return
        }
        setError(parseApiError(fetchError))
      }
    }

    void load()

    return () => {
      controller.abort()
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [photoUrl, token])

  if (error) {
    return <p className="text-muted-foreground">Failed to load image: {error}</p>
  }

  if (blobUrl) {
    return <img src={blobUrl} alt={alt} className={className} />
  }

  const shouldFetchAsBlob = /\/api\/attendance\/\d+\/photo\/(check-in|check-out)\//.test(photoUrl)
  if (shouldFetchAsBlob) {
    return (
      <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        Loading image...
      </div>
    )
  }

  return <img src={photoUrl} alt={alt} className={className} />
}
