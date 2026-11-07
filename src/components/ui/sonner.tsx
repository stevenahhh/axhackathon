import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

import { buttonVariants } from "@/components/ui/button"
import { useIsDark, useIsDesktop } from "@/lib/media"
import { cn } from "@/lib/utils"

// 모바일은 앱바(3.5rem) 아래 상단 가운데에 띄워 하단 탭바와 겹치지 않게 하고, 데스크톱은 오른쪽 아래 lg:p-8 여백에 맞춘다.
const MOBILE_TOP = "calc(3.5rem + 0.75rem + env(safe-area-inset-top))"

// 토스트 한 장은 [아이콘 | 내용 | 취소 | 동작] 격자다. 모바일은 버튼을 둘째 줄로 내리고(44px), 데스크톱은 한 줄(32px)로 둔다.
const BUTTON = "row-start-2 h-11 px-3 lg:row-start-1 lg:h-8 lg:self-center"

// sonner 기본 스타일은 레이어 밖 CSS라 Tailwind 유틸리티가 지지 못한다. unstyled로 끄고 토큰 클래스만 입힌다.
export function Toaster(props: ToasterProps) {
  const isDesktop = useIsDesktop()
  const dark = useIsDark()
  return (
    <Sonner
      theme={dark ? "dark" : "light"}
      position={isDesktop ? "bottom-right" : "top-center"}
      offset={isDesktop ? 32 : { top: MOBILE_TOP }}
      mobileOffset={{ top: MOBILE_TOP, left: 16, right: 16 }}
      expand
      gap={12}
      containerAriaLabel="알림"
      icons={{
        success: <CircleCheckIcon />,
        info: <InfoIcon />,
        warning: <TriangleAlertIcon />,
        error: <OctagonXIcon />,
        loading: <Loader2Icon className="animate-spin" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "grid w-(--width) grid-cols-[auto_minmax(0,1fr)_auto_auto] items-start gap-y-3 rounded-lg border bg-popover p-4 font-sans text-sm text-popover-foreground shadow-lg outline-none focus-visible:ring-2! focus-visible:ring-ring",
          // relative: sonner가 로딩 아이콘을 absolute로 가운데 정렬하므로 이 칸이 기준이 되어야 한다.
          icon: "relative col-start-1 row-start-1 mt-0.5 mr-3 flex size-4 shrink-0 items-center justify-center [&_svg]:size-4",
          content: "col-[2/5] row-start-1 flex min-w-0 flex-col gap-0.5 lg:col-[2/3]",
          title: "font-medium leading-5",
          // 어두운 테마의 설명 색은 sonner가 레이어 밖 CSS로 고정하므로 !로 덮는다.
          description: "leading-5 text-muted-foreground!",
          cancelButton: cn(buttonVariants({ variant: "outline" }), BUTTON, "col-start-3 lg:ml-3"),
          actionButton: cn(buttonVariants(), BUTTON, "col-start-4 ml-2"),
          // 밝은 테마의 상태색 잉크는 badge.tsx와 같은 짙은 값을 써서 대비 3:1을 지킨다.
          success: "[&_[data-icon]]:text-[oklch(0.48_0.14_155)] dark:[&_[data-icon]]:text-success",
          info: "[&_[data-icon]]:text-[oklch(0.48_0.13_225)] dark:[&_[data-icon]]:text-info",
          warning: "[&_[data-icon]]:text-[oklch(0.5_0.13_60)] dark:[&_[data-icon]]:text-warning",
          error: "[&_[data-icon]]:text-[oklch(0.5_0.22_25)] dark:[&_[data-icon]]:text-destructive",
          loading: "[&_[data-icon]]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}
