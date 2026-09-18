'use client'

// 코워크 우측 하단에 고정되는 짭비스 HUD 토글 플로팅 버튼임
interface JjapvisFloatingButtonProps {
  isOpen: boolean
  onClick: () => void
}

export function JjapvisFloatingButton({
  isOpen,
  onClick,
}: JjapvisFloatingButtonProps) {
  return (
    <button
      onClick={onClick}
      title={isOpen ? '짭비스 HUD 닫기' : '짭비스 홀로그램 HUD 실행'}
      className={`fixed bottom-6 right-6 z-40 flex items-center space-x-2 px-3.5 py-2.5 rounded-full border-2 border-black font-mono text-xs font-black shadow-[3px_3px_0_#000] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[4px_4px_0_#000] active:translate-y-0.5 active:shadow-[1px_1px_0_#000] ${
        isOpen
          ? 'bg-[#ef4444] text-white hover:bg-[#dc2626]'
          : 'bg-[#5eead4] text-black hover:bg-[#2dd4bf]'
      }`}
    >
      {/* 사이버네틱 펄스 링 애니메이션임 */}
      <span className="relative flex h-2.5 w-2.5">
        <span
          className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
            isOpen ? 'bg-white' : 'bg-[#0f766e]'
          }`}
        />
        <span
          className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
            isOpen ? 'bg-white' : 'bg-[#0f766e]'
          }`}
        />
      </span>

      <span>{isOpen ? 'CLOSE HUD' : 'JJAPVIS AGI'}</span>
    </button>
  )
}
