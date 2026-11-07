import { cn } from "@/lib/utils"
import type { Photo } from "@/types"

export function DetectionImage({
  photo,
  className,
  boxClassName = "border-cyan-300",
}: {
  photo: Photo
  className?: string
  boxClassName?: string
}) {
  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      <img
        src={photo.ir}
        alt={`${photo.seq}번 열화상`}
        width={photo.width}
        height={photo.height}
        className="block h-auto w-full"
      />
      {photo.boxes.map(({ bbox: [x, y, w, h] }, index) => (
        <span
          key={index}
          className={cn(
            "absolute min-h-2.5 min-w-2.5 -translate-x-0.5 -translate-y-0.5 rounded-[2px] border-2",
            boxClassName
          )}
          style={{
            left: `${(x / photo.width) * 100}%`,
            top: `${(y / photo.height) * 100}%`,
            width: `${(w / photo.width) * 100}%`,
            height: `${(h / photo.height) * 100}%`,
          }}
        />
      ))}
    </div>
  )
}
